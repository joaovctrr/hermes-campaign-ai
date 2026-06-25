import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

type Bucket = { positivo: number; neutro: number; negativo: number; total: number };

function emptyBucket(): Bucket {
  return { positivo: 0, neutro: 0, negativo: 0, total: 0 };
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

export const getMyInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const now = Date.now();
    const d1 = new Date(now - 24 * 3600 * 1000).toISOString();
    const d7 = new Date(now - 7 * 86400 * 1000).toISOString();

    const [mentions1, mentions7, news7, lastSnap, feedback] = await Promise.all([
      supabase
        .from("social_mentions")
        .select("sentiment, network, content")
        .eq("user_id", userId)
        .gte("collected_at", d1),
      supabase
        .from("social_mentions")
        .select("sentiment, collected_at")
        .eq("user_id", userId)
        .gte("collected_at", d7),
      supabase
        .from("news_items")
        .select("title, theme, urgency, summary, created_at")
        .eq("user_id", userId)
        .gte("created_at", d7)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("sentiment_snapshots")
        .select("created_at, positivo, neutro, negativo, total")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("insight_feedback")
        .select("recommendation_text, useful, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const m1 = mentions1.data ?? [];
    const m7 = mentions7.data ?? [];
    const n7 = news7.data ?? [];
    const fb = feedback.data ?? [];

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
      Math.max(1, prior.reduce((a, s) => a + s.positivo + s.neutro + s.negativo, 0));
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
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (lovableKey && (n7.length || m1.length)) {
      try {
        const provider = createLovableAiGatewayProvider(lovableKey);
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

        const liked = fb.filter((f) => f.useful).slice(0, 6).map((f) => `- ${f.recommendation_text}`).join("\n");
        const disliked = fb.filter((f) => !f.useful).slice(0, 10).map((f) => `- ${f.recommendation_text}`).join("\n");

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
          model: provider.chatModel("google/gemini-2.5-flash"),
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
      const recsJson = recommendations;
      const themesJson = topThemes;
      const rows = [
        {
          user_id: userId,
          window_kind: "24h",
          generated_at: generatedAt,
          sentiment_trend: trend,
          positivo_pct: pct(bucket24.positivo, bucket24.total),
          neutro_pct: pct(bucket24.neutro, bucket24.total),
          negativo_pct: pct(bucket24.negativo, bucket24.total),
          total_mentions: bucket24.total,
          top_themes: themesJson,
          recommendations: recsJson,
          refresh_source: "manual",
        },
        {
          user_id: userId,
          window_kind: "7d",
          generated_at: generatedAt,
          sentiment_trend: trend,
          positivo_pct: pct(bucket7.positivo, bucket7.total),
          neutro_pct: pct(bucket7.neutro, bucket7.total),
          negativo_pct: pct(bucket7.negativo, bucket7.total),
          total_mentions: bucket7.total,
          top_themes: themesJson,
          recommendations: recsJson,
          refresh_source: "manual",
        },
      ];
      const { error: histErr } = await supabase.from("insight_history").insert(rows);
      if (histErr) console.error("[insights] history insert failed", histErr);
    }

    return {
      bucket24,
      bucket7,
      series,
      trend,
      topThemes,
      recommendations,
      lastSnapshotAt: lastSnap.data?.created_at ?? null,
      lastRefreshAt: generatedAt,
      newsCount7d: n7.length,
    };
  });

const HistorySchema = z.object({
  window: z.enum(["24h", "7d"]).default("24h"),
  days: z.number().int().min(1).max(90).default(30),
});

export const getInsightHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HistorySchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("insight_history")
      .select(
        "id, window_kind, generated_at, sentiment_trend, positivo_pct, neutro_pct, negativo_pct, total_mentions, top_themes, recommendations, refresh_source",
      )
      .eq("user_id", context.userId)
      .eq("window_kind", data.window)
      .gte("generated_at", since)
      .order("generated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
