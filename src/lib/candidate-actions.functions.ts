import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OptionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const CandidateActionSchema = z.object({
  action_type: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(240),
  description: OptionalText,
  theme: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  source: z
    .string()
    .trim()
    .max(160)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  source_url: z
    .string()
    .trim()
    .url("Informe uma URL vÃ¡lida")
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((v) => (v ? v : null)),
  action_date: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((v) => (v ? v : null)),
  legislature: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

export const listMyCandidateActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("candidate_actions")
      .select("*")
      .eq("user_id", context.userId)
      .order("action_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCandidateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CandidateActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("candidate_actions")
      .insert({
        ...data,
        user_id: context.userId,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });

export const updateCandidateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
      })
      .merge(CandidateActionSchema)
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...values } = data;
    const { data: updated, error } = await context.supabase
      .from("candidate_actions")
      .update(values)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteCandidateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("candidate_actions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

