import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMyCronHistory } from "@/lib/cron-logs.functions";
import { CheckCircle2, SkipForward, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/logs")({
  component: LogsPage,
});

const REASON_LABEL: Record<string, string> = {
  within_interval: "Dentro do intervalo configurado",
  plan_floor: "Limite do plano não permite ainda",
  no_handles: "Nenhuma rede configurada",
  no_profile: "Perfil não encontrado",
  no_results: "Apify não retornou itens",
  no_networks_selected: "Nenhuma rede selecionada",
  already_fresh: "Sem novidades desde a última coleta",
  error: "Erro durante execução",
};

function LogsPage() {
  const fn = useServerFn(getMyCronHistory);
  const { data = [], isLoading } = useQuery({
    queryKey: ["cron-history"],
    queryFn: () => fn({ data: { limit: 100 } }),
  });

  const [filter, setFilter] = useState<"all" | "processed" | "skipped">("all");

  const rows = useMemo(() => {
    if (filter === "all") return data;
    return data.filter((r) => r.action === filter);
  }, [data, filter]);

  return (
    <AppShell
      title="Logs de coleta"
      subtitle="Histórico das execuções automáticas do Termômetro Social. Veja quando seu perfil foi processado ou pulado e por quê."
    >
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="processed">Processadas</TabsTrigger>
          <TabsTrigger value="skipped">Puladas</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum log ainda. O cron roda a cada 6h e os registros aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data/hora</th>
                <th className="text-left p-3">Hook</th>
                <th className="text-left p-3">Ação</th>
                <th className="text-left p-3">Motivo</th>
                <th className="text-left p-3">Intervalo</th>
                <th className="text-left p-3">Plano</th>
                <th className="text-right p-3">Novos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 text-xs text-muted-foreground tabular-nums">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3 text-xs">{r.hook}</td>
                  <td className="p-3">
                    {r.action === "processed" ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Processado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                        <SkipForward className="h-3 w-3 mr-1" /> Pulado
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {r.error ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {r.error.slice(0, 80)}
                      </span>
                    ) : (
                      REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "—"
                    )}
                  </td>
                  <td className="p-3 text-xs tabular-nums">{r.interval_hours ?? "—"}h</td>
                  <td className="p-3 text-xs capitalize">{r.plan ?? "—"}</td>
                  <td className="p-3 text-xs text-right tabular-nums">
                    {r.action === "processed" ? r.inserted_count ?? 0 : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
