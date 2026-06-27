import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  replaceLegislativeMemoryChunks,
  searchLegislativeMemoryChunks,
} from "@/lib/legislative-memory.server";

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
  mode: z.enum(["theme", "author", "number"]).default("theme"),
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
    await syncCandidateActionMemory(context.supabase, context.userId, inserted);
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
    await syncCandidateActionMemory(context.supabase, context.userId, updated);
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
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    const candidateName = profile?.full_name ?? "";
    const propositions =
      data.mode === "number"
        ? await searchCamaraPropositionsByNumber(data.query, data.year, data.limit)
        : data.mode === "author"
          ? await searchCamaraPropositionsByAuthor(data.query, data.year, data.limit)
          : await searchCamaraPropositionsByTheme(data.query, data.year, data.limit);

    return Promise.all(
      propositions.map(async (item) => {
        const authors = await fetchCamaraAuthors(item.id);
        return {
          id: String(item.id),
          title: formatCamaraTitle(item),
          summary: item.ementa ?? "",
          source_url: camaraPortalUrl(item.id),
          api_url: item.uri ?? null,
          year: item.ano ?? null,
          type: item.siglaTipo ?? null,
          authors,
          relation: evaluateCandidateRelation(candidateName, item, authors),
        };
      }),
    );
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
    await syncCandidateActionMemory(context.supabase, context.userId, inserted, "camara");
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
    const parsed = await extractTextFromUpload(
      data.file_name,
      data.mime_type ?? "",
      data.content_base64,
    );
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

    await replaceLegislativeMemoryChunks(
      context.supabase,
      context.userId,
      { document_id: document.id },
      [
        {
          source_type: "document",
          title: data.file_name,
          content: parsed.text,
          document_id: document.id,
          metadata: {
            file_name: data.file_name,
            mime_type: data.mime_type,
            size_bytes: data.size_bytes,
          },
        },
      ],
    );

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

    const chunks = await searchLegislativeMemoryChunks(
      context.supabase,
      context.userId,
      data.query,
      data.limit,
    );

    return {
      actions: actions ?? [],
      chunks,
    };
  });

async function extractTextFromUpload(fileName: string, mimeType: string, contentBase64: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const binary = Buffer.from(contentBase64, "base64");

  if (
    ["txt", "md", "markdown", "csv", "json", "html", "htm"].includes(extension) ||
    mimeType.startsWith("text/")
  ) {
    return { text: normalizeExtractedText(binary.toString("utf8")) };
  }

  if (extension === "pdf" || mimeType === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(binary);
    return { text: normalizeExtractedText(result.text ?? "") };
  }

  if (["doc", "docx"].includes(extension)) {
    throw new Error(
      "DOC/DOCX ainda não é processado nesta versão. Exporte para TXT ou Markdown e envie novamente.",
    );
  }

  throw new Error("Formato não suportado. Envie PDF, TXT, Markdown, CSV, JSON ou HTML.");
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

type CamaraAuthor = {
  nome?: string;
  tipo?: string;
};

type CamaraDeputy = {
  id: number | string;
  nome?: string;
  siglaPartido?: string;
  siglaUf?: string;
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

async function searchCamaraPropositionsByTheme(query: string, year: string | null, limit: number) {
  const params = new URLSearchParams({
    keywords: query,
    ordem: "DESC",
    ordenarPor: "id",
    itens: String(limit),
  });
  if (year) params.set("ano", year);
  return fetchCamaraPropositionList(params);
}

async function searchCamaraPropositionsByAuthor(query: string, year: string | null, limit: number) {
  const seen = new Set<string>();
  const propositions: CamaraPropositionSummary[] = [];

  const addRows = (rows: CamaraPropositionSummary[]) => {
    for (const row of rows) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      propositions.push(row);
      if (propositions.length >= limit) return true;
    }
    return false;
  };

  const deputyParams = new URLSearchParams({
    nome: query,
    ordem: "ASC",
    ordenarPor: "nome",
    itens: "5",
  });

  const deputiesResponse = await fetch(
    `https://dadosabertos.camara.leg.br/api/v2/deputados?${deputyParams.toString()}`,
    { headers: { accept: "application/json" } },
  );

  if (!deputiesResponse.ok) {
    throw new Error("Não foi possível consultar deputados/autores na API da Câmara.");
  }

  const deputiesPayload = (await deputiesResponse.json()) as { dados?: CamaraDeputy[] };
  const deputies = deputiesPayload.dados ?? [];

  for (const deputy of deputies) {
    const params = new URLSearchParams({
      idDeputadoAutor: String(deputy.id),
      ordem: "DESC",
      ordenarPor: "id",
      itens: String(limit),
    });
    if (year) params.set("ano", year);

    const rows = await fetchCamaraPropositionList(params);
    if (addRows(rows)) return propositions;
  }

  for (const authorName of getAuthorSearchVariants(query)) {
    const params = new URLSearchParams({
      autor: authorName,
      ordem: "DESC",
      ordenarPor: "id",
      itens: String(limit),
    });
    if (year) params.set("ano", year);

    const rows = await fetchCamaraPropositionList(params);
    if (addRows(rows)) return propositions;
  }

  if (!propositions.length) {
    for (const keyword of getAuthorSearchVariants(query)) {
      const params = new URLSearchParams({
        keywords: keyword,
        ordem: "DESC",
        ordenarPor: "id",
        itens: String(limit),
      });
      if (year) params.set("ano", year);

      const rows = await fetchCamaraPropositionList(params);
      if (addRows(rows)) return propositions;
    }
  }

  return propositions;
}

async function searchCamaraPropositionsByNumber(query: string, year: string | null, limit: number) {
  const parsed = parsePropositionNumber(query, year);
  const params = new URLSearchParams({
    ordem: "DESC",
    ordenarPor: "id",
    itens: String(limit),
  });

  if (parsed.type) params.set("siglaTipo", parsed.type);
  if (parsed.number) params.set("numero", parsed.number);
  if (parsed.year) params.set("ano", parsed.year);

  return fetchCamaraPropositionList(params);
}

async function fetchCamaraPropositionList(params: URLSearchParams) {
  const response = await fetch(
    `https://dadosabertos.camara.leg.br/api/v2/proposicoes?${params.toString()}`,
    { headers: { accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error("Não foi possível consultar proposições na API da Câmara dos Deputados.");
  }

  const payload = (await response.json()) as { dados?: CamaraPropositionSummary[] };
  return payload.dados ?? [];
}

async function fetchCamaraAuthors(propositionId: number | string) {
  try {
    const response = await fetch(
      `https://dadosabertos.camara.leg.br/api/v2/proposicoes/${propositionId}/autores`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as { dados?: CamaraAuthor[] };
    return (payload.dados ?? [])
      .map((author) => ({
        name: author.nome ?? "",
        type: author.tipo ?? null,
      }))
      .filter((author) => author.name);
  } catch {
    return [];
  }
}

function evaluateCandidateRelation(
  candidateName: string,
  item: CamaraPropositionSummary,
  authors: Array<{ name: string; type: string | null }>,
) {
  const candidate = normalizeComparable(candidateName);
  if (!candidate) {
    return {
      level: "unknown" as const,
      label: "Nome do perfil não informado",
      detail: "Cadastre o nome do candidato nas configurações para comparar com os autores.",
    };
  }

  const matchedAuthor = authors.find((author) =>
    namesLookRelated(candidate, normalizeComparable(author.name)),
  );

  if (matchedAuthor) {
    return {
      level: "direct" as const,
      label: "Relação direta encontrada",
      detail: `O nome cadastrado aparece entre os autores: ${matchedAuthor.name}.`,
    };
  }

  const text = normalizeComparable(
    [formatCamaraTitle(item), item.ementa].filter(Boolean).join(" "),
  );
  if (namesLookRelated(candidate, text)) {
    return {
      level: "possible" as const,
      label: "Possível relação no texto",
      detail: "O nome cadastrado aparece no título ou na ementa, mas não entre os autores.",
    };
  }

  return {
    level: "none" as const,
    label: "Nome não encontrado",
    detail: "O nome cadastrado não apareceu entre os autores nem no texto da proposição.",
  };
}

function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAuthorSearchVariants(query: string) {
  const trimmed = query.trim();
  const normalized = normalizeComparable(trimmed);
  const variants = new Set<string>([trimmed]);

  if (
    normalized.includes("subtenente gonzaga") ||
    (normalized.includes("luiz") &&
      normalized.includes("gonzaga") &&
      normalized.includes("ribeiro"))
  ) {
    variants.add("Subtenente Gonzaga");
    variants.add("Luiz Gonzaga Ribeiro");
    variants.add("Luiz Gonzaga");
    variants.add("Gonzaga");
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length >= 3);
  if (tokens.length >= 2) variants.add(`${tokens[0]} ${tokens.at(-1)}`);
  if (tokens.length >= 1) variants.add(tokens.at(-1) ?? trimmed);

  return [...variants].filter(Boolean).slice(0, 6);
}

function parsePropositionNumber(query: string, fallbackYear: string | null) {
  const normalized = query.trim().toUpperCase();
  const type = normalized.match(/\b(PLP|PL|PEC|PDL|REQ|PRC|MSC|MPV|INC|RIC)\b/)?.[1] ?? null;
  const number = normalized.match(/\b(\d{1,6})\b/)?.[1] ?? "";
  const year = normalized.match(/\b(19|20)\d{2}\b/)?.[0] ?? fallbackYear ?? null;

  return { type, number, year };
}

function namesLookRelated(candidate: string, target: string) {
  if (!candidate || !target) return false;
  if (target.includes(candidate) || candidate.includes(target)) return true;

  const candidateTokens = expandComparableName(candidate);
  const targetTokens = new Set(target.split(" ").filter((token) => token.length >= 3));
  const shared = candidateTokens.filter((token) => targetTokens.has(token));
  const lastName = candidateTokens.at(-1);

  return shared.length >= 2 && Boolean(lastName && targetTokens.has(lastName));
}

function expandComparableName(name: string) {
  const tokens = name.split(" ").filter((token) => token.length >= 3);

  if (tokens.includes("subtenente") && tokens.includes("gonzaga")) {
    return [...new Set([...tokens, "luiz", "ribeiro"])];
  }

  if (tokens.includes("luiz") && tokens.includes("gonzaga") && tokens.includes("ribeiro")) {
    return [...new Set([...tokens, "subtenente"])];
  }

  return tokens;
}

async function syncCandidateActionMemory(
  supabase: Parameters<typeof replaceLegislativeMemoryChunks>[0],
  userId: string,
  action: {
    id: string;
    action_type: string | null;
    title: string;
    description: string | null;
    theme: string | null;
    source: string | null;
    source_url: string | null;
    action_date: string | null;
    legislature: string | null;
    keywords: string[] | null;
  },
  forcedSourceType?: "manual" | "camara",
) {
  const sourceType =
    forcedSourceType ??
    (action.source?.toLowerCase().includes("câmara") ||
    action.source?.toLowerCase().includes("camara")
      ? "camara"
      : "manual");

  const content = [
    `Tipo: ${action.action_type ?? "Registro"}`,
    `Título: ${action.title}`,
    action.theme ? `Tema: ${action.theme}` : null,
    action.description ? `Descrição: ${action.description}` : null,
    action.action_date ? `Data: ${action.action_date}` : null,
    action.legislature ? `Legislatura/ano: ${action.legislature}` : null,
    action.source ? `Fonte: ${action.source}` : null,
    action.source_url ? `URL: ${action.source_url}` : null,
    action.keywords?.length ? `Palavras-chave: ${action.keywords.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await replaceLegislativeMemoryChunks(supabase, userId, { action_id: action.id }, [
    {
      source_type: sourceType,
      title: action.title,
      content,
      action_id: action.id,
      metadata: {
        action_type: action.action_type,
        theme: action.theme,
        source: action.source,
        source_url: action.source_url,
        action_date: action.action_date,
        legislature: action.legislature,
        keywords: action.keywords ?? [],
      },
    },
  ]);
}
