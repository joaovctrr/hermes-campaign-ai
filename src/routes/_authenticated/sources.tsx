import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteMonitoredSource,
  listMonitoredSources,
  saveMonitoredSource,
  seedDefaultMonitoredSources,
} from "@/lib/strategic-intelligence.functions";
import { ExternalLink, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sources")({
  component: SourcesPage,
});

type MonitoredSource = {
  id: string;
  name: string;
  url: string;
  source_type: string | null;
  city: string | null;
  state: string | null;
  theme: string | null;
  priority_level: string;
  active: boolean;
};

function SourcesPage() {
  const listSources = useServerFn(listMonitoredSources);
  const saveSource = useServerFn(saveMonitoredSource);
  const seedDefaults = useServerFn(seedDefaultMonitoredSources);
  const deleteSource = useServerFn(deleteMonitoredSource);
  const { data: sources = [], refetch } = useQuery({
    queryKey: ["monitored-sources"],
    queryFn: () => listSources(),
  });
  const [form, setForm] = useState({
    name: "",
    url: "",
    source_type: "portal",
    state: "",
    city: "",
    theme: "",
    priority_level: "media" as "baixa" | "media" | "alta" | "estrategica",
    active: true,
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      saveSource({
        data: {
          ...form,
          state: form.state || null,
          city: form.city || null,
          theme: form.theme || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Fonte monitorada salva.");
      setForm({
        name: "",
        url: "",
        source_type: "portal",
        state: "",
        city: "",
        theme: "",
        priority_level: "media",
        active: true,
        notes: "",
      });
      await refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar."),
  });

  const defaultsMutation = useMutation({
    mutationFn: () => seedDefaults(),
    onSuccess: async () => {
      toast.success("Fontes nacionais adicionadas.");
      await refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao adicionar."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSource({ data: { id } }),
    onSuccess: async () => {
      toast.success("Fonte removida.");
      await refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao remover."),
  });

  return (
    <AppShell
      title="Fontes Monitoradas"
      subtitle="Cadastre portais, blogs, órgãos oficiais, RSS e páginas locais que o radar deve priorizar."
    >
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <Radio className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-serif text-xl">Pacote nacional ampliado</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adicione portais nacionais, bastidores políticos, checagem, institucionais e
                  veículos regionais para começar com uma base forte.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={defaultsMutation.isPending}
              onClick={() => defaultsMutation.mutate()}
              className="mt-4 w-full"
            >
              {defaultsMutation.isPending ? "Adicionando..." : "Adicionar pacote nacional"}
            </Button>
          </section>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
            className="rounded-xl border border-border bg-card p-6"
          >
            <h2 className="font-serif text-xl">Adicionar fonte</h2>
            <div className="mt-5 space-y-4">
              <Field label="Nome da fonte">
                <Input
                  required
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Ex: Blog do Centro, Prefeitura Municipal"
                />
              </Field>
              <Field label="URL">
                <Input
                  required
                  type="url"
                  value={form.url}
                  onChange={(event) => setForm({ ...form, url: event.target.value })}
                  placeholder="https://..."
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <Select
                    value={form.source_type}
                    onChange={(value) => setForm({ ...form, source_type: value })}
                  >
                    <option value="portal">Portal de notícia</option>
                    <option value="blog">Blog local</option>
                    <option value="institucional">Site institucional</option>
                    <option value="camara">Câmara Municipal</option>
                    <option value="prefeitura">Prefeitura</option>
                    <option value="rss">RSS</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                    <option value="outro">Outro</option>
                  </Select>
                </Field>
                <Field label="Importância">
                  <Select
                    value={form.priority_level}
                    onChange={(value) =>
                      setForm({
                        ...form,
                        priority_level: value as "baixa" | "media" | "alta" | "estrategica",
                      })
                    }
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="estrategica">Estratégica</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Estado">
                  <Input
                    value={form.state}
                    onChange={(event) => setForm({ ...form, state: event.target.value })}
                    placeholder="MG"
                  />
                </Field>
                <Field label="Cidade">
                  <Input
                    value={form.city}
                    onChange={(event) => setForm({ ...form, city: event.target.value })}
                    placeholder="Belo Horizonte"
                  />
                </Field>
              </div>
              <Field label="Tema principal">
                <Input
                  value={form.theme}
                  onChange={(event) => setForm({ ...form, theme: event.target.value })}
                  placeholder="Política, economia, saúde, educação..."
                />
              </Field>
              <Field label="Observações">
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="Ex: fonte importante para bairros da região norte."
                />
              </Field>
              <Button type="submit" disabled={mutation.isPending} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                {mutation.isPending ? "Salvando..." : "Salvar fonte"}
              </Button>
            </div>
          </form>
        </div>

        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl">Fontes cadastradas</h2>
            <Badge variant="outline">{sources.length} fonte(s)</Badge>
          </div>
          <div className="mt-5 space-y-3">
            {sources.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nenhuma fonte manual cadastrada ainda.
              </p>
            ) : (
              (sources as MonitoredSource[]).map((source) => (
                <article key={source.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{source.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[source.source_type, source.city, source.state, source.theme]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{source.priority_level}</Badge>
                      <Badge variant={source.active ? "default" : "secondary"}>
                        {source.active ? "ativa" : "inativa"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="truncate text-xs text-muted-foreground">{source.url}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Remover "${source.name}" das fontes monitoradas?`)) {
                            deleteMutation.mutate(source.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remover
                      </Button>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="mr-1 h-4 w-4" />
                          Abrir
                        </Button>
                      </a>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
    >
      {children}
    </select>
  );
}
