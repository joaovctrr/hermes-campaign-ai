import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchLegislativeMemoryChunks } from "@/lib/legislative-memory.server";

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

    const memoryResults = await searchLegislativeMemoryChunks(
      context.supabase,
      context.userId,
      [news.title, news.theme, news.summary].filter(Boolean).join(" "),
      8,
    );
    const memoryContext = formatMemoryContext(memoryResults);

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

function formatMemoryContext(
  results: Array<{
    source_type: string | null;
    title: string | null;
    content: string | null;
    similarity?: number | null;
  }>,
) {
  return results
    .slice(0, 8)
    .map((item) => {
      const source =
        item.source_type === "camara"
          ? "Câmara"
          : item.source_type === "document"
            ? "Documento"
            : "Registro";
      const score =
        typeof item.similarity === "number"
          ? `, relevância ${Math.round(item.similarity * 100)}%`
          : "";
      return `- [${source}${score}] ${item.title ?? "Memória"}: ${String(item.content ?? "").slice(0, 850)}`;
    })
    .join("\n");
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
