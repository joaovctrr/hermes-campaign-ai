import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { manualCooldownHours, formatCooldownRemaining } from "./plan-limits";

export const listMyNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("news_items")
      .select("*")
      .eq("user_id", context.userId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_dashboard_stats");
    if (error) throw new Error(error.message);
    const row = (
      data as Array<{
        total: number;
        last_24h: number;
        critical_24h: number;
        last_news_at: string | null;
      }> | null
    )?.[0];
    return row ?? { total: 0, last_24h: 0, critical_24h: 0, last_news_at: null };
  });

export const refreshRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente");

    // Plan cooldown
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("plan")
      .eq("id", context.userId)
      .maybeSingle();
    const cooldown = manualCooldownHours(profile?.plan);
    if (cooldown > 0) {
      const { data: last } = await context.supabase
        .from("news_items")
        .select("created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.created_at) {
        const elapsed = Date.now() - new Date(last.created_at).getTime();
        const remaining = cooldown * 3600000 - elapsed;
        if (remaining > 0) {
          throw new Error(
            `Refresh manual disponível em ${formatCooldownRemaining(remaining)}. Faça upgrade do plano para atualizar quando quiser.`,
          );
        }
      }
    }

    const { refreshRadarForUser } = await import("./radar-refresh.server");
    const result = await refreshRadarForUser(context.supabase, context.userId, key);
    if (result.reason === "no_themes") {
      throw new Error("Cadastre temas monitorados nas Configurações antes de atualizar o radar.");
    }
    const messages: Record<string, string> = {
      no_feed_results: "Nenhuma notícia retornada do feed. Tente novamente em alguns minutos.",
      already_fresh: "Radar já estava atualizado.",
    };
    return {
      inserted: result.inserted,
      message: result.reason
        ? (messages[result.reason] ?? "")
        : `${result.inserted} novas notícias analisadas.`,
    };
  });

export const getRadarCooldownStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("plan")
      .eq("id", context.userId)
      .maybeSingle();
    const plan = profile?.plan ?? "basico";
    const cooldown = manualCooldownHours(plan);
    const { data: last } = await context.supabase
      .from("news_items")
      .select("created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = last?.created_at ? new Date(last.created_at).getTime() : 0;
    const remaining =
      cooldown > 0 && lastAt ? Math.max(0, cooldown * 3600000 - (Date.now() - lastAt)) : 0;
    return { plan, cooldownHours: cooldown, remainingMs: remaining };
  });

export const getNewsItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: item, error } = await context.supabase
      .from("news_items")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return item;
  });
