import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useState } from "react";
import { listMyNews } from "@/lib/news.functions";
import { generatePostFromTopic } from "@/lib/posts.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/studio/")({
  component: StudioIndex,
});

function StudioIndex() {
  const getNews = useServerFn(listMyNews);
  const generateFromTopic = useServerFn(generatePostFromTopic);
  const { data: news = [] } = useQuery({ queryKey: ["news"], queryFn: () => getNews() });
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<"instagram" | "tiktok" | "twitter">("instagram");
  const [provider, setProvider] = useState<"gemini" | "openai">("gemini");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const topicMutation = useMutation({
    mutationFn: () =>
      generateFromTopic({
        data: {
          topic,
          format,
          provider,
        },
      }),
    onSuccess: (post) => {
      setDraft(post.content);
      toast.success("Conteúdo gerado a partir do assunto.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar conteúdo."),
  });

  function copyDraft() {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AppShell
      title="Estúdio de Criação"
      subtitle="Gere conteúdo a partir de uma notícia ou de um assunto próprio conectado à memória legislativa."
    >
      <section className="mb-8 max-w-4xl rounded-xl border border-border bg-card p-6">
        <div className="mb-4">
          <h2 className="font-serif text-xl">Gerar por assunto próprio</h2>
          <p className="text-sm text-muted-foreground">
            Use para pautas que não vieram do Radar. A IA ainda buscará conexão com a memória
            legislativa do candidato.
          </p>
        </div>
        <Textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={4}
          placeholder="Ex: posicionamento sobre segurança nas escolas municipais, cobrança por melhorias no bairro Centro..."
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={format} onChange={(value) => setFormat(value as typeof format)}>
            <option value="instagram">Instagram (Carrossel)</option>
            <option value="tiktok">TikTok / Reels</option>
            <option value="twitter">Twitter / X</option>
          </Select>
          <Select value={provider} onChange={(value) => setProvider(value as typeof provider)}>
            <option value="gemini">Gemini</option>
            <option value="openai">Chat-GPT</option>
          </Select>
          <Button
            type="button"
            disabled={topicMutation.isPending || topic.trim().length < 8}
            onClick={() => topicMutation.mutate()}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {topicMutation.isPending ? "Gerando..." : "Gerar conteúdo"}
          </Button>
          <Button type="button" variant="outline" disabled={!draft} onClick={copyDraft}>
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        {draft && (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            className="mt-4 font-mono text-sm leading-relaxed"
          />
        )}
      </section>

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
      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {children}
    </select>
  );
}
