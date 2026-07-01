import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTerritorialDashboard } from "@/lib/strategic-intelligence.functions";
import { MapPin, Settings, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/territory")({
  component: TerritoryPage,
});

function TerritoryPage() {
  const loadTerritory = useServerFn(getTerritorialDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["territorial-dashboard"],
    queryFn: () => loadTerritory(),
  });

  return (
    <AppShell
      title="Mapa de Repercussão"
      subtitle="Mostra onde o nome, as pautas e os riscos apareceram no Brasil, destacando o que está dentro ou fora da base estratégica."
      actions={
        <Link to="/settings">
          <Button variant="outline" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            Configurar território
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <p className="text-muted-foreground">Carregando repercussão territorial...</p>
      ) : error ? (
        <EmptyTerritory text={String(error)} />
      ) : !data || data.cities.length === 0 ? (
        <EmptyTerritory text="Ainda não há volume suficiente. Configure a base estratégica e atualize o Radar para alimentar este painel." />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-3">
            <SummaryCard
              label="Dentro da base"
              value={data.referenceSignalCount ?? 0}
              detail={`${data.coveragePct ?? 0}% dos sinais coletados`}
            />
            <SummaryCard
              label="Fora da base"
              value={data.outsideSignalCount ?? 0}
              detail="Sinais que merecem checagem nacional"
            />
            <SummaryCard
              label="Locais detectados"
              value={data.cities.length}
              detail="Cidades, bairros ou estados citados"
            />
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl">Base estratégica</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.isFilteredByTerritory
                    ? `Referência atual: ${[
                        ...data.monitoredStates,
                        ...data.monitoredCities,
                        ...data.priorityCities,
                      ]
                        .slice(0, 8)
                        .join(", ")}. O painel continua mostrando repercussão fora dessa base.`
                    : "Sem base estratégica configurada; mostrando todos os sinais disponíveis no Brasil."}
                </p>
              </div>
              <Badge variant={data.isFilteredByTerritory ? "default" : "outline"}>
                {data.isFilteredByTerritory ? "referência ativa" : "visão geral"}
              </Badge>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-serif text-xl">Onde olhar primeiro</h2>
                <Badge variant="outline">notícias + menções</Badge>
              </div>
              <div className="mt-5 space-y-3">
                {data.cities.map((city, index) => (
                  <article
                    key={`${city.city}-${index}`}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {index + 1}. {city.city}
                          {city.state ? ` / ${city.state}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{city.opportunity}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{city.total} sinais</Badge>
                        <Badge
                          variant="outline"
                          className={
                            city.negative > 0
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : ""
                          }
                        >
                          {city.negative} negativos
                        </Badge>
                        <Badge variant="outline">{city.mainTheme}</Badge>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Link to="/studio">
                        <Button size="sm" variant="outline">
                          <Sparkles className="mr-2 h-4 w-4" />
                          Gerar roteiro local
                        </Button>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-serif text-xl">Pautas por repercussão</h2>
              <div className="mt-5 space-y-3">
                {data.themes.slice(0, 10).map((theme) => (
                  <div key={theme.label} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{theme.label}</span>
                      <span className="text-sm text-muted-foreground">{theme.count}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.min(100, Math.max(8, theme.count * 10))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value}</p>
      <p className="mt-1 truncate text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyTerritory({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-4 font-serif text-xl">Repercussão ainda sem leitura suficiente</h2>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      <div className="mt-6">
        <Link to="/settings">
          <Button>Configurar cidades</Button>
        </Link>
      </div>
    </div>
  );
}
