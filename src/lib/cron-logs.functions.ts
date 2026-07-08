import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";

const Input = z.object({ limit: z.number().int().min(1).max(200).default(50) });

export const getMyCronHistory = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => Input.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const rows = await context.sql`
      SELECT cul.id, cul.run_id, cul.hook, cul.action, cul.reason,
             cul.interval_hours, cul.plan, cul.inserted_count, cul.error,
             cul.created_at, crl.started_at AS run_started_at, crl.status AS run_status
      FROM app.cron_user_logs cul
      LEFT JOIN app.cron_run_logs crl ON crl.id = cul.run_id
      WHERE cul.user_id = ${context.userId}
      ORDER BY cul.created_at DESC
      LIMIT ${data.limit}
    `;
    return (rows ?? []) as unknown as Array<{
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
