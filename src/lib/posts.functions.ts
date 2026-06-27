import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const FormatSchema = z.enum(["instagram", "tiktok", "twitter"]);

const FORMAT_INSTRUCTIONS: Record<z.infer<typeof FormatSchema>, string> = {
  instagram:
    "Roteiro de carrossel para Instagram com 5 lâminas. Estrutura: [Lâmina 1 — Capa/Gancho]\\n...\\n[Lâmina 5 — CTA]. Cada lâmina com 1-2 frases de impacto. Tom alinhado ao perfil. Inclua sugestão de legenda curta no fim, separada por '---' e prefixada com 'LEGENDA:'.",
  tiktok:
    "Roteiro de vídeo curto (até 60s) para TikTok/Reels. Estrutura: [HOOK 3s] - frase de retenção, [DESENVOLVIMENTO] - 2-3 falas conectadas, [CTA] - chamada clara. Indique entre parênteses o tom de voz e B-roll sugerido em cada bloco.",
  twitter:
    "Thread no X (Twitter) com 4 a 6 posts numerados (1/n). Cada post até 270 caracteres. Primeiro post precisa ser um gancho forte; último post precisa ter um CTA ou pergunta de engajamento.",
};

const GenerateInput = z.object({
  news_item_id: z.string().uuid(),
  format: FormatSchema,
});

export const generatePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente");

    const [{ data: profile }, { data: news }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("news_items")
        .select("*")
        .eq("id", data.news_item_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (!news) throw new Error("Notícia não encontrada.");

    const memoryContext = await getLegislativeMemoryContext(
      context.supabase,
      context.userId,
      [news.title, news.theme, news.summary].filter(Boolean).join(" "),
    );

    const { createGoogleAiProvider } = await import("./ai-gateway.server");
    const google = createGoogleAiProvider(key);
    const model = google("gemini-3-flash-preview");

    const system = `Você é Informa Ágora, estrategista de comunicação política de elite. Escreve em PT-BR brasileiro, com clareza institucional e impacto. NUNCA inventa fatos: trabalha apenas com a notícia e com a memória legislativa fornecida. Adapta o tom à persona do candidato. SEMPRE inclui a frase "Conteúdo produzido com auxílio de IA." ao final, em linha separada.`;

    const userPrompt = `PERSONA DO CANDIDATO:
- Nome: ${profile?.full_name ?? "—"}
- Cargo: ${profile?.political_role ?? "—"}
- Região de atuação: ${profile?.region ?? "—"}
- Tom de voz: ${profile?.tone ?? "institucional e firme"}
- Posicionamento: ${profile?.bio ?? "—"}

NOTÍCIA-BASE (use como gancho, não copie):
- Título: ${news.title}
- Fonte: ${news.source ?? "—"}
- Tema: ${news.theme ?? "—"}
- Urgência: ${news.urgency}
- Resumo: ${news.summary ?? "—"}

MEMÓRIA LEGISLATIVA DOCUMENTADA:
${memoryContext || "Nenhum trecho relevante encontrado na memória legislativa."}

FORMATO:
${FORMAT_INSTRUCTIONS[data.format]}

Use a memória legislativa apenas quando houver conexão real com a notícia. Não diga que o candidato fez algo se isso não estiver documentado acima.

Produza o conteúdo final pronto para a equipe revisar e publicar.`;

    const { text } = await generateText({
      model,
      system,
      prompt: userPrompt,
    });

    const { data: inserted, error: insErr } = await context.supabase
      .from("generated_posts")
      .insert({
        user_id: context.userId,
        news_item_id: news.id,
        format: data.format,
        content: text,
      })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);
    return inserted;
  });

async function getLegislativeMemoryContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string,
) {
  const terms = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\W+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4)
    .slice(0, 8);

  if (!terms.length) return "";

  const actionQuery = terms.join(" ");
  const safeIlike = actionQuery.replace(/[,%]/g, " ");
  const lines: string[] = [];

  try {
    const { data: actions } = await supabase
      .from("candidate_actions")
      .select("action_type, title, description, theme, source, action_date")
      .eq("user_id", userId)
      .or(`title.ilike.%${safeIlike}%,description.ilike.%${safeIlike}%,theme.ilike.%${safeIlike}%`)
      .limit(4);

    for (const action of actions ?? []) {
      lines.push(
        `- ${action.title} (${action.action_type}${action.action_date ? `, ${action.action_date}` : ""}${action.source ? `, fonte: ${action.source}` : ""}): ${action.description ?? action.theme ?? "registro documentado"}`,
      );
    }
  } catch {
    // The memory tables may not exist yet in projects that have not applied the migration.
  }

  try {
    const { data: chunks } = await supabase
      .from("legislative_document_chunks")
      .select("content, legislative_documents(file_name)")
      .eq("user_id", userId)
      .textSearch("content_search", actionQuery, {
        type: "plain",
        config: "portuguese",
      })
      .limit(4);

    for (const chunk of chunks ?? []) {
      const fileName = Array.isArray(chunk.legislative_documents)
        ? chunk.legislative_documents[0]?.file_name
        : chunk.legislative_documents?.file_name;
      lines.push(
        `- Trecho de ${fileName ?? "documento enviado"}: ${String(chunk.content).slice(0, 700)}`,
      );
    }
  } catch {
    // Keep post generation available even before the document RAG migration is applied.
  }

  return lines.slice(0, 8).join("\n");
}

export const listPostsForNews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ news_item_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("generated_posts")
      .select("*")
      .eq("user_id", context.userId)
      .eq("news_item_id", data.news_item_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("generated_posts")
      .select("id, content, format, news_item_id, created_at, news_items(title, theme, urgency)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("generated_posts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
