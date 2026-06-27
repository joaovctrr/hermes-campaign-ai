import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OptionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const CandidateActionSchema = z.object({
  action_type: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(240),
  description: OptionalText,
  theme: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  source: z
    .string()
    .trim()
    .max(160)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  source_url: z
    .string()
    .trim()
    .url("Informe uma URL válida")
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((v) => (v ? v : null)),
  action_date: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((v) => (v ? v : null)),
  legislature: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

const DocumentUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(240),
  mime_type: z.string().trim().max(120).optional().nullable(),
  size_bytes: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
  content_base64: z.string().min(1),
});

const CamaraSearchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  year: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  limit: z.number().int().min(1).max(20).default(10),
});

const CamaraImportSchema = z.object({
  proposition_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  theme: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const listMyCandidateActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("candidate_actions")
      .select("*")
      .eq("user_id", context.userId)
      .order("action_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCandidateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CandidateActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .from("candidate_actions")
      .insert({
        ...data,
        user_id: context.userId,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });

export const updateCandidateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
      })
      .merge(CandidateActionSchema)
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...values } = data;
    const { data: updated, error } = await context.supabase
      .from("candidate_actions")
      .update(values)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return updated;
  });

export const deleteCandidateAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("candidate_actions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchCamaraPropositions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CamaraSearchSchema.parse(d))
  .handler(async ({ data }) => {
    const params = new URLSearchParams({
      keywords: data.query,
      ordem: "DESC",
      ordenarPor: "id",
      itens: String(data.limit),
    });
    if (data.year) params.set("ano", data.year);

    const response = await fetch(
      `https://dadosabertos.camara.leg.br/api/v2/proposicoes?${params.toString()}`,
      { headers: { accept: "application/json" } },
    );

    if (!response.ok) {
      throw new Error("Não foi possível consultar a API da Câmara dos Deputados.");
    }

    const payload = (await response.json()) as { dados?: CamaraPropositionSummary[] };
    return (payload.dados ?? []).map((item) => ({
      id: String(item.id),
      title: formatCamaraTitle(item),
      summary: item.ementa ?? "",
      source_url: camaraPortalUrl(item.id),
      api_url: item.uri ?? null,
      year: item.ano ?? null,
      type: item.siglaTipo ?? null,
    }));
  });

export const importCamaraProposition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CamaraImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const response = await fetch(
      `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${data.proposition_id}`,
      { headers: { accept: "application/json" } },
    );

    if (!response.ok) {
      throw new Error("Não foi possível carregar esta proposição na API da Câmara.");
    }

    const payload = (await response.json()) as { dados?: CamaraPropositionDetail };
    const proposition = payload.dados;
    if (!proposition?.id) throw new Error("Proposição não encontrada na Câmara.");

    const title = formatCamaraTitle(proposition);
    const status = proposition.statusProposicao;
    const description = [
      proposition.ementa,
      proposition.ementaDetalhada,
      status?.descricaoSituacao ? `Situação: ${status.descricaoSituacao}` : null,
      status?.despacho ? `Último despacho: ${status.despacho}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: inserted, error } = await context.supabase
      .from("candidate_actions")
      .insert({
        user_id: context.userId,
        action_type: camaraActionType(proposition.siglaTipo),
        title,
        description: description || null,
        theme: data.theme,
        source: "Câmara dos Deputados - Dados Abertos",
        source_url: camaraPortalUrl(proposition.id),
        action_date: proposition.dataApresentacao?.slice(0, 10) ?? null,
        legislature: proposition.ano ? String(proposition.ano) : null,
        keywords: [proposition.siglaTipo, "Câmara dos Deputados", status?.descricaoSituacao].filter(
          Boolean,
        ),
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });

export const listMyLegislativeDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("legislative_documents")
      .select("id, file_name, mime_type, size_bytes, status, chunk_count, error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const uploadLegislativeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DocumentUploadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const parsed = extractTextFromUpload(data.file_name, data.mime_type ?? "", data.content_base64);
    const chunks = chunkText(parsed.text);

    if (!chunks.length) {
      throw new Error("Não foi possível extrair texto útil deste arquivo.");
    }

    const { data: document, error: docError } = await context.supabase
      .from("legislative_documents")
      .insert({
        user_id: context.userId,
        file_name: data.file_name,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        extracted_text: parsed.text,
        status: "processed",
        chunk_count: chunks.length,
      })
      .select("id, file_name, mime_type, size_bytes, status, chunk_count, error, created_at")
      .single();

    if (docError) throw new Error(docError.message);

    const rows = chunks.map((content, index) => ({
      user_id: context.userId,
      document_id: document.id,
      chunk_index: index,
      content,
    }));

    const { error: chunkError } = await context.supabase
      .from("legislative_document_chunks")
      .insert(rows);
    if (chunkError) throw new Error(chunkError.message);

    return document;
  });

export const deleteLegislativeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("legislative_documents")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchLegislativeMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().trim().min(1).max(240),
        limit: z.number().int().min(1).max(12).default(6),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const terms = data.query
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3)
      .slice(0, 8);

    if (!terms.length) return { actions: [], chunks: [] };

    const actionQuery = terms.join(" ");

    const { data: actions, error: actionError } = await context.supabase
      .from("candidate_actions")
      .select(
        "id, action_type, title, description, theme, source, source_url, action_date, keywords",
      )
      .eq("user_id", context.userId)
      .or(
        `title.ilike.%${actionQuery}%,description.ilike.%${actionQuery}%,theme.ilike.%${actionQuery}%`,
      )
      .limit(data.limit);

    if (actionError) throw new Error(actionError.message);

    const { data: chunks, error: chunkError } = await context.supabase
      .from("legislative_document_chunks")
      .select("id, document_id, chunk_index, content, legislative_documents(file_name)")
      .eq("user_id", context.userId)
      .textSearch("content_search", actionQuery, {
        type: "plain",
        config: "portuguese",
      })
      .limit(data.limit);

    if (chunkError) throw new Error(chunkError.message);

    return {
      actions: actions ?? [],
      chunks: chunks ?? [],
    };
  });

function extractTextFromUpload(fileName: string, mimeType: string, contentBase64: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const binary = Buffer.from(contentBase64, "base64");

  if (
    ["txt", "md", "markdown", "csv", "json", "html", "htm"].includes(extension) ||
    mimeType.startsWith("text/")
  ) {
    return { text: normalizeExtractedText(binary.toString("utf8")) };
  }

  if (extension === "pdf") {
    throw new Error(
      "PDF ainda não é processado nesta versão. Envie TXT, Markdown, CSV, JSON ou HTML.",
    );
  }

  if (["doc", "docx"].includes(extension)) {
    throw new Error(
      "DOC/DOCX ainda não é processado nesta versão. Exporte para TXT ou Markdown e envie novamente.",
    );
  }

  throw new Error("Formato não suportado. Envie TXT, Markdown, CSV, JSON ou HTML.");
}

function normalizeExtractedText(text: string) {
  return text
    .split("\u0000")
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkText(text: string) {
  const max = 1400;
  const overlap = 180;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + max, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length >= 80) chunks.push(chunk);
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

type CamaraPropositionSummary = {
  id: number | string;
  uri?: string;
  siglaTipo?: string;
  numero?: number | string;
  ano?: number | string;
  ementa?: string;
};

type CamaraPropositionDetail = CamaraPropositionSummary & {
  dataApresentacao?: string;
  ementaDetalhada?: string;
  statusProposicao?: {
    descricaoSituacao?: string;
    despacho?: string;
  };
};

function formatCamaraTitle(item: CamaraPropositionSummary) {
  const type = item.siglaTipo ?? "Proposição";
  const number = item.numero ? ` ${item.numero}` : "";
  const year = item.ano ? `/${item.ano}` : "";
  return `${type}${number}${year}`.trim();
}

function camaraPortalUrl(id: number | string) {
  return `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${id}`;
}

function camaraActionType(type?: string) {
  const normalized = type?.toUpperCase() ?? "";
  if (normalized.includes("PL")) return "Projeto de Lei";
  if (normalized.includes("PEC")) return "Emenda";
  if (normalized.includes("REQ")) return "Requerimento";
  return "Proposição";
}
