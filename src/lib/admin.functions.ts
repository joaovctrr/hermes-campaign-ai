import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";
import type { Sql } from "@/db/client.server";

async function isAdmin(sql: Sql, userId: string): Promise<boolean> {
  const [row] = await sql`
    SELECT 1 FROM app.user_roles
    WHERE user_id = ${userId} AND role = 'admin'
    LIMIT 1
  `;
  return Boolean(row);
}

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    try {
      return await isAdmin(context.sql, context.userId);
    } catch {
      return false;
    }
  });

const PlanEnum = z.enum(["basico", "avancado", "enterprise"]);

export const setMyPlan = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ plan: PlanEnum }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.sql, context.userId))) throw new Error("Forbidden");
    await context.sql`
      UPDATE app.profiles SET plan = ${data.plan} WHERE id = ${context.userId}
    `;
    return { ok: true, plan: data.plan };
  });
