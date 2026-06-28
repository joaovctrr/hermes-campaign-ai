import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getNewsItem } from "@/lib/news.functions";
import { generatePost, getLegislativeMemoryForNews, listPostsForNews } from "@/lib/posts.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, Copy, Check, BookOpenCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/studio/$id")({
  component: StudioDetail,
});

const FORMATS = [
  { key: "instagram", label: "Instagram (Carrossel)" },
  { key: "tiktok", label: "TikTok / Reels" },
  { key: "twitter", label: "Twitter / X" },
] as const;

function StudioDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getNews = useServerFn(getNewsItem);
  const listPosts = useServerFn(listPostsForNews);
  const getMemory = useServerFn(getLegislativeMemoryForNews);
  const gen = useServerFn(generatePost);

  const { data: news } = useQuery({
    queryKey: ["news", id],
    queryFn: () => getNews({ data: { id } }),
  });
  const { data: memory } = useQuery({
    queryKey: ["news-memory", id],
    queryFn: () => getMemory({ data: { news_item_id: id } }),
  });
  const { data: posts = [] } = useQuery({
    queryKey: ["posts", id],
    queryFn: () => listPosts({ data: { news_item_id: id } }),
  });

  const [format, setFormat] = useState<(typeof FORMATS)[number]["key"]>("instagram");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const latestForFormat = posts.find((p) => p.format === format);
  useEffect(() => {
    setDraft(latestForFormat?.content ?? "");
  }, [latestForFormat?.content, latestForFormat?.id, format]);

  const mutation = useMutation({
    mutationFn: () => gen({ data: { news_item_id: id, format } }),
    onSuccess: (post) => {
      setDraft(post.content);
      qc.invalidateQueries({ queryKey: ["posts", id] });
      toast.success("Conteúdo gerado.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function copy() {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppShell
      title="Estúdio de Criação"
      subtitle="Gere e ajuste o conteúdo no formato desejado."
      actions={
        <Link to="/radar">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar ao radar
          </Button>
        </Link>
      }
    >
      {!news ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6 max-w-6xl">
          <aside className="rounded-xl border border-border bg-card p-6 h-fit sticky top-6">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Notícia base
            </span>
            <h2 className="mt-2 font-serif text-xl leading-snug">{news.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {news.theme && <Badge variant="outline">{news.theme}</Badge>}
              <Badge variant="outline">{news.source}</Badge>
            </div>
            {news.summary && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{news.summary}</p>
            )}
            {news.url && (
              <a
                href={news.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm text-gold hover:underline"
              >
                Abrir matéria original <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            <div className="mt-6 border-t border-border pt-5">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="h-4 w-4 text-gold" />
                <h3 className="font-serif text-base">Relação com memória legislativa</h3>
              </div>
              {!memory ? (
                <p className="mt-3 text-sm text-muted-foreground">Buscando conexões...</p>
              ) : memory.matches.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum registro forte encontrado. A estratégia será baseada só na notícia e no
                  perfil.
                </p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {memory.themes.map((theme) => (
                      <Badge key={theme} variant="outline" className="bg-gold/10">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-4 space-y-3">
                    {memory.matches.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md border border-border bg-muted/20 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{item.sourceLabel}</span>
                          {item.similarity !== null && (
                            <Badge variant="outline" className="text-[11px]">
                              {item.similarity}% relação
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium leading-snug">{item.title}</p>
                        {item.theme && (
                          <p className="mt-1 text-xs text-muted-foreground">Tema: {item.theme}</p>
                        )}
                        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                          {item.excerpt}
                        </p>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Ver fonte <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <Tabs value={format} onValueChange={(v) => setFormat(v as typeof format)}>
              <TabsList className="grid grid-cols-3 w-full">
                {FORMATS.map((f) => (
                  <TabsTrigger key={f.key} value={f.key}>
                    {f.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {FORMATS.map((f) => (
                <TabsContent key={f.key} value={f.key} className="mt-4">
                  <div className="flex justify-between items-center gap-2 mb-3">
                    <p className="text-sm text-muted-foreground">
                      {latestForFormat
                        ? "Última versão gerada carregada abaixo. Edite ou gere novamente."
                        : "Nenhuma versão gerada ainda."}
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={copy} variant="outline" size="sm" disabled={!draft}>
                        {copied ? (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 mr-1" />
                        )}
                        {copied ? "Copiado" : "Copiar"}
                      </Button>
                      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {mutation.isPending
                          ? "Gerando..."
                          : latestForFormat
                            ? "Gerar nova versão"
                            : "Gerar"}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={22}
                    className="font-mono text-sm leading-relaxed"
                    placeholder="Clique em 'Gerar' para criar o conteúdo a partir da notícia."
                  />
                </TabsContent>
              ))}
            </Tabs>
          </section>
        </div>
      )}
    </AppShell>
  );
}
