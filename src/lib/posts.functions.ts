import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth.server";

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
  .middleware([requireAuth])
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY ausente");

<<<<<<< Updated upstream
    const [{ data: profile }, { data: news }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("news_items")
        .select("*")
        .eq("id", data.news_item_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
=======
    const [[profile], [news]] = await Promise.all([
      context.sql`SELECT * FROM app.profiles WHERE id = ${context.userId}`,
      context.sql`SELECT * FROM app.news_items WHERE id = ${data.news_item_id} AND user_id = ${context.userId}`,
>>>>>>> Stashed changes
    ]);
    if (!news) throw new Error("Notícia não encontrada.");

    const { createGoogleAiProvider } = await import("./ai-gateway.server");
    const google = createGoogleAiProvider(key);
    const model = google("gemini-3-flash-preview");

    const system = `Você é Informa Ágora, estrategista de comunicação política de elite. Escreve em PT-BR brasileiro, com clareza institucional e impacto. NUNCA inventa fatos: trabalha apenas com o que está na notícia. Adapta o tom à persona do candidato. SEMPRE inclui a frase "Conteúdo produzido com auxílio de IA." ao final, em linha separada.`;

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

FORMATO:
${FORMAT_INSTRUCTIONS[data.format]}

Produza o conteúdo final pronto para a equipe revisar e publicar.`;

    const { text } = await generateText({
      model,
      system,
      prompt: userPrompt,
    });

    const [inserted] = await context.sql`
      INSERT INTO app.generated_posts (user_id, news_item_id, format, content)
      VALUES (${context.userId}, ${news.id}, ${data.format}, ${text})
      RETURNING *
    `;
    return inserted;
  });

export const listPostsForNews = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ news_item_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const rows = await context.sql`
      SELECT * FROM app.generated_posts
      WHERE user_id = ${context.userId} AND news_item_id = ${data.news_item_id}
      ORDER BY created_at DESC
    `;
    return rows ?? [];
  });

export const listMyPosts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    // Mantém o shape aninhado `news_items` que a UI consome (antes vinha do PostgREST).
    const rows = await context.sql`
      SELECT
        p.id, p.content, p.format, p.news_item_id, p.created_at,
        CASE WHEN n.id IS NULL THEN NULL
             ELSE json_build_object('title', n.title, 'theme', n.theme, 'urgency', n.urgency)
        END AS news_items
      FROM app.generated_posts p
      LEFT JOIN app.news_items n ON n.id = p.news_item_id
      WHERE p.user_id = ${context.userId}
      ORDER BY p.created_at DESC
      LIMIT 200
    `;
    return rows ?? [];
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.sql`
      DELETE FROM app.generated_posts
      WHERE id = ${data.id} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });
