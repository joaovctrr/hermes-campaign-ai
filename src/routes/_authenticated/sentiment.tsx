import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, ExternalLink, Instagram, Twitter, Facebook, Music2, Lock, MessageSquare } from "lucide-react";
import {
  getLatestSnapshot,
  listMyMentions,
  refreshMySentiment,
  getManualCooldownStatus,
} from "@/lib/sentiment.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { formatCooldownRemaining, planLabel } from "@/lib/plan-limits";

export const Route = createFileRoute("/_authenticated/sentiment")({
  component: SentimentPage,
});

const NETWORK_ICON = {
  instagram: Instagram,
  twitter: Twitter,
  tiktok: Music2,
  facebook: Facebook,
} as const;

function SentimentPage() {
  const profileFn = useServerFn(getMyProfile);
  const snapshotFn = useServerFn(getLatestSnapshot);
  const mentionsFn = useServerFn(listMyMentions);
  const refreshFn = useServerFn(refreshMySentiment);
  const cooldownFn = useServerFn(getManualCooldownStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"todas" | "positivo" | "neutro" | "negativo">("todas");
  const [network, setNetwork] = useState<"todas" | "instagram" | "twitter" | "tiktok" | "facebook">("todas");
  const [postModal, setPostModal] = useState<null | {
    network: string;
    url?: string | null;
    caption?: string | null;
    thumbnail?: string | null;
    posted_at?: string | null;
    author?: string | null;
  }>(null);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: snap, refetch: refetchSnap } = useQuery({
    queryKey: ["sentiment-snapshot"],
    queryFn: () => snapshotFn(),
  });
  const { data: mentions, refetch: refetchMentions } = useQuery({
    queryKey: ["mentions", tab, network],
    queryFn: () =>
      mentionsFn({
        data: {
          ...(tab === "todas" ? {} : { sentiment: tab }),
          ...(network === "todas" ? {} : { network }),
        },
      }),
  });
  const { data: cd, refetch: refetchCd } = useQuery({
    queryKey: ["cooldown-sentiment"],
    queryFn: () => cooldownFn(),
    refetchInterval: 60000,
  });

  const hasHandles =
    !!profile?.instagram_handle ||
    !!profile?.twitter_handle ||
    !!profile?.tiktok_handle ||
    !!profile?.facebook_handle ||
    (profile?.mention_keywords?.length ?? 0) > 0;

  const blocked = (cd?.remainingMs ?? 0) > 0;

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await refreshFn();
      toast.success(
        r.inserted
          ? `${r.inserted} novas menções classificadas.`
          : r.reason === "no_handles"
            ? "Adicione um handle em Configurações."
            : r.reason === "no_results"
              ? "Apify não retornou itens. Tente novamente em alguns minutos."
              : "Nada novo desde a última coleta.",
      );
      await Promise.all([refetchSnap(), refetchMentions(), refetchCd()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na coleta");
      await refetchCd();
    } finally {
      setRefreshing(false);
    }
  }

  const total = snap?.total ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const pos = pct(snap?.positivo ?? 0);
  const neu = pct(snap?.neutro ?? 0);
  const neg = pct(snap?.negativo ?? 0);

  return (
    <AppShell
      title="Termômetro Social"
      subtitle="Sentimento agregado das últimas menções coletadas via Apify (7 dias)."
      actions={
        <div className="flex items-center gap-2">
          {cd && (
            <Badge variant="outline" className="text-xs">
              Plano {planLabel(cd.plan)} · cooldown {cd.cooldownHours === 0 ? "livre" : `${cd.cooldownHours}h`}
            </Badge>
          )}
          <Button onClick={refresh} disabled={refreshing || !hasHandles || blocked}>
            {blocked ? (
              <Lock className="h-4 w-4 mr-2" />
            ) : (
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            )}
            {blocked
              ? `Disponível em ${formatCooldownRemaining(cd!.remainingMs)}`
              : refreshing
                ? "Coletando..."
                : "Atualizar agora"}
          </Button>
        </div>
      }
    >
      {!hasHandles && (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 mb-6">
          <h2 className="font-serif text-lg mb-1">Configure pelo menos uma rede social</h2>
          <p className="text-sm text-muted-foreground">
            Vá em <strong>Configurações → Redes sociais monitoradas</strong> e adicione o handle de Instagram, X,
            TikTok ou Facebook.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Menções (7d)" value={total} />
        <StatCard label="Positivas" value={`${pos}%`} accent="text-emerald-600" />
        <StatCard label="Neutras" value={`${neu}%`} accent="text-muted-foreground" />
        <StatCard label="Negativas" value={`${neg}%`} accent="text-destructive" />
      </div>

      {total > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 mb-8">
          <h2 className="font-serif text-lg mb-3">Distribuição</h2>
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${pos}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${neu}%` }} />
            <div className="bg-destructive" style={{ width: `${neg}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {Object.entries((snap?.networks as Record<string, { total: number; pos: number; neg: number; neu: number }>) ?? {}).map(
              ([net, c]) => {
                const active = network === net;
                return (
                  <button
                    type="button"
                    key={net}
                    onClick={() => setNetwork(active ? "todas" : (net as typeof network))}
                    className={`text-left rounded-md border p-3 transition ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <div className="font-medium capitalize flex items-center justify-between">
                      {net}
                      {active && <span className="text-[10px] uppercase tracking-wider text-primary">filtrando</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.total} menções · {c.pos > 0 ? `${Math.round((c.pos / c.total) * 100)}% positivas` : "—"}
                    </div>
                  </button>
                );
              },
            )}
          </div>
          {network !== "todas" && (
            <button
              type="button"
              onClick={() => setNetwork("todas")}
              className="mt-3 text-xs text-primary hover:underline"
            >
              Limpar filtro de rede
            </button>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="positivo">Positivas</TabsTrigger>
          <TabsTrigger value="neutro">Neutras</TabsTrigger>
          <TabsTrigger value="negativo">Negativas</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4 space-y-3">
          {(mentions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma menção nesta categoria ainda.</p>
          ) : (
            (mentions ?? []).map((m) => {
              const Icon = NETWORK_ICON[m.network as keyof typeof NETWORK_ICON];
              const sentColor =
                m.sentiment === "positivo"
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                  : m.sentiment === "negativo"
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : "bg-muted text-muted-foreground border-border";
              return (
                <article key={m.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="capitalize">{m.network}</span>
                      {m.author && <span>· @{m.author}</span>}
                      {m.posted_at && <span>· {new Date(m.posted_at).toLocaleDateString("pt-BR")}</span>}
                    </div>
                    <Badge variant="outline" className={`text-xs ${sentColor}`}>
                      {m.sentiment}
                    </Badge>
                  </div>

                  {m.parent_post_url && (
                    <button
                      type="button"
                      onClick={() =>
                        setPostModal({
                          network: m.network,
                          url: m.parent_post_url,
                          caption: m.parent_post_caption,
                          thumbnail: m.parent_post_thumbnail,
                          posted_at: m.posted_at,
                          author: m.author,
                        })
                      }
                      className="mt-3 flex w-full gap-3 rounded-md border border-border bg-muted/30 p-2.5 text-left hover:bg-muted/60 transition"
                    >
                      {m.parent_post_thumbnail && (
                        <img
                          src={m.parent_post_thumbnail}
                          alt=""
                          className="h-14 w-14 rounded object-cover shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          Em resposta a · clique para ver
                        </div>
                        {m.parent_post_caption && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {m.parent_post_caption}
                          </p>
                        )}
                      </div>
                    </button>
                  )}

                  <p className="mt-3 text-sm leading-relaxed">{m.content}</p>
                  {m.url && (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Abrir original <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </article>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {snap?.created_at && (
        <p className="mt-6 text-xs text-muted-foreground">
          Última coleta: {new Date(snap.created_at).toLocaleString("pt-BR")} · Cron a cada 6h.
        </p>
      )}

      <Dialog open={!!postModal} onOpenChange={(o) => !o && setPostModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif capitalize">
              Post original · {postModal?.network}
            </DialogTitle>
            <DialogDescription>
              {postModal?.author && <>@{postModal.author} · </>}
              {postModal?.posted_at && new Date(postModal.posted_at).toLocaleString("pt-BR")}
            </DialogDescription>
          </DialogHeader>
          {postModal?.thumbnail && (
            <img
              src={postModal.thumbnail}
              alt=""
              className="w-full max-h-80 object-cover rounded-md border border-border"
            />
          )}
          {postModal?.caption ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{postModal.caption}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Sem legenda capturada.</p>
          )}
          {postModal?.url && (
            <a
              href={postModal.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Abrir no {postModal.network} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-2 font-serif text-3xl ${accent ?? ""}`}>{value}</div>
    </div>
  );
}
