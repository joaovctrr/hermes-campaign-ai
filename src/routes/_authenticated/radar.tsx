import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyNews, refreshRadar } from "@/lib/news.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/radar")({
  component: RadarPage,
});

const URGENCY: Record<string, { label: string; className: string }> = {
  alta: { label: "Urgência alta", className: "bg-destructive/10 text-destructive border-destructive/40" },
  media: { label: "Urgência média", className: "bg-gold/15 text-gold-foreground border-gold/40" },
  baixa: { label: "Contexto", className: "bg-muted text-muted-foreground border-border" },
};

function RadarPage() {
  const qc = useQueryClient();
  const getNews = useServerFn(listMyNews);
  const refresh = useServerFn(refreshRadar);
  const { data: news = [], isLoading } = useQuery({ queryKey: ["news"], queryFn: () => getNews() });

  const refreshMutation = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: ["news"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  return (
    <AppShell
      title="Radar de Notícias"
      subtitle="Curadoria automática, ordenada cronologicamente. Atualize manualmente ou aguarde o ciclo de 3h."
      actions={
        <Button onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          {refreshMutation.isPending ? "Analisando..." : "Atualizar radar"}
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : news.length === 0 ? (
        <EmptyState onRefresh={() => refreshMutation.mutate()} loading={refreshMutation.isPending} />
      ) : (
        <div className="grid gap-4 max-w-4xl">
          {news.map((n) => {
            const urg = URGENCY[n.urgency] ?? URGENCY.baixa;
            return (
              <article key={n.id} className="rounded-xl border border-border bg-card p-6 hover:border-gold/40 transition">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{n.source ?? "Fonte"}</span>
                  <span>·</span>
                  <span>
                    {formatDistanceToNow(new Date(n.created_at), { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
                <h3 className="mt-2 font-serif text-xl leading-snug">{n.title}</h3>
                {n.summary && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{n.summary}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {n.theme && <Badge variant="outline">{n.theme}</Badge>}
                  <Badge variant="outline" className={urg.className}>{urg.label}</Badge>
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

function EmptyState({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center max-w-2xl mx-auto">
      <h3 className="font-serif text-xl">Seu radar está vazio.</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Configure seus temas monitorados em Configurações e clique em "Atualizar radar" para fazer a primeira varredura.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/settings"><Button variant="outline">Configurar perfil</Button></Link>
        <Button onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar radar
        </Button>
      </div>
    </div>
  );
}
