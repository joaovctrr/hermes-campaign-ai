import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type React from "react";
import { useMemo, useState } from "react";
import {
  addManualNewsFromUrl,
  getRadarCooldownStatus,
  listMyNews,
  refreshRadar,
} from "@/lib/news.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, ExternalLink, Sparkles, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCooldownRemaining, planLabel } from "@/lib/plan-limits";

export const Route = createFileRoute("/_authenticated/radar")({
  component: RadarPage,
});

const URGENCY: Record<string, { label: string; className: string }> = {
  alta: {
    label: "Urgência alta",
    className: "bg-destructive/10 text-destructive border-destructive/40",
  },
  media: { label: "Urgência média", className: "bg-gold/15 text-gold-foreground border-gold/40" },
  baixa: { label: "Sem urgência", className: "bg-muted text-muted-foreground border-border" },
};

function RadarPage() {
  const qc = useQueryClient();
  const getNews = useServerFn(listMyNews);
  const refresh = useServerFn(refreshRadar);
  const cooldownFn = useServerFn(getRadarCooldownStatus);
  const addManualNews = useServerFn(addManualNewsFromUrl);
  const { data: news = [], isLoading } = useQuery({ queryKey: ["news"], queryFn: () => getNews() });
  const { data: cd } = useQuery({
    queryKey: ["cooldown-radar"],
    queryFn: () => cooldownFn(),
    refetchInterval: 60000,
  });

  const blocked = (cd?.remainingMs ?? 0) > 0;
  const [manualUrl, setManualUrl] = useState("");
  const [manualTheme, setManualTheme] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const sources = useMemo(
    () => [...new Set(news.map((item) => item.source).filter(Boolean) as string[])].sort(),
    [news],
  );
  const themes = useMemo(
    () => [...new Set(news.map((item) => item.theme).filter(Boolean) as string[])].sort(),
    [news],
  );
  const states = useMemo(
    () => [...new Set(news.map((item) => newsState(item)).filter(Boolean) as string[])].sort(),
    [news],
  );
  const neighborhoods = useMemo(
    () =>
      [...new Set(news.map((item) => newsNeighborhood(item)).filter(Boolean) as string[])].sort(),
    [news],
  );
  const filteredNews = useMemo(() => {
    const minTime = dateFilterToTime(dateFilter);
    return news.filter((item) => {
      const timelineDate = item.published_at ?? item.created_at;
      const time = new Date(timelineDate).getTime();
      const itemState = newsState(item);
      const itemNeighborhood = newsNeighborhood(item);
      return (
        (sourceFilter === "all" || item.source === sourceFilter) &&
        (themeFilter === "all" || item.theme === themeFilter) &&
        (urgencyFilter === "all" || item.urgency === urgencyFilter) &&
        (stateFilter === "all" || itemState === stateFilter) &&
        (neighborhoodFilter === "all" || itemNeighborhood === neighborhoodFilter) &&
        (!minTime || time >= minTime)
      );
    });
  }, [dateFilter, neighborhoodFilter, news, sourceFilter, stateFilter, themeFilter, urgencyFilter]);

  const refreshMutation = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: ["news"] });
      qc.invalidateQueries({ queryKey: ["cooldown-radar"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
      qc.invalidateQueries({ queryKey: ["cooldown-radar"] });
    },
  });

  const manualMutation = useMutation({
    mutationFn: () =>
      addManualNews({
        data: {
          url: manualUrl,
          theme: manualTheme || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(r.message);
      setManualUrl("");
      setManualTheme("");
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar notícia manual."),
  });

  return (
    <AppShell
      title="Radar de Notícias"
      subtitle="Curadoria automática, ordenada cronologicamente. Atualização automática a cada 3h."
      actions={
        <div className="flex items-center gap-2">
          {cd && (
            <Badge variant="outline" className="text-xs">
              Plano {planLabel(cd.plan)} · cooldown{" "}
              {cd.cooldownHours === 0 ? "livre" : `${cd.cooldownHours}h`}
            </Badge>
          )}
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || blocked}
          >
            {blocked ? (
              <Lock className="h-4 w-4 mr-2" />
            ) : (
              <RefreshCw
                className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`}
              />
            )}
            {blocked
              ? `Disponível em ${formatCooldownRemaining(cd!.remainingMs)}`
              : refreshMutation.isPending
                ? "Analisando..."
                : "Atualizar radar"}
          </Button>
        </div>
      }
    >
      <section className="mb-6 max-w-4xl rounded-xl border border-border bg-card p-5">
        <div className="mb-3">
          <h2 className="font-serif text-xl">Adicionar notícia por link</h2>
          <p className="text-sm text-muted-foreground">
            Use quando uma matéria importante não apareceu automaticamente no radar.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <Input
            placeholder="https://..."
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
          />
          <Input
            placeholder="Tema opcional"
            value={manualTheme}
            onChange={(e) => setManualTheme(e.target.value)}
          />
          <Button
            type="button"
            disabled={manualMutation.isPending || !manualUrl.trim()}
            onClick={() => manualMutation.mutate()}
          >
            <Plus className="h-4 w-4 mr-2" />
            {manualMutation.isPending ? "Analisando..." : "Adicionar"}
          </Button>
        </div>
      </section>

      {news.length > 0 && (
        <section className="mb-6 grid max-w-5xl gap-3 md:grid-cols-3 xl:grid-cols-6">
          <FilterSelect value={sourceFilter} onChange={setSourceFilter}>
            <option value="all">Todos os canais</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={themeFilter} onChange={setThemeFilter}>
            <option value="all">Todos os temas</option>
            {themes.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={urgencyFilter} onChange={setUrgencyFilter}>
            <option value="all">Todas urgências</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Sem urgência</option>
          </FilterSelect>
          <FilterSelect value={stateFilter} onChange={setStateFilter}>
            <option value="all">Todos os estados</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={neighborhoodFilter} onChange={setNeighborhoodFilter}>
            <option value="all">Todos os bairros</option>
            {neighborhoods.map((neighborhood) => (
              <option key={neighborhood} value={neighborhood}>
                {neighborhood}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={dateFilter} onChange={setDateFilter}>
            <option value="all">Todas as datas</option>
            <option value="24h">Últimas 24h</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </FilterSelect>
        </section>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : news.length === 0 ? (
        <EmptyState
          onRefresh={() => refreshMutation.mutate()}
          loading={refreshMutation.isPending}
          blocked={blocked}
        />
      ) : filteredNews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center max-w-4xl">
          <p className="text-sm text-muted-foreground">
            Nenhuma notícia encontrada com os filtros selecionados.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 max-w-4xl">
          {filteredNews.map((n) => {
            const urg = URGENCY[n.urgency] ?? URGENCY.baixa;
            const timelineDate = n.published_at ?? n.created_at;
            const state = newsState(n);
            const neighborhood = newsNeighborhood(n);
            return (
              <article
                key={n.id}
                className="rounded-xl border border-border bg-card p-6 hover:border-gold/40 transition"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{n.source ?? "Fonte"}</span>
                  <span>·</span>
                  <span>
                    {formatDistanceToNow(new Date(timelineDate), { locale: ptBR, addSuffix: true })}
                  </span>
                  {state && (
                    <>
                      <span>·</span>
                      <span>{state}</span>
                    </>
                  )}
                  {neighborhood && (
                    <>
                      <span>·</span>
                      <span>{neighborhood}</span>
                    </>
                  )}
                </div>
                <h3 className="mt-2 font-serif text-xl leading-snug">{n.title}</h3>
                {n.summary && (
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{n.summary}</p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {n.theme && <Badge variant="outline">{n.theme}</Badge>}
                  {state && <Badge variant="outline">Estado: {state}</Badge>}
                  {neighborhood && <Badge variant="outline">Bairro: {neighborhood}</Badge>}
                  <Badge variant="outline" className={urg.className}>
                    {urg.label}
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    {n.url && (
                      <a href={n.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Fonte
                        </Button>
                      </a>
                    )}
                    <Link to="/studio/$id" params={{ id: n.id }}>
                      <Button size="sm">
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar estratégia
                      </Button>
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {children}
    </select>
  );
}

function dateFilterToTime(value: string) {
  const day = 24 * 60 * 60 * 1000;
  if (value === "24h") return Date.now() - day;
  if (value === "7d") return Date.now() - 7 * day;
  if (value === "30d") return Date.now() - 30 * day;
  return 0;
}

type RadarNewsItem = Awaited<ReturnType<typeof listMyNews>>[number];

function newsState(item: RadarNewsItem) {
  return (
    cleanLocation(item.state ?? null) ?? inferStateFromText(`${item.title} ${item.summary ?? ""}`)
  );
}

function newsNeighborhood(item: RadarNewsItem) {
  return (
    cleanLocation(item.neighborhood ?? null) ??
    inferNeighborhoodFromText(`${item.title} ${item.summary ?? ""}`)
  );
}

function cleanLocation(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function inferStateFromText(text: string) {
  const normalized = ` ${text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()} `;
  const states: Array<[string, string[]]> = [
    ["MG", ["minas gerais", " belo horizonte ", " bh "]],
    ["SP", ["sao paulo"]],
    ["RJ", ["rio de janeiro"]],
    ["ES", ["espirito santo"]],
    ["BA", ["bahia"]],
    ["PR", ["parana"]],
    ["SC", ["santa catarina"]],
    ["RS", ["rio grande do sul"]],
    ["GO", ["goias"]],
    ["DF", ["distrito federal", "brasilia"]],
  ];
  return states.find(([, terms]) => terms.some((term) => normalized.includes(term)))?.[0] ?? null;
}

function inferNeighborhoodFromText(text: string) {
  const match = /\bbairro\s+([\p{L}0-9][\p{L}0-9\s'.-]{2,36})/iu.exec(text);
  return (
    match?.[1]
      ?.replace(/\s+/g, " ")
      .replace(/[.,;:!?-]+$/g, "")
      .trim() ?? null
  );
}

function EmptyState({
  onRefresh,
  loading,
  blocked,
}: {
  onRefresh: () => void;
  loading: boolean;
  blocked: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center max-w-2xl mx-auto">
      <h3 className="font-serif text-xl">Seu radar está vazio.</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Configure seus temas monitorados em Configurações e clique em "Atualizar radar".
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/settings">
          <Button variant="outline">Configurar perfil</Button>
        </Link>
        <Button onClick={onRefresh} disabled={loading || blocked}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar radar
        </Button>
      </div>
    </div>
  );
}
