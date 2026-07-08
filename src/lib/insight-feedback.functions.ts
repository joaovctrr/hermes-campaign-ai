import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";

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
  .middleware([requireAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const hash = await hashRecommendation(data.text);
    await context.sql`
      INSERT INTO app.insight_feedback (user_id, recommendation_text, recommendation_hash, context_window, useful)
      VALUES (${context.userId}, ${data.text.slice(0, 800)}, ${hash}, ${data.window}, ${data.useful})
      ON CONFLICT (user_id, recommendation_hash) DO UPDATE SET
        recommendation_text = EXCLUDED.recommendation_text,
        context_window = EXCLUDED.context_window,
        useful = EXCLUDED.useful
    `;
    return { ok: true, hash };
  });

export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const rows = await context.sql`
      SELECT recommendation_text, recommendation_hash, useful, created_at
      FROM app.insight_feedback
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return rows ?? [];
  });
