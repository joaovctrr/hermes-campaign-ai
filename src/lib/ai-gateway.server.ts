import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function createGoogleAiProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}
