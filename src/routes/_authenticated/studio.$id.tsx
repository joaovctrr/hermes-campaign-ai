import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getNewsItem } from "@/lib/news.functions";
import { generatePost, listPostsForNews } from "@/lib/posts.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, Copy, Check } from "lucide-react";
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
  const gen = useServerFn(generatePost);

  const { data: news } = useQuery({ queryKey: ["news", id], queryFn: () => getNews({ data: { id } }) });
  const { data: posts = [] } = useQuery({
    queryKey: ["posts", id],
    queryFn: () => listPosts({ data: { news_item_id: id } }),
  });

  const [format, setFormat] = useState<typeof FORMATS[number]["key"]>("instagram");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const latestForFormat = posts.find((p) => p.format === format);
  useEffect(() => {
    setDraft(latestForFormat?.content ?? "");
  }, [latestForFormat?.id, format]);

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
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Notícia base</span>
            <h2 className="mt-2 font-serif text-xl leading-snug">{news.title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {news.theme && <Badge variant="outline">{news.theme}</Badge>}
              <Badge variant="outline">{news.source}</Badge>
            </div>
            {news.summary && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{news.summary}</p>
            )}
            {news.url && (
              <a href={news.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm text-gold hover:underline">
                Abrir matéria original →
              </a>
            )}
          </aside>

          <section className="space-y-4">
            <Tabs value={format} onValueChange={(v) => setFormat(v as typeof format)}>
              <TabsList className="grid grid-cols-3 w-full">
                {FORMATS.map((f) => (
                  <TabsTrigger key={f.key} value={f.key}>{f.label}</TabsTrigger>
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
                        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        {copied ? "Copiado" : "Copiar"}
                      </Button>
                      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {mutation.isPending ? "Gerando..." : latestForFormat ? "Gerar nova versão" : "Gerar"}
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
