import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFeature, getPlanAccess } from "@/lib/plan-access.server";
import { formatCooldownRemaining, manualCooldownHours } from "@/lib/plan-limits";

type LooseSupabase = {
  // Supabase generated types are intentionally behind the new migration in this workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type MentionRow = {
  id: string;
  source_name: string | null;
  source_url: string | null;
  source_type: string | null;
  title: string;
  content_snippet: string | null;
  full_content: string | null;
  published_at: string | null;
  collected_at: string | null;
  created_at: string | null;
  city: string | null;
  state: string | null;
  theme: string | null;
  mention_type: string | null;
  sentiment: string | null;
  urgency: string | null;
  relevance_score: number | null;
  is_read: boolean | null;
};

type StrategicProfile = {
  full_name?: string | null;
  political_name?: string | null;
  mention_keywords?: string[] | null;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  tiktok_handle?: string | null;
  facebook_handle?: string | null;
  monitored_states?: string[] | null;
  monitored_cities?: string[] | null;
  priority_cities?: string[] | null;
};

const SourceInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160),
  url: z.string().trim().url(),
  source_type: z.string().trim().min(2).max(60).default("portal"),
  state: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  theme: z.string().trim().max(120).optional().nullable(),
  priority_level: z.enum(["baixa", "media", "alta", "estrategica"]).default("media"),
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const listMentionRadar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const [profileResult, mentionsResult, socialResult, newsResult] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      db
        .from("mentions")
        .select("*")
        .eq("user_id", context.userId)
        .eq("is_archived", false)
        .eq("is_false_positive", false)
        .order("collected_at", { ascending: false })
        .limit(120),
      context.supabase
        .from("social_mentions")
        .select(
          "id, network, author, content, url, sentiment, theme, geography, relevance_score, posted_at, collected_at, crisis_alert, parent_post_caption",
        )
        .eq("user_id", context.userId)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .order("collected_at", { ascending: false })
        .limit(120),
      context.supabase
        .from("news_items")
        .select(
          "id, title, source, url, summary, theme, urgency, state, neighborhood, published_at, created_at",
        )
        .eq("user_id", context.userId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(180),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (mentionsResult.error) throw new Error(mentionsResult.error.message);
    if (socialResult.error) throw new Error(socialResult.error.message);
    if (newsResult.error) throw new Error(newsResult.error.message);

    const profile = profileResult.data as typeof profileResult.data & StrategicProfile;
    const candidateTerms = candidateMentionTerms(profile);

    const webMentions = ((mentionsResult.data ?? []) as MentionRow[])
      .filter((item) =>
        containsCandidateTerm(
          `${item.title} ${item.content_snippet ?? ""} ${item.full_content ?? ""}`,
          candidateTerms,
        ),
      )
      .map((item) => ({
        id: `mention:${item.id}`,
        sourceId: item.id,
        origin: "mention" as const,
        title: item.title,
        source: item.source_name ?? item.source_type ?? "Menção",
        sourceType: item.source_type ?? "web",
        url: item.source_url,
        date: item.published_at ?? item.collected_at ?? item.created_at ?? new Date().toISOString(),
        city: item.city,
        state: item.state,
        snippet: item.content_snippet ?? item.full_content ?? "",
        sentiment: item.sentiment ?? "neutra",
        urgency: item.urgency ?? "baixa",
        relevance: item.relevance_score ?? 1,
        theme: item.theme ?? "Outros",
        mentionType: directMentionType(
          `${item.title} ${item.content_snippet ?? ""} ${item.full_content ?? ""}`,
          candidateTerms,
        ),
        isRead: item.is_read ?? false,
      }));

    const socialMentions = (socialResult.data ?? [])
      .filter((item) =>
        containsCandidateTerm(`${item.content} ${item.parent_post_caption ?? ""}`, candidateTerms),
      )
      .map((item) => ({
        id: `social:${item.id}`,
        sourceId: item.id,
        origin: "social" as const,
        title: item.content.slice(0, 96),
        source: item.network,
        sourceType: "comentario",
        url: item.url,
        date: item.posted_at ?? item.collected_at ?? new Date().toISOString(),
        city: item.geography,
        state: null,
        snippet: item.content,
        sentiment: item.crisis_alert ? "risco reputacional" : item.sentiment,
        urgency: item.crisis_alert ? "alta" : item.sentiment === "negativo" ? "media" : "baixa",
        relevance: item.relevance_score ?? 1,
        theme: item.theme ?? "Comentários",
        mentionType: directMentionType(
          `${item.content} ${item.parent_post_caption ?? ""}`,
          candidateTerms,
        ),
        isRead: false,
      }));

    const newsMentions = (newsResult.data ?? [])
      .filter((item) => {
        const text = `${item.title} ${item.summary ?? ""}`;
        return containsCandidateTerm(text, candidateTerms);
      })
      .map((item) => ({
        id: `news-mention:${item.id}`,
        sourceId: item.id,
        origin: "news" as const,
        title: item.title,
        source: item.source ?? "Portal de notícia",
        sourceType: "portal",
        url: item.url,
        date: item.published_at ?? item.created_at ?? new Date().toISOString(),
        city: item.neighborhood,
        state: item.state,
        snippet: item.summary ?? item.title,
        sentiment: item.urgency === "alta" ? "risco reputacional" : "neutra",
        urgency: item.urgency ?? "baixa",
        relevance: item.urgency === "alta" ? 80 : item.urgency === "media" ? 55 : 35,
        theme: item.theme ?? "Menção em portal",
        mentionType: directMentionType(`${item.title} ${item.summary ?? ""}`, candidateTerms),
        isRead: false,
      }));

    const items = [...webMentions, ...newsMentions, ...socialMentions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const negative = items.filter((item) =>
      ["negativa", "negativo", "ataque político", "risco reputacional"].includes(item.sentiment),
    );
    const critical = items.filter((item) => ["alta", "critica", "crítica"].includes(item.urgency));
    const cityRanking = rank(items.map((item) => item.city).filter(Boolean) as string[]);
    const themeRanking = rank(items.map((item) => item.theme).filter(Boolean) as string[]);
    const sourceRanking = rank(items.map((item) => item.source).filter(Boolean) as string[]);

    return {
      kpis: {
        total: items.length,
        positive: items.filter((item) => ["positiva", "positivo"].includes(item.sentiment)).length,
        neutral: items.filter((item) => ["neutra", "neutro"].includes(item.sentiment)).length,
        negative: negative.length,
        critical: critical.length,
        last24: items.filter((item) => Date.now() - new Date(item.date).getTime() <= 86400000)
          .length,
        topCity: cityRanking[0]?.label ?? null,
        topTheme: themeRanking[0]?.label ?? null,
        topSource: sourceRanking[0]?.label ?? null,
      },
      filters: {
        cities: cityRanking.map((item) => item.label),
        themes: themeRanking.map((item) => item.label),
        sources: sourceRanking.map((item) => item.label),
      },
      items,
    };
  });

export const getTerritorialDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const [{ data: profile }, newsResult, mentionsResult] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("news_items")
        .select(
          "id, title, source, state, neighborhood, geography, theme, urgency, published_at, created_at",
        )
        .eq("user_id", context.userId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(200),
      db
        .from("mentions")
        .select("id, title, city, state, theme, sentiment, urgency, collected_at")
        .eq("user_id", context.userId)
        .eq("is_archived", false)
        .limit(200),
    ]);

    if (newsResult.error) throw new Error(newsResult.error.message);
    if (mentionsResult.error) throw new Error(mentionsResult.error.message);

    const strategicProfile = profile as typeof profile & StrategicProfile;
    const territoryTerms = [
      ...(strategicProfile?.monitored_states ?? []),
      ...(strategicProfile?.monitored_cities ?? []),
      ...(strategicProfile?.priority_cities ?? []),
    ];

    const rawSignals = [
      ...((newsResult.data ?? []).map((item) => ({
        id: `news:${item.id}`,
        title: item.title,
        city: item.neighborhood ?? item.geography ?? null,
        state: item.state ?? null,
        theme: item.theme ?? "Outros",
        urgency: item.urgency,
        negative: item.urgency === "alta",
        date: item.published_at ?? item.created_at ?? new Date().toISOString(),
      })) ?? []),
      ...(((mentionsResult.data ?? []) as MentionRow[]).map((item) => ({
        id: `mention:${item.id}`,
        title: item.title,
        city: item.city,
        state: item.state,
        theme: item.theme ?? "Outros",
        urgency: item.urgency,
        negative: ["negativa", "negativo", "risco reputacional", "ataque político"].includes(
          item.sentiment ?? "",
        ),
        date: item.collected_at ?? new Date().toISOString(),
      })) ?? []),
    ];

    const referenceSignals = territoryTerms.length
      ? rawSignals.filter((signal) =>
          containsTerritory(
            `${signal.title} ${signal.city ?? ""} ${signal.state ?? ""} ${signal.theme ?? ""}`,
            territoryTerms,
          ),
        )
      : rawSignals;
    const outsideSignals = territoryTerms.length
      ? rawSignals.filter(
          (signal) =>
            !containsTerritory(
              `${signal.title} ${signal.city ?? ""} ${signal.state ?? ""} ${signal.theme ?? ""}`,
              territoryTerms,
            ),
        )
      : [];
    const signals = rawSignals;

    const cityMap = new Map<
      string,
      { city: string; state: string | null; total: number; negative: number; themes: string[] }
    >();
    for (const signal of signals) {
      const city = signal.city || signal.state || "Território não identificado";
      const current = cityMap.get(city) ?? {
        city,
        state: signal.state,
        total: 0,
        negative: 0,
        themes: [],
      };
      current.total += 1;
      if (signal.negative) current.negative += 1;
      current.themes.push(signal.theme ?? "Outros");
      cityMap.set(city, current);
    }

    return {
      monitoredStates: strategicProfile?.monitored_states ?? [],
      monitoredCities: strategicProfile?.monitored_cities ?? [],
      priorityCities: strategicProfile?.priority_cities ?? [],
      cities: [...cityMap.values()]
        .map((city) => ({
          ...city,
          mainTheme: rank(city.themes)[0]?.label ?? "Outros",
          opportunity:
            city.negative > 0
              ? `Responder com posicionamento sobre ${rank(city.themes)[0]?.label ?? "tema local"}.`
              : `Acompanhar pauta local e preparar conteúdo preventivo.`,
        }))
        .sort((a, b) => b.negative - a.negative || b.total - a.total)
        .slice(0, 20),
      themes: rank(signals.map((item) => item.theme)),
      signals: signals.slice(0, 80),
      referenceSignalCount: referenceSignals.length,
      outsideSignalCount: outsideSignals.length,
      coveragePct: percent(referenceSignals.length, rawSignals.length),
      isFilteredByTerritory: territoryTerms.length > 0,
    };
  });

export const listMonitoredSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const { data, error } = await db
      .from("monitored_sources")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const seedDefaultMonitoredSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const rows = DEFAULT_SOURCES.map((source) => ({
      ...source,
      user_id: context.userId,
      state: "state" in source ? source.state : null,
      city: "city" in source ? source.city : null,
      active: true,
      priority_level: source.priority_level ?? "alta",
      updated_at: new Date().toISOString(),
    }));
    const { error } = await db.from("monitored_sources").upsert(rows, {
      onConflict: "user_id,url",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const deleteMonitoredSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const { error } = await db
      .from("monitored_sources")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveMonitoredSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SourceInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const payload = {
      ...data,
      user_id: context.userId,
      state: data.state || null,
      city: data.city || null,
      theme: data.theme || null,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? db.from("monitored_sources").update(payload).eq("id", data.id).eq("user_id", context.userId)
      : db.from("monitored_sources").insert(payload);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshMentionRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await getPlanAccess(context.supabase, context.userId);
    assertFeature(
      access.sentimentEnabled,
      "Radar de Menções disponível a partir do Plano Avançado.",
    );

    const cooldown = manualCooldownHours(access.plan);
    if (cooldown > 0) {
      const { data: last } = await context.supabase
        .from("sentiment_snapshots")
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
            `Refresh manual disponível em ${formatCooldownRemaining(remaining)}. Faça upgrade do plano para liberar atualizações sob demanda.`,
          );
        }
      }
    }

    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!googleApiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY não configurado");

    const apifyToken = process.env.APIFY_TOKEN;
    let socialInserted = 0;
    let socialReason: string | undefined = apifyToken ? undefined : "missing_apify_token";
    let sourceInserted = 0;

    if (apifyToken) {
      try {
        const { refreshSentimentForUser } = await import("@/lib/sentiment-refresh.server");
        const social = await refreshSentimentForUser(
          context.supabase,
          context.userId,
          apifyToken,
          googleApiKey,
        );
        socialInserted = social.inserted;
        socialReason = social.reason;
      } catch (error) {
        socialReason = error instanceof Error ? error.message : "social_refresh_failed";
      }
    }

    const { refreshRadarForUser } = await import("@/lib/radar-refresh.server");
    const source = await refreshRadarForUser(context.supabase, context.userId, googleApiKey);
    sourceInserted = source.inserted;
    const sourceReason = source.reason;

    return {
      inserted: socialInserted + sourceInserted,
      socialInserted,
      sourceInserted,
      socialReason,
      sourceReason,
    };
  });

function rank(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) {
    const label = value?.trim();
    if (!label) continue;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function candidateMentionTerms(profile: StrategicProfile | null | undefined) {
  return [
    profile?.political_name,
    profile?.full_name,
    profile?.instagram_handle,
    profile?.twitter_handle,
    profile?.tiktok_handle,
    profile?.facebook_handle,
    profile?.instagram_handle ? `@${profile.instagram_handle}` : null,
    profile?.twitter_handle ? `@${profile.twitter_handle}` : null,
    profile?.tiktok_handle ? `@${profile.tiktok_handle}` : null,
    ...(profile?.mention_keywords ?? []),
  ].filter((value): value is string => Boolean(value && value.trim().length >= 3));
}

function directMentionType(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  const direct = terms.find((term) => normalizedText.includes(normalize(term)));
  if (!direct) return "menção indireta";
  return direct.includes(" ") ? "menção ao nome completo" : "menção ao nome político";
}

function containsCandidateTerm(text: string, terms: string[]) {
  if (!terms.length) return false;
  const normalizedText = normalize(text);
  return terms.some((term) => normalizedText.includes(normalize(term)));
}

function containsTerritory(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  return terms.some((term) => normalizedText.includes(normalize(term)));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const DEFAULT_SOURCES = [
  {
    name: "G1",
    url: "https://g1.globo.com/",
    source_type: "portal",
    theme: "Noticiário nacional",
    priority_level: "estrategica",
  },
  {
    name: "Agência Brasil",
    url: "https://agenciabrasil.ebc.com.br/",
    source_type: "portal",
    theme: "Governo e políticas públicas",
    priority_level: "alta",
  },
  {
    name: "CNN Brasil",
    url: "https://www.cnnbrasil.com.br/",
    source_type: "portal",
    theme: "Política e atualidades",
    priority_level: "alta",
  },
  {
    name: "UOL Notícias",
    url: "https://noticias.uol.com.br/",
    source_type: "portal",
    theme: "Noticiário nacional",
    priority_level: "alta",
  },
  {
    name: "Metrópoles",
    url: "https://www.metropoles.com/",
    source_type: "portal",
    theme: "Política e Brasil",
    priority_level: "alta",
  },
  {
    name: "O Globo",
    url: "https://oglobo.globo.com/",
    source_type: "portal",
    theme: "Noticiário nacional",
    priority_level: "alta",
  },
  {
    name: "R7",
    url: "https://noticias.r7.com/",
    source_type: "portal",
    theme: "Noticiário nacional",
    priority_level: "alta",
  },
  {
    name: "Terra Notícias",
    url: "https://www.terra.com.br/noticias/",
    source_type: "portal",
    theme: "Noticiário nacional",
    priority_level: "alta",
  },
  {
    name: "Folha de S.Paulo",
    url: "https://www.folha.uol.com.br/",
    source_type: "portal",
    theme: "Política",
    priority_level: "alta",
  },
  {
    name: "Estadão",
    url: "https://www.estadao.com.br/",
    source_type: "portal",
    theme: "Política",
    priority_level: "alta",
  },
  {
    name: "Poder360",
    url: "https://www.poder360.com.br/",
    source_type: "portal",
    theme: "Poder e eleições",
    priority_level: "alta",
  },
  {
    name: "JOTA",
    url: "https://www.jota.info/",
    source_type: "portal",
    theme: "Poder, justiça e bastidores",
    priority_level: "alta",
  },
  {
    name: "O Antagonista",
    url: "https://oantagonista.com.br/",
    source_type: "portal",
    theme: "Bastidores políticos",
    priority_level: "alta",
  },
  {
    name: "Crusoé",
    url: "https://crusoe.com.br/",
    source_type: "portal",
    theme: "Política e bastidores",
    priority_level: "alta",
  },
  {
    name: "Canal Meio",
    url: "https://www.canalmeio.com.br/",
    source_type: "portal",
    theme: "Política e análise",
    priority_level: "media",
  },
  {
    name: "Nexo Jornal",
    url: "https://www.nexojornal.com.br/",
    source_type: "portal",
    theme: "Análise política",
    priority_level: "media",
  },
  {
    name: "Agência Pública",
    url: "https://apublica.org/",
    source_type: "portal",
    theme: "Investigação e política pública",
    priority_level: "media",
  },
  {
    name: "Aos Fatos",
    url: "https://www.aosfatos.org/",
    source_type: "portal",
    theme: "Checagem e debate público",
    priority_level: "media",
  },
  {
    name: "Agência Lupa",
    url: "https://lupa.uol.com.br/",
    source_type: "portal",
    theme: "Checagem e política",
    priority_level: "media",
  },
  {
    name: "Veja",
    url: "https://veja.abril.com.br/",
    source_type: "portal",
    theme: "Política e Brasil",
    priority_level: "alta",
  },
  {
    name: "Radar - Veja",
    url: "https://veja.abril.com.br/coluna/radar/",
    source_type: "portal",
    theme: "Bastidores políticos",
    priority_level: "alta",
  },
  {
    name: "Painel - Folha",
    url: "https://www1.folha.uol.com.br/colunas/painel/",
    source_type: "portal",
    theme: "Bastidores políticos",
    priority_level: "alta",
  },
  {
    name: "Lauro Jardim - O Globo",
    url: "https://oglobo.globo.com/blogs/lauro-jardim/",
    source_type: "portal",
    theme: "Bastidores políticos",
    priority_level: "alta",
  },
  {
    name: "Estadão Política",
    url: "https://www.estadao.com.br/politica/",
    source_type: "portal",
    theme: "Política",
    priority_level: "alta",
  },
  {
    name: "CartaCapital",
    url: "https://www.cartacapital.com.br/",
    source_type: "portal",
    theme: "Política e sociedade",
    priority_level: "media",
  },
  {
    name: "Revista Fórum",
    url: "https://revistaforum.com.br/",
    source_type: "portal",
    theme: "Política e sociedade",
    priority_level: "media",
  },
  {
    name: "Brasil 247",
    url: "https://www.brasil247.com/",
    source_type: "portal",
    theme: "Política e sociedade",
    priority_level: "media",
  },
  {
    name: "Revista Piauí",
    url: "https://piaui.folha.uol.com.br/",
    source_type: "portal",
    theme: "Reportagem e bastidores",
    priority_level: "media",
  },
  {
    name: "IstoÉ",
    url: "https://istoe.com.br/",
    source_type: "portal",
    theme: "Política e Brasil",
    priority_level: "media",
  },
  {
    name: "Jovem Pan News",
    url: "https://jovempan.com.br/noticias/politica",
    source_type: "portal",
    theme: "Política",
    priority_level: "media",
  },
  {
    name: "SBT News Política",
    url: "https://sbtnews.sbt.com.br/politica",
    source_type: "portal",
    theme: "Política",
    priority_level: "media",
  },
  {
    name: "Exame",
    url: "https://exame.com/",
    source_type: "portal",
    theme: "Economia e política",
    priority_level: "media",
  },
  {
    name: "Valor Econômico",
    url: "https://valor.globo.com/",
    source_type: "portal",
    theme: "Economia e poder público",
    priority_level: "media",
  },
  {
    name: "InfoMoney",
    url: "https://www.infomoney.com.br/",
    source_type: "portal",
    theme: "Economia e política",
    priority_level: "media",
  },
  {
    name: "Congresso em Foco",
    url: "https://congressoemfoco.uol.com.br/",
    source_type: "portal",
    theme: "Congresso Nacional",
    priority_level: "alta",
  },
  {
    name: "Câmara dos Deputados",
    url: "https://www.camara.leg.br/noticias/",
    source_type: "camara",
    state: "DF",
    city: "Brasília",
    theme: "Legislativo",
    priority_level: "estrategica",
  },
  {
    name: "Senado Notícias",
    url: "https://www12.senado.leg.br/noticias",
    source_type: "institucional",
    state: "DF",
    city: "Brasília",
    theme: "Legislativo",
    priority_level: "alta",
  },
  {
    name: "Gov.br",
    url: "https://www.gov.br/pt-br/noticias",
    source_type: "institucional",
    state: "DF",
    city: "Brasília",
    theme: "Governo federal",
    priority_level: "media",
  },
  {
    name: "Correio Braziliense",
    url: "https://www.correiobraziliense.com.br/",
    source_type: "portal",
    state: "DF",
    city: "Brasília",
    theme: "Política e DF",
    priority_level: "media",
  },
  {
    name: "Gazeta do Povo",
    url: "https://www.gazetadopovo.com.br/",
    source_type: "portal",
    theme: "Política",
    priority_level: "media",
  },
  {
    name: "Estado de Minas",
    url: "https://www.em.com.br/",
    source_type: "portal",
    state: "MG",
    city: "Belo Horizonte",
    theme: "Minas Gerais",
    priority_level: "alta",
  },
  {
    name: "O Tempo",
    url: "https://www.otempo.com.br/",
    source_type: "portal",
    state: "MG",
    city: "Belo Horizonte",
    theme: "Minas Gerais",
    priority_level: "alta",
  },
  {
    name: "Diário do Nordeste",
    url: "https://diariodonordeste.verdesmares.com.br/",
    source_type: "portal",
    state: "CE",
    city: "Fortaleza",
    theme: "Nordeste",
    priority_level: "media",
  },
  {
    name: "GZH",
    url: "https://gauchazh.clicrbs.com.br/",
    source_type: "portal",
    state: "RS",
    city: "Porto Alegre",
    theme: "Sul",
    priority_level: "media",
  },
  {
    name: "A Tarde",
    url: "https://www.atarde.com.br/",
    source_type: "portal",
    state: "BA",
    city: "Salvador",
    theme: "Bahia",
    priority_level: "media",
  },
  {
    name: "Brasil de Fato",
    url: "https://www.brasildefato.com.br/",
    source_type: "portal",
    theme: "Política e sociedade",
    priority_level: "media",
  },
] as const;
