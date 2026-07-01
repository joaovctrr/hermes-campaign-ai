import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { amIAdmin, setMyPlan } from "@/lib/admin.functions";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AtSign,
  CheckCircle2,
  Clock,
  Flag,
  MapPin,
  Megaphone,
  Radio,
  Save,
  Target,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Network = "instagram" | "twitter" | "tiktok" | "facebook";

function SettingsPage() {
  const getProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  const navigate = useNavigate();
  const {
    data: profile,
    refetch,
    isLoading,
  } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
  });

  const [form, setForm] = useState({
    full_name: "",
    political_name: "",
    party: "",
    electoral_number: "",
    political_role: "",
    target_position: "",
    region: "",
    priority_audience: "",
    positioning_phrase: "",
    bio: "",
    tone: "",
    monitored_states: [] as string[],
    monitored_cities: [] as string[],
    priority_cities: [] as string[],
    themes: [] as string[],
    instagram_handle: "",
    twitter_handle: "",
    tiktok_handle: "",
    facebook_handle: "",
    mention_keywords: [] as string[],
    monitored_networks: ["instagram", "twitter", "tiktok", "facebook"] as Network[],
    cron_interval_hours: 6 as 6 | 12 | 24,
  });
  const [themeInput, setThemeInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [priorityInput, setPriorityInput] = useState("");
  const [saving, setSaving] = useState(false);

  const plan = (profile?.plan ?? "basico") as
    | "bloqueado"
    | "basico"
    | "trial_avancado"
    | "avancado"
    | "enterprise";
  const minInterval =
    plan === "enterprise" ? 6 : plan === "avancado" || plan === "trial_avancado" ? 12 : 24;

  const completion = useMemo(() => {
    const checks = [
      Boolean(form.full_name),
      Boolean(form.political_name),
      Boolean(form.political_role || form.target_position),
      form.monitored_states.length > 0,
      form.monitored_cities.length > 0 || form.priority_cities.length > 0,
      form.themes.length > 0,
      form.mention_keywords.length > 0,
      Boolean(form.instagram_handle || form.facebook_handle || form.twitter_handle),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form]);

  useEffect(() => {
    if (!profile) return;
    const strategicProfile = profile as typeof profile & {
      political_name?: string | null;
      party?: string | null;
      electoral_number?: string | null;
      target_position?: string | null;
      priority_audience?: string | null;
      positioning_phrase?: string | null;
      monitored_states?: string[] | null;
      monitored_cities?: string[] | null;
      priority_cities?: string[] | null;
    };
    setForm({
      full_name: profile.full_name ?? "",
      political_name: strategicProfile.political_name ?? "",
      party: strategicProfile.party ?? "",
      electoral_number: strategicProfile.electoral_number ?? "",
      political_role: profile.political_role ?? "",
      target_position: strategicProfile.target_position ?? "",
      region: profile.region ?? "",
      priority_audience: strategicProfile.priority_audience ?? "",
      positioning_phrase: strategicProfile.positioning_phrase ?? "",
      bio: profile.bio ?? "",
      tone: profile.tone ?? "",
      monitored_states: strategicProfile.monitored_states ?? [],
      monitored_cities: strategicProfile.monitored_cities ?? [],
      priority_cities: strategicProfile.priority_cities ?? [],
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
      ]) as Network[],
      cron_interval_hours: (profile.cron_interval_hours ?? 6) as 6 | 12 | 24,
    });
  }, [profile]);

  function addChip(
    field: "monitored_states" | "monitored_cities" | "priority_cities",
    value: string,
  ) {
    const item = value.trim();
    if (!item || form[field].includes(item)) return;
    setForm((current) => ({ ...current, [field]: [...current[field], item] }));
  }

  function addTheme() {
    const item = themeInput.trim();
    if (!item || form.themes.includes(item)) return;
    setForm((current) => ({ ...current, themes: [...current.themes, item] }));
    setThemeInput("");
  }

  function addKeyword() {
    const item = keywordInput.trim();
    if (!item || form.mention_keywords.includes(item)) return;
    setForm((current) => ({ ...current, mention_keywords: [...current.mention_keywords, item] }));
    setKeywordInput("");
  }

  function toggleNetwork(network: Network) {
    setForm((current) => ({
      ...current,
      monitored_networks: current.monitored_networks.includes(network)
        ? current.monitored_networks.filter((item) => item !== network)
        : [...current.monitored_networks, network],
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.full_name.trim()) return toast.error("Nome completo é obrigatório.");
    setSaving(true);
    try {
      await update({
        data: {
          full_name: form.full_name,
          political_name: form.political_name || null,
          party: form.party || null,
          electoral_number: form.electoral_number || null,
          political_role: form.political_role || null,
          target_position: form.target_position || null,
          region: form.region || null,
          preferred_news_state: form.monitored_states[0] ?? null,
          preferred_news_neighborhood: form.priority_cities[0] ?? form.monitored_cities[0] ?? null,
          priority_audience: form.priority_audience || null,
          positioning_phrase: form.positioning_phrase || null,
          bio: form.bio || null,
          tone: form.tone || null,
          monitored_states: form.monitored_states,
          monitored_cities: form.monitored_cities,
          priority_cities: form.priority_cities,
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
      toast.success("Perfil estratégico atualizado.");
      await refetch();
      if (!profile?.onboarded) navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Perfil Estratégico"
      subtitle="Configure uma única fonte de verdade para radar, IA, território e atendimento."
      actions={
        <Button type="submit" form="strategic-profile-form" disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar perfil"}
        </Button>
      }
    >
      {isLoading ? (
        <p className="text-muted-foreground">Carregando perfil...</p>
      ) : (
        <form id="strategic-profile-form" onSubmit={save} className="space-y-6">
          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge variant="outline" className="mb-3">
                    {plan.replace("_", " ")}
                  </Badge>
                  <h2 className="font-serif text-2xl">
                    {form.political_name || form.full_name || "Candidato sem nome político"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Este perfil alimenta as buscas por menções, o radar territorial, os prompts da
                    IA e as respostas do WhatsApp. Evite campos duplicados: território e foco de
                    notícias agora ficam juntos no mapa estratégico.
                  </p>
                </div>
                <div className="min-w-40 rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Prontidão do perfil
                  </p>
                  <p className="mt-1 font-serif text-3xl">{completion}%</p>
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <Metric label="Estados" value={form.monitored_states.length} />
                <Metric label="Territórios" value={form.monitored_cities.length} />
                <Metric label="Prioridades" value={form.priority_cities.length} />
                <Metric label="Temas" value={form.themes.length} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <StatusCard
                icon={<Radio className="h-4 w-4" />}
                title="Radar de Menções"
                text="Busca nome político, nome completo, @ e palavras-chave em notícias e comentários."
              />
              <StatusCard
                icon={<Target className="h-4 w-4" />}
                title="Foco territorial"
                text="O primeiro estado e a primeira prioridade calibram automaticamente o radar."
              />
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Panel
              icon={<UserRound className="h-5 w-5" />}
              title="Identidade política"
              subtitle="Como a plataforma reconhece o candidato e como a IA deve apresentá-lo."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome completo">
                  <Input
                    required
                    value={form.full_name}
                    onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                    placeholder="Ex: Nome completo do parlamentar"
                  />
                </Field>
                <Field label="Nome político">
                  <Input
                    value={form.political_name}
                    onChange={(event) => setForm({ ...form, political_name: event.target.value })}
                    placeholder="Ex: Nome político ou de urna"
                  />
                </Field>
                <Field label="Cargo atual">
                  <Input
                    value={form.political_role}
                    onChange={(event) => setForm({ ...form, political_role: event.target.value })}
                    placeholder="Ex: Deputado Federal"
                  />
                </Field>
                <Field label="Cargo pretendido">
                  <Input
                    value={form.target_position}
                    onChange={(event) => setForm({ ...form, target_position: event.target.value })}
                    placeholder="Ex: Prefeito, Vereador"
                  />
                </Field>
                <Field label="Partido">
                  <Input
                    value={form.party}
                    onChange={(event) => setForm({ ...form, party: event.target.value })}
                    placeholder="Ex: PSD"
                  />
                </Field>
                <Field label="Número eleitoral">
                  <Input
                    value={form.electoral_number}
                    onChange={(event) => setForm({ ...form, electoral_number: event.target.value })}
                    placeholder="Ex: 12345"
                  />
                </Field>
              </div>
              <Field label="Frase de posicionamento">
                <Input
                  value={form.positioning_phrase}
                  onChange={(event) => setForm({ ...form, positioning_phrase: event.target.value })}
                  placeholder="Ex: Segurança, presença e resultado para Minas."
                />
              </Field>
              <Field label="Bandeiras e biografia curta">
                <Textarea
                  rows={4}
                  value={form.bio}
                  onChange={(event) => setForm({ ...form, bio: event.target.value })}
                  placeholder="Ex: educação, saúde, desenvolvimento econômico, causas sociais e presença nos municípios."
                />
              </Field>
            </Panel>

            <Panel
              icon={<MapPin className="h-5 w-5" />}
              title="Mapa estratégico de monitoramento"
              subtitle="Use uma só área para estado, cidade, bairro e região. O radar usa estes dados automaticamente."
            >
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p className="text-sm text-muted-foreground">
                    O campo antigo “estado preferencial” agora é o primeiro estado abaixo. O campo
                    antigo “bairro preferencial” agora é a primeira prioridade territorial.
                  </p>
                </div>
              </div>
              <ChipEditor
                label="Estados base"
                helper="Estados onde o candidato quer acompanhar notícias, menções e crises."
                placeholder="Ex: MG ou Minas Gerais"
                value={stateInput}
                chips={form.monitored_states}
                onChange={setStateInput}
                onAdd={() => {
                  addChip("monitored_states", stateInput);
                  setStateInput("");
                }}
                onRemove={(item) =>
                  setForm({
                    ...form,
                    monitored_states: form.monitored_states.filter((value) => value !== item),
                  })
                }
              />
              <ChipEditor
                label="Cidades acompanhadas"
                helper="Municípios que devem aparecer no monitoramento territorial."
                placeholder="Ex: Belo Horizonte"
                value={cityInput}
                chips={form.monitored_cities}
                onChange={setCityInput}
                onAdd={() => {
                  addChip("monitored_cities", cityInput);
                  setCityInput("");
                }}
                onRemove={(item) =>
                  setForm({
                    ...form,
                    monitored_cities: form.monitored_cities.filter((value) => value !== item),
                  })
                }
              />
              <ChipEditor
                label="Bairros, regiões ou cidades prioritárias"
                helper="Use aqui Centro, Barreiro, Região Norte, Uberlândia etc. O primeiro item vira foco do radar."
                placeholder="Ex: Centro"
                value={priorityInput}
                chips={form.priority_cities}
                onChange={setPriorityInput}
                onAdd={() => {
                  addChip("priority_cities", priorityInput);
                  setPriorityInput("");
                }}
                onRemove={(item) =>
                  setForm({
                    ...form,
                    priority_cities: form.priority_cities.filter((value) => value !== item),
                  })
                }
              />
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <Panel
              icon={<Flag className="h-5 w-5" />}
              title="Temas estratégicos"
              subtitle="Pautas que orientam notícias, memória e análise."
            >
              <ChipInput
                value={themeInput}
                onChange={setThemeInput}
                onAdd={addTheme}
                placeholder="Ex: Segurança Pública"
              />
              <ChipList
                chips={form.themes}
                empty="Nenhum tema cadastrado."
                onRemove={(item) =>
                  setForm({ ...form, themes: form.themes.filter((value) => value !== item) })
                }
              />
            </Panel>

            <Panel
              icon={<AtSign className="h-5 w-5" />}
              title="Termos de menção"
              subtitle="Usados para procurar o candidato em portais e redes."
            >
              <ChipInput
                value={keywordInput}
                onChange={setKeywordInput}
                onAdd={addKeyword}
                placeholder="Ex: nome de urna, @perfiloficial, projeto prioritário"
              />
              <ChipList
                chips={[
                  ...new Set(
                    [form.political_name, form.full_name, ...form.mention_keywords].filter(
                      Boolean,
                    ) as string[],
                  ),
                ]}
                empty="Nome político e nome completo entram automaticamente quando preenchidos."
                onRemove={(item) =>
                  setForm({
                    ...form,
                    mention_keywords: form.mention_keywords.filter((value) => value !== item),
                  })
                }
                locked={[form.political_name, form.full_name].filter(Boolean) as string[]}
              />
            </Panel>

            <Panel
              icon={<Megaphone className="h-5 w-5" />}
              title="Tom e público"
              subtitle="Como a IA deve soar ao gerar post, estratégia e WhatsApp."
            >
              <Field label="Tom de comunicação">
                <Input
                  value={form.tone}
                  onChange={(event) => setForm({ ...form, tone: event.target.value })}
                  placeholder="Ex: institucional, firme, popular"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {["Institucional", "Popular", "Técnico", "Combativo", "Municipalista"].map(
                  (tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setForm({ ...form, tone })}
                      className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                    >
                      {tone}
                    </button>
                  ),
                )}
              </div>
              <Field label="Público prioritário">
                <Textarea
                  rows={3}
                  value={form.priority_audience}
                  onChange={(event) => setForm({ ...form, priority_audience: event.target.value })}
                  placeholder="Ex: servidores públicos, lideranças comunitárias, famílias."
                />
              </Field>
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <Panel
              icon={<Radio className="h-5 w-5" />}
              title="Redes sociais monitoradas"
              subtitle="Perfis próprios do candidato para comentários e sinais sociais."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Instagram">
                  <Input
                    value={form.instagram_handle}
                    onChange={(event) =>
                      setForm({ ...form, instagram_handle: cleanHandle(event.target.value) })
                    }
                    placeholder="sem @"
                  />
                </Field>
                <Field label="Twitter / X">
                  <Input
                    value={form.twitter_handle}
                    onChange={(event) =>
                      setForm({ ...form, twitter_handle: cleanHandle(event.target.value) })
                    }
                    placeholder="sem @"
                  />
                </Field>
                <Field label="TikTok">
                  <Input
                    value={form.tiktok_handle}
                    onChange={(event) =>
                      setForm({ ...form, tiktok_handle: cleanHandle(event.target.value) })
                    }
                    placeholder="sem @"
                  />
                </Field>
                <Field label="Facebook">
                  <Input
                    value={form.facebook_handle}
                    onChange={(event) =>
                      setForm({ ...form, facebook_handle: cleanHandle(event.target.value) })
                    }
                    placeholder="usuário ou página"
                  />
                </Field>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                {(["instagram", "twitter", "tiktok", "facebook"] as const).map((network) => (
                  <button
                    key={network}
                    type="button"
                    onClick={() => toggleNetwork(network)}
                    className={`rounded-lg border px-3 py-2 text-sm capitalize transition ${
                      form.monitored_networks.includes(network)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {network === "twitter" ? "X/Twitter" : network}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel
              icon={<Clock className="h-5 w-5" />}
              title="Ritmo de coleta"
              subtitle="Frequência permitida pelo plano atual."
            >
              <div className="grid gap-2">
                {([6, 12, 24] as const).map((value) => {
                  const disabled = value < minInterval;
                  const active = form.cron_interval_hours === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setForm({ ...form, cron_interval_hours: value })}
                      className={`rounded-lg border px-4 py-3 text-left transition ${
                        active
                          ? "border-primary bg-primary/10"
                          : disabled
                            ? "cursor-not-allowed border-border opacity-45"
                            : "border-border hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">Atualizar a cada {value}h</span>
                      <span className="block text-xs text-muted-foreground">
                        {disabled
                          ? `Disponível a partir de planos com coleta de ${value}h.`
                          : "Aplica ao radar e às coletas automáticas."}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Plano atual: <strong>{plan.replace("_", " ")}</strong>. Intervalo mínimo:{" "}
                {minInterval}h.
              </p>
            </Panel>
          </section>

          <AdminDevTools currentPlan={plan} onChanged={refetch} />

          <div className="sticky bottom-4 z-10 flex justify-end">
            <Button type="submit" disabled={saving} size="lg" className="shadow-lg">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Salvando..." : "Salvar perfil estratégico"}
            </Button>
          </div>
        </form>
      )}
    </AppShell>
  );
}

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-2 text-primary">{icon}</div>
        <div>
          <h2 className="font-serif text-xl">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ChipEditor({
  label,
  helper,
  placeholder,
  value,
  chips,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  helper: string;
  placeholder: string;
  value: string;
  chips: string[];
  onChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3">
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </div>
      <ChipInput value={value} onChange={onChange} onAdd={onAdd} placeholder={placeholder} />
      <ChipList chips={chips} empty="Nenhum território cadastrado." onRemove={onRemove} />
    </div>
  );
}

function ChipInput({
  value,
  onChange,
  onAdd,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onAdd();
          }
        }}
        placeholder={placeholder}
      />
      <Button type="button" variant="outline" onClick={onAdd}>
        Adicionar
      </Button>
    </div>
  );
}

function ChipList({
  chips,
  empty,
  locked = [],
  onRemove,
}: {
  chips: string[];
  empty: string;
  locked?: string[];
  onRemove: (value: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((chip) => {
        const isLocked = locked.includes(chip);
        return (
          <Badge key={chip} variant={isLocked ? "outline" : "secondary"} className="gap-1 pl-3">
            {chip}
            {isLocked ? (
              <span className="ml-1 text-[10px] text-muted-foreground">auto</span>
            ) : (
              <button
                type="button"
                onClick={() => onRemove(chip)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        );
      })}
      {!chips.length && <p className="text-xs text-muted-foreground">{empty}</p>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl">{value}</p>
    </div>
  );
}

function StatusCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 inline-flex rounded-lg border border-border bg-muted/30 p-2 text-primary">
        {icon}
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function cleanHandle(value: string) {
  return value.replace(/^@/, "").trim();
}

function AdminDevTools({
  currentPlan,
  onChanged,
}: {
  currentPlan: "bloqueado" | "basico" | "trial_avancado" | "avancado" | "enterprise";
  onChanged: () => void;
}) {
  const checkAdmin = useServerFn(amIAdmin);
  const changePlan = useServerFn(setMyPlan);
  const { data: isAdmin } = useQuery({
    queryKey: ["am-i-admin"],
    queryFn: () => checkAdmin(),
  });
  const [busy, setBusy] = useState<string | null>(null);

  if (!isAdmin) return null;

  const plans: Array<{
    value: "bloqueado" | "basico" | "trial_avancado" | "avancado" | "enterprise";
    label: string;
  }> = [
    { value: "bloqueado", label: "Bloqueado" },
    { value: "basico", label: "Básico" },
    { value: "trial_avancado", label: "Trial Avançado" },
    { value: "avancado", label: "Avançado" },
    { value: "enterprise", label: "Enterprise" },
  ];

  async function pick(plan: "bloqueado" | "basico" | "trial_avancado" | "avancado" | "enterprise") {
    setBusy(plan);
    try {
      await changePlan({ data: { plan } });
      toast.success(`Plano alterado para ${plan}.`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-amber-500/40 bg-amber-50/5 p-6">
      <h2 className="font-serif text-xl">Ferramentas de desenvolvedor</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Visível apenas para administradores. Plano atual:{" "}
        <Badge variant="secondary">{currentPlan}</Badge>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {plans.map((plan) => (
          <Button
            key={plan.value}
            type="button"
            variant={currentPlan === plan.value ? "default" : "outline"}
            disabled={busy !== null}
            onClick={() => pick(plan.value)}
          >
            {busy === plan.value ? "Aplicando..." : plan.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
