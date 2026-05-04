import OpenAI from "openai";
import { config } from "./config.js";

export function createOpenAiClient() {
  if (!config.openAiApiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: config.openAiApiKey
  });
}

