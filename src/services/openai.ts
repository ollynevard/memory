import { fetchWithRetry } from "./http";
import type { ChatModel, Embedder } from "./llm";

export function createOpenAIEmbedder(apiKey: string): Embedder {
  return {
    async embed(text: string): Promise<number[]> {
      const response = await fetchWithRetry(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI embedding failed (${response.status})`);
      }

      const result = (await response.json()) as {
        data: [{ embedding: number[] }];
      };
      return result.data[0].embedding;
    },
  };
}

export function createOpenAIChatModel(apiKey: string): ChatModel {
  return {
    async complete(messages, options = {}): Promise<string> {
      const {
        model = "gpt-4o-mini",
        temperature = 0,
        jsonMode = false,
      } = options;

      const response = await fetchWithRetry(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            ...(jsonMode && { response_format: { type: "json_object" } }),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`OpenAI chat completion failed (${response.status})`);
      }

      const result = (await response.json()) as {
        choices: [{ message: { content: string } }];
      };

      return result.choices[0].message.content;
    },
  };
}
