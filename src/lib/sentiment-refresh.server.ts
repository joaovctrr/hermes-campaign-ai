import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
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
 * sentiment with Lovable AI in a single batch, upserts mentions and writes
 * a snapshot row. Returns aggregate counters for the caller.
 */
export async function refreshSentimentForUser(
  supabase: SupabaseClient,
  userId: string,
  apifyToken: string,
  lovableKey: string,
): Promise<{ collected: number; inserted: number; snapshot_id?: string; reason?: string }> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("instagram_handle, twitter_handle, tiktok_handle, facebook_handle, mention_keywords, monitored_networks")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!profile) return { collected: 0, inserted: 0, reason: "no_profile" };

  const nets: string[] = profile.monitored_networks ?? ["instagram", "twitter", "tiktok", "facebook"];
  const on = (n: string) => nets.includes(n);

  const tasks: Array<Promise<RawMention[]>> = [];
  if (on("instagram") && profile.instagram_handle) tasks.push(fetchInstagramMentions(profile.instagram_handle, apifyToken));
  if (on("twitter") && (profile.twitter_handle || (profile.mention_keywords?.length ?? 0)))
    tasks.push(fetchTwitterMentions(profile.twitter_handle ?? null, profile.mention_keywords ?? [], apifyToken));
  if (on("tiktok") && profile.tiktok_handle) tasks.push(fetchTiktokMentions(profile.tiktok_handle, apifyToken));
  if (on("facebook") && profile.facebook_handle) tasks.push(fetchFacebookMentions(profile.facebook_handle, apifyToken));

  if (!tasks.length) return { collected: 0, inserted: 0, reason: "no_networks_selected" };

  const results = await Promise.allSettled(tasks);
  const all: RawMention[] = [];
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
  if (!all.length) return { collected: 0, inserted: 0, reason: "no_results" };

  // Dedup against DB
  const ids = all.map((m) => m.external_id);
  const { data: existing } = await supabase
    .from("social_mentions")
    .select("external_id")
    .eq("user_id", userId)
    .in("external_id", ids);
  const existingSet = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));
  const novel = all.filter((m) => !existingSet.has(m.external_id)).slice(0, 80);

  if (!novel.length) {
    await writeSnapshot(supabase, userId);
    return { collected: all.length, inserted: 0, reason: "already_fresh" };
  }

  // Classify in one batch
  const classified = await classifyBatch(novel, lovableKey);

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
  }));

  const { error: insErr } = await supabase
    .from("social_mentions")
    .upsert(rows, { onConflict: "user_id,network,external_id", ignoreDuplicates: true });
  if (insErr) throw new Error(insErr.message);

  const snap = await writeSnapshot(supabase, userId);
  return { collected: all.length, inserted: rows.length, snapshot_id: snap };
}

function safeDate(s: string): string | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

async function classifyBatch(items: RawMention[], lovableKey: string): Promise<Classified[]> {
  const gateway = createLovableAiGatewayProvider(lovableKey);
  const model = gateway("google/gemini-3-flash-preview");

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
    return { ...m, sentiment: ["positivo", "neutro", "negativo"].includes(s) ? s : "neutro", score: p?.score ?? 0.5 };
  });
}

async function writeSnapshot(supabase: SupabaseClient, userId: string): Promise<string | undefined> {
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from("social_mentions")
    .select("network, sentiment")
    .eq("user_id", userId)
    .gte("collected_at", windowStart);

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
