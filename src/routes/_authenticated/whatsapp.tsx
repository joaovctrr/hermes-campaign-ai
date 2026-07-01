import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  generateWhatsAppReply,
  getWhatsAppChannel,
  saveWhatsAppChannel,
} from "@/lib/whatsapp.functions";
import { Bot, Copy, MessageCircle, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
});

type AgentPersona = "candidate" | "assessor" | "office";
type ResponseStyle = "acolhedor" | "institucional" | "combativo" | "tecnico";
type ResponseDepth = "curta" | "media" | "detalhada";
type CreativityLevel = "conservadora" | "equilibrada" | "expressiva";

const PERSONAS: Array<{ value: AgentPersona; label: string; text: string }> = [
  { value: "assessor", label: "Assessor", text: "Fala pela equipe, com cuidado institucional." },
  {
    value: "candidate",
    label: "Candidato",
    text: "Responde em primeira pessoa, sem promessas não confirmadas.",
  },
  { value: "office", label: "Gabinete", text: "Usa voz oficial da equipe ou do mandato." },
];

function WhatsAppPage() {
  const getChannel = useServerFn(getWhatsAppChannel);
  const saveChannel = useServerFn(saveWhatsAppChannel);
  const generateReply = useServerFn(generateWhatsAppReply);
  const { data: channel, refetch } = useQuery({
    queryKey: ["whatsapp-channel"],
    queryFn: () => getChannel(),
  });
  const [config, setConfig] = useState({
    public_phone: "",
    provider: "manual" as const,
    llm_provider: "gemini" as "gemini" | "openai",
    response_tone: "",
    agent_persona: "assessor" as AgentPersona,
    response_style: "acolhedor" as ResponseStyle,
    response_depth: "curta" as ResponseDepth,
    creativity_level: "equilibrada" as CreativityLevel,
    agent_instructions: "",
    escalation_message:
      "Vou encaminhar sua solicitação para a equipe responsável responder com precisão.",
    auto_reply_enabled: false,
  });
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);

  useEffect(() => {
    if (!channel) return;
    setConfig({
      public_phone: channel.public_phone ?? "",
      provider: "manual",
      llm_provider: (channel.llm_provider ?? "gemini") as "gemini" | "openai",
      response_tone: channel.response_tone ?? "",
      agent_persona: (channel.agent_persona ?? "assessor") as AgentPersona,
      response_style: (channel.response_style ?? "acolhedor") as ResponseStyle,
      response_depth: (channel.response_depth ?? "curta") as ResponseDepth,
      creativity_level: (channel.creativity_level ?? "equilibrada") as CreativityLevel,
      agent_instructions: channel.agent_instructions ?? "",
      escalation_message:
        channel.escalation_message ??
        "Vou encaminhar sua solicitação para a equipe responsável responder com precisão.",
      auto_reply_enabled: channel.auto_reply_enabled ?? false,
    });
  }, [channel]);

  const saveMutation = useMutation({
    mutationFn: () => saveChannel({ data: config }),
    onSuccess: async () => {
      toast.success("Configuração do WhatsApp salva.");
      await refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar."),
  });

  const replyMutation = useMutation({
    mutationFn: () => generateReply({ data: { message } }),
    onSuccess: (result) => {
      setAnswer(result.outbound_text ?? "");
      setConfidence(result.confidence_score ?? null);
      toast.success("Resposta sugerida com base na memória.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao gerar."),
  });

  function copyAnswer() {
    navigator.clipboard.writeText(answer);
    toast.success("Resposta copiada.");
  }

  return (
    <AppShell
      title="WhatsApp"
      subtitle="Simule atendimento e calibre a voz do agente antes de conectar um provedor oficial."
    >
      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <section className="space-y-5 rounded-xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl">Canal WhatsApp</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Modo atual: simulação manual com geração de resposta assistida.
              </p>
            </div>
            <Badge variant="outline">{channel?.connection_status ?? "draft"}</Badge>
          </div>

          <div className="grid gap-4">
            <Field label="WhatsApp público">
              <Input
                value={config.public_phone}
                onChange={(event) => setConfig({ ...config, public_phone: event.target.value })}
                placeholder="+55 31 99999-9999"
              />
            </Field>
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-start gap-3">
                <MessageCircle className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium">Provedor: manual / simulação</p>
                  <p className="text-xs text-muted-foreground">
                    A conexão com API de envio ficará oculta até o provedor estar implementado e
                    validado.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="LLM">
                <Select
                  value={config.llm_provider}
                  onChange={(value) =>
                    setConfig({ ...config, llm_provider: value as typeof config.llm_provider })
                  }
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                </Select>
              </Field>
              <Field label="Liberdade">
                <Select
                  value={config.creativity_level}
                  onChange={(value) =>
                    setConfig({
                      ...config,
                      creativity_level: value as typeof config.creativity_level,
                    })
                  }
                >
                  <option value="conservadora">Fiel às fontes</option>
                  <option value="equilibrada">Equilibrada</option>
                  <option value="expressiva">Mais persuasiva</option>
                </Select>
              </Field>
            </div>
            <Field label="Tom do atendimento">
              <Input
                value={config.response_tone}
                onChange={(event) => setConfig({ ...config, response_tone: event.target.value })}
                placeholder="Ex: cordial, direto, popular, técnico..."
              />
            </Field>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-background p-4">
            <div className="flex items-start gap-3">
              <SlidersHorizontal className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <h3 className="text-sm font-medium">Comportamento do agente</h3>
                <p className="text-xs text-muted-foreground">
                  Personalize para qualquer candidato, mandato ou equipe.
                </p>
              </div>
            </div>

            <Field label="Quem ele representa">
              <div className="grid gap-2">
                {PERSONAS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setConfig({ ...config, agent_persona: option.value })}
                    className={`rounded-lg border p-3 text-left transition ${
                      config.agent_persona === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {option.text}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Estilo">
                <Select
                  value={config.response_style}
                  onChange={(value) =>
                    setConfig({ ...config, response_style: value as typeof config.response_style })
                  }
                >
                  <option value="acolhedor">Acolhedor</option>
                  <option value="institucional">Institucional</option>
                  <option value="combativo">Firme</option>
                  <option value="tecnico">Técnico</option>
                </Select>
              </Field>
              <Field label="Tamanho">
                <Select
                  value={config.response_depth}
                  onChange={(value) =>
                    setConfig({ ...config, response_depth: value as typeof config.response_depth })
                  }
                >
                  <option value="curta">Curta</option>
                  <option value="media">Média</option>
                  <option value="detalhada">Detalhada</option>
                </Select>
              </Field>
            </div>

            <Field label="Instruções específicas">
              <Textarea
                rows={3}
                value={config.agent_instructions}
                onChange={(event) =>
                  setConfig({ ...config, agent_instructions: event.target.value })
                }
                placeholder="Ex: responder sem ataques, pedir cidade em demandas locais, não prometer agenda..."
              />
            </Field>
          </div>

          <Field label="Mensagem de encaminhamento">
            <Textarea
              rows={3}
              value={config.escalation_message}
              onChange={(event) => setConfig({ ...config, escalation_message: event.target.value })}
            />
          </Field>

          <label className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-sm">
            <input
              type="checkbox"
              checked={config.auto_reply_enabled}
              onChange={(event) =>
                setConfig({ ...config, auto_reply_enabled: event.target.checked })
              }
              className="h-4 w-4 accent-primary"
            />
            Preparar resposta automática quando um provedor estiver conectado.
          </label>

          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="w-full"
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar configuração"}
          </Button>
        </section>

        <section className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <Bot className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-serif text-xl">Simulador de atendimento</h2>
                <p className="text-sm text-muted-foreground">
                  Cole uma pergunta recebida. A IA consulta a memória e devolve um rascunho pronto
                  para revisão.
                </p>
              </div>
            </div>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              className="mt-5"
              placeholder="Ex: Quais são as principais propostas do candidato para minha cidade?"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={replyMutation.isPending || message.trim().length < 4}
                onClick={() => replyMutation.mutate()}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {replyMutation.isPending ? "Consultando memória..." : "Gerar resposta"}
              </Button>
              <Button type="button" variant="outline" disabled={!answer} onClick={copyAnswer}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
              {confidence !== null && <Badge variant="outline">confiança {confidence}%</Badge>}
            </div>
            {answer && (
              <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Não inventa histórico"
              text="Se a memória não sustentar a resposta, o agente encaminha ou evita afirmar."
            />
            <InfoCard
              icon={<MessageCircle className="h-5 w-5" />}
              title="Pronto para calibrar"
              text="Ajuste persona, tom, tamanho e instruções antes da integração final."
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
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
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
    >
      {children}
    </select>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-primary">{icon}</div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
