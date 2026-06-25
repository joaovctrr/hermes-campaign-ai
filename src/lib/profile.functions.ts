import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const HandleSchema = z
  .string()
  .max(80)
  .transform((s) => s.replace(/^@/, "").trim())
  .optional()
  .nullable();

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(120),
  political_role: z.string().max(160).optional().nullable(),
  region: z.string().max(160).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  tone: z.string().max(400).optional().nullable(),
  monitored_themes: z.array(z.string().min(1).max(80)).max(20).default([]),
  instagram_handle: HandleSchema,
  twitter_handle: HandleSchema,
  tiktok_handle: HandleSchema,
  facebook_handle: HandleSchema,
  mention_keywords: z.array(z.string().min(1).max(80)).max(20).default([]),
  onboarded: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ ...data, onboarded: data.onboarded ?? true })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
