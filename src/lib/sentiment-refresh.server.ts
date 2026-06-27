import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGoogleAiProvider } from "./ai-gateway.server";
import {
  fetchInstagramMentions,
  fetchTwitterMentions,
  fetchTiktokMentions,
  fetchFacebookMentions,
  type RawMention,
} from "./apify.server";

type Classified = RawMention & { sentiment: "positivo" | "neutro" | "negativo"; score: number };

/**
 * Server-only. Scrapes via Apify for each configured network, classifies
 * sentiment with Google AI in a single batch, upserts mentions and writes
 * a snapshot row. Returns aggregate counters for the caller.
 */
export async function refreshSentimentForUser(
  supabase: SupabaseClient,
  userId: string,
  apifyToken: string,
  googleApiKey: string,
): Promise<{ collected: number; inserted: number; snapshot_id?: string; reason?: string }> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select(
      "instagram_handle, twitter_handle, tiktok_handle, facebook_handle, mention_keywords, monitored_networks",
    )
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!profile) return { collected: 0, inserted: 0, reason: "no_profile" };

  const nets: string[] = profile.monitored_networks ?? [
    "instagram",
    "twitter",
    "tiktok",
    "facebook",
  ];
  const on = (n: string) => nets.includes(n);

  const tasks: Array<Promise<RawMention[]>> = [];
  if (on("instagram") && profile.instagram_handle)
    tasks.push(fetchInstagramMentions(profile.instagram_handle, apifyToken));
  if (on("twitter") && (profile.twitter_handle || (profile.mention_keywords?.length ?? 0)))
    tasks.push(
      fetchTwitterMentions(
        profile.twitter_handle ?? null,
        profile.mention_keywords ?? [],
        apifyToken,
      ),
    );
  if (on("tiktok") && profile.tiktok_handle)
    tasks.push(fetchTiktokMentions(profile.tiktok_handle, apifyToken));
  if (on("facebook") && profile.facebook_handle)
    tasks.push(fetchFacebookMentions(profile.facebook_handle, apifyToken));

  if (!tasks.length) return { collected: 0, inserted: 0, reason: "no_networks_selected" };

  const results = await Promise.allSettled(tasks);
  const all: RawMention[] = [];
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
  if (!all.length) return { collected: 0, inserted: 0, reason: "no_results" };

  const sorted = [...all].sort((a, b) => mentionTime(b) - mentionTime(a));
  const toClassify = sorted.slice(0, 80);
  const ids = toClassify.map((m) => m.external_id);
  const { data: existing } = await supabase
    .from("social_mentions")
    .select("external_id")
    .eq("user_id", userId)
    .in("external_id", ids);
  const existingSet = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));

  const classified = await classifyBatch(toClassify, googleApiKey);

  const rows = classified.map((m) => ({
    user_id: userId,
    network: m.network,
    source_type: "comment",
    external_id: m.external_id,
    author: m.author,
    content: m.content,
    url: m.url,
    sentiment: m.sentiment,
    score: m.score,
    posted_at: m.posted_at ? safeDate(m.posted_at) : null,
    parent_post_id: m.parent_post_id,
    parent_post_url: m.parent_post_url,
    parent_post_caption: m.parent_post_caption,
    parent_post_thumbnail: m.parent_post_thumbnail,
  }));

  const { error: insErr } = await supabase
    .from("social_mentions")
    .upsert(rows, { onConflict: "user_id,network,external_id" });
  if (insErr) throw new Error(insErr.message);

  const snap = await writeSnapshot(supabase, userId);
  const inserted = rows.filter((row) => !existingSet.has(row.external_id)).length;
  return {
    collected: all.length,
    inserted,
    snapshot_id: snap,
    reason: inserted ? undefined : "already_fresh",
  };
}

function safeDate(s: string): string | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function mentionTime(m: RawMention): number {
  if (!m.posted_at) return 0;
  const d = new Date(m.posted_at);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

async function classifyBatch(items: RawMention[], googleApiKey: string): Promise<Classified[]> {
  const google = createGoogleAiProvider(googleApiKey);
  const model = google("gemini-3-flash-preview");

  const prompt = `Você é um analista de sentimento político em PT-BR. Classifique CADA comentário pelo sentimento do autor em relação ao político/perfil monitorado. Retorne SOMENTE um JSON array (sem markdown), com objetos {"i": <indice>, "s": "positivo"|"neutro"|"negativo", "score": <0..1 confiança>}.
Critério:
- positivo: elogio, apoio, aprovação, gratidão, defesa do político, concordância, entusiasmo, parabéns.
- negativo: crítica, rejeição, raiva, ataque, deboche hostil, denúncia, acusação, cobrança agressiva, xingamento.
- neutro: informativo, pergunta sem juízo, marcação de usuário, emoji isolado ou comentário sem opinião clara.
Não marque tudo como neutro: se houver polaridade política clara, escolha positivo ou negativo.

Itens:
${items.map((m, i) => `${i}. [${m.network}] ${m.content.slice(0, 300)}`).join("\n")}`;

  let parsed: Array<{ i: number; s: string; score?: number }> = [];
  try {
    const { text } = await generateText({ model, prompt });
    const match = text.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]);
  } catch (e) {
    console.error("[sentiment] AI classify failed", e);
  }
  const byIdx = new Map(parsed.map((p) => [p.i, p]));
  return items.map((m, i) => {
    const p = byIdx.get(i);
    const modelSentiment = normalizeSentiment(p?.s);
    const inferredSentiment = inferSentiment(m.content);
    const sentiment = chooseSentiment(modelSentiment, inferredSentiment);
    return {
      ...m,
      sentiment,
      score: modelSentiment === sentiment ? (p?.score ?? 0.5) : 0.72,
    };
  });
}

function chooseSentiment(
  modelSentiment: Classified["sentiment"] | null,
  inferredSentiment: Classified["sentiment"],
): Classified["sentiment"] {
  if (!modelSentiment) return inferredSentiment;
  if (modelSentiment === "neutro" && inferredSentiment !== "neutro") return inferredSentiment;
  return modelSentiment;
}

function normalizeSentiment(value: unknown): Classified["sentiment"] | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

  if (normalized.startsWith("pos")) return "positivo";
  if (normalized.startsWith("neg")) return "negativo";
  if (normalized.startsWith("neu")) return "neutro";
  return null;
}

function inferSentiment(content: string): Classified["sentiment"] {
  const text = content
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  const negativeTerms = [
    "acabou",
    "absurdo",
    "burro",
    "cade",
    "cadê",
    "cala boca",
    "cansado",
    "corrupt",
    "criminos",
    "critica",
    "covarde",
    "decepcao",
    "decepcion",
    "demagog",
    "descaso",
    "desonest",
    "devia ter vergonha",
    "engan",
    "facil falar",
    "fake",
    "fora",
    "fraco",
    "hipocri",
    "horrivel",
    "incompet",
    "ladrao",
    "lixo",
    "mentir",
    "mentiros",
    "nao acredito",
    "nao da",
    "nao fez",
    "nao faz",
    "nao gostei",
    "nao presta",
    "omiss",
    "palhac",
    "pare de",
    "perdeu",
    "pessim",
    "piada",
    "promessa",
    "ridicul",
    "safad",
    "sumiu",
    "vergonhoso",
    "vergonha",
  ];
  const positiveTerms = [
    "abraco",
    "apoio",
    "apoiado",
    "apoiamos",
    "aprov",
    "boa",
    "bom",
    "bravo",
    "classe",
    "concordo",
    "defende",
    "defender",
    "defesa",
    "deus abencoe",
    "diferenciado",
    "excelente",
    "fechado",
    "felicit",
    "forca",
    "gratid",
    "honra",
    "honesto",
    "juntos",
    "lider",
    "merece",
    "melhor",
    "obrigad",
    "orgulho",
    "parabens",
    "perfeito",
    "representa",
    "respeito",
    "show",
    "top",
    "trabalho",
    "unico q defende",
    "unico que defende",
    "vamos",
  ];

  const positiveEmoji =
    /[\u{1f44f}\u{1f44d}\u{1f4aa}\u{1f64c}\u{1f64f}\u{1f3c6}\u{1f947}\u{2764}\u{1f499}\u{1f49a}]/u;
  const negativeEmoji = /[\u{1f44e}\u{1f621}\u{1f620}\u{1f92e}\u{1f921}]/u;

  const neg =
    negativeTerms.filter((term) => text.includes(term)).length +
    (negativeEmoji.test(content) ? 1 : 0);
  const pos =
    positiveTerms.filter((term) => text.includes(term)).length +
    (positiveEmoji.test(content) ? 1 : 0);

  if (neg > 0 && neg >= pos) return "negativo";
  if (pos > 0) return "positivo";
  return "neutro";
}

async function writeSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | undefined> {
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from("social_mentions")
    .select("network, sentiment")
    .eq("user_id", userId)
    .or(`posted_at.gte.${windowStart},and(posted_at.is.null,collected_at.gte.${windowStart})`);

  const list = rows ?? [];
  const total = list.length;
  const counts = { positivo: 0, neutro: 0, negativo: 0 };
  const networks: Record<string, { total: number; pos: number; neg: number; neu: number }> = {};
  for (const r of list) {
    const s = (r.sentiment as keyof typeof counts) ?? "neutro";
    counts[s]++;
    const n = (networks[r.network] ??= { total: 0, pos: 0, neg: 0, neu: 0 });
    n.total++;
    if (s === "positivo") n.pos++;
    else if (s === "negativo") n.neg++;
    else n.neu++;
  }
  const { data, error } = await supabase
    .from("sentiment_snapshots")
    .insert({
      user_id: userId,
      window_start: windowStart,
      window_end: new Date().toISOString(),
      total,
      positivo: counts.positivo,
      neutro: counts.neutro,
      negativo: counts.negativo,
      networks,
      top_topics: [],
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[sentiment] snapshot insert failed", error);
    return undefined;
  }
  return data?.id;
}
