import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("news_items")
      .select("*")
      .eq("user_id", context.userId)
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
    const row = (data as Array<{ total: number; last_24h: number; critical_24h: number; last_news_at: string | null }> | null)?.[0];
    return row ?? { total: 0, last_24h: 0, critical_24h: 0, last_news_at: null };
  });

export const refreshRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
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
      message: result.reason ? messages[result.reason] ?? "" : `${result.inserted} novas notícias analisadas.`,
    };
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
