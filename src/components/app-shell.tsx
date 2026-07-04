import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ComponentType, type ReactNode, useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageCircle,
  Newspaper,
  Radio,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import logo from "@/assets/informa-agora-logo-transparent.png";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/radar", label: "Radar de Notícias", icon: Newspaper },
  { to: "/studio", label: "Estúdio de Criação", icon: Sparkles },
  { to: "/library", label: "Biblioteca", icon: Library },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/telegram", label: "Telegram", icon: Send },
  { to: "/history", label: "Memória Legislativa", icon: BookOpenCheck },
  { to: "/sentiment", label: "Termômetro Social", icon: BarChart3 },
  { to: "/sources", label: "Fontes Monitoradas", icon: Radio },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <SidebarContent pathname={pathname} signOut={signOut} />
      </aside>

      <div
        className={`fixed inset-0 z-50 md:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/40 transition-opacity ${
            mobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Fechar menu"
        />
        <aside
          className={`relative flex h-full w-[82vw] max-w-80 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute right-3 top-3 rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
          <SidebarContent
            pathname={pathname}
            signOut={signOut}
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </aside>
      </div>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-border bg-background">
          <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between md:px-8 md:py-6">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-0.5 shrink-0 md:hidden"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Abrir menu"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="font-serif text-2xl md:text-3xl">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </header>
        <div className="flex-1 px-4 py-5 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

function SidebarContent({
  pathname,
  signOut,
  onNavigate,
}: {
  pathname: string;
  signOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="border-b border-sidebar-border/40 px-5 py-6">
        <Link
          to="/dashboard"
          onClick={onNavigate}
          className="flex min-h-20 items-center justify-center"
          aria-label="Ir para o painel"
        >
          <img
            src={logo}
            alt="Informa Ágora"
            className="max-h-24 w-full max-w-56 object-contain brightness-0 invert"
          />
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((item) => (
          <NavLink key={item.to} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border/40">
        <button
          onClick={() => {
            onNavigate?.();
            signOut();
          }}
          className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: {
    to: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
  };
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
      }`}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export { Button };
