import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manualCooldownHours, formatCooldownRemaining } from "./plan-limits";

export const refreshMySentiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apifyToken = process.env.APIFY_TOKEN;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!apifyToken) throw new Error("APIFY_TOKEN não configurado");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurado");

    // Plan-based cooldown
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("plan")
      .eq("id", context.userId)
      .maybeSingle();
    const cooldown = manualCooldownHours(profile?.plan);
    if (cooldown > 0) {
      const { data: last } = await context.supabase
        .from("sentiment_snapshots")
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
            `Refresh manual disponível em ${formatCooldownRemaining(remaining)}. Faça upgrade do plano para liberar atualizações sob demanda.`,
          );
        }
      }
    }

    const { refreshSentimentForUser } = await import("@/lib/sentiment-refresh.server");
    return refreshSentimentForUser(context.supabase, context.userId, apifyToken, lovableKey);
  });

export const getLatestSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sentiment_snapshots")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const listSnapshotHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("sentiment_snapshots")
      .select("id, created_at, total, positivo, neutro, negativo")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ListInput = z.object({
  network: z.enum(["instagram", "twitter", "tiktok", "facebook"]).optional(),
  sentiment: z.enum(["positivo", "neutro", "negativo"]).optional(),
  limit: z.number().int().min(1).max(200).default(60),
});

export const listMyMentions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("social_mentions")
      .select(
        "id, network, author, content, url, sentiment, score, posted_at, collected_at, parent_post_id, parent_post_url, parent_post_caption, parent_post_thumbnail",
      )
      .eq("user_id", context.userId)
      .order("collected_at", { ascending: false })
      .limit(data.limit);
    if (data.network) q = q.eq("network", data.network);
    if (data.sentiment) q = q.eq("sentiment", data.sentiment);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getManualCooldownStatus = createServerFn({ method: "GET" })
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
      .from("sentiment_snapshots")
      .select("created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = last?.created_at ? new Date(last.created_at).getTime() : 0;
    const remaining = cooldown > 0 && lastAt ? Math.max(0, cooldown * 3600000 - (Date.now() - lastAt)) : 0;
    return { plan, cooldownHours: cooldown, remainingMs: remaining, lastAt: last?.created_at ?? null };
  });
