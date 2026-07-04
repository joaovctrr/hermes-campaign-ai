import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { listMyPosts, deletePost } from "@/lib/posts.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Instagram, Music2, Twitter, Library, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

const FORMAT_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  instagram: { label: "Instagram", Icon: Instagram },
  tiktok: { label: "TikTok / Reels", Icon: Music2 },
  twitter: { label: "Thread X", Icon: Twitter },
};

function LibraryPage() {
  const qc = useQueryClient();
  const getPosts = useServerFn(listMyPosts);
  const del = useServerFn(deletePost);
  const [filter, setFilter] = useState<"all" | "instagram" | "tiktok" | "twitter">("all");

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["my-posts"],
    queryFn: () => getPosts(),
  });

  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.format === filter)),
    [posts, filter],
  );

  const removeMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Post removido.");
      qc.invalidateQueries({ queryKey: ["my-posts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover."),
  });

  return (
    <AppShell
      title="Biblioteca de Conteúdo"
      subtitle="Histórico de todos os roteiros gerados pelo Informa Ágora."
    >
      <section className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <Library className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h2 className="font-serif text-xl">{posts.length} conteúdo(s) gerado(s)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Organize roteiros, threads e carrosséis criados a partir do Radar ou de assuntos
                próprios.
              </p>
            </div>
          </div>
        </div>
        <Link to="/studio">
          <Button className="h-full w-full md:w-auto">
            <Sparkles className="mr-2 h-4 w-4" />
            Novo conteúdo
          </Button>
        </Link>
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", "instagram", "tiktok", "twitter"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-4 py-1.5 text-xs uppercase tracking-wider border transition ${
              filter === k
                ? "border-gold bg-gold/10 text-gold"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "all" ? `Todos (${posts.length})` : FORMAT_META[k].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center max-w-xl">
          <p className="text-sm text-muted-foreground">
            Nada por aqui ainda. Vá ao{" "}
            <Link to="/studio" className="underline text-foreground">
              Estúdio
            </Link>{" "}
            e gere seu primeiro post.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {filtered.map((p) => {
            const meta = FORMAT_META[p.format] ?? { label: p.format, Icon: Copy };
            const news = (
              p as { news_items?: { title: string; theme: string | null; urgency: string } | null }
            ).news_items;
            return (
              <li
                key={p.id}
                className="rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:bg-muted/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                      <meta.Icon className="h-3.5 w-3.5 text-gold" />
                      {meta.label}
                      <span className="text-border">·</span>
                      <time>{new Date(p.created_at).toLocaleString("pt-BR")}</time>
                    </div>
                    {news && (
                      <p className="mt-2 font-serif text-base truncate">
                        {p.news_item_id ? (
                          <Link
                            to="/studio/$id"
                            params={{ id: p.news_item_id }}
                            className="hover:underline"
                          >
                            {news.title}
                          </Link>
                        ) : (
                          news.title
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(p.content);
                        toast.success("Copiado.");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remover este post da biblioteca?")) removeMut.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <pre className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background/60 p-4 font-sans text-sm leading-relaxed text-foreground/90">
                  {p.content}
                </pre>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
