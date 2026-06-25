import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ limit: z.number().int().min(1).max(200).default(50) });

export const getMyCronHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("get_my_cron_history", { _limit: data.limit });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      run_id: string;
      hook: string;
      action: string;
      reason: string | null;
      interval_hours: number | null;
      plan: string | null;
      inserted_count: number | null;
      error: string | null;
      created_at: string;
      run_started_at: string | null;
      run_status: string | null;
    }>;
  });
