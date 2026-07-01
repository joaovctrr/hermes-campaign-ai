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
  const db = supabase as SupabaseClient & {
    // Supabase generated types are intentionally behind the new migration in this workspace.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
  };
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select(
      "full_name, political_name, political_role, region, preferred_news_state, preferred_news_neighborhood, monitored_themes, mention_keywords",
    )
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);

  const themes: string[] = profile?.monitored_themes ?? [];

  const all: Raw[] = [];
  const { data: monitoredSources } = await db
    .from("monitored_sources")
    .select("name, url, active")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(30);
  const monitoredDomains = ((monitoredSources ?? []) as Array<{ url: string | null }>)
    .map((source) => domainFromUrl(source.url))
    .filter((domain): domain is string => Boolean(domain));
  const localSignal = profile?.preferred_news_state || profile?.region || "Brasil";
  const neighborhoodSignal = profile?.preferred_news_neighborhood?.trim();
  const candidateTerms = [
    profile?.political_name,
    profile?.full_name,
    ...((profile?.mention_keywords as string[] | null) ?? []),
  ]
    .filter((value): value is string => Boolean(value && value.trim().length >= 3))
    .slice(0, 5);

  for (const term of candidateTerms) {
    all.push(...(await fetchGoogleNews(`"${term}" when:30d`, "Menção nacional ao candidato")));
    all.push(...(await fetchGoogleNews(`"${term}" Brasil when:30d`, "Menção nacional ao candidato")));
    all.push(...(await fetchGoogleNews(`"${term}" política when:30d`, "Menção nacional ao candidato")));
    all.push(...(await fetchGoogleNews(`"${term}" ${localSignal} when:30d`, "Menção ao candidato")));
    if (profile?.region && profile.region !== localSignal) {
      all.push(
        ...(await fetchGoogleNews(`"${term}" ${profile.region} when:30d`, "Menção ao candidato")),
      );
    }
    for (const state of BRAZIL_STATE_TERMS) {
      all.push(
        ...(await fetchGoogleNews(`"${term}" "${state}" when:30d`, "Menção estadual ao candidato")),
      );
    }
    for (const domain of monitoredDomains.slice(0, 30)) {
      all.push(
        ...(await fetchGoogleNews(
          `"${term}" site:${domain} when:30d`,
          "Menção em fonte monitorada",
        )),
      );
    }
  }

  for (const theme of themes.slice(0, 5)) {
    if (neighborhoodSignal) {
      all.push(...(await fetchGoogleNews(`${theme} ${neighborhoodSignal} ${localSignal}`, theme)));
    }
    all.push(...(await fetchGoogleNews(`${theme} ${localSignal}`, theme)));
    if (profile?.region && profile.region !== localSignal) {
      all.push(...(await fetchGoogleNews(`${theme} ${profile.region}`, theme)));
    }
    all.push(...(await fetchGoogleNews(`${theme} Brasil when:1d`, theme)));
  }
  if (!all.length) return { inserted: 0, reason: themes.length ? "no_feed_results" : "no_terms" };

  const ranked = dedupeNews(all)
    .filter((n) => isFresh(n.pubDate))
    .sort((a, b) => newsTime(b.pubDate) - newsTime(a.pubDate))
    .slice(0, 80);
  if (!ranked.length) return { inserted: 0, reason: "no_recent_results" };

  const urls = ranked.map((n) => n.link);
  const { data: existing } = await supabase
    .from("news_items")
    .select("url")
    .eq("user_id", userId)
    .in("url", urls);
  const existingSet = new Set((existing ?? []).map((r: { url: string | null }) => r.url));
  const novel = ranked.filter((n) => !existingSet.has(n.link)).slice(0, 30);
  if (!novel.length) return { inserted: 0, reason: "already_fresh" };

  const google = createGoogleAiProvider(apiKey);
  const model = google("gemini-3-flash-preview");

  const prompt = `Você é Informa Ágora, analista de comunicação política. Para cada notícia abaixo, retorne UM JSON array (e SOMENTE o array, sem markdown) com objetos: {"i": <indice>, "summary": "<2 frases objetivas em PT-BR>", "urgency": "baixa"|"media"|"alta", "state": "UF ou estado citado", "neighborhood": "bairro citado ou null"}.

Critério ALTA: crise, escândalo, denúncia, tragédia ou pauta de segurança/saúde com impacto direto em "${localSignal}" ou na região "${profile?.region ?? "Brasil"}" e perfil "${profile?.political_role ?? "político"}".
MEDIA: tema relevante sem crise.
BAIXA: contexto/análise.
Estado preferencial do usuário: ${profile?.preferred_news_state ?? "não informado"}.
Bairro preferencial do usuário: ${profile?.preferred_news_neighborhood ?? "não informado"}.
Se o estado/bairro não aparecer claramente, use null. Não invente bairro.

Notícias:
${novel.map((n, i) => `${i}. [${n.theme}] ${n.title} (fonte: ${n.source})`).join("\n")}`;

  let parsed: Array<{
    i: number;
    summary: string;
    urgency: string;
    state?: string | null;
    neighborhood?: string | null;
  }> = [];
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
      state: normalizeLocation(byIndex.get(i)?.state) ?? inferState(n.title, localSignal),
      neighborhood:
        normalizeLocation(byIndex.get(i)?.neighborhood) ??
        inferNeighborhood(n.title, profile?.preferred_news_neighborhood ?? null),
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
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).flatMap((m) => {
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
  return !time || time >= Date.now() - 7 * 24 * 60 * 60 * 1000;
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

function normalizeLocation(value?: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "null") return null;
  return normalized.slice(0, 120);
}

function inferState(text: string, fallback: string | null) {
  const normalized = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const states: Array<[string, string[]]> = [
    ["MG", ["minas gerais", " minas ", " belo horizonte", " bh "]],
    ["SP", ["sao paulo", " paulista"]],
    ["RJ", ["rio de janeiro", " fluminense"]],
    ["ES", ["espirito santo"]],
    ["BA", ["bahia"]],
    ["PR", ["parana"]],
    ["SC", ["santa catarina"]],
    ["RS", ["rio grande do sul"]],
    ["GO", ["goias"]],
    ["DF", ["distrito federal", "brasilia"]],
  ];
  const padded = ` ${normalized} `;
  return states.find(([, terms]) => terms.some((term) => padded.includes(term)))?.[0] ?? fallback;
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

function domainFromUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const BRAZIL_STATE_TERMS = [
  "Acre",
  "Alagoas",
  "Amapá",
  "Amazonas",
  "Bahia",
  "Ceará",
  "Distrito Federal",
  "Espírito Santo",
  "Goiás",
  "Maranhão",
  "Mato Grosso",
  "Mato Grosso do Sul",
  "Minas Gerais",
  "Pará",
  "Paraíba",
  "Paraná",
  "Pernambuco",
  "Piauí",
  "Rio de Janeiro",
  "Rio Grande do Norte",
  "Rio Grande do Sul",
  "Rondônia",
  "Roraima",
  "Santa Catarina",
  "São Paulo",
  "Sergipe",
  "Tocantins",
];
