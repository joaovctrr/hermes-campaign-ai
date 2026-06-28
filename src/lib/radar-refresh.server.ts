import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGoogleAiProvider } from "./ai-gateway.server";

type Raw = { title: string; link: string; source: string; pubDate?: string; theme: string };

/**
 * Server-only helper. Fetches Google News for each monitored theme,
 * deduplicates against the DB, summarizes via Google AI and inserts.
 * Returns the count of inserted rows. Designed to be called from both
 * the authenticated server function and the pg_cron webhook.
 */
export async function refreshRadarForUser(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
): Promise<{ inserted: number; reason?: string }> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("political_role, region, preferred_news_state, monitored_themes")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);

  const themes: string[] = profile?.monitored_themes ?? [];
  if (!themes.length) return { inserted: 0, reason: "no_themes" };

  const all: Raw[] = [];
  const localSignal = profile?.preferred_news_state || profile?.region || "Brasil";
  for (const theme of themes.slice(0, 5)) {
    all.push(...(await fetchGoogleNews(`${theme} ${localSignal}`, theme)));
    if (profile?.region && profile.region !== localSignal) {
      all.push(...(await fetchGoogleNews(`${theme} ${profile.region}`, theme)));
    }
    all.push(...(await fetchGoogleNews(`${theme} Brasil when:1d`, theme)));
  }
  if (!all.length) return { inserted: 0, reason: "no_feed_results" };

  const ranked = dedupeNews(all)
    .filter((n) => isFresh(n.pubDate))
    .sort((a, b) => newsTime(b.pubDate) - newsTime(a.pubDate))
    .slice(0, 24);
  if (!ranked.length) return { inserted: 0, reason: "no_recent_results" };

  const urls = ranked.map((n) => n.link);
  const { data: existing } = await supabase
    .from("news_items")
    .select("url")
    .eq("user_id", userId)
    .in("url", urls);
  const existingSet = new Set((existing ?? []).map((r: { url: string | null }) => r.url));
  const novel = ranked.filter((n) => !existingSet.has(n.link)).slice(0, 12);
  if (!novel.length) return { inserted: 0, reason: "already_fresh" };

  const google = createGoogleAiProvider(apiKey);
  const model = google("gemini-3-flash-preview");

  const prompt = `Você é Informa Ágora, analista de comunicação política. Para cada notícia abaixo, retorne UM JSON array (e SOMENTE o array, sem markdown) com objetos: {"i": <indice>, "summary": "<2 frases objetivas em PT-BR>", "urgency": "baixa"|"media"|"alta"}.

Critério ALTA: crise, escândalo, denúncia, tragédia ou pauta de segurança/saúde com impacto direto em "${localSignal}" ou na região "${profile?.region ?? "Brasil"}" e perfil "${profile?.political_role ?? "político"}".
MEDIA: tema relevante sem crise.
BAIXA: contexto/análise.

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
  const rows = novel.map((n, i) => {
    const urgency = normalizeUrgency(byIndex.get(i)?.urgency) ?? inferUrgency(n.title);
    return {
      user_id: userId,
      title: n.title,
      source: n.source || "Google News",
      url: n.link,
      summary: byIndex.get(i)?.summary ?? null,
      theme: n.theme,
      urgency,
      published_at: n.pubDate ? new Date(n.pubDate).toISOString() : null,
    };
  });

  const { error: insErr } = await supabase.from("news_items").insert(rows);
  if (insErr) throw new Error(insErr.message);
  return { inserted: rows.length };
}

async function fetchGoogleNews(query: string, theme: string): Promise<Raw[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "InformaAgoraBot/1.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).flatMap((m) => {
      const block = m[1];
      const get = (tag: string) => {
        const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
        return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
      };
      const title = decodeXml(get("title"));
      const link = decodeXml(get("link"));
      const pubDate = get("pubDate");
      const source = decodeXml(get("source"));
      return title && link ? [{ title, link, source, pubDate, theme }] : [];
    });
  } catch {
    return [];
  }
}

function dedupeNews(items: Raw[]): Raw[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.link || item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function newsTime(value?: string): number {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isFresh(value?: string): boolean {
  const time = newsTime(value);
  return !time || time >= Date.now() - 3 * 24 * 60 * 60 * 1000;
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
  if (normalized.startsWith("bai") || normalized.includes("context")) return "baixa";
  return null;
}

function inferUrgency(title: string): "alta" | "media" | "baixa" {
  const text = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const high = [
    "acus",
    "assassin",
    "ataque",
    "combate",
    "crime",
    "denunc",
    "garimpo ilegal",
    "investiga",
    "morre",
    "morte",
    "operacao",
    "pris",
    "suspeit",
    "video:",
    "violencia",
  ];
  const medium = ["alerta", "amplia", "anuncia", "crise", "fiscaliza", "protest", "seguranca"];
  if (high.some((term) => text.includes(term))) return "alta";
  if (medium.some((term) => text.includes(term))) return "media";
  return "baixa";
}
