import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getMyProfile } from "@/lib/profile.functions";
import { listMyNews, getMyDashboardStats } from "@/lib/news.functions";
import { getMyInsights, getInsightHistory } from "@/lib/insights.functions";
import { saveInsightFeedback, listMyFeedback } from "@/lib/insight-feedback.functions";
import { AppShell } from "@/components/app-shell";
import {
  ShieldAlert,
  TrendingUp,
  Radio,
  Clock,
  Activity,
  Lightbulb,
  Sparkles,
  ArrowDown,
  ArrowUp,
  Minus,
  ThumbsUp,
  ThumbsDown,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getProfile = useServerFn(getMyProfile);
  const getNews = useServerFn(listMyNews);
  const getStats = useServerFn(getMyDashboardStats);
  const getInsights = useServerFn(getMyInsights);
  const getHistory = useServerFn(getInsightHistory);
  const getFeedback = useServerFn(listMyFeedback);
  const saveFeedbackFn = useServerFn(saveInsightFeedback);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const { data: news = [] } = useQuery({ queryKey: ["news"], queryFn: () => getNews() });
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => getStats() });
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: () => getInsights(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: feedback = [] } = useQuery({
    queryKey: ["insight-feedback"],
    queryFn: () => getFeedback(),
  });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyWindow, setHistoryWindow] = useState<"24h" | "7d">("24h");
  const { data: history = [] } = useQuery({
    queryKey: ["insight-history", historyWindow],
    queryFn: () => getHistory({ data: { window: historyWindow, days: 30 } }),
    enabled: historyOpen,
  });

  const saveFeedback = useMutation({
    mutationFn: (vars: { text: string; window: "24h" | "7d"; useful: boolean }) =>
      saveFeedbackFn({ data: vars }),
    onSuccess: () => {
      toast.success("Obrigado — vou ajustar as próximas.");
      qc.invalidateQueries({ queryKey: ["insight-feedback"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const feedbackMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const f of feedback) map.set(normalize(f.recommendation_text), f.useful);
    return map;
  }, [feedback]);

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/settings" });
  }, [profile, navigate]);

  const critical = news.filter((n) => n.urgency === "alta");

  const themeMap = new Map<string, number>();
  news
    .filter((n) => new Date(n.created_at).getTime() > Date.now() - 86400000)
    .forEach((n) => n.theme && themeMap.set(n.theme, (themeMap.get(n.theme) ?? 0) + 1));
  const topThemes = [...themeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const lastNewsAt = stats?.last_news_at ? new Date(stats.last_news_at) : null;

  return (
    <AppShell
      title={`Bom dia${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.`}
      subtitle="Panorama estratégico das últimas 24 horas no seu radar."
    >
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>
          Radar atualizado automaticamente a cada 3h.
          {lastNewsAt && ` Última coleta: ${lastNewsAt.toLocaleString("pt-BR")}.`}
        </span>
      </div>

      {critical.length > 0 && (
        <div className="mb-6 rounded-xl border border-destructive/50 bg-destructive/5 p-5 flex items-start gap-4">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-serif text-lg text-destructive">
              {critical.length} aviso(s) crítico(s)
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Notícias com urgência alta detectadas. Recomenda-se posicionamento ainda hoje.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {critical.slice(0, 3).map((n) => (
                <li key={n.id} className="flex items-start gap-2">
                  <span className="text-destructive mt-1.5 h-1 w-1 rounded-full bg-destructive shrink-0" />
                  <Link to="/studio/$id" params={{ id: n.id }} className="hover:underline">
                    {n.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="Sinais recentes" icon={Radio}>
          <div className="font-serif text-5xl">{stats?.last_24h ?? 0}</div>
          <p className="text-sm text-muted-foreground mt-2">
            Notícias e sinais novos nas últimas 24h. {stats?.total ?? 0} itens no histórico.
          </p>
          <Link to="/radar" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              Abrir radar
            </Button>
          </Link>
        </Card>

        <Card title="Oportunidades de fala" icon={Sparkles}>
          {topThemes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem dados ainda. Atualize o radar para começar.
            </p>
          ) : (
            <ul className="space-y-2 mt-1">
              {topThemes.map(([theme, count]) => (
                <li key={theme} className="flex justify-between text-sm">
                  <span>{theme}</span>
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/studio" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              Criar conteúdo
            </Button>
          </Link>
        </Card>

        <Card title="Riscos urgentes" icon={ShieldAlert}>
          <div className="font-serif text-5xl text-destructive">{stats?.critical_24h ?? 0}</div>
          <p className="text-sm text-muted-foreground mt-2">
            Pautas de alta urgência que podem exigir resposta pública.
          </p>
          <Link to="/analysis" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              Ver análise
            </Button>
          </Link>
        </Card>
      </div>

      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-gold" />
              Insights automáticos
            </div>
            <h2 className="font-serif text-2xl mt-1">Tendência de sentimento e recomendações</h2>
            {insights?.lastRefreshAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Atualizado em {new Date(insights.lastRefreshAt).toLocaleString("pt-BR")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <TrendBadge trend={insights?.trend} />
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen((v) => !v)}>
              <History className="h-3.5 w-3.5 mr-1.5" />
              {historyOpen ? "Fechar histórico" : "Ver histórico"}
            </Button>
          </div>
        </div>

        {insightsLoading ? (
          <p className="text-sm text-muted-foreground">Calculando insights...</p>
        ) : !insights || insights.bucket7.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem menções suficientes ainda. Configure suas redes em{" "}
            <Link to="/settings" className="underline">
              Configurações
            </Link>{" "}
            e atualize o{" "}
            <Link to="/sentiment" className="underline">
              Termômetro
            </Link>
            .
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h3 className="text-sm font-medium mb-3">Sentimento — últimas 24h</h3>
              <SentimentBars bucket={insights.bucket24} />
              <h3 className="text-sm font-medium mt-6 mb-3">Sentimento — últimos 7 dias</h3>
              <SentimentBars bucket={insights.bucket7} />
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Série diária (7d)</h3>
              <MiniSeries series={insights.series} />
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">Principais temas (7d)</h3>
                {insights.topThemes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem temas detectados.</p>
                ) : (
                  <ul className="space-y-1">
                    {insights.topThemes.map((t) => (
                      <li key={t.theme} className="flex justify-between text-sm">
                        <span>{t.theme}</span>
                        <span className="text-muted-foreground tabular-nums">{t.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-gold" />
                Recomendações para 48h
              </h3>
              {insights.recommendations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sem recomendações da IA neste ciclo.
                </p>
              ) : (
                <ol className="space-y-3">
                  {insights.recommendations.map((r, i) => {
                    const current = feedbackMap.get(normalize(r));
                    return (
                      <li key={i} className="text-sm leading-relaxed">
                        <div className="flex gap-3">
                          <span className="font-serif text-gold tabular-nums">{i + 1}.</span>
                          <span className="flex-1">{r}</span>
                        </div>
                        <div className="mt-1.5 ml-6 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              saveFeedback.mutate({ text: r, window: "24h", useful: true })
                            }
                            disabled={saveFeedback.isPending}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                              current === true
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700"
                                : "border-border text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-700"
                            }`}
                          >
                            <ThumbsUp className="h-3 w-3" /> Útil
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              saveFeedback.mutate({ text: r, window: "24h", useful: false })
                            }
                            disabled={saveFeedback.isPending}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
                              current === false
                                ? "border-destructive/50 bg-destructive/10 text-destructive"
                                : "border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                            }`}
                          >
                            <ThumbsDown className="h-3 w-3" /> Não útil
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}

        {historyOpen && (
          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Histórico (30 dias)</h3>
              <Tabs
                value={historyWindow}
                onValueChange={(v) => setHistoryWindow(v as "24h" | "7d")}
              >
                <TabsList>
                  <TabsTrigger value="24h">24h</TabsTrigger>
                  <TabsTrigger value="7d">7d</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem histórico ainda para essa janela.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Quando</th>
                      <th className="text-left p-2">Tendência</th>
                      <th className="text-right p-2">Pos%</th>
                      <th className="text-right p-2">Neu%</th>
                      <th className="text-right p-2">Neg%</th>
                      <th className="text-right p-2">Menções</th>
                      <th className="text-left p-2">Top temas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const themes =
                        (h.top_themes as Array<{ theme: string; count: number }> | null) ?? [];
                      return (
                        <tr key={h.id} className="border-t border-border">
                          <td className="p-2 tabular-nums">
                            {new Date(h.generated_at).toLocaleString("pt-BR")}
                          </td>
                          <td className="p-2 capitalize">{h.sentiment_trend ?? "—"}</td>
                          <td className="p-2 text-right tabular-nums">{h.positivo_pct}</td>
                          <td className="p-2 text-right tabular-nums">{h.neutro_pct}</td>
                          <td className="p-2 text-right tabular-nums">{h.negativo_pct}</td>
                          <td className="p-2 text-right tabular-nums">{h.total_mentions}</td>
                          <td className="p-2 text-muted-foreground">
                            {themes
                              .slice(0, 3)
                              .map((t) => t.theme)
                              .join(", ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function TrendBadge({ trend }: { trend?: "piorando" | "estavel" | "melhorando" }) {
  if (!trend) return null;
  const map = {
    piorando: {
      label: "Piorando",
      Icon: ArrowDown,
      cls: "text-destructive border-destructive/40 bg-destructive/5",
    },
    melhorando: {
      label: "Melhorando",
      Icon: ArrowUp,
      cls: "text-emerald-600 border-emerald-600/40 bg-emerald-600/5",
    },
    estavel: {
      label: "Estável",
      Icon: Minus,
      cls: "text-muted-foreground border-border bg-muted/40",
    },
  } as const;
  const { label, Icon, cls } = map[trend];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function SentimentBars({
  bucket,
}: {
  bucket: { positivo: number; neutro: number; negativo: number; total: number };
}) {
  const { positivo, neutro, negativo, total } = bucket;
  if (!total) return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="space-y-2">
      <Bar label="Positivo" value={positivo} pct={pct(positivo)} color="bg-emerald-500" />
      <Bar label="Neutro" value={neutro} pct={pct(neutro)} color="bg-muted-foreground/50" />
      <Bar label="Negativo" value={negativo} pct={pct(negativo)} color="bg-destructive" />
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniSeries({
  series,
}: {
  series: Array<{ day: string; positivo: number; neutro: number; negativo: number }>;
}) {
  const max = Math.max(1, ...series.map((s) => s.positivo + s.neutro + s.negativo));
  return (
    <div className="flex items-end gap-1 h-24">
      {series.map((s) => {
        const total = s.positivo + s.neutro + s.negativo;
        const h = (total / max) * 100;
        const dayLabel = new Date(s.day)
          .toLocaleDateString("pt-BR", { weekday: "short" })
          .slice(0, 3);
        return (
          <div key={s.day} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full flex flex-col-reverse rounded-sm overflow-hidden bg-muted"
              style={{ height: `${Math.max(h, 4)}%`, minHeight: 4 }}
            >
              {s.positivo > 0 && (
                <div
                  className="bg-emerald-500"
                  style={{ height: `${(s.positivo / Math.max(total, 1)) * 100}%` }}
                />
              )}
              {s.neutro > 0 && (
                <div
                  className="bg-muted-foreground/40"
                  style={{ height: `${(s.neutro / Math.max(total, 1)) * 100}%` }}
                />
              )}
              {s.negativo > 0 && (
                <div
                  className="bg-destructive"
                  style={{ height: `${(s.negativo / Math.max(total, 1)) * 100}%` }}
                />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">{dayLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-gold" />
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
