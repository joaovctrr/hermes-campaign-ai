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
import { buildCandidateAliases, inferSentimentForCandidate } from "./sentiment-rules";

type Classified = RawMention & { sentiment: "positivo" | "neutro" | "negativo"; score: number };
type SentimentProfile = {
  full_name?: string | null;
  political_role?: string | null;
  bio?: string | null;
  tone?: string | null;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  tiktok_handle?: string | null;
  facebook_handle?: string | null;
  mention_keywords?: string[] | null;
};

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
      "full_name, political_role, bio, tone, instagram_handle, twitter_handle, tiktok_handle, facebook_handle, mention_keywords, monitored_networks",
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

  const classified = await classifyBatch(toClassify, googleApiKey, profile);

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

async function classifyBatch(
  items: RawMention[],
  googleApiKey: string,
  profile: SentimentProfile,
): Promise<Classified[]> {
  const google = createGoogleAiProvider(googleApiKey);
  const model = google("gemini-3-flash-preview");
  const aliases = buildCandidateAliases(profile);

  const prompt = `Você é um analista de sentimento político em PT-BR. Classifique CADA comentário pelo sentimento do autor EM RELAÇÃO AO CANDIDATO/PERFIL MONITORADO, não pelo clima geral do assunto. Retorne SOMENTE um JSON array (sem markdown), com objetos {"i": <indice>, "s": "positivo"|"neutro"|"negativo", "score": <0..1 confiança>}.

CANDIDATO/PERFIL MONITORADO:
- Nome: ${profile.full_name ?? "não informado"}
- Cargo: ${profile.political_role ?? "não informado"}
- Handles/apelidos: ${aliases.join(", ") || "não informado"}
- Posicionamento/bandeiras: ${profile.bio ?? "não informado"}

Critério obrigatório:
- positivo: fala bem do candidato, apoia o candidato, elogia o trabalho/posicionamento dele, concorda com a defesa feita por ele, agradece, parabeniza ou usa emojis de apoio em contexto de apoio.
- negativo: critica o candidato, rejeita o candidato, acusa, cobra de forma hostil, ironiza contra ele, xinga, diz que ele não fez/faz nada, ou ataca o posicionamento dele.
- neutro: não menciona juízo positivo/negativo sobre o candidato nem seu posicionamento; é só informação, pergunta genuína, marcação, legenda factual ou comentário sobre terceiros.
- Se o comentário está no post do próprio candidato e diz "defende a classe", "parabéns", "apoio", "representa", "estamos juntos", classifique positivo.
- Se o comentário está no post do próprio candidato e diz "vergonha", "não fez nada", "mentiroso", "fora", "cadê", "incompetente", classifique negativo.
- Emoji isolado de aplauso, coração, joinha, força ou parabéns em post do candidato é positivo. Emoji isolado sem polaridade é neutro.

Itens:
${items
  .map(
    (m, i) =>
      `${i}. [${m.network}] autor=${m.author ?? "?"} comentario="${m.content.slice(0, 420)}"${
        m.parent_post_caption ? ` | post="${m.parent_post_caption.slice(0, 180)}"` : ""
      }`,
  )
  .join("\n")}`;

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
    const inferredSentiment = inferSentimentForCandidate(m.content, aliases);
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
  if (modelSentiment !== inferredSentiment && inferredSentiment !== "neutro")
    return inferredSentiment;
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
