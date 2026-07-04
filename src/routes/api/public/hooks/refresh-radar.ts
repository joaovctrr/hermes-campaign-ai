import { createFileRoute } from "@tanstack/react-router";
import { authorizePublicHook } from "@/lib/public-hook-auth.server";

/**
 * Called every 3h by pg_cron. Authenticated via CRON_HOOK_SECRET in
 * Authorization: Bearer, x-api-key or apikey. Runs the radar refresh for
 * every onboarded profile, then refreshes the dashboard materialized view.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-radar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizePublicHook(request);
        if (unauthorized) return unauthorized;

        const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!googleApiKey) {
          return new Response(JSON.stringify({ error: "GOOGLE_GENERATIVE_AI_API_KEY missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { refreshRadarForUser } = await import("@/lib/radar-refresh.server");

        const { data: profiles, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, plan, radar_interval_hours")
          .eq("onboarded", true);
        if (pErr) {
          return new Response(JSON.stringify({ error: pErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Array<{
          user_id: string;
          inserted: number;
          reason?: string;
          error?: string;
        }> = [];
        for (const p of profiles ?? []) {
          try {
            const interval = p.radar_interval_hours ?? 24;
            const { data: last } = await supabaseAdmin
              .from("news_items")
              .select("created_at")
              .eq("user_id", p.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const lastMs = last?.created_at ? new Date(last.created_at).getTime() : 0;
            const dueMs = Date.now() - interval * 3600 * 1000 + 5 * 60 * 1000;
            if (lastMs > dueMs) {
              results.push({ user_id: p.id, inserted: 0, reason: "within_interval" });
              continue;
            }

            const r = await refreshRadarForUser(supabaseAdmin, p.id, googleApiKey);
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
          await supabaseAdmin.rpc("refresh_dashboard_stats");
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
