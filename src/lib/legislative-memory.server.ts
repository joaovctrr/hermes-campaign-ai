import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, embedMany } from "ai";
import type { Database } from "@/integrations/supabase/types";
import { createGoogleAiProvider } from "./ai-gateway.server";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

export type LegislativeMemoryInput = {
  source_type: "manual" | "camara" | "document";
  title: string;
  content: string;
  action_id?: string | null;
  document_id?: string | null;
  metadata?: Record<string, unknown>;
};

export async function replaceLegislativeMemoryChunks(
  supabase: SupabaseClient<Database>,
  userId: string,
  deleteFilter: { action_id?: string; document_id?: string },
  inputs: LegislativeMemoryInput[],
) {
  let query = supabase.from("legislative_memory_chunks").delete().eq("user_id", userId);
  if (deleteFilter.action_id) query = query.eq("action_id", deleteFilter.action_id);
  if (deleteFilter.document_id) query = query.eq("document_id", deleteFilter.document_id);
  await query;

  return insertLegislativeMemoryChunks(supabase, userId, inputs);
}

export async function insertLegislativeMemoryChunks(
  supabase: SupabaseClient<Database>,
  userId: string,
  inputs: LegislativeMemoryInput[],
) {
  const rows = inputs
    .flatMap((input) =>
      chunkTextForMemory(input.content).map((content, index) => ({
        user_id: userId,
        source_type: input.source_type,
        title: input.title,
        content,
        action_id: input.action_id ?? null,
        document_id: input.document_id ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          chunk_index: index,
        },
      })),
    )
    .filter((row) => row.content.length >= 60);

  if (!rows.length) return { inserted: 0, embedded: 0 };

  const embeddings = await embedMemoryDocuments(rows.map((row) => `${row.title}\n${row.content}`));
  const payload = rows.map((row, index) => ({
    ...row,
    embedding: embeddings[index] ? vectorLiteral(embeddings[index]) : null,
  }));

  const { error } = await supabase.from("legislative_memory_chunks").insert(payload);
  if (error) throw new Error(error.message);

  return {
    inserted: payload.length,
    embedded: payload.filter((row) => row.embedding).length,
  };
}

export async function searchLegislativeMemoryChunks(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string,
  limit = 8,
) {
  const queryEmbedding = await embedMemoryQuery(query);

  if (queryEmbedding) {
    const { data, error } = await supabase.rpc("match_legislative_memory", {
      _user_id: userId,
      _query_embedding: vectorLiteral(queryEmbedding),
      _match_count: limit,
      _min_similarity: 0.28,
    });

    if (!error && data?.length) {
      return data;
    }
  }

  const terms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 8);

  if (!terms.length) return [];

  const { data, error } = await supabase
    .from("legislative_memory_chunks")
    .select("id, source_type, title, content, metadata")
    .eq("user_id", userId)
    .textSearch("content_search", terms.join(" "), {
      type: "plain",
      config: "portuguese",
    })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map((row) => ({ ...row, similarity: null }));
}

async function embedMemoryDocuments(values: string[]) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key || !values.length) return [];

  try {
    const google = createGoogleAiProvider(key);
    const { embeddings } = await embedMany({
      model: google.embedding(EMBEDDING_MODEL),
      values: values.map(limitEmbeddingText),
      providerOptions: {
        google: {
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      },
    });
    return embeddings;
  } catch {
    return [];
  }
}

async function embedMemoryQuery(value: string) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key || !value.trim()) return null;

  try {
    const google = createGoogleAiProvider(key);
    const { embedding } = await embed({
      model: google.embedding(EMBEDDING_MODEL),
      value: limitEmbeddingText(value),
      providerOptions: {
        google: {
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      },
    });
    return embedding;
  } catch {
    return null;
  }
}

function chunkTextForMemory(text: string) {
  const max = 1300;
  const overlap = 180;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + max, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function limitEmbeddingText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 6000);
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}
