import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnalysisSentiment = "positivo" | "neutro" | "negativo" | "crise";
type AnalysisKind = "news" | "mention";

type AnalysisItem = {
  id: string;
  kind: AnalysisKind;
  title: string;
  text: string;
  source: string;
  date: string;
  url: string | null;
  author: string | null;
  theme: string;
  sentiment: AnalysisSentiment;
  urgency: string | null;
  geography: string | null;
  relevance: number;
  newsId: string | null;
};

const DAY = 24 * 60 * 60 * 1000;

export const getDataAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since7d = new Date(Date.now() - 7 * DAY).toISOString();

    const [{ data: news, error: newsError }, { data: mentions, error: mentionsError }] =
      await Promise.all([
        context.supabase
          .from("news_items")
          .select("id, title, source, url, summary, theme, urgency, published_at, created_at")
          .eq("user_id", context.userId)
          .or(`published_at.gte.${since7d},created_at.gte.${since7d}`)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(120),
        context.supabase
          .from("social_mentions")
          .select("id, network, author, content, url, sentiment, posted_at, collected_at, score")
          .eq("user_id", context.userId)
          .or(`posted_at.gte.${since7d},collected_at.gte.${since7d}`)
          .order("posted_at", { ascending: false, nullsFirst: false })
          .order("collected_at", { ascending: false })
          .limit(220),
      ]);

    if (newsError) throw new Error(newsError.message);
    if (mentionsError) throw new Error(mentionsError.message);

    const items: AnalysisItem[] = [
      ...((news ?? []).map((item) => {
        const text = `${item.title}. ${item.summary ?? ""}`;
        const urgency = normalizeUrgency(item.urgency);
        return {
          id: `news:${item.id}`,
          kind: "news" as const,
          title: item.title,
          text,
          source: item.source ?? "Notícia",
          date: item.published_at ?? item.created_at,
          url: item.url,
          author: item.source ?? null,
          theme: normalizeTheme(item.theme) ?? inferTheme(text),
          sentiment: inferNewsSentiment(text, urgency),
          urgency,
          geography: inferGeography(text),
          relevance: newsRelevance(item.source, urgency),
          newsId: item.id,
        };
      }) ?? []),
      ...((mentions ?? []).map((item) => {
        const sentiment = normalizeMentionSentiment(item.sentiment, item.content);
        return {
          id: `mention:${item.id}`,
          kind: "mention" as const,
          title: item.content.slice(0, 96),
          text: item.content,
          source: item.network,
          date: item.posted_at ?? item.collected_at,
          url: item.url,
          author: item.author,
          theme: inferTheme(item.content),
          sentiment,
          urgency: sentiment === "crise" ? "alta" : null,
          geography: inferGeography(item.content),
          relevance: mentionRelevance(sentiment, item.score ?? null),
          newsId: null,
        };
      }) ?? []),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const last24 = items.filter((item) => new Date(item.date).getTime() >= Date.now() - DAY);
    const previous24 = items.filter((item) => {
      const time = new Date(item.date).getTime();
      return time >= Date.now() - 2 * DAY && time < Date.now() - DAY;
    });

    const total24 = last24.length;
    const positive24 = countBySentiment(last24, "positivo");
    const negative24 = countBySentiment(last24, "negativo") + countBySentiment(last24, "crise");
    const neutral24 = countBySentiment(last24, "neutro");
    const previousNegative =
      countBySentiment(previous24, "negativo") + countBySentiment(previous24, "crise");

    return {
      generatedAt: new Date().toISOString(),
      kpis: {
        total24,
        positivePct: pct(positive24, total24),
        neutralPct: pct(neutral24, total24),
        negativePct: pct(negative24, total24),
        crisisCount: countBySentiment(last24, "crise"),
        negativeDelta: negative24 - previousNegative,
      },
      trend: buildTrend(items),
      themes: groupThemes(last24.length ? last24 : items),
      keywords: topKeywords(last24.length ? last24 : items),
      riskZones: riskZones(items),
      actors: actorRadar(last24.length ? last24 : items),
      negativeSecurity: items.filter(
        (item) =>
          item.theme.toLowerCase().includes("segurança") &&
          (item.sentiment === "negativo" || item.sentiment === "crise"),
      ),
      items: items.slice(0, 120),
    };
  });

function countBySentiment(items: AnalysisItem[], sentiment: AnalysisSentiment) {
  return items.filter((item) => item.sentiment === sentiment).length;
}

function pct(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function buildTrend(items: AnalysisItem[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(Date.now() - (6 - index) * DAY);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + DAY);
    const dayItems = items.filter((item) => {
      const time = new Date(item.date).getTime();
      return time >= start.getTime() && time < end.getTime();
    });
    return {
      label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      positivo: countBySentiment(dayItems, "positivo"),
      negativo: countBySentiment(dayItems, "negativo") + countBySentiment(dayItems, "crise"),
      neutro: countBySentiment(dayItems, "neutro"),
    };
  });
}

function groupThemes(items: AnalysisItem[]) {
  const grouped = new Map<
    string,
    { theme: string; count: number; negative: number; items: AnalysisItem[] }
  >();
  for (const item of items) {
    const key = item.theme || "Outros";
    const current = grouped.get(key) ?? { theme: key, count: 0, negative: 0, items: [] };
    current.count += 1;
    if (item.sentiment === "negativo" || item.sentiment === "crise") current.negative += 1;
    current.items.push(item);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((entry) => ({
      theme: entry.theme,
      count: entry.count,
      negative: entry.negative,
      percent: pct(entry.count, items.length),
      items: entry.items.slice(0, 20),
    }));
}

function topKeywords(items: AnalysisItem[]) {
  const words = new Map<string, number>();
  for (const item of items) {
    const tokens = item.text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
    for (const token of tokens) words.set(token, (words.get(token) ?? 0) + 1);
  }
  return [...words.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));
}

function riskZones(items: AnalysisItem[]) {
  const grouped = new Map<string, { zone: string; count: number; items: AnalysisItem[] }>();
  for (const item of items) {
    if (!item.geography || (item.sentiment !== "negativo" && item.sentiment !== "crise")) continue;
    const current = grouped.get(item.geography) ?? { zone: item.geography, count: 0, items: [] };
    current.count += 1;
    current.items.push(item);
    grouped.set(item.geography, current);
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 8);
}

function actorRadar(items: AnalysisItem[]) {
  const actors = [
    "prefeito",
    "prefeita",
    "governador",
    "governadora",
    "vereador",
    "vereadora",
    "adversário",
    "adversario",
    "oposição",
    "oposicao",
    "aliado",
    "aliada",
    "governo",
  ];
  return actors
    .map((actor) => {
      const matched = items.filter((item) => normalize(item.text).includes(normalize(actor)));
      return {
        actor: actor.charAt(0).toUpperCase() + actor.slice(1),
        count: matched.length,
        negative: matched.filter(
          (item) => item.sentiment === "negativo" || item.sentiment === "crise",
        ).length,
        items: matched.slice(0, 12),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.negative - a.negative || b.count - a.count)
    .slice(0, 6);
}

function normalizeTheme(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function inferTheme(text: string) {
  const normalized = normalize(text);
  const rules: Array<[string, string[]]> = [
    [
      "Segurança Pública",
      ["policia", "assalto", "roubo", "furto", "crime", "violencia", "homicidio", "trafico"],
    ],
    ["Saúde", ["hospital", "saude", "upa", "medico", "enfermagem", "vacina", "sus"]],
    [
      "Infraestrutura",
      ["asfalto", "buraco", "obra", "estrada", "ponte", "iluminacao", "transporte"],
    ],
    ["Educação", ["escola", "educacao", "professor", "aluno", "creche", "ensino"]],
    ["Política", ["prefeito", "governador", "deputado", "camara", "assembleia", "governo"]],
    ["Chuvas", ["chuva", "enchente", "alagamento", "deslizamento", "defesa civil"]],
  ];
  return (
    rules.find(([, terms]) => terms.some((term) => normalized.includes(term)))?.[0] ?? "Outros"
  );
}

function inferNewsSentiment(text: string, urgency: string | null): AnalysisSentiment {
  if (urgency === "alta") return "crise";
  const normalized = normalize(text);
  if (/(morre|morte|crime|crise|denuncia|prisao|violencia|assalto|roubo|grave)/.test(normalized)) {
    return "negativo";
  }
  if (/(inaugura|entrega|avanca|fortalece|amplia|melhora|parceria)/.test(normalized)) {
    return "positivo";
  }
  return "neutro";
}

function normalizeMentionSentiment(sentiment: string, text: string): AnalysisSentiment {
  if (sentiment === "negativo" && /(vergonha|fora|crise|grave|urgente|absurdo)/i.test(text)) {
    return "crise";
  }
  if (sentiment === "positivo" || sentiment === "negativo") return sentiment;
  return "neutro";
}

function inferGeography(text: string) {
  const patterns = [
    /\bbairro\s+([\p{L}0-9][\p{L}0-9\s'.-]{2,36})/iu,
    /\bregi[aã]o\s+([\p{L}0-9][\p{L}0-9\s'.-]{2,36})/iu,
    /\bcidade\s+de\s+([\p{L}0-9][\p{L}0-9\s'.-]{2,36})/iu,
    /\bem\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}0-9\s'.-]{2,36})/u,
  ];
  const match = patterns.map((pattern) => pattern.exec(text)).find(Boolean);
  return (
    match?.[1]
      ?.replace(/\s+/g, " ")
      .replace(/[.,;:!?-]+$/g, "")
      .trim() ?? null
  );
}

function newsRelevance(source: string | null, urgency: string | null) {
  const sourceScore =
    source && /g1|uol|folha|estado|minas|gov|camara|senado/i.test(source) ? 30 : 15;
  const urgencyScore = urgency === "alta" ? 60 : urgency === "media" ? 35 : 15;
  return Math.min(100, sourceScore + urgencyScore);
}

function mentionRelevance(sentiment: AnalysisSentiment, score: number | null) {
  const sentimentScore =
    sentiment === "crise" ? 75 : sentiment === "negativo" ? 55 : sentiment === "positivo" ? 35 : 20;
  return Math.min(100, sentimentScore + Math.round((score ?? 0.5) * 20));
}

function normalizeUrgency(value?: string | null) {
  if (value === "alta" || value === "media" || value === "baixa") return value;
  return null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const STOP_WORDS = new Set([
  "para",
  "pela",
  "pelo",
  "como",
  "mais",
  "menos",
  "sobre",
  "apos",
  "entre",
  "contra",
  "com",
  "das",
  "dos",
  "uma",
  "este",
  "esta",
  "esse",
  "essa",
  "aqui",
  "hoje",
  "muito",
  "tambem",
  "policia",
  "militar",
]);
