import { generateText } from "ai";
import type { Sql } from "@/db/client.server";
import { createGoogleAiProvider } from "./ai-gateway.server";

type Raw = { title: string; link: string; source: string; pubDate?: string; theme: string };

/**
 * Server-only helper. Fetches Google News for each monitored theme,
 * deduplicates against the DB, summarizes via Google AI and inserts.
 * Returns the count of inserted rows. Designed to be called from both
 * the authenticated server function and the cron webhook.
 */
export async function refreshRadarForUser(
  sql: Sql,
  userId: string,
  apiKey: string,
): Promise<{ inserted: number; reason?: string }> {
  const [profile] = await sql`
    SELECT political_role, region, monitored_themes FROM app.profiles WHERE id = ${userId}
  `;

  const themes: string[] = profile?.monitored_themes ?? [];
  if (!themes.length) return { inserted: 0, reason: "no_themes" };

  const all: Raw[] = [];
  for (const theme of themes.slice(0, 5)) {
    const query = encodeURIComponent(`${theme} ${profile?.region ?? "Brasil"}`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "InformaAgoraBot/1.0" } });
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
      /* ignora */
    }
  }
  if (!all.length) return { inserted: 0, reason: "no_feed_results" };

  const urls = all.map((n) => n.link);
  const existing = await sql`
    SELECT url FROM app.news_items WHERE user_id = ${userId} AND url = ANY(${urls})
  `;
  const existingSet = new Set(existing.map((r) => (r as { url: string | null }).url));
  const novel = all.filter((n) => !existingSet.has(n.link)).slice(0, 12);
  if (!novel.length) return { inserted: 0, reason: "already_fresh" };

  const google = createGoogleAiProvider(apiKey);
  const model = google("gemini-3-flash-preview");

  const prompt = `Você é Informa Ágora, analista de comunicação política. Para cada notícia abaixo, retorne UM JSON array (e SOMENTE o array, sem markdown) com objetos: {"i": <indice>, "summary": "<2 frases objetivas em PT-BR>", "urgency": "baixa"|"media"|"alta"}.

Critério ALTA: crise, escândalo, denúncia, tragédia ou pauta de segurança/saúde com impacto direto na região "${profile?.region ?? "Brasil"}" e perfil "${profile?.political_role ?? "político"}".
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
  const rows = novel.map((n, i) => ({
    user_id: userId,
    title: n.title,
    source: n.source || "Google News",
    url: n.link,
    summary: byIndex.get(i)?.summary ?? null,
    theme: n.theme,
    urgency: byIndex.get(i)?.urgency ?? "baixa",
    published_at: n.pubDate ? new Date(n.pubDate).toISOString() : null,
  }));

  await sql`
    INSERT INTO app.news_items ${sql(rows, "user_id", "title", "source", "url", "summary", "theme", "urgency", "published_at")}
  `;
  return { inserted: rows.length };
}
