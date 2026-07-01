import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseSupabase = {
  // Supabase generated types are intentionally behind the new migration in this workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

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

const NetworkEnum = z.enum(["instagram", "twitter", "tiktok", "facebook"]);

const UpdateSchema = z.object({
  full_name: z.string().min(1).max(120),
  political_name: z.string().max(120).optional().nullable(),
  party: z.string().max(40).optional().nullable(),
  electoral_number: z.string().max(20).optional().nullable(),
  political_role: z.string().max(160).optional().nullable(),
  target_position: z.string().max(160).optional().nullable(),
  region: z.string().max(160).optional().nullable(),
  preferred_news_state: z.string().max(80).optional().nullable(),
  preferred_news_neighborhood: z.string().max(120).optional().nullable(),
  priority_audience: z.string().max(500).optional().nullable(),
  positioning_phrase: z.string().max(500).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  tone: z.string().max(400).optional().nullable(),
  monitored_states: z.array(z.string().min(1).max(80)).max(30).default([]),
  monitored_cities: z.array(z.string().min(1).max(120)).max(300).default([]),
  priority_cities: z.array(z.string().min(1).max(120)).max(80).default([]),
  monitored_themes: z.array(z.string().min(1).max(80)).max(20).default([]),
  instagram_handle: HandleSchema,
  twitter_handle: HandleSchema,
  tiktok_handle: HandleSchema,
  facebook_handle: HandleSchema,
  mention_keywords: z.array(z.string().min(1).max(80)).max(20).default([]),
  monitored_networks: z
    .array(NetworkEnum)
    .max(4)
    .default(["instagram", "twitter", "tiktok", "facebook"]),
  cron_interval_hours: z.union([z.literal(6), z.literal(12), z.literal(24)]).default(6),
  onboarded: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const { error } = await db.from("profiles").upsert(
      {
        id: context.userId,
        ...data,
        onboarded: data.onboarded ?? true,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
