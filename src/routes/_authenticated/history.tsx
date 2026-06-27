import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  createCandidateAction,
  deleteCandidateAction,
  listMyCandidateActions,
} from "@/lib/candidate-actions.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

const ACTION_TYPES = [
  "Projeto de Lei",
  "Lei",
  "Relatoria",
  "Discurso",
  "VotaÃ§Ã£o",
  "Requerimento",
  "Emenda",
  "ComissÃ£o",
  "AudiÃªncia PÃºblica",
  "NotÃ­cia antiga",
  "Outro",
] as const;

type FormState = {
  action_type: string;
  title: string;
  description: string;
  theme: string;
  source: string;
  source_url: string;
  action_date: string;
  legislature: string;
  keywords: string[];
};

const EMPTY_FORM: FormState = {
  action_type: "Projeto de Lei",
  title: "",
  description: "",
  theme: "",
  source: "",
  source_url: "",
  action_date: "",
  legislature: "",
  keywords: [],
};

function HistoryPage() {
  const qc = useQueryClient();
  const listActions = useServerFn(listMyCandidateActions);
  const createAction = useServerFn(createCandidateAction);
  const deleteAction = useServerFn(deleteCandidateAction);

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ["candidate-actions"],
    queryFn: () => listActions(),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [keywordInput, setKeywordInput] = useState("");
  const [themeFilter, setThemeFilter] = useState("all");

  const themes = useMemo(() => {
    const set = new Set<string>();
    for (const action of actions) {
      if (action.theme) set.add(action.theme);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [actions]);

  const filteredActions = useMemo(() => {
    if (themeFilter === "all") return actions;
    return actions.filter((action) => action.theme === themeFilter);
  }, [actions, themeFilter]);

  const createMutation = useMutation({
    mutationFn: () => createAction({ data: form }),
    onSuccess: () => {
      toast.success("AtuaÃ§Ã£o salva na memÃ³ria legislativa.");
      setForm(EMPTY_FORM);
      setKeywordInput("");
      qc.invalidateQueries({ queryKey: ["candidate-actions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar atuaÃ§Ã£o."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAction({ data: { id } }),
    onSuccess: () => {
      toast.success("AtuaÃ§Ã£o removida.");
      qc.invalidateQueries({ queryKey: ["candidate-actions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover atuaÃ§Ã£o."),
  });

  function addKeyword() {
    const keyword = keywordInput.trim();
    if (!keyword || form.keywords.includes(keyword)) return;
    setForm((current) => ({
      ...current,
      keywords: [...current.keywords, keyword],
    }));
    setKeywordInput("");
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Informe o tÃ­tulo da atuaÃ§Ã£o.");
    createMutation.mutate();
  }

  return (
    <AppShell
      title="MemÃ³ria Legislativa"
      subtitle="Cadastre atuaÃ§Ãµes documentadas do candidato para a IA conectar notÃ­cias atuais com histÃ³rico real."
    >
      <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
        <form onSubmit={save} className="rounded-xl border border-border bg-card p-6 h-fit space-y-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Plus className="h-3.5 w-3.5 text-gold" />
              Novo registro
            </div>
            <h2 className="mt-1 font-serif text-2xl">AtuaÃ§Ã£o anterior</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use fontes oficiais sempre que possÃ­vel. A IA sÃ³ deve relacionar notÃ­cias com fatos documentados.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Tipo">
              <select
                value={form.action_type}
                onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ACTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Tema">
              <Input
                placeholder="Ex: SeguranÃ§a pÃºblica"
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              />
            </Field>
          </div>

          <Field label="TÃ­tulo">
            <Input
              placeholder="Ex: PL 1234/2019 â€” ReforÃ§o no combate ao crime organizado"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </Field>

          <Field label="DescriÃ§Ã£o / contexto">
            <Textarea
              rows={4}
              placeholder="Descreva de forma objetiva o que o candidato fez e por que isso importa."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Data">
              <Input
                type="date"
                value={form.action_date}
                onChange={(e) => setForm({ ...form, action_date: e.target.value })}
              />
            </Field>
            <Field label="Legislatura / mandato">
              <Input
                placeholder="Ex: 2015â€“2018"
                value={form.legislature}
                onChange={(e) => setForm({ ...form, legislature: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Fonte">
              <Input
                placeholder="Ex: CÃ¢mara dos Deputados"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </Field>
            <Field label="URL da fonte">
              <Input
                placeholder="https://..."
                value={form.source_url}
                onChange={(e) => setForm({ ...form, source_url: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <Label>Palavras-chave</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                placeholder="Ex: crime organizado"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addKeyword}>
                Adicionar
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {form.keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="gap-1 pl-3">
                  {keyword}
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        keywords: form.keywords.filter((item) => item !== keyword),
                      })
                    }
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={createMutation.isPending} className="w-full">
            {createMutation.isPending ? "Salvando..." : "Salvar na memÃ³ria legislativa"}
          </Button>
        </form>

        <section>
          <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-serif text-2xl">Registros cadastrados</h2>
              <p className="text-sm text-muted-foreground">
                {actions.length} atuaÃ§Ã£o(Ãµes) disponÃ­veis para cruzamento com notÃ­cias.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setThemeFilter("all")}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  themeFilter === "all"
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Todos
              </button>
              {themes.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => setThemeFilter(theme)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    themeFilter === theme
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando memÃ³ria legislativa...</p>
          ) : filteredActions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhuma atuaÃ§Ã£o cadastrada ainda. Comece pelos principais projetos, discursos e votaÃ§Ãµes do candidato.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {filteredActions.map((action) => (
                <li key={action.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                        <span>{action.action_type}</span>
                        {action.theme && (
                          <>
                            <span className="text-border">Â·</span>
                            <span>{action.theme}</span>
                          </>
                        )}
                        {action.action_date && (
                          <>
                            <span className="text-border">Â·</span>
                            <time>{new Date(`${action.action_date}T00:00:00`).toLocaleDateString("pt-BR")}</time>
                          </>
                        )}
                      </div>
                      <h3 className="mt-2 font-serif text-xl leading-snug">{action.title}</h3>
                      {action.description && (
                        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                          {action.description}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Remover esta atuaÃ§Ã£o da memÃ³ria legislativa?")) {
                          deleteMutation.mutate(action.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {(action.keywords ?? []).map((keyword: string) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                    {action.source_url && (
                      <a
                        href={action.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
                      >
                        Fonte <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

