import { createFileRoute } from "@tanstack/react-router";

/**
 * Chamado periodicamente por um scheduler externo (cron do SO / tarefa agendada
 * do Coolify). Autenticado por CRON_SECRET no header `x-api-key`. Roda o radar
 * para cada profile onboarded e atualiza a materialized view do dashboard.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-radar")({
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

        const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!googleApiKey) {
          return new Response(JSON.stringify({ error: "GOOGLE_GENERATIVE_AI_API_KEY missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { sql } = await import("@/db/client.server");
        const { refreshRadarForUser } = await import("@/lib/radar-refresh.server");

        const profiles = await sql`SELECT id FROM app.profiles WHERE onboarded = true`;

        const results: Array<{
          user_id: string;
          inserted: number;
          reason?: string;
          error?: string;
        }> = [];
<<<<<<< Updated upstream
        for (const p of profiles ?? []) {
          try {
            const r = await refreshRadarForUser(supabaseAdmin, p.id, googleApiKey);
=======
        for (const p of profiles) {
          try {
            const r = await refreshRadarForUser(sql, p.id, lovableKey);
>>>>>>> Stashed changes
            results.push({ user_id: p.id, ...r });
          } catch (e) {
            results.push({
              user_id: p.id,
              inserted: 0,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        try {
<<<<<<< Updated upstream
          await supabaseAdmin.rpc("refresh_dashboard_stats");
=======
          await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY app.dashboard_stats`;
>>>>>>> Stashed changes
        } catch {
          /* ignore */
        }

        const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
        return new Response(
          JSON.stringify({
            ok: true,
            users_processed: results.length,
            total_inserted: totalInserted,
            results,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
