import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const getProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  const navigate = useNavigate();
  const { data: profile, refetch, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
  });

  const [form, setForm] = useState({
    full_name: "",
    political_role: "",
    region: "",
    bio: "",
    tone: "",
    themes: [] as string[],
  });
  const [themeInput, setThemeInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        political_role: profile.political_role ?? "",
        region: profile.region ?? "",
        bio: profile.bio ?? "",
        tone: profile.tone ?? "",
        themes: profile.monitored_themes ?? [],
      });
    }
  }, [profile]);

  function addTheme() {
    const t = themeInput.trim();
    if (!t || form.themes.includes(t)) return;
    setForm((f) => ({ ...f, themes: [...f.themes, t] }));
    setThemeInput("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name) return toast.error("Nome é obrigatório");
    setSaving(true);
    try {
      await update({
        data: {
          full_name: form.full_name,
          political_role: form.political_role || null,
          region: form.region || null,
          bio: form.bio || null,
          tone: form.tone || null,
          monitored_themes: form.themes,
          onboarded: true,
        },
      });
      toast.success("Perfil atualizado.");
      await refetch();
      if (!profile?.onboarded) navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Configurações do perfil"
      subtitle="Esses dados calibram o tom da IA e o que entra no seu radar."
    >
      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <form onSubmit={save} className="max-w-3xl space-y-8">
          <Section title="Identidade política">
            <Field label="Nome completo">
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </Field>
            <Field label="Cargo / mandato">
              <Input
                placeholder="Ex: Deputado Estadual"
                value={form.political_role}
                onChange={(e) => setForm({ ...form, political_role: e.target.value })}
              />
            </Field>
            <Field label="Região de atuação">
              <Input
                placeholder="Ex: Região Metropolitana de Belo Horizonte"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </Field>
            <Field label="Tom de voz">
              <Input
                placeholder="Ex: institucional, firme, professoral"
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
              />
            </Field>
            <Field label="Posicionamento / bandeiras">
              <Textarea
                rows={4}
                placeholder="Ex: linha dura na segurança, defesa do pequeno empreendedor, foco em interior."
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>
          </Section>

          <Section title="Temas monitorados" subtitle="Palavras-chave que a IA usa para varrer o noticiário.">
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Segurança Pública"
                value={themeInput}
                onChange={(e) => setThemeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTheme();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTheme}>Adicionar</Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {form.themes.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1 pl-3">
                  {t}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, themes: form.themes.filter((x) => x !== t) })}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {!form.themes.length && (
                <p className="text-xs text-muted-foreground">Nenhum tema cadastrado. Adicione ao menos 1.</p>
              )}
            </div>
          </Section>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-serif text-xl">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
