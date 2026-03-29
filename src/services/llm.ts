export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export interface ChatModel {
  complete(
    messages: ChatMessage[],
    options?: ChatCompletionOptions,
  ): Promise<string>;
}
