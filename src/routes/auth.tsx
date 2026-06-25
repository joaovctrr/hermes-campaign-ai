import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import logo from "@/assets/informa-agora-logo-transparent.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · Informa Ágora" },
      { name: "description", content: "Acesse seu painel Informa Ágora." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [loading, setLoading] = useState(false);

  // Se já estiver logado, vai para dashboard
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && pathname === "/auth") {
        navigate({ to: "/dashboard" });
      }
    });
  }, [navigate, pathname]);

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta.");
    navigate({ to: "/dashboard" });
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        data: { full_name: String(fd.get("full_name")) },
        emailRedirectTo: window.location.origin + "/dashboard",
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada. Verifique seu e-mail se a confirmação estiver ativa.");
    navigate({ to: "/dashboard" });
  }

  async function handleGoogle() {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (r.error) toast.error(r.error.message ?? "Falha no login com Google");
    if (!r.redirected && !r.error) navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <aside className="hidden md:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <a href="/" className="flex items-center gap-2">
          <img src={logo.url} alt="Informa Ágora" className="h-10 w-auto object-contain" />
          <span className="font-serif text-xl">Informa Ágora</span>
        </a>
        <div>
          <p className="font-serif text-3xl leading-snug max-w-md">
            "Quem domina a primeira hora do debate, dita a manchete da semana."
          </p>
          <p className="mt-6 text-sm text-sidebar-foreground/70">Manual interno · Informa Ágora</p>
        </div>
        <div className="text-xs text-sidebar-foreground/60">© Informa Ágora Inteligência Política</div>
      </aside>

      <main className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="font-serif text-3xl">Acesse seu painel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Multi-tenant seguro. Cada usuário vê apenas seus próprios dados.
          </p>

          <Tabs defaultValue="login" className="mt-8">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleEmailLogin} className="space-y-4 mt-6">
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
                <div>
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" name="password" type="password" required autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-6">
                <div>
                  <Label htmlFor="full_name">Nome</Label>
                  <Input id="full_name" name="full_name" required />
                </div>
                <div>
                  <Label htmlFor="email-s">E-mail</Label>
                  <Input id="email-s" name="email" type="email" required />
                </div>
                <div>
                  <Label htmlFor="password-s">Senha</Label>
                  <Input id="password-s" name="password" type="password" minLength={6} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px bg-border flex-1" /> ou <div className="h-px bg-border flex-1" />
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            Entrar com Google
          </Button>

          <p className="mt-8 text-xs text-muted-foreground text-center">
            Ao acessar, você concorda com nossos termos e a Política de Uso da Lovable Cloud.
          </p>
        </div>
      </main>
    </div>
  );
}
