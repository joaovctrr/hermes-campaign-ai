import { createFileRoute } from "@tanstack/react-router";

/**
 * Called by pg_cron every 6h. Authenticated via the Supabase publishable key
 * in the `apikey` header. Runs the Apify-backed sentiment refresh for every
 * onboarded profile that has at least one social handle.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-sentiment")({
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
        const apifyToken = process.env.APIFY_TOKEN;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!apifyToken || !lovableKey) {
          return new Response(JSON.stringify({ error: "missing_secrets" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { refreshSentimentForUser } = await import("@/lib/sentiment-refresh.server");

        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select("id, instagram_handle, twitter_handle, tiktok_handle, facebook_handle, mention_keywords")
          .eq("onboarded", true);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const eligible = (profiles ?? []).filter(
          (p) =>
            p.instagram_handle ||
            p.twitter_handle ||
            p.tiktok_handle ||
            p.facebook_handle ||
            (p.mention_keywords?.length ?? 0) > 0,
        );

        const results: Array<{ user_id: string; collected: number; inserted: number; reason?: string; error?: string }> = [];
        for (const p of eligible) {
          try {
            const r = await refreshSentimentForUser(supabaseAdmin, p.id, apifyToken, lovableKey);
            results.push({ user_id: p.id, ...r });
          } catch (e) {
            results.push({
              user_id: p.id,
              collected: 0,
              inserted: 0,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            users_processed: results.length,
            total_inserted: results.reduce((s, r) => s + r.inserted, 0),
            results,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
