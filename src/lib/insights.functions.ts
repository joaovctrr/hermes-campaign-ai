import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";
import { generateText } from "ai";
import { createGoogleAiProvider } from "./ai-gateway.server";

type Bucket = { positivo: number; neutro: number; negativo: number; total: number };

function emptyBucket(): Bucket {
  return { positivo: 0, neutro: 0, negativo: 0, total: 0 };
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

export const getMyInsights = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql, userId } = context;
    const now = Date.now();
    const d1 = new Date(now - 24 * 3600 * 1000).toISOString();
    const d7 = new Date(now - 7 * 86400 * 1000).toISOString();

    const [m1, m7, n7, lastSnapRows, fb] = await Promise.all([
      sql`
        SELECT sentiment, network, content FROM app.social_mentions
        WHERE user_id = ${userId} AND collected_at >= ${d1}
      `,
      sql`
        SELECT sentiment, collected_at FROM app.social_mentions
        WHERE user_id = ${userId} AND collected_at >= ${d7}
      `,
      sql`
        SELECT title, theme, urgency, summary, created_at FROM app.news_items
        WHERE user_id = ${userId} AND created_at >= ${d7}
        ORDER BY created_at DESC LIMIT 40
      `,
      sql`
        SELECT created_at, positivo, neutro, negativo, total FROM app.sentiment_snapshots
        WHERE user_id = ${userId}
        ORDER BY created_at DESC LIMIT 1
      `,
      sql`
        SELECT recommendation_text, useful, created_at FROM app.insight_feedback
        WHERE user_id = ${userId}
        ORDER BY created_at DESC LIMIT 30
      `,
    ]);
    const lastSnap = lastSnapRows[0] ?? null;

    const bucket24 = emptyBucket();
    for (const r of m1) {
      bucket24.total++;
      if (r.sentiment === "positivo") bucket24.positivo++;
      else if (r.sentiment === "negativo") bucket24.negativo++;
      else bucket24.neutro++;
    }

    const series: Array<{ day: string; positivo: number; neutro: number; negativo: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now - i * 86400 * 1000);
      const key = day.toISOString().slice(0, 10);
      series.push({ day: key, positivo: 0, neutro: 0, negativo: 0 });
    }
    const byDay = new Map(series.map((s) => [s.day, s]));
    for (const r of m7) {
      const key = new Date(r.collected_at).toISOString().slice(0, 10);
      const s = byDay.get(key);
      if (!s) continue;
      if (r.sentiment === "positivo") s.positivo++;
      else if (r.sentiment === "negativo") s.negativo++;
      else s.neutro++;
    }

    const bucket7 = emptyBucket();
    for (const s of series) {
      bucket7.positivo += s.positivo;
      bucket7.neutro += s.neutro;
      bucket7.negativo += s.negativo;
      bucket7.total += s.positivo + s.neutro + s.negativo;
    }

    const prior = series.slice(0, 6);
    const priorNegShare =
      prior.reduce((a, s) => a + s.negativo, 0) /
      Math.max(
        1,
        prior.reduce((a, s) => a + s.positivo + s.neutro + s.negativo, 0),
      );
    const todayNegShare = bucket24.total ? bucket24.negativo / bucket24.total : 0;
    const trend: "piorando" | "estavel" | "melhorando" =
      todayNegShare > priorNegShare + 0.1
        ? "piorando"
        : todayNegShare < priorNegShare - 0.1
          ? "melhorando"
          : "estavel";

    const themeMap = new Map<string, number>();
    for (const n of n7) if (n.theme) themeMap.set(n.theme, (themeMap.get(n.theme) ?? 0) + 1);
    const topThemes = [...themeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count }));

    let recommendations: string[] = [];
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (googleApiKey && (n7.length || m1.length)) {
      try {
        const google = createGoogleAiProvider(googleApiKey);
        const sampleNegatives = m1
          .filter((m) => m.sentiment === "negativo")
          .slice(0, 6)
          .map((m) => `- (${m.network}) ${String(m.content).slice(0, 160)}`)
          .join("\n");
        const sampleNews = n7
          .filter((n) => n.urgency === "alta" || n.urgency === "media")
          .slice(0, 6)
          .map((n) => `- [${n.urgency}] ${n.title}`)
          .join("\n");

        const liked = fb
          .filter((f) => f.useful)
          .slice(0, 6)
          .map((f) => `- ${f.recommendation_text}`)
          .join("\n");
        const disliked = fb
          .filter((f) => !f.useful)
          .slice(0, 10)
          .map((f) => `- ${f.recommendation_text}`)
          .join("\n");

        const prompt = `Você é um estrategista de comunicação política. Devolva 3 recomendações práticas de resposta para as próximas 48h, no formato JSON: {"recs":["...","...","..."]}. Frases curtas (máx 180 caracteres), em português, tom institucional.

Tendência (7d): ${trend}.
Sentimento 24h: ${bucket24.positivo} positivos, ${bucket24.neutro} neutros, ${bucket24.negativo} negativos.
Top temas (7d): ${topThemes.map((t) => t.theme).join(", ") || "n/d"}.
Manchetes relevantes:
${sampleNews || "n/d"}
Críticas recentes:
${sampleNegatives || "n/d"}
${liked ? `\nRecomendações que o usuário marcou como ÚTEIS (siga este estilo/abordagem):\n${liked}\n` : ""}${disliked ? `\nRecomendações marcadas como NÃO ÚTEIS — NÃO repita esse tom, conteúdo ou abordagem:\n${disliked}\n` : ""}`;
        const { text } = await generateText({
          model: google("gemini-2.5-flash"),
          prompt,
        });
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed.recs)) {
            recommendations = parsed.recs.filter((s: unknown) => typeof s === "string").slice(0, 3);
          }
        }
      } catch {
        recommendations = [];
      }
    }

    // Persist a history row (one per window) — best-effort, non-blocking on failure
    const generatedAt = new Date().toISOString();
    if (bucket24.total > 0 || bucket7.total > 0) {
      try {
        await sql`
          INSERT INTO app.insight_history
            (user_id, window_kind, generated_at, sentiment_trend, positivo_pct, neutro_pct, negativo_pct, total_mentions, top_themes, recommendations, refresh_source)
          VALUES
            (${userId}, '24h', ${generatedAt}, ${trend}, ${pct(bucket24.positivo, bucket24.total)}, ${pct(bucket24.neutro, bucket24.total)}, ${pct(bucket24.negativo, bucket24.total)}, ${bucket24.total}, ${sql.json(topThemes)}, ${sql.json(recommendations)}, 'manual'),
            (${userId}, '7d', ${generatedAt}, ${trend}, ${pct(bucket7.positivo, bucket7.total)}, ${pct(bucket7.neutro, bucket7.total)}, ${pct(bucket7.negativo, bucket7.total)}, ${bucket7.total}, ${sql.json(topThemes)}, ${sql.json(recommendations)}, 'manual')
        `;
      } catch (histErr) {
        console.error("[insights] history insert failed", histErr);
      }
    }

    return {
      bucket24,
      bucket7,
      series,
      trend,
      topThemes,
      recommendations,
      lastSnapshotAt: lastSnap?.created_at ?? null,
      lastRefreshAt: generatedAt,
      newsCount7d: n7.length,
    };
  });

const HistorySchema = z.object({
  window: z.enum(["24h", "7d"]).default("24h"),
  days: z.number().int().min(1).max(90).default(30),
});

export const getInsightHistory = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => HistorySchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const rows = await context.sql`
      SELECT id, window_kind, generated_at, sentiment_trend, positivo_pct, neutro_pct,
             negativo_pct, total_mentions, top_themes, recommendations, refresh_source
      FROM app.insight_history
      WHERE user_id = ${context.userId} AND window_kind = ${data.window} AND generated_at >= ${since}
      ORDER BY generated_at DESC
      LIMIT 200
    `;
    return rows ?? [];
  });
