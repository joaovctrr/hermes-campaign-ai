import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manualCooldownHours, formatCooldownRemaining } from "./plan-limits";
import { createGoogleAiProvider } from "./ai-gateway.server";

const ManualNewsSchema = z.object({
  url: z.string().trim().url("Informe um link válido"),
  theme: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const listMyNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("news_items")
      .select("*")
      .eq("user_id", context.userId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_dashboard_stats");
    if (error) throw new Error(error.message);
    const row = (
      data as Array<{
        total: number;
        last_24h: number;
        critical_24h: number;
        last_news_at: string | null;
      }> | null
    )?.[0];
    return row ?? { total: 0, last_24h: 0, critical_24h: 0, last_news_at: null };
  });

export const refreshRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente");

    // Plan cooldown
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("plan")
      .eq("id", context.userId)
      .maybeSingle();
    const cooldown = manualCooldownHours(profile?.plan);
    if (cooldown > 0) {
      const { data: last } = await context.supabase
        .from("news_items")
        .select("created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.created_at) {
        const elapsed = Date.now() - new Date(last.created_at).getTime();
        const remaining = cooldown * 3600000 - elapsed;
        if (remaining > 0) {
          throw new Error(
            `Refresh manual disponível em ${formatCooldownRemaining(remaining)}. Faça upgrade do plano para atualizar quando quiser.`,
          );
        }
      }
    }

    const { refreshRadarForUser } = await import("./radar-refresh.server");
    const result = await refreshRadarForUser(context.supabase, context.userId, key);
    if (result.reason === "no_themes") {
      throw new Error("Cadastre temas monitorados nas Configurações antes de atualizar o radar.");
    }
    const messages: Record<string, string> = {
      no_feed_results: "Nenhuma notícia retornada do feed. Tente novamente em alguns minutos.",
      already_fresh: "Radar já estava atualizado.",
    };
    return {
      inserted: result.inserted,
      message: result.reason
        ? (messages[result.reason] ?? "")
        : `${result.inserted} novas notícias analisadas.`,
    };
  });

export const addManualNewsFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ManualNewsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente");

    const article = await fetchArticleMetadata(data.url);
    const { data: existing } = await context.supabase
      .from("news_items")
      .select("id")
      .eq("user_id", context.userId)
      .eq("url", data.url)
      .maybeSingle();
    if (existing?.id) return { id: existing.id, message: "Notícia já estava no radar." };

    const { data: profile } = await context.supabase
      .from("profiles")
      .select(
        "political_role, region, preferred_news_state, preferred_news_neighborhood, monitored_themes",
      )
      .eq("id", context.userId)
      .maybeSingle();

    const google = createGoogleAiProvider(key);
    const model = google("gemini-3-flash-preview");
    const themes = profile?.monitored_themes ?? [];
    const prompt = `Analise esta notícia para um radar político. Retorne SOMENTE JSON: {"summary":"até 2 frases", "urgency":"baixa|media|alta", "theme":"tema curto", "state":"UF ou estado citado ou null", "neighborhood":"bairro citado ou null"}.

Perfil: ${profile?.political_role ?? "político"}.
Estado prioritário: ${profile?.preferred_news_state ?? "Brasil"}.
Bairro prioritário: ${profile?.preferred_news_neighborhood ?? "não informado"}.
Região: ${profile?.region ?? "Brasil"}.
Temas monitorados: ${themes.join(", ") || "não informado"}.

Título: ${article.title}
Fonte: ${article.source}
Descrição/metadados: ${article.description ?? "—"}
URL: ${data.url}`;

    let ai: {
      summary?: string;
      urgency?: string;
      theme?: string;
      state?: string | null;
      neighborhood?: string | null;
    } = {};
    try {
      const { text } = await generateText({ model, prompt });
      const match = text.match(/\{[\s\S]*\}/);
      if (match) ai = JSON.parse(match[0]);
    } catch {
      ai = {};
    }

    const { data: inserted, error } = await context.supabase
      .from("news_items")
      .insert({
        user_id: context.userId,
        title: article.title,
        source: article.source,
        url: data.url,
        summary: ai.summary ?? article.description ?? null,
        theme: data.theme ?? ai.theme ?? themes[0] ?? null,
        urgency: normalizeUrgency(ai.urgency) ?? "media",
        state: normalizeLocation(ai.state) ?? profile?.preferred_news_state ?? null,
        neighborhood:
          normalizeLocation(ai.neighborhood) ??
          inferNeighborhood(
            `${article.title} ${article.description ?? ""}`,
            profile?.preferred_news_neighborhood ?? null,
          ),
        published_at: article.publishedAt,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: inserted.id, message: "Notícia adicionada ao radar." };
  });

export const getRadarCooldownStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("plan")
      .eq("id", context.userId)
      .maybeSingle();
    const plan = profile?.plan ?? "basico";
    const cooldown = manualCooldownHours(plan);
    const { data: last } = await context.supabase
      .from("news_items")
      .select("created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = last?.created_at ? new Date(last.created_at).getTime() : 0;
    const remaining =
      cooldown > 0 && lastAt ? Math.max(0, cooldown * 3600000 - (Date.now() - lastAt)) : 0;
    return { plan, cooldownHours: cooldown, remainingMs: remaining };
  });

export const getNewsItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("news_items")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return item;
  });

async function fetchArticleMetadata(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 InformaAgoraBot/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error("Não foi possível acessar o link informado.");

  const html = await response.text();
  const title =
    meta(html, "property", "og:title") ||
    meta(html, "name", "twitter:title") ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    url;
  const description =
    meta(html, "property", "og:description") ||
    meta(html, "name", "description") ||
    meta(html, "name", "twitter:description");
  const publishedAt =
    meta(html, "property", "article:published_time") ||
    meta(html, "name", "pubdate") ||
    meta(html, "name", "date") ||
    null;
  const source =
    meta(html, "property", "og:site_name") || new URL(url).hostname.replace(/^www\./, "");

  return {
    title: cleanHtml(title),
    description: description ? cleanHtml(description) : null,
    source: cleanHtml(source),
    publishedAt:
      publishedAt && !Number.isNaN(new Date(publishedAt).getTime())
        ? new Date(publishedAt).toISOString()
        : null,
  };
}

function meta(html: string, attr: "name" | "property", value: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrValue = getAttribute(tag, attr);
    if (attrValue?.toLowerCase() === value.toLowerCase()) {
      return getAttribute(tag, "content") ?? "";
    }
  }
  return "";
}

function cleanHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(tag: string, attr: string) {
  const match = new RegExp(`${attr}=["']([^"']+)["']`, "i").exec(tag);
  return match?.[1] ?? null;
}

function normalizeUrgency(value?: string): "alta" | "media" | "baixa" | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("alt")) return "alta";
  if (normalized.startsWith("med")) return "media";
  if (normalized.startsWith("bai") || normalized.includes("sem")) return "baixa";
  return null;
}

function normalizeLocation(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "null") return null;
  return normalized.slice(0, 120);
}

function inferNeighborhood(text: string, preferred: string | null) {
  const match = /\bbairro\s+([\p{L}0-9][\p{L}0-9\s'.-]{2,36})/iu.exec(text);
  if (match?.[1])
    return match[1]
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?-]+$/g, "")
      .trim();
  if (preferred && text.toLowerCase().includes(preferred.toLowerCase())) return preferred;
  return null;
}
