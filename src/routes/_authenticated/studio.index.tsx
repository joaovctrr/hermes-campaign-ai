import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyNews } from "@/lib/news.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/studio/")({
  component: StudioIndex,
});

function StudioIndex() {
  const getNews = useServerFn(listMyNews);
  const { data: news = [] } = useQuery({ queryKey: ["news"], queryFn: () => getNews() });

  return (
    <AppShell
      title="Estúdio de Criação"
      subtitle="Escolha uma notícia do radar para gerar a estratégia de conteúdo."
    >
      {news.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center max-w-xl mx-auto">
          <p className="text-sm text-muted-foreground">Nenhuma notícia no radar ainda.</p>
          <Link to="/radar" className="mt-4 inline-block">
            <Button variant="outline">Ir para o radar</Button>
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3 max-w-3xl">
          {news.slice(0, 20).map((n) => (
            <li key={n.id}>
              <Link
                to="/studio/$id"
                params={{ id: n.id }}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 hover:border-gold/40 transition"
              >
                <div className="min-w-0">
                  <p className="font-serif text-base truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{n.source} · {n.theme}</p>
                </div>
                <Sparkles className="h-4 w-4 text-gold shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
