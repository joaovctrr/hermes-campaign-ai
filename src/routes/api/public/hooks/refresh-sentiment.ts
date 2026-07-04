import { createFileRoute } from "@tanstack/react-router";
import { authorizePublicHook } from "@/lib/public-hook-auth.server";

/**
 * Called by pg_cron every 6h. Authenticated via CRON_HOOK_SECRET.
 * Runs Apify-backed sentiment refresh for each onboarded profile that has
 * at least one social handle and is past its plan/user-defined interval.
 * Writes structured run + per-user logs so users can audit the cron in the UI.
 */
export const Route = createFileRoute("/api/public/hooks/refresh-sentiment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizePublicHook(request);
        if (unauthorized) return unauthorized;

        const apifyToken = process.env.APIFY_TOKEN;
        const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apifyToken || !googleApiKey) {
          return new Response(JSON.stringify({ error: "missing_secrets" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { refreshSentimentForUser } = await import("@/lib/sentiment-refresh.server");

        const HOOK = "refresh-sentiment";

        // Open a run row
        const { data: runRow } = await supabaseAdmin
          .from("cron_run_logs")
          .insert({ hook: HOOK, status: "running" })
          .select("id")
          .maybeSingle();
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
          await supabaseAdmin.from("cron_user_logs").insert({
            run_id: runId,
            user_id: userId,
            hook: HOOK,
            action,
            reason,
            interval_hours: interval,
            plan,
            inserted_count: inserted,
            error: err,
          });
        }

        const { data: profiles, error } = await supabaseAdmin
          .from("profiles")
          .select(
            "id, instagram_handle, twitter_handle, tiktok_handle, facebook_handle, mention_keywords, monitored_networks, cron_interval_hours, plan, radar_interval_hours, sentiment_enabled",
          )
          .eq("onboarded", true);
        if (error) {
          if (runId) {
            await supabaseAdmin
              .from("cron_run_logs")
              .update({
                status: "error",
                error: error.message,
                finished_at: new Date().toISOString(),
              })
              .eq("id", runId);
          }
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const all = profiles ?? [];
        let processed = 0;
        let skipped = 0;
        const results: Array<Record<string, unknown>> = [];

        for (const p of all) {
          if (!p.sentiment_enabled) {
            skipped++;
            await logUser(
              p.id,
              "skipped",
              "plan_locked",
              p.radar_interval_hours ?? 24,
              p.plan,
              null,
              null,
            );
            continue;
          }

          const nets: string[] = p.monitored_networks ?? [];
          const hasSource =
            (nets.includes("instagram") && p.instagram_handle) ||
            (nets.includes("twitter") && (p.twitter_handle || (p.mention_keywords?.length ?? 0))) ||
            (nets.includes("tiktok") && p.tiktok_handle) ||
            (nets.includes("facebook") && p.facebook_handle);

          const interval = Math.max(p.cron_interval_hours ?? 6, p.radar_interval_hours ?? 24);

          if (!hasSource) {
            skipped++;
            await logUser(p.id, "skipped", "no_handles", interval, p.plan, null, null);
            continue;
          }

          const { data: last } = await supabaseAdmin
            .from("sentiment_snapshots")
            .select("created_at")
            .eq("user_id", p.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
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
            const r = await refreshSentimentForUser(supabaseAdmin, p.id, apifyToken, googleApiKey);
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
          await supabaseAdmin
            .from("cron_run_logs")
            .update({
              status: "ok",
              finished_at: new Date().toISOString(),
              users_total: all.length,
              users_processed: processed,
              users_skipped: skipped,
            })
            .eq("id", runId);
        }

        return new Response(
          JSON.stringify({
            ok: true,
            run_id: runId,
            users_total: all.length,
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
