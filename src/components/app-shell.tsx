import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode } from "react";
import {
  LayoutDashboard,
  Newspaper,
  Sparkles,
  Library,
  BarChart3,
  ScrollText,
  Settings,
  LogOut,
} from "lucide-react";
import logo from "@/assets/informa-agora-logo-transparent.png";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Centro de Comando", icon: LayoutDashboard },
  { to: "/radar", label: "Radar de Notícias", icon: Newspaper },
  { to: "/studio", label: "Estúdio de Criação", icon: Sparkles },
  { to: "/library", label: "Biblioteca", icon: Library },
  { to: "/sentiment", label: "Termômetro Social", icon: BarChart3 },
  { to: "/logs", label: "Logs de coleta", icon: ScrollText },
  { to: "/settings", label: "Configurações", icon: Settings },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function signOut() {
    await authClient.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6 border-b border-sidebar-border/40">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img
              src={logo}
              alt="Informa Ágora"
              className="h-11 w-auto object-contain brightness-0 invert"
            />
            <span className="font-serif text-xl">Informa Ágora</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active =
              pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border/40">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-border bg-background">
          <div className="px-8 py-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl md:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        </header>
        <div className="flex-1 px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export { Button };
