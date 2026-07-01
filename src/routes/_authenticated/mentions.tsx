import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listMentionRadar,
  listMonitoredSources,
  refreshMentionRadar,
} from "@/lib/strategic-intelligence.functions";
import { getManualCooldownStatus } from "@/lib/sentiment.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { formatCooldownRemaining, planLabel } from "@/lib/plan-limits";
import {
  ExternalLink,
  Filter,
  Lock,
  MessageSquareWarning,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mentions")({
  component: MentionsPage,
});

type MentionRadar = Awaited<ReturnType<typeof listMentionRadar>>;
type MentionItem = MentionRadar["items"][number];

function MentionsPage() {
  const loadMentions = useServerFn(listMentionRadar);
  const refreshMentions = useServerFn(refreshMentionRadar);
  const loadSources = useServerFn(listMonitoredSources);
  const cooldownFn = useServerFn(getManualCooldownStatus);
  const profileFn = useServerFn(getMyProfile);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["mention-radar"],
    queryFn: () => loadMentions(),
  });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: monitoredSources = [] } = useQuery({
    queryKey: ["monitored-sources-for-mentions"],
    queryFn: () => loadSources(),
  });
  const { data: cooldown, refetch: refetchCooldown } = useQuery({
    queryKey: ["cooldown-mention-radar"],
    queryFn: () => cooldownFn(),
    refetchInterval: 60000,
  });
  const [sentiment, setSentiment] = useState("todos");
  const [query, setQuery] = useState("");

  const hasMentionSources =
    !!profile?.instagram_handle ||
    !!profile?.twitter_handle ||
    !!profile?.tiktok_handle ||
    !!profile?.facebook_handle ||
    (profile?.mention_keywords?.length ?? 0) > 0 ||
    monitoredSources.some((source) => source.active);

  const planLocked = cooldown?.sentimentEnabled === false;
  const blocked = planLocked || (cooldown?.remainingMs ?? 0) > 0;

  const refreshMutation = useMutation({
    mutationFn: () => refreshMentions(),
    onSuccess: async (result) => {
      toast.success(
        result.inserted
          ? `${result.sourceInserted} em fontes monitoradas e ${result.socialInserted} em redes sociais.`
          : result.sourceReason === "no_terms"
            ? "Adicione nome político, nome completo ou palavras-chave nas Configurações."
            : result.sourceReason === "no_feed_results" || result.socialReason === "no_results"
              ? "A coleta não retornou itens agora."
              : "Nada novo desde a última coleta.",
      );
      await Promise.all([refetch(), refetchCooldown()]);
    },
    onError: async (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar menções.");
      await refetchCooldown();
    },
  });

  const items = useMemo(() => {
    const q = normalize(query);
    return (data?.items ?? []).filter((item) => {
      const matchesSentiment =
        sentiment === "todos" ||
        normalize(item.sentiment).includes(normalize(sentiment)) ||
        normalize(item.urgency).includes(normalize(sentiment));
      const matchesQuery =
        !q ||
        normalize(item.title).includes(q) ||
        normalize(item.snippet).includes(q) ||
        normalize(item.source).includes(q) ||
        normalize(item.theme).includes(q);
      return matchesSentiment && matchesQuery;
    });
  }, [data?.items, query, sentiment]);

  return (
    <AppShell
      title="Radar de Menções"
      subtitle="Tudo que cita o candidato, seus temas, redes, projetos e oportunidades de resposta."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {cooldown && (
            <Badge variant="outline" className="text-xs">
              Plano {planLabel(cooldown.plan)} · cooldown{" "}
              {cooldown.cooldownHours === 0 ? "livre" : `${cooldown.cooldownHours}h`}
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || !hasMentionSources || blocked}
          >
            {blocked ? (
              <Lock className="mr-2 h-4 w-4" />
            ) : (
              <RefreshCw
                className={`mr-2 h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`}
              />
            )}
            {planLocked
              ? "Plano avançado"
              : blocked
                ? `Disponível em ${formatCooldownRemaining(cooldown!.remainingMs)}`
                : refreshMutation.isPending
                  ? "Atualizando..."
                  : "Atualizar menções"}
          </Button>
          <Link to="/studio">
            <Button size="sm" variant="outline">
              <Sparkles className="mr-2 h-4 w-4" />
              Gerar resposta
            </Button>
          </Link>
        </div>
      }
    >
      {!hasMentionSources && (
        <div className="mb-6 rounded-xl border border-dashed border-border bg-card p-6">
          <h2 className="font-serif text-lg">Configure fontes de menção</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Adicione fontes monitoradas, redes sociais ou palavras-chave em Configurações para
            liberar a coleta manual.
          </p>
        </div>
      )}

      {planLocked && (
        <div className="mb-6 rounded-xl border border-dashed border-border bg-card p-6">
          <h2 className="font-serif text-lg">Atualização manual disponível no plano avançado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A coleta manual de menções usa o mesmo motor do Termômetro Social e fica disponível a
            partir do Plano Avançado.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando menções...</p>
      ) : error ? (
        <EmptyState title="Não foi possível carregar as menções" text={String(error)} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Nenhuma menção encontrada ainda"
          text="Quando os robôs de coleta salvarem menções ou comentários, elas aparecerão aqui com sentimento, urgência e oportunidade."
        />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Kpi label="Total" value={data.kpis.total} />
            <Kpi label="Positivas" value={data.kpis.positive} tone="positive" />
            <Kpi label="Neutras" value={data.kpis.neutral} />
            <Kpi label="Negativas" value={data.kpis.negative} tone="negative" />
            <Kpi label="Críticas" value={data.kpis.critical} tone="negative" />
            <Kpi label="24h" value={data.kpis.last24} />
            <Kpi label="Cidade" value={data.kpis.topCity ?? "-"} compact />
            <Kpi label="Tema" value={data.kpis.topTheme ?? "-"} compact />
          </section>

          <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 md:flex-row md:items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar por fonte, tema, cidade ou trecho..."
              className="md:max-w-sm"
            />
            <select
              value={sentiment}
              onChange={(event) => setSentiment(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="todos">Todos os sentimentos</option>
              <option value="positiv">Positivas</option>
              <option value="neutr">Neutras</option>
              <option value="negativ">Negativas</option>
              <option value="risco">Risco reputacional</option>
              <option value="alta">Urgência alta</option>
            </select>
          </section>

          <section className="grid gap-3">
            {items.map((item) => (
              <MentionCard key={item.id} item={item} />
            ))}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function MentionCard({ item }: { item: MentionItem }) {
  const negative = ["negativa", "negativo", "risco reputacional", "ataque político"].includes(
    item.sentiment,
  );
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{item.source}</span>
        <span>·</span>
        <span>{item.sourceType}</span>
        <span>·</span>
        <span>{new Date(item.date ?? Date.now()).toLocaleString("pt-BR")}</span>
        {(item.city || item.state) && (
          <>
            <span>·</span>
            <span>{[item.city, item.state].filter(Boolean).join(" / ")}</span>
          </>
        )}
      </div>
      <h2 className="mt-2 font-serif text-xl leading-snug">{item.title}</h2>
      {item.snippet && <p className="mt-2 text-sm text-muted-foreground">{item.snippet}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{item.theme}</Badge>
        <Badge variant="outline">{item.mentionType}</Badge>
        <Badge
          variant="outline"
          className={negative ? "border-destructive/30 bg-destructive/10 text-destructive" : ""}
        >
          {item.sentiment}
        </Badge>
        <Badge variant="outline">urgência {item.urgency}</Badge>
        <Badge variant="outline">relevância {item.relevance}</Badge>
        <div className="ml-auto flex gap-2">
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm">
                <ExternalLink className="mr-1 h-4 w-4" />
                Fonte
              </Button>
            </a>
          )}
          <Link to="/studio">
            <Button size="sm">
              <Sparkles className="mr-1 h-4 w-4" />
              Gerar post
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

function Kpi({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: string | number;
  tone?: "positive" | "negative";
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 truncate font-serif ${compact ? "text-lg" : "text-2xl"} ${
          tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <MessageSquareWarning className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-4 font-serif text-xl">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
