import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import {
  createCandidateAction,
  deleteCandidateAction,
  deleteLegislativeDocument,
  importCamaraProposition,
  listMyCandidateActions,
  listMyLegislativeDocuments,
  searchCamaraPropositions,
  uploadLegislativeDocument,
} from "@/lib/candidate-actions.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, FileText, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
});

const ACTION_TYPES = [
  "Projeto de Lei",
  "Lei",
  "Relatoria",
  "Discurso",
  "Votação",
  "Requerimento",
  "Emenda",
  "Comissão",
  "Audiência Pública",
  "Notícia antiga",
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listActions = useServerFn(listMyCandidateActions);
  const createAction = useServerFn(createCandidateAction);
  const deleteAction = useServerFn(deleteCandidateAction);
  const listDocuments = useServerFn(listMyLegislativeDocuments);
  const uploadDocument = useServerFn(uploadLegislativeDocument);
  const deleteDocument = useServerFn(deleteLegislativeDocument);
  const searchCamara = useServerFn(searchCamaraPropositions);
  const importCamara = useServerFn(importCamaraProposition);

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ["candidate-actions"],
    queryFn: () => listActions(),
  });
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["legislative-documents"],
    queryFn: () => listDocuments(),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [keywordInput, setKeywordInput] = useState("");
  const [themeFilter, setThemeFilter] = useState("all");
  const [camaraQuery, setCamaraQuery] = useState("");
  const [camaraYear, setCamaraYear] = useState("");
  const [camaraTheme, setCamaraTheme] = useState("");

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
      toast.success("Atuação salva na memória legislativa.");
      setForm(EMPTY_FORM);
      setKeywordInput("");
      qc.invalidateQueries({ queryKey: ["candidate-actions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar atuação."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAction({ data: { id } }),
    onSuccess: () => {
      toast.success("Atuação removida.");
      qc.invalidateQueries({ queryKey: ["candidate-actions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover atuação."),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const content_base64 = await fileToBase64(file);
      return uploadDocument({
        data: {
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          content_base64,
        },
      });
    },
    onSuccess: (doc) => {
      toast.success(`${doc.file_name} processado para a memória legislativa.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["legislative-documents"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao processar arquivo."),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (id: string) => deleteDocument({ data: { id } }),
    onSuccess: () => {
      toast.success("Documento removido.");
      qc.invalidateQueries({ queryKey: ["legislative-documents"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover documento."),
  });

  const camaraSearchMutation = useMutation({
    mutationFn: () =>
      searchCamara({
        data: {
          query: camaraQuery,
          year: camaraYear,
          limit: 10,
        },
      }),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao consultar a Câmara dos Deputados."),
  });

  const camaraImportMutation = useMutation({
    mutationFn: (propositionId: string) =>
      importCamara({
        data: {
          proposition_id: propositionId,
          theme: camaraTheme || camaraQuery,
        },
      }),
    onSuccess: (action) => {
      toast.success(`${action.title} importada para a memória legislativa.`);
      qc.invalidateQueries({ queryKey: ["candidate-actions"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Erro ao importar proposição da Câmara."),
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
    if (!form.title.trim()) return toast.error("Informe o título da atuação.");
    createMutation.mutate();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
  }

  return (
    <AppShell
      title="Memória Legislativa"
      subtitle="Cadastre atuações e documentos do candidato para a IA conectar notícias atuais com histórico real."
    >
      <div className="grid gap-8 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <form
            onSubmit={save}
            className="rounded-xl border border-border bg-card p-6 h-fit space-y-5"
          >
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Plus className="h-3.5 w-3.5 text-gold" />
                Novo registro
              </div>
              <h2 className="mt-1 font-serif text-2xl">Atuação anterior</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use fontes oficiais sempre que possível. A IA só deve relacionar notícias com fatos
                documentados.
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
                  placeholder="Ex: Segurança pública"
                  value={form.theme}
                  onChange={(e) => setForm({ ...form, theme: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Título">
              <Input
                placeholder="Ex: PL 1234/2019 — Reforço no combate ao crime organizado"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </Field>

            <Field label="Descrição / contexto">
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
                  placeholder="Ex: 2015-2018"
                  value={form.legislature}
                  onChange={(e) => setForm({ ...form, legislature: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Fonte">
                <Input
                  placeholder="Ex: Câmara dos Deputados"
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
              {createMutation.isPending ? "Salvando..." : "Salvar na memória legislativa"}
            </Button>
          </form>

          <section className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5 text-gold" />
                Fonte oficial
              </div>
              <h2 className="mt-1 font-serif text-2xl">API da Câmara</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Busque proposições nos Dados Abertos da Câmara e importe como registros da memória.
              </p>
            </div>

            <div className="grid sm:grid-cols-[1fr_96px] gap-3">
              <Input
                placeholder="Ex: segurança pública"
                value={camaraQuery}
                onChange={(e) => setCamaraQuery(e.target.value)}
              />
              <Input
                placeholder="Ano"
                value={camaraYear}
                onChange={(e) => setCamaraYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </div>
            <Input
              placeholder="Tema ao importar (opcional)"
              value={camaraTheme}
              onChange={(e) => setCamaraTheme(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={camaraSearchMutation.isPending || camaraQuery.trim().length < 2}
              onClick={() => camaraSearchMutation.mutate()}
              className="w-full"
            >
              {camaraSearchMutation.isPending ? "Consultando..." : "Buscar na Câmara"}
            </Button>

            {(camaraSearchMutation.data ?? []).length > 0 && (
              <div className="space-y-3">
                {camaraSearchMutation.data?.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">{item.title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant={relationBadgeVariant(item.relation.level)}>
                            {item.relation.label}
                          </Badge>
                          {item.authors.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Autor(es): {item.authors.map((author) => author.name).join(", ")}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{item.relation.detail}</p>
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {item.summary || "Sem ementa disponível."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={camaraImportMutation.isPending}
                        onClick={() => camaraImportMutation.mutate(item.id)}
                      >
                        Importar
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Upload className="h-3.5 w-3.5 text-gold" />
                RAG de documentos
              </div>
              <h2 className="mt-1 font-serif text-2xl">Arquivos de aprendizado</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Envie documentos próprios para a IA aprender o histórico do mandato. Aceita TXT,
                Markdown, CSV, JSON e HTML.
              </p>
            </div>

            <Input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/*"
              onChange={handleFileChange}
              disabled={uploadMutation.isPending}
            />

            <Button
              type="button"
              variant="outline"
              disabled={uploadMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadMutation.isPending ? "Processando arquivo..." : "Selecionar arquivo"}
            </Button>
          </section>
        </div>

        <section>
          <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-serif text-2xl">Registros cadastrados</h2>
              <p className="text-sm text-muted-foreground">
                {actions.length} atuação(ões) e {documents.length} documento(s) disponíveis para
                cruzamento com notícias.
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

          <DocumentList
            documents={documents}
            loading={documentsLoading}
            onDelete={(id) => {
              if (confirm("Remover este documento da memória legislativa?")) {
                deleteDocumentMutation.mutate(id);
              }
            }}
          />

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando memória legislativa...</p>
          ) : filteredActions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhuma atuação cadastrada ainda. Comece pelos principais projetos, discursos e
                votações do candidato.
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
                            <span className="text-border">·</span>
                            <span>{action.theme}</span>
                          </>
                        )}
                        {action.action_date && (
                          <>
                            <span className="text-border">·</span>
                            <time>
                              {new Date(`${action.action_date}T00:00:00`).toLocaleDateString(
                                "pt-BR",
                              )}
                            </time>
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
                        if (confirm("Remover esta atuação da memória legislativa?")) {
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

function DocumentList({
  documents,
  loading,
  onDelete,
}: {
  documents: Array<{
    id: string;
    file_name: string;
    size_bytes: number | null;
    chunk_count: number | null;
    status: string | null;
    created_at: string;
  }>;
  loading: boolean;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return <p className="mb-4 text-sm text-muted-foreground">Carregando documentos...</p>;
  }

  if (!documents.length) return null;

  return (
    <div className="mb-6 space-y-3">
      {documents.map((doc) => (
        <article key={doc.id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-gold" />
                <span className="truncate">{doc.file_name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatBytes(doc.size_bytes ?? 0)} · {doc.chunk_count ?? 0} trecho(s) para RAG ·{" "}
                {new Date(doc.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(doc.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </article>
      ))}
    </div>
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

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function relationBadgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "direct") return "default";
  if (level === "possible") return "secondary";
  if (level === "none") return "destructive";
  return "outline";
}
