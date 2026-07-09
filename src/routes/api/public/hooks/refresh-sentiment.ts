import { createFileRoute } from "@tanstack/react-router";

/**
 * Chamado por um scheduler externo (cron do SO / tarefa agendada do Coolify).
 * Autenticado por CRON_SECRET no header `x-api-key`. Roda o refresh de sentimento
 * (Apify) para cada profile onboarded com pelo menos um handle e que já passou do
 * intervalo do plano/usuário. Grava logs de execução e por usuário.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-sentiment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("x-api-key") ?? request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.CRON_SECRET) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const apifyToken = process.env.APIFY_TOKEN;
        const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apifyToken || !googleApiKey) {
          return new Response(JSON.stringify({ error: "missing_secrets" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { sql } = await import("@/db/client.server");
        const { refreshSentimentForUser } = await import("@/lib/sentiment-refresh.server");

        const HOOK = "refresh-sentiment";

        // Open a run row
        const [runRow] = await sql`
          INSERT INTO app.cron_run_logs (hook, status) VALUES (${HOOK}, 'running') RETURNING id
        `;
        const runId = runRow?.id ?? null;

        async function logUser(
          userId: string,
          action: "processed" | "skipped",
          reason: string | null,
          interval: number | null,
          plan: string | null,
          inserted: number | null,
          err: string | null,
        ) {
          if (!runId) return;
          await sql`
            INSERT INTO app.cron_user_logs (run_id, user_id, hook, action, reason, interval_hours, plan, inserted_count, error)
            VALUES (${runId}, ${userId}, ${HOOK}, ${action}, ${reason}, ${interval}, ${plan}, ${inserted}, ${err})
          `;
        }

        let profiles: Array<Record<string, any>>;
        try {
          profiles = await sql`
            SELECT id, instagram_handle, twitter_handle, tiktok_handle, facebook_handle,
                   mention_keywords, monitored_networks, cron_interval_hours, plan
            FROM app.profiles WHERE onboarded = true
          `;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (runId) {
            await sql`
              UPDATE app.cron_run_logs
              SET status = 'error', error = ${msg}, finished_at = now()
              WHERE id = ${runId}
            `;
          }
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const planMin = (plan: string | null) =>
          plan === "enterprise" ? 6 : plan === "avancado" ? 12 : 24;

        let processed = 0;
        let skipped = 0;
        const results: Array<Record<string, unknown>> = [];

        for (const p of profiles) {
          const nets: string[] = p.monitored_networks ?? [];
          const hasSource =
            (nets.includes("instagram") && p.instagram_handle) ||
            (nets.includes("twitter") && (p.twitter_handle || (p.mention_keywords?.length ?? 0))) ||
            (nets.includes("tiktok") && p.tiktok_handle) ||
            (nets.includes("facebook") && p.facebook_handle);

          const interval = Math.max(p.cron_interval_hours ?? 6, planMin(p.plan));

          if (!hasSource) {
            skipped++;
            await logUser(p.id, "skipped", "no_handles", interval, p.plan, null, null);
            continue;
          }

          const [last] = await sql`
            SELECT created_at FROM app.sentiment_snapshots
            WHERE user_id = ${p.id}
            ORDER BY created_at DESC LIMIT 1
          `;
          const lastMs = last?.created_at ? new Date(last.created_at).getTime() : 0;
          const dueMs = Date.now() - interval * 3600 * 1000 + 5 * 60 * 1000;

          if (lastMs > dueMs) {
            skipped++;
            const reason =
              interval > (p.cron_interval_hours ?? 6) ? "plan_floor" : "within_interval";
            await logUser(p.id, "skipped", reason, interval, p.plan, null, null);
            continue;
          }

          try {
            const r = await refreshSentimentForUser(sql, p.id, apifyToken, googleApiKey);
            processed++;
            await logUser(p.id, "processed", r.reason ?? null, interval, p.plan, r.inserted, null);
            results.push({ user_id: p.id, ...r });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await logUser(p.id, "processed", "error", interval, p.plan, 0, msg);
            results.push({ user_id: p.id, inserted: 0, error: msg });
          }
        }

        if (runId) {
          await sql`
            UPDATE app.cron_run_logs
            SET status = 'ok', finished_at = now(),
                users_total = ${profiles.length}, users_processed = ${processed}, users_skipped = ${skipped}
            WHERE id = ${runId}
          `;
        }

        return new Response(
          JSON.stringify({
            ok: true,
            run_id: runId,
            users_total: profiles.length,
            users_processed: processed,
            users_skipped: skipped,
            results,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
