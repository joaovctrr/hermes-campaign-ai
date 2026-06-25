import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { getMyProfile } from "@/lib/profile.functions";
import { listMyNews, getMyDashboardStats } from "@/lib/news.functions";
import { AppShell } from "@/components/app-shell";
import { ShieldAlert, TrendingUp, Radio, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const getProfile = useServerFn(getMyProfile);
  const getNews = useServerFn(listMyNews);
  const getStats = useServerFn(getMyDashboardStats);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const { data: news = [] } = useQuery({ queryKey: ["news"], queryFn: () => getNews() });
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: () => getStats() });

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/settings" });
  }, [profile, navigate]);

  const critical = news.filter((n) => n.urgency === "alta");

  const themeMap = new Map<string, number>();
  news
    .filter((n) => new Date(n.created_at).getTime() > Date.now() - 86400000)
    .forEach((n) => n.theme && themeMap.set(n.theme, (themeMap.get(n.theme) ?? 0) + 1));
  const topThemes = [...themeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const lastNewsAt = stats?.last_news_at ? new Date(stats.last_news_at) : null;

  return (
    <AppShell
      title={`Bom dia${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}.`}
      subtitle="Panorama estratégico das últimas 24 horas no seu radar."
    >
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>
          Radar atualizado automaticamente a cada 3h.
          {lastNewsAt && ` Última coleta: ${lastNewsAt.toLocaleString("pt-BR")}.`}
        </span>
      </div>

      {critical.length > 0 && (
        <div className="mb-6 rounded-xl border border-destructive/50 bg-destructive/5 p-5 flex items-start gap-4">
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-serif text-lg text-destructive">{critical.length} aviso(s) crítico(s)</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Notícias com urgência alta detectadas. Recomenda-se posicionamento ainda hoje.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {critical.slice(0, 3).map((n) => (
                <li key={n.id} className="flex items-start gap-2">
                  <span className="text-destructive mt-1.5 h-1 w-1 rounded-full bg-destructive shrink-0" />
                  <Link to="/studio/$id" params={{ id: n.id }} className="hover:underline">{n.title}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card title="Notícias nas últimas 24h" icon={Radio}>
          <div className="font-serif text-5xl">{stats?.last_24h ?? 0}</div>
          <p className="text-sm text-muted-foreground mt-2">
            {stats?.total ?? 0} no total armazenadas no seu radar.
          </p>
          <Link to="/radar" className="mt-4 inline-block">
            <Button variant="outline" size="sm">Abrir radar</Button>
          </Link>
        </Card>

        <Card title="Pautas em alta" icon={TrendingUp}>
          {topThemes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem dados ainda. Atualize o radar para começar.
            </p>
          ) : (
            <ul className="space-y-2 mt-1">
              {topThemes.map(([theme, count]) => (
                <li key={theme} className="flex justify-between text-sm">
                  <span>{theme}</span>
                  <span className="text-muted-foreground tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Avisos críticos (24h)" icon={ShieldAlert}>
          <div className="font-serif text-5xl text-destructive">{stats?.critical_24h ?? 0}</div>
          <p className="text-sm text-muted-foreground mt-2">
            Pautas que exigem posicionamento imediato.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ title, icon: Icon, children }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-gold" />
        {title}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
