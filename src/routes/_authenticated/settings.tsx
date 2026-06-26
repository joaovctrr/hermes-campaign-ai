import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { amIAdmin, setMyPlan } from "@/lib/admin.functions";
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
    instagram_handle: "",
    twitter_handle: "",
    tiktok_handle: "",
    facebook_handle: "",
    mention_keywords: [] as string[],
    monitored_networks: ["instagram", "twitter", "tiktok", "facebook"] as Array<
      "instagram" | "twitter" | "tiktok" | "facebook"
    >,
    cron_interval_hours: 6 as 6 | 12 | 24,
  });
  const [themeInput, setThemeInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);

  const plan = (profile?.plan ?? "basico") as "basico" | "avancado" | "enterprise";
  const minInterval = plan === "enterprise" ? 6 : plan === "avancado" ? 12 : 24;
  const intervalOptions: Array<{ value: 6 | 12 | 24; label: string; disabled: boolean }> = [
    { value: 6, label: "A cada 6h", disabled: minInterval > 6 },
    { value: 12, label: "A cada 12h", disabled: minInterval > 12 },
    { value: 24, label: "A cada 24h", disabled: false },
  ];

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        political_role: profile.political_role ?? "",
        region: profile.region ?? "",
        bio: profile.bio ?? "",
        tone: profile.tone ?? "",
        themes: profile.monitored_themes ?? [],
        instagram_handle: profile.instagram_handle ?? "",
        twitter_handle: profile.twitter_handle ?? "",
        tiktok_handle: profile.tiktok_handle ?? "",
        facebook_handle: profile.facebook_handle ?? "",
        mention_keywords: profile.mention_keywords ?? [],
        monitored_networks: (profile.monitored_networks ?? [
          "instagram",
          "twitter",
          "tiktok",
          "facebook",
        ]) as Array<"instagram" | "twitter" | "tiktok" | "facebook">,
        cron_interval_hours: (profile.cron_interval_hours ?? 6) as 6 | 12 | 24,
      });
    }
  }, [profile]);

  function toggleNetwork(n: "instagram" | "twitter" | "tiktok" | "facebook") {
    setForm((f) => ({
      ...f,
      monitored_networks: f.monitored_networks.includes(n)
        ? f.monitored_networks.filter((x) => x !== n)
        : [...f.monitored_networks, n],
    }));
  }


  function addTheme() {
    const t = themeInput.trim();
    if (!t || form.themes.includes(t)) return;
    setForm((f) => ({ ...f, themes: [...f.themes, t] }));
    setThemeInput("");
  }

  function addKeyword() {
    const t = keywordInput.trim();
    if (!t || form.mention_keywords.includes(t)) return;
    setForm((f) => ({ ...f, mention_keywords: [...f.mention_keywords, t] }));
    setKeywordInput("");
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
          instagram_handle: form.instagram_handle || null,
          twitter_handle: form.twitter_handle || null,
          tiktok_handle: form.tiktok_handle || null,
          facebook_handle: form.facebook_handle || null,
          mention_keywords: form.mention_keywords,
          monitored_networks: form.monitored_networks,
          cron_interval_hours: Math.max(form.cron_interval_hours, minInterval) as 6 | 12 | 24,
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

          <Section
            title="Coleta automática"
            subtitle="Escolha quais redes entram no Termômetro Social e a frequência do cron."
          >
            <div>
              <Label>Redes monitoradas</Label>
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                {(["instagram", "twitter", "tiktok", "facebook"] as const).map((n) => {
                  const checked = form.monitored_networks.includes(n);
                  const labels: Record<typeof n, string> = {
                    instagram: "Instagram",
                    twitter: "Twitter / X",
                    tiktok: "TikTok",
                    facebook: "Facebook",
                  };
                  return (
                    <label
                      key={n}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition ${
                        checked ? "border-gold bg-gold/5" : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleNetwork(n)}
                        className="h-4 w-4 accent-gold"
                      />
                      <span className="text-sm">{labels[n]}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Desmarque para economizar créditos da Apify.
              </p>
            </div>

            <div className="pt-2">
              <Label>Intervalo de atualização automática</Label>
              <div className="grid sm:grid-cols-3 gap-2 mt-2">
                {intervalOptions.map((opt) => {
                  const active = form.cron_interval_hours === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => setForm({ ...form, cron_interval_hours: opt.value })}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        active
                          ? "border-gold bg-gold/5"
                          : opt.disabled
                            ? "border-border opacity-40 cursor-not-allowed"
                            : "border-border hover:bg-muted/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Seu plano <span className="font-medium capitalize">{plan}</span> permite no mínimo a cada {minInterval}h.
                {plan !== "enterprise" && " Faça upgrade para atualizações mais frequentes."}
              </p>
            </div>
          </Section>

          <Section
            title="Redes sociais monitoradas"
            subtitle="Handles públicos usados pelo Termômetro Social (Apify). Deixe em branco o que não quiser monitorar."
          >

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Instagram (sem @)">
                <Input
                  placeholder="ex: candidato"
                  value={form.instagram_handle}
                  onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })}
                />
              </Field>
              <Field label="Twitter / X (sem @)">
                <Input
                  placeholder="ex: candidato"
                  value={form.twitter_handle}
                  onChange={(e) => setForm({ ...form, twitter_handle: e.target.value })}
                />
              </Field>
              <Field label="TikTok (sem @)">
                <Input
                  placeholder="ex: candidato"
                  value={form.tiktok_handle}
                  onChange={(e) => setForm({ ...form, tiktok_handle: e.target.value })}
                />
              </Field>
              <Field label="Facebook (usuário ou página)">
                <Input
                  placeholder="ex: candidato.oficial"
                  value={form.facebook_handle}
                  onChange={(e) => setForm({ ...form, facebook_handle: e.target.value })}
                />
              </Field>
            </div>
            <div className="pt-2">
              <Label>Palavras-chave de menção (Twitter/X)</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Termos extras para detectar menções mesmo sem @ ao seu handle.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: Nome Sobrenome"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addKeyword}>Adicionar</Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {form.mention_keywords.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 pl-3">
                    {t}
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, mention_keywords: form.mention_keywords.filter((x) => x !== t) })
                      }
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
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
