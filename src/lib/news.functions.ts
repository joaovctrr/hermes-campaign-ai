import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";
import { manualCooldownHours, formatCooldownRemaining } from "./plan-limits";

export const listMyNews = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await context.sql`
      SELECT * FROM app.news_items
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return rows ?? [];
  });

export const getMyDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const [row] = await context.sql`
      SELECT total, last_24h, critical_24h, last_news_at
      FROM app.dashboard_stats
      WHERE user_id = ${context.userId}
    `;
    return (
      (row as
        | { total: number; last_24h: number; critical_24h: number; last_news_at: string | null }
        | undefined) ?? {
        total: 0,
        last_24h: 0,
        critical_24h: 0,
        last_news_at: null,
      }
    );
  });

export const refreshRadar = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente");

    // Plan cooldown
    const [profile] = await context.sql`
      SELECT plan FROM app.profiles WHERE id = ${context.userId}
    `;
    const cooldown = manualCooldownHours(profile?.plan);
    if (cooldown > 0) {
      const [last] = await context.sql`
        SELECT created_at FROM app.news_items
        WHERE user_id = ${context.userId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (last?.created_at) {
        const elapsed = Date.now() - new Date(last.created_at).getTime();
        const remaining = cooldown * 3600000 - elapsed;
        if (remaining > 0) {
          throw new Error(
            `Refresh manual disponível em ${formatCooldownRemaining(remaining)}. Faça upgrade do plano para atualizar quando quiser.`,
          );
        }
      }
    }

    const { refreshRadarForUser } = await import("./radar-refresh.server");
    const result = await refreshRadarForUser(context.sql, context.userId, key);
    if (result.reason === "no_themes") {
      throw new Error("Cadastre temas monitorados nas Configurações antes de atualizar o radar.");
    }
    const messages: Record<string, string> = {
      no_feed_results: "Nenhuma notícia retornada do feed. Tente novamente em alguns minutos.",
      already_fresh: "Radar já estava atualizado.",
    };
    return {
      inserted: result.inserted,
      message: result.reason
        ? (messages[result.reason] ?? "")
        : `${result.inserted} novas notícias analisadas.`,
    };
  });

export const getRadarCooldownStatus = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const [profile] = await context.sql`
      SELECT plan FROM app.profiles WHERE id = ${context.userId}
    `;
    const plan = profile?.plan ?? "basico";
    const cooldown = manualCooldownHours(plan);
    const [last] = await context.sql`
      SELECT created_at FROM app.news_items
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const lastAt = last?.created_at ? new Date(last.created_at).getTime() : 0;
    const remaining =
      cooldown > 0 && lastAt ? Math.max(0, cooldown * 3600000 - (Date.now() - lastAt)) : 0;
    return { plan, cooldownHours: cooldown, remainingMs: remaining };
  });

export const getNewsItem = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [item] = await context.sql`
      SELECT * FROM app.news_items
      WHERE id = ${data.id} AND user_id = ${context.userId}
    `;
    return item ?? null;
  });
