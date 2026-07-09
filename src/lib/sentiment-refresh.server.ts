import { generateText } from "ai";
import type { Sql } from "@/db/client.server";
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
  sql: Sql,
  userId: string,
  apifyToken: string,
  googleApiKey: string,
): Promise<{ collected: number; inserted: number; snapshot_id?: string; reason?: string }> {
  const [profile] = await sql`
    SELECT instagram_handle, twitter_handle, tiktok_handle, facebook_handle, mention_keywords, monitored_networks
    FROM app.profiles WHERE id = ${userId}
  `;
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

  // Dedup against DB
  const ids = all.map((m) => m.external_id);
  const existing = await sql`
    SELECT external_id FROM app.social_mentions
    WHERE user_id = ${userId} AND external_id = ANY(${ids})
  `;
  const existingSet = new Set(existing.map((r) => (r as { external_id: string }).external_id));
  const novel = all.filter((m) => !existingSet.has(m.external_id)).slice(0, 80);

  if (!novel.length) {
    await writeSnapshot(sql, userId);
    return { collected: all.length, inserted: 0, reason: "already_fresh" };
  }

  // Classify in one batch
  const classified = await classifyBatch(novel, googleApiKey);

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

  await sql`
    INSERT INTO app.social_mentions ${sql(
      rows,
      "user_id",
      "network",
      "source_type",
      "external_id",
      "author",
      "content",
      "url",
      "sentiment",
      "score",
      "posted_at",
      "parent_post_id",
      "parent_post_url",
      "parent_post_caption",
      "parent_post_thumbnail",
    )}
    ON CONFLICT (user_id, network, external_id) DO NOTHING
  `;

  const snap = await writeSnapshot(sql, userId);
  return { collected: all.length, inserted: rows.length, snapshot_id: snap };
}

function safeDate(s: string): string | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function classifyBatch(items: RawMention[], googleApiKey: string): Promise<Classified[]> {
  const google = createGoogleAiProvider(googleApiKey);
  const model = google("gemini-3-flash-preview");

  const prompt = `Você é um analista de sentimento político em PT-BR. Para CADA item retorne SOMENTE um JSON array (sem markdown), com objetos {"i": <indice>, "s": "positivo"|"neutro"|"negativo", "score": <0..1 confiança>}.
Critério:
- positivo: elogio, apoio, gratidão.
- negativo: crítica, raiva, ataque, denúncia, sarcasmo hostil.
- neutro: informativo, neutro, pergunta sem juízo.

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
    const s = (p?.s as Classified["sentiment"]) || "neutro";
    return {
      ...m,
      sentiment: ["positivo", "neutro", "negativo"].includes(s) ? s : "neutro",
      score: p?.score ?? 0.5,
    };
  });
}

async function writeSnapshot(sql: Sql, userId: string): Promise<string | undefined> {
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await sql`
    SELECT network, sentiment FROM app.social_mentions
    WHERE user_id = ${userId} AND collected_at >= ${windowStart}
  `;

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
  try {
    const [inserted] = await sql`
      INSERT INTO app.sentiment_snapshots
        (user_id, window_start, window_end, total, positivo, neutro, negativo, networks, top_topics)
      VALUES
        (${userId}, ${windowStart}, ${new Date().toISOString()}, ${total},
         ${counts.positivo}, ${counts.neutro}, ${counts.negativo}, ${sql.json(networks)}, ${sql.json([])})
      RETURNING id
    `;
    return inserted?.id;
  } catch (error) {
    console.error("[sentiment] snapshot insert failed", error);
    return undefined;
  }
}
