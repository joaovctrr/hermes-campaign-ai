import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchLegislativeMemoryChunks } from "@/lib/legislative-memory.server";

type LooseSupabase = {
  // Supabase generated types are intentionally behind the new migration in this workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type StrategicProfile = {
  political_name?: string | null;
  party?: string | null;
  target_position?: string | null;
};

type MemoryMatch = {
  source_type: string | null;
  title: string | null;
  content: string | null;
  similarity?: number | null;
};

type LeadTriage = {
  needsHuman: boolean;
  category:
    | "political_question"
    | "agenda_request"
    | "service_request"
    | "local_demand"
    | "off_topic"
    | "abuse"
    | "unknown";
  reason: string;
};

const ChannelInput = z.object({
  public_phone: z.string().trim().max(40).optional().nullable(),
  provider: z.enum(["manual", "meta", "twilio", "zapi", "evolution", "waha"]).default("manual"),
  llm_provider: z.enum(["gemini", "openai"]).default("gemini"),
  response_tone: z.string().trim().max(300).optional().nullable(),
  agent_persona: z.enum(["candidate", "assessor", "office"]).default("assessor"),
  response_style: z
    .enum(["acolhedor", "institucional", "combativo", "tecnico"])
    .default("acolhedor"),
  response_depth: z.enum(["curta", "media", "detalhada"]).default("curta"),
  creativity_level: z.enum(["conservadora", "equilibrada", "expressiva"]).default("equilibrada"),
  agent_instructions: z.string().trim().max(1200).optional().nullable(),
  escalation_message: z.string().trim().max(500).optional().nullable(),
  auto_reply_enabled: z.boolean().default(false),
});

const ReplyInput = z.object({
  message: z.string().trim().min(4).max(2000),
  contact_name: z.string().trim().max(120).optional().nullable(),
  contact_phone: z.string().trim().max(40).optional().nullable(),
});

export const getWhatsAppChannel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const { data, error } = await db
      .from("whatsapp_channels")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      data ?? {
        public_phone: "",
        provider: "manual",
        connection_status: "not_connected",
        llm_provider: "gemini",
        response_tone: "",
        agent_persona: "assessor",
        response_style: "acolhedor",
        response_depth: "curta",
        creativity_level: "equilibrada",
        agent_instructions: "",
        escalation_message:
          "Vou encaminhar sua solicitação para a equipe responsável responder com precisão.",
        auto_reply_enabled: false,
      }
    );
  });

export const saveWhatsAppChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChannelInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const { error } = await db.from("whatsapp_channels").upsert(
      {
        user_id: context.userId,
        ...data,
        public_phone: data.public_phone || null,
        response_tone: data.response_tone || null,
        agent_persona: data.agent_persona,
        response_style: data.response_style,
        response_depth: data.response_depth,
        creativity_level: data.creativity_level,
        agent_instructions: data.agent_instructions || null,
        escalation_message:
          data.escalation_message ||
          "Vou encaminhar sua solicitação para a equipe responsável responder com precisão.",
        connection_status: data.provider === "manual" ? "draft" : "awaiting_auth",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateWhatsAppReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReplyInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as LooseSupabase;
    const [{ data: profile }, { data: channel }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      db.from("whatsapp_channels").select("*").eq("user_id", context.userId).maybeSingle(),
    ]);

    const provider = channel?.llm_provider === "openai" ? "openai" : "gemini";
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    if (provider === "gemini" && !googleKey)
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente");
    if (provider === "openai" && !openAiKey) throw new Error("OPENAI_API_KEY ausente");

    const memoryResults = await searchLegislativeMemoryChunks(
      context.supabase,
      context.userId,
      data.message,
      7,
    );
    const memoryMatches = Array.isArray(memoryResults) ? (memoryResults as MemoryMatch[]) : [];
    const memoryContext = formatMemoryContext(memoryMatches);
    const confidence = scoreConfidence(memoryMatches);
    const escalation =
      channel?.escalation_message ||
      "Vou encaminhar sua solicitação para a equipe responsável responder com precisão.";

    const { createGoogleAiProvider, createOpenAiProvider } = await import("./ai-gateway.server");
    const model =
      provider === "openai"
        ? createOpenAiProvider(openAiKey!)("gpt-4.1-mini")
        : createGoogleAiProvider(googleKey!)("gemini-3-flash-preview");

    const strategicProfile = profile as typeof profile & StrategicProfile;
    const profileName = strategicProfile?.political_name ?? profile?.full_name ?? "candidato";
    const agentInstructions = buildAgentInstructions(channel, {
      profileName,
      role: profile?.political_role ?? strategicProfile?.target_position ?? null,
      party: strategicProfile?.party ?? null,
      tone: profile?.tone ?? null,
      bio: profile?.bio ?? null,
    });
    const generationFreedom = creativityToTemperature(channel?.creativity_level);
    const triage = await classifyLeadNeed({
      model,
      message: data.message,
      memoryContext,
      profileName,
    });

    const { text } = await generateText({
      model,
      temperature: generationFreedom,
      system: `Você é um atendente político institucional no WhatsApp. Responda em PT-BR. Nunca invente feitos, leis, promessas, agenda ou dados pessoais. Só encaminhe para a equipe quando a triagem indicar necessidade real de acompanhamento humano.

CONFIGURAÇÃO DO AGENTE:
${agentInstructions}`,
      prompt: `PERFIL DO CANDIDATO:
- Nome: ${profileName}
- Cargo: ${profile?.political_role ?? strategicProfile?.target_position ?? "—"}
- Partido: ${strategicProfile?.party ?? "—"}
- Tom desejado: ${channel?.response_tone || profile?.tone || "institucional, claro e acolhedor"}
- Posicionamento: ${profile?.bio ?? "—"}
- Configuração do agente: ${agentInstructions}

MENSAGEM RECEBIDA:
${data.message}

MEMÓRIA POLÍTICA DISPONÍVEL:
${memoryContext || "Nenhum trecho relevante encontrado."}

TRIAGEM DA MENSAGEM:
- Precisa de equipe humana: ${triage.needsHuman ? "sim" : "não"}
- Categoria: ${triage.category}
- Motivo: ${triage.reason}

REGRAS:
1. Escreva uma resposta curta, própria para WhatsApp.
2. Se houver base na memória, cite o tema de forma natural, sem parecer relatório.
3. Se a pergunta estiver fora do contexto político/institucional, responda com educação que este canal atende assuntos ligados ao mandato, campanha, agenda ou atuação pública. Não acione equipe humana.
4. Se a triagem indicar equipe humana, use esta resposta de encaminhamento como base: "${escalation}" e peça nome, cidade e telefone se faltar.
5. Se for convite, agenda, demanda local, reclamação de serviço público ou pedido de presença do candidato, encaminhe para a equipe mesmo sem memória suficiente.
6. Não use markdown.
7. Não diga que consultou banco vetorial, embeddings ou mecanismos internos.

Resposta final:`,
    });

    const { data: saved, error } = await db
      .from("whatsapp_messages")
      .insert({
        user_id: context.userId,
        channel_id: channel?.id ?? null,
        contact_name: data.contact_name || null,
        contact_phone: data.contact_phone || null,
        inbound_text: data.message,
        outbound_text: text,
        confidence_score: confidence,
        status: triage.needsHuman ? "needs_human" : "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

function formatMemoryContext(
  results: Array<{
    source_type: string | null;
    title: string | null;
    content: string | null;
    similarity?: number | null;
  }>,
) {
  return results
    .slice(0, 7)
    .map((item) => {
      const score =
        typeof item.similarity === "number"
          ? `relevância ${Math.round(item.similarity * 100)}%`
          : "";
      return `- ${item.title ?? "Memória"} ${score}: ${String(item.content ?? "").slice(0, 700)}`;
    })
    .join("\n");
}

function buildAgentInstructions(
  channel: Record<string, unknown> | null | undefined,
  profile: {
    profileName: string;
    role?: string | null;
    party?: string | null;
    tone?: string | null;
    bio?: string | null;
  },
) {
  const persona = String(channel?.agent_persona ?? "assessor");
  const style = String(channel?.response_style ?? "acolhedor");
  const depth = String(channel?.response_depth ?? "curta");
  const customInstructions = String(channel?.agent_instructions ?? "").trim();

  const personaInstruction =
    persona === "candidate"
      ? `Responder em primeira pessoa como ${profile.profileName}, sem prometer agenda ou decisões não confirmadas.`
      : persona === "office"
        ? `Responder como canal institucional do gabinete/equipe de ${profile.profileName}, usando "nossa equipe" quando adequado.`
        : `Responder como assessor de ${profile.profileName}, deixando claro que é uma orientação da equipe quando necessário.`;

  const styleInstruction =
    style === "combativo"
      ? "Tom firme e assertivo, sem ataques pessoais ou acusações sem fonte."
      : style === "tecnico"
        ? "Tom técnico, objetivo e baseado em dados."
        : style === "institucional"
          ? "Tom institucional, sóbrio e cordial."
          : "Tom acolhedor, humano, claro e próximo.";

  const depthInstruction =
    depth === "detalhada"
      ? "Resposta mais completa, com 2 a 4 pontos quando houver base suficiente."
      : depth === "media"
        ? "Resposta média, com contexto e no máximo 2 pontos principais."
        : "Resposta curta, direta e pronta para chat.";

  return [
    personaInstruction,
    styleInstruction,
    depthInstruction,
    profile.role ? `Cargo/foco cadastrado: ${profile.role}.` : null,
    profile.party ? `Partido cadastrado: ${profile.party}.` : null,
    profile.tone ? `Tom geral cadastrado no perfil: ${profile.tone}.` : null,
    profile.bio ? `Posicionamento do perfil: ${profile.bio}` : null,
    customInstructions ? `Instruções específicas do gabinete: ${customInstructions}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function creativityToTemperature(value: unknown) {
  if (value === "expressiva") return 0.55;
  if (value === "conservadora") return 0.05;
  return 0.25;
}

async function classifyLeadNeed({
  model,
  message,
  memoryContext,
  profileName,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  message: string;
  memoryContext: string;
  profileName: string;
}): Promise<LeadTriage> {
  try {
    const { text } = await generateText({
      model,
      system:
        "Classifique mensagens recebidas por um atendimento político. Responda somente JSON válido.",
      prompt: `CANDIDATO/PARLAMENTAR: ${profileName}
MENSAGEM: ${message}
HÁ MEMÓRIA RELEVANTE? ${memoryContext ? "sim" : "não"}

Decida se a equipe humana precisa receber este lead.
Marque needsHuman=true somente para: pedido de agenda, convite para evento/visita, demanda de cidade/bairro, reclamação de serviço público, denúncia, pedido de reunião, pedido de apoio institucional ou assunto político que exija retorno personalizado.
Marque needsHuman=false para: curiosidade fora do contexto político, pergunta geral sem relação com o candidato, spam, ofensa vazia ou pergunta que pode ser respondida com a memória.

Retorne exatamente:
{"needsHuman":boolean,"category":"political_question"|"agenda_request"|"service_request"|"local_demand"|"off_topic"|"abuse"|"unknown","reason":"frase curta"}`,
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("triage_json_missing");
    const parsed = JSON.parse(jsonMatch[0]) as Partial<LeadTriage>;
    return {
      needsHuman: Boolean(parsed.needsHuman),
      category: isTriageCategory(parsed.category) ? parsed.category : "unknown",
      reason: String(parsed.reason ?? "Triagem automática.").slice(0, 180),
    };
  } catch {
    const text = normalize(message);
    const needsHuman = [
      "agenda",
      "visita",
      "reuniao",
      "reunião",
      "cidade",
      "bairro",
      "evento",
      "denuncia",
      "denúncia",
      "preciso",
      "problema",
      "demanda",
      "convite",
    ].some((term) => text.includes(normalize(term)));
    return {
      needsHuman,
      category: needsHuman ? "local_demand" : "unknown",
      reason: needsHuman
        ? "Mensagem parece exigir retorno personalizado."
        : "Mensagem não exige acionamento humano imediato.",
    };
  }
}

function isTriageCategory(value: unknown): value is LeadTriage["category"] {
  return [
    "political_question",
    "agenda_request",
    "service_request",
    "local_demand",
    "off_topic",
    "abuse",
    "unknown",
  ].includes(String(value));
}

function scoreConfidence(results: Array<{ similarity?: number | null }>) {
  const best = results
    .map((item) => (typeof item.similarity === "number" ? item.similarity : 0.35))
    .sort((a, b) => b - a)[0];
  return Math.max(0, Math.min(100, Math.round((best ?? 0) * 100)));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
