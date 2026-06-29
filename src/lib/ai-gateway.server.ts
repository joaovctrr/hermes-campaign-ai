import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export function createGoogleAiProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}

export function createOpenAiProvider(apiKey: string) {
  const normalizedKey = apiKey.trim();
  if (normalizedKey.startsWith("ysk-")) {
    throw new Error(
      "OPENAI_API_KEY inválida: a chave parece começar com 'ysk-'. Verifique se não foi colado um caractere antes de 'sk-'.",
    );
  }
  if (!normalizedKey.startsWith("sk-")) {
    throw new Error("OPENAI_API_KEY inválida: use uma chave da OpenAI começando com 'sk-'.");
  }

  return createOpenAI({ apiKey: normalizedKey });
}
