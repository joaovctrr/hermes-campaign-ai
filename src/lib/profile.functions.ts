import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const [row] = await context.sql`
      SELECT * FROM app.profiles WHERE id = ${context.userId}
    `;
    return row ?? null;
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
  monitored_networks: z
    .array(NetworkEnum)
    .max(4)
    .default(["instagram", "twitter", "tiktok", "facebook"]),
  cron_interval_hours: z.union([z.literal(6), z.literal(12), z.literal(24)]).default(6),
  onboarded: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const patch = { ...data, onboarded: data.onboarded ?? true };
    // updated_at é atualizado pelo trigger app.profiles_touch.
    await context.sql`
      UPDATE app.profiles SET ${context.sql(patch)} WHERE id = ${context.userId}
    `;
    return { ok: true };
  });
