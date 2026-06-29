import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export function createGoogleAiProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}

export function createOpenAiProvider(apiKey: string) {
  return createOpenAI({ apiKey });
}
