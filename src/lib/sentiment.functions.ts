import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";
import { manualCooldownHours, formatCooldownRemaining } from "./plan-limits";

export const refreshMySentiment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const apifyToken = process.env.APIFY_TOKEN;
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apifyToken) throw new Error("APIFY_TOKEN não configurado");
    if (!googleApiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY não configurado");

    // Plan-based cooldown
    const [profile] = await context.sql`
      SELECT plan FROM app.profiles WHERE id = ${context.userId}
    `;
    const cooldown = manualCooldownHours(profile?.plan);
    if (cooldown > 0) {
      const [last] = await context.sql`
        SELECT created_at FROM app.sentiment_snapshots
        WHERE user_id = ${context.userId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
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
<<<<<<< Updated upstream
    return refreshSentimentForUser(context.supabase, context.userId, apifyToken, googleApiKey);
=======
    return refreshSentimentForUser(context.sql, context.userId, apifyToken, lovableKey);
>>>>>>> Stashed changes
  });

export const getLatestSnapshot = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const [row] = await context.sql`
      SELECT * FROM app.sentiment_snapshots
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return row ?? null;
  });

export const listSnapshotHistory = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await context.sql`
      SELECT id, created_at, total, positivo, neutro, negativo
      FROM app.sentiment_snapshots
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 30
    `;
    return rows ?? [];
  });

const ListInput = z.object({
  network: z.enum(["instagram", "twitter", "tiktok", "facebook"]).optional(),
  sentiment: z.enum(["positivo", "neutro", "negativo"]).optional(),
  limit: z.number().int().min(1).max(200).default(60),
});

export const listMyMentions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { sql } = context;
    const rows = await sql`
      SELECT id, network, author, content, url, sentiment, score, posted_at, collected_at,
             parent_post_id, parent_post_url, parent_post_caption, parent_post_thumbnail
      FROM app.social_mentions
      WHERE user_id = ${context.userId}
        ${data.network ? sql`AND network = ${data.network}` : sql``}
        ${data.sentiment ? sql`AND sentiment = ${data.sentiment}` : sql``}
      ORDER BY collected_at DESC
      LIMIT ${data.limit}
    `;
    return rows ?? [];
  });

export const getManualCooldownStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const [profile] = await context.sql`
      SELECT plan FROM app.profiles WHERE id = ${context.userId}
    `;
    const plan = profile?.plan ?? "basico";
    const cooldown = manualCooldownHours(plan);
    const [last] = await context.sql`
      SELECT created_at FROM app.sentiment_snapshots
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const lastAt = last?.created_at ? new Date(last.created_at).getTime() : 0;
    const remaining =
      cooldown > 0 && lastAt ? Math.max(0, cooldown * 3600000 - (Date.now() - lastAt)) : 0;
    return {
      plan,
      cooldownHours: cooldown,
      remainingMs: remaining,
      lastAt: last?.created_at ?? null,
    };
  });
