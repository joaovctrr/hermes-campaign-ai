import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanAccess = {
  plan: string;
  trialEndsAt: string | null;
  hasPaymentMethod: boolean;
  subscriptionStatus: string;
  maxUsers: number;
  radarIntervalHours: number;
  monthlyPostLimit: number | null;
  uploadFileLimit: number | null;
  intelligenceEnabled: boolean;
  sentimentEnabled: boolean;
  manualRefreshEnabled: boolean;
  realtimeAlertsEnabled: boolean;
};

export async function getPlanAccess(supabase: SupabaseClient, userId: string): Promise<PlanAccess> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "plan, trial_ends_at, has_payment_method, subscription_status, max_users, radar_interval_hours, monthly_post_limit, upload_file_limit, intelligence_enabled, sentiment_enabled, manual_refresh_enabled, realtime_alerts_enabled",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    plan: data?.plan ?? "basico",
    trialEndsAt: data?.trial_ends_at ?? null,
    hasPaymentMethod: Boolean(data?.has_payment_method),
    subscriptionStatus: data?.subscription_status ?? "active",
    maxUsers: data?.max_users ?? 1,
    radarIntervalHours: data?.radar_interval_hours ?? 24,
    monthlyPostLimit: data?.monthly_post_limit ?? 3,
    uploadFileLimit: data?.upload_file_limit ?? 1,
    intelligenceEnabled: data?.intelligence_enabled ?? false,
    sentimentEnabled: data?.sentiment_enabled ?? false,
    manualRefreshEnabled: data?.manual_refresh_enabled ?? false,
    realtimeAlertsEnabled: data?.realtime_alerts_enabled ?? false,
  };
}

export function assertFeature(allowed: boolean, message: string) {
  if (!allowed) {
    const error = new Error(message);
    error.name = "PlanUpgradeRequired";
    throw error;
  }
}

export function currentMonthStart() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}
