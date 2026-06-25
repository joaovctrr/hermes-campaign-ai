import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lista as notícias do usuário (ordem cronológica reversa)
export const listMyNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("news_items")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Busca notícias no Google News (RSS público) com base nos temas do usuário,
// resume cada uma com a IA (Lovable AI) e grava no banco.
export const refreshRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const { data: profile, error: pErr } = await context.supabase
      .from("profiles")
      .select("political_role, region, monitored_themes, bio")
      .eq("id", context.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    const themes: string[] = profile?.monitored_themes ?? [];
    if (!themes.length) {
      throw new Error("Cadastre temas monitorados nas Configurações antes de atualizar o radar.");
    }

    // Coleta de RSS do Google News por tema (até 5 temas)
    type Raw = { title: string; link: string; source: string; pubDate?: string; theme: string };
    const all: Raw[] = [];

    for (const theme of themes.slice(0, 5)) {
      const query = encodeURIComponent(`${theme} ${profile?.region ?? "Brasil"}`);
      const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
      try {
        const res = await fetch(url, { headers: { "User-Agent": "HermesBot/1.0" } });
        if (!res.ok) continue;
        const xml = await res.text();
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4);
        for (const m of items) {
          const block = m[1];
          const get = (tag: string) => {
            const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
            return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
          };
          const title = get("title");
          const link = get("link");
          const pubDate = get("pubDate");
          const source = get("source");
          if (title && link) all.push({ title, link, source, pubDate, theme });
        }
      } catch {
        /* ignora falhas pontuais */
      }
    }

    if (!all.length) {
      return { inserted: 0, message: "Nenhuma notícia retornada do feed. Tente novamente em alguns minutos." };
    }

    // Deduplica por URL contra o que já está no banco
    const urls = all.map((n) => n.link);
    const { data: existing } = await context.supabase
      .from("news_items")
      .select("url")
      .eq("user_id", context.userId)
      .in("url", urls);
    const existingSet = new Set((existing ?? []).map((r) => r.url));
    const novel = all.filter((n) => !existingSet.has(n.link)).slice(0, 12);

    if (!novel.length) return { inserted: 0, message: "Radar já estava atualizado." };

    // IA: gera resumo + urgência por notícia (batch único)
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const prompt = `Você é Hermes, analista de comunicação política. Para cada notícia abaixo, retorne UM JSON array (e SOMENTE o array, sem markdown) com objetos: {"i": <indice>, "summary": "<2 frases objetivas em PT-BR>", "urgency": "baixa"|"media"|"alta"}.

Critério de urgência ALTA: crise, escândalo, denúncia, tragédia ou pauta de segurança/saúde com impacto direto na região "${profile?.region ?? "Brasil"}" e perfil "${profile?.political_role ?? "político"}".
Critério MEDIA: tema relevante mas sem crise.
Critério BAIXA: contexto/análise/menor relevância.

Notícias:
${novel.map((n, i) => `${i}. [${n.theme}] ${n.title} (fonte: ${n.source})`).join("\n")}`;

    let parsed: Array<{ i: number; summary: string; urgency: string }> = [];
    try {
      const { text } = await generateText({ model, prompt });
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("AI parsing failed", e);
    }

    const byIndex = new Map(parsed.map((p) => [p.i, p]));
    const rows = novel.map((n, i) => ({
      user_id: context.userId,
      title: n.title,
      source: n.source || "Google News",
      url: n.link,
      summary: byIndex.get(i)?.summary ?? null,
      theme: n.theme,
      urgency: byIndex.get(i)?.urgency ?? "baixa",
      published_at: n.pubDate ? new Date(n.pubDate).toISOString() : null,
    }));

    const { error: insErr } = await context.supabase.from("news_items").insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { inserted: rows.length, message: `${rows.length} novas notícias analisadas.` };
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
