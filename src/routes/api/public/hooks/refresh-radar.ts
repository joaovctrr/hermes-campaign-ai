import { createFileRoute } from "@tanstack/react-router";

/**
 * Called every 3h by pg_cron. Authenticated via the project's anon key in
 * the `apikey` header (same pattern used by Supabase Data API). Runs the
 * radar refresh for every onboarded profile, then refreshes the dashboard
 * materialized view.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-radar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) {
          return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { refreshRadarForUser } = await import("@/lib/radar-refresh.server");

        const { data: profiles, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("onboarded", true);
        if (pErr) {
          return new Response(JSON.stringify({ error: pErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Array<{ user_id: string; inserted: number; reason?: string; error?: string }> = [];
        for (const p of profiles ?? []) {
          try {
            const r = await refreshRadarForUser(supabaseAdmin, p.id, lovableKey);
            results.push({ user_id: p.id, ...r });
          } catch (e) {
            results.push({ user_id: p.id, inserted: 0, error: e instanceof Error ? e.message : String(e) });
          }
        }

        await supabaseAdmin.rpc("refresh_dashboard_stats").catch(() => {});

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
