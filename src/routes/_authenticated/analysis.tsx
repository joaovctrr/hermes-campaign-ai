import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDataAnalysis } from "@/lib/data-analysis.functions";
import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  FileText,
  MapPin,
  Newspaper,
  Radio,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/analysis")({
  component: DataAnalysisPage,
});

type Analysis = Awaited<ReturnType<typeof getDataAnalysis>>;
type AnalysisItem = Analysis["items"][number];

function DataAnalysisPage() {
  const analysisFn = useServerFn(getDataAnalysis);
  const { data, error, isLoading } = useQuery({
    queryKey: ["data-analysis"],
    queryFn: () => analysisFn(),
  });
  const [modal, setModal] = useState<null | {
    title: string;
    description: string;
    action: "strategy" | "script";
    items: AnalysisItem[];
  }>(null);

  const firstActionNews = modal?.items.find((item) => item.newsId)?.newsId ?? null;
  const bestTheme = data?.themes[0];
  const totalThemeCount = data?.themes.reduce((sum, item) => sum + item.count, 0) ?? 0;

  const heatColor = useMemo(() => {
    const negative = data?.kpis.negativePct ?? 0;
    if (negative >= 45 || (data?.kpis.crisisCount ?? 0) > 0) return "text-destructive";
    if (negative >= 25) return "text-gold-foreground";
    return "text-emerald-600";
  }, [data?.kpis.crisisCount, data?.kpis.negativePct]);

  return (
    <AppShell
      title="Análise de Dados"
      subtitle="Painel tático com origem, tema, sentimento, geografia e relevância dos sinais coletados."
      actions={
        <Link to="/radar">
          <Button variant="outline" size="sm">
            <Newspaper className="h-4 w-4 mr-2" />
            Atualizar fontes
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <p className="text-muted-foreground">Carregando análise...</p>
      ) : error ? (
        <LockedAnalysis message={error instanceof Error ? error.message : "Recurso bloqueado."} />
      ) : !data || data.items.length === 0 ? (
        <EmptyAnalysis />
      ) : (
        <div className="space-y-8">
          <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Sentimento geral das últimas 24h
                  </p>
                  <div className={`mt-3 font-serif text-4xl ${heatColor}`}>
                    {data.kpis.positivePct}% positivo
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {data.kpis.total24} sinais em 24h
                </Badge>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <KpiChip label="Positivo" value={`${data.kpis.positivePct}%`} tone="positive" />
                <KpiChip label="Neutro" value={`${data.kpis.neutralPct}%`} tone="neutral" />
                <button
                  type="button"
                  onClick={() =>
                    setModal({
                      title: "Sinais negativos e alertas de crise",
                      description: "Itens recentes que exigem leitura prioritária.",
                      action: "strategy",
                      items: data.items.filter(
                        (item) => item.sentiment === "negativo" || item.sentiment === "crise",
                      ),
                    })
                  }
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left hover:bg-destructive/10"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Negativo/crise
                  </span>
                  <span className="mt-1 block font-serif text-2xl text-destructive">
                    {data.kpis.negativePct}%
                  </span>
                </button>
              </div>

              <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                {data.kpis.negativeDelta > 0 ? (
                  <TrendingUp className="h-4 w-4 text-destructive" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-emerald-600" />
                )}
                Menções negativas {data.kpis.negativeDelta > 0 ? "subiram" : "não subiram"} em{" "}
                {Math.abs(data.kpis.negativeDelta)} item(ns) contra o dia anterior.
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl">Tendência dos últimos 7 dias</h2>
                <Badge variant="outline">linha do tempo</Badge>
              </div>
              <div className="mt-5 flex h-44 items-end gap-2">
                {data.trend.map((day) => {
                  const max = Math.max(1, day.positivo + day.neutro + day.negativo);
                  return (
                    <div
                      key={day.label}
                      className="flex min-w-0 flex-1 flex-col items-center gap-2"
                    >
                      <div className="flex h-32 w-full items-end justify-center gap-1">
                        <Bar value={day.positivo} max={max} className="bg-emerald-500" />
                        <Bar value={day.neutro} max={max} className="bg-muted-foreground/35" />
                        <Bar value={day.negativo} max={max} className="bg-destructive" />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{day.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl">Temas em alta</h2>
                {bestTheme && (
                  <Badge variant="outline">
                    pauta dominante: {bestTheme.theme} · {bestTheme.percent}%
                  </Badge>
                )}
              </div>
              <div className="mt-5 space-y-3">
                {data.themes.map((theme) => (
                  <button
                    key={theme.theme}
                    type="button"
                    onClick={() =>
                      setModal({
                        title: `Pauta: ${theme.theme}`,
                        description: `${theme.count} sinal(is), ${theme.negative} negativo(s).`,
                        action: "strategy",
                        items: theme.items,
                      })
                    }
                    className="w-full rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-muted/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{theme.theme}</span>
                      <span className="text-sm text-muted-foreground">{theme.count}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.max(6, Math.round((theme.count / Math.max(1, totalThemeCount)) * 100))}%`,
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-serif text-xl">Top palavras-chave</h2>
              <div className="mt-5 flex flex-wrap gap-2">
                {data.keywords.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem volume suficiente ainda.</p>
                ) : (
                  data.keywords.map((keyword) => (
                    <Badge key={keyword.word} variant="outline" className="px-3 py-1.5 text-sm">
                      {keyword.word} · {keyword.count}
                    </Badge>
                  ))
                )}
              </div>
              {data.negativeSecurity.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setModal({
                      title: "Notícias negativas sobre Segurança",
                      description: "Atalho para gerar estratégia de resposta.",
                      action: "strategy",
                      items: data.negativeSecurity,
                    })
                  }
                  className="mt-6 flex w-full items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left hover:bg-destructive/10"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Segurança com sinal negativo
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-destructive" />
                </button>
              )}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl">Ranking de zonas de risco</h2>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-5 space-y-3">
                {data.riskZones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum bairro ou cidade com volume negativo detectado.
                  </p>
                ) : (
                  data.riskZones.map((zone, index) => (
                    <button
                      key={zone.zone}
                      type="button"
                      onClick={() =>
                        setModal({
                          title: `${index + 1}º ${zone.zone}`,
                          description: `${zone.count} menção(ões) negativas relacionadas à região.`,
                          action: "script",
                          items: zone.items,
                        })
                      }
                      className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-muted/30"
                    >
                      <span>
                        <strong>{index + 1}º</strong> {zone.zone}
                      </span>
                      <Badge variant="outline">{zone.count} menções</Badge>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl">Radar de opositores/aliados</h2>
                <Radio className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-5 space-y-3">
                {data.actors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum ator político monitorável foi citado nas últimas coletas.
                  </p>
                ) : (
                  data.actors.map((actor) => (
                    <button
                      key={actor.actor}
                      type="button"
                      onClick={() =>
                        setModal({
                          title: `Citações: ${actor.actor}`,
                          description: `${actor.count} citação(ões), ${actor.negative} com sinal negativo.`,
                          action: "strategy",
                          items: actor.items,
                        })
                      }
                      className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-muted/30"
                    >
                      <span className="font-medium">{actor.actor}</span>
                      <span className="text-sm text-muted-foreground">
                        {actor.count} citações · {actor.negative} negativas
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}. A relevância combina
            fonte, urgência, sentimento e confiança do classificador.
          </p>
        </div>
      )}

      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif">{modal?.title}</DialogTitle>
            <DialogDescription>{modal?.description}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {(modal?.items ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
            ) : (
              modal!.items.map((item) => <AnalysisItemCard key={item.id} item={item} />)
            )}
          </div>
          <div className="flex justify-end gap-2">
            {firstActionNews ? (
              <Link to="/studio/$id" params={{ id: firstActionNews }}>
                <Button>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {modal?.action === "script"
                    ? "Gerar roteiro de vídeo"
                    : "Gerar estratégia de resposta"}
                </Button>
              </Link>
            ) : (
              <Link to="/studio">
                <Button variant="outline">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Abrir Estúdio
                </Button>
              </Link>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <div
      className={`w-3 rounded-t ${className}`}
      style={{ height: `${Math.max(value ? 8 : 2, (value / max) * 128)}px` }}
      title={`${value}`}
    />
  );
}

function KpiChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={`mt-1 block font-serif text-2xl ${
          tone === "positive" ? "text-emerald-600" : "text-muted-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function AnalysisItemCard({ item }: { item: AnalysisItem }) {
  const sentimentClass =
    item.sentiment === "positivo"
      ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/10"
      : item.sentiment === "negativo" || item.sentiment === "crise"
        ? "text-destructive border-destructive/30 bg-destructive/10"
        : "text-muted-foreground border-border bg-muted";

  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {item.kind === "news" ? (
          <FileText className="h-3.5 w-3.5" />
        ) : (
          <Radio className="h-3.5 w-3.5" />
        )}
        <span>{item.source}</span>
        <span>·</span>
        <span>{new Date(item.date).toLocaleString("pt-BR")}</span>
        {item.geography && (
          <>
            <span>·</span>
            <span>{item.geography}</span>
          </>
        )}
      </div>
      <h3 className="mt-2 font-medium leading-snug">{item.title}</h3>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{item.theme}</Badge>
        <Badge variant="outline" className={sentimentClass}>
          {item.sentiment === "crise" ? "Alerta de crise" : item.sentiment}
        </Badge>
        <Badge variant="outline">relevância {item.relevance}/100</Badge>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="ml-auto">
            <Button variant="ghost" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Fonte
            </Button>
          </a>
        )}
      </div>
    </article>
  );
}

function EmptyAnalysis() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <Target className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-4 font-serif text-xl">Ainda não há dados suficientes.</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Atualize o Radar de Notícias e o Termômetro Social para alimentar a análise.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/radar">
          <Button variant="outline">Ir para o Radar</Button>
        </Link>
        <Link to="/sentiment">
          <Button>Ir para o Termômetro</Button>
        </Link>
      </div>
    </div>
  );
}

function LockedAnalysis({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <Target className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-4 font-serif text-xl">Painel bloqueado no plano atual.</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/settings">
          <Button>Ver opções de plano</Button>
        </Link>
      </div>
    </div>
  );
}
