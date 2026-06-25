import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SaveSchema = z.object({
  text: z.string().min(1).max(800),
  window: z.enum(["24h", "7d"]),
  useful: z.boolean(),
});

async function hashRecommendation(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text.trim().toLowerCase());
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export const saveInsightFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const hash = await hashRecommendation(data.text);
    const { error } = await context.supabase
      .from("insight_feedback")
      .upsert(
        {
          user_id: context.userId,
          recommendation_text: data.text.slice(0, 800),
          recommendation_hash: hash,
          context_window: data.window,
          useful: data.useful,
        },
        { onConflict: "user_id,recommendation_hash" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, hash };
  });

export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("insight_feedback")
      .select("recommendation_text, recommendation_hash, useful, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
