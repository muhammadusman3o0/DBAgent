/**
 * Unified LLM Client
 *
 * Provides a single interface to interact with multiple LLM providers:
 * - OpenAI (standard API)
 * - Azure OpenAI
 * - Grok (xAI)
 * - Gemini (Google)
 * - Ollama (local/self-hosted)
 */

import OpenAI from "openai";

// ==================== Types ====================

export type LLMProvider = "openai" | "azure" | "grok" | "gemini" | "ollama";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  // Azure-specific
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  success: boolean;
  content: string;
  error?: string;
}

export interface LLMRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

// ==================== Configuration Parser ====================

export function parseLLMConfig(): LLMConfig | null {
  const provider = (
    process.env.LLM_PROVIDER || "openai"
  ).toLowerCase() as LLMProvider;

  switch (provider) {
    case "openai":
      if (!process.env.OPENAI_API_KEY) {
        console.warn("OpenAI selected but OPENAI_API_KEY is not set");
        return null;
      }
      return {
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4",
        baseUrl: process.env.OPENAI_BASE_URL,
      };

    case "azure":
      if (
        !process.env.AZURE_OPENAI_API_KEY ||
        !process.env.AZURE_OPENAI_ENDPOINT
      ) {
        console.warn("Azure OpenAI selected but required env vars are not set");
        return null;
      }
      return {
        provider: "azure",
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4",
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        azureApiVersion:
          process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview",
      };

    case "grok":
      if (!process.env.GROK_API_KEY) {
        console.warn("Grok selected but GROK_API_KEY is not set");
        return null;
      }
      return {
        provider: "grok",
        apiKey: process.env.GROK_API_KEY,
        model: process.env.GROK_MODEL || "grok-beta",
        baseUrl: process.env.GROK_BASE_URL || "https://api.x.ai/v1",
      };

    case "gemini":
      if (!process.env.GEMINI_API_KEY) {
        console.warn("Gemini selected but GEMINI_API_KEY is not set");
        return null;
      }
      return {
        provider: "gemini",
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-pro",
        baseUrl:
          process.env.GEMINI_BASE_URL ||
          "https://generativelanguage.googleapis.com/v1beta",
      };

    case "ollama":
      return {
        provider: "ollama",
        model: process.env.OLLAMA_MODEL || "llama2",
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      };

    default:
      console.warn(`Unknown LLM provider: ${provider}, falling back to OpenAI`);
      if (!process.env.OPENAI_API_KEY) {
        return null;
      }
      return {
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-4",
      };
  }
}

// ==================== Unified LLM Client ====================

export class UnifiedLLMClient {
  private config: LLMConfig;
  private client: OpenAI | null = null;

  constructor(config: LLMConfig) {
    this.config = config;
    this.initializeClient();
  }

  private initializeClient(): void {
    const {
      provider,
      apiKey,
      baseUrl,
      azureEndpoint,
      azureApiVersion,
      azureDeployment,
    } = this.config;

    switch (provider) {
      case "openai":
        this.client = new OpenAI({
          apiKey: apiKey!,
          baseURL: baseUrl,
        });
        break;

      case "azure":
        // Azure OpenAI uses a different constructor pattern
        this.client = new OpenAI({
          apiKey: apiKey!,
          baseURL: `${azureEndpoint}/openai/deployments/${azureDeployment}`,
          defaultQuery: { "api-version": azureApiVersion },
          defaultHeaders: { "api-key": apiKey! },
        });
        break;

      case "grok":
        // Grok uses OpenAI-compatible API
        this.client = new OpenAI({
          apiKey: apiKey!,
          baseURL: baseUrl,
        });
        break;

      case "gemini":
        // Gemini can use OpenAI-compatible wrapper or native SDK
        // For now, we'll use a custom implementation
        this.client = null; // Will handle separately
        break;

      case "ollama":
        // Ollama uses OpenAI-compatible API
        this.client = new OpenAI({
          apiKey: "ollama", // Ollama doesn't require real API key
          baseURL: `${baseUrl}/v1`,
        });
        break;
    }
  }

  async chat(
    messages: LLMMessage[],
    options: LLMRequestOptions = {}
  ): Promise<LLMResponse> {
    const temperature =
      options.temperature ?? parseFloat(process.env.LLM_TEMPERATURE || "0.1");
    const maxTokens =
      options.maxTokens ?? parseInt(process.env.LLM_MAX_TOKENS || "2000");
    const topP = options.topP ?? parseFloat(process.env.LLM_TOP_P || "0.95");

    try {
      // Handle Gemini separately (uses different API structure)
      if (this.config.provider === "gemini") {
        return await this.chatGemini(messages, {
          temperature,
          maxTokens,
          topP,
        });
      }

      // All other providers use OpenAI-compatible API
      if (!this.client) {
        return {
          success: false,
          content: "",
          error: "LLM client not initialized",
        };
      }

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: messages as any,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return {
          success: false,
          content: "",
          error: "LLM returned empty response",
        };
      }

      return {
        success: true,
        content: content.trim(),
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async chatGemini(
    messages: LLMMessage[],
    options: { temperature: number; maxTokens: number; topP: number }
  ): Promise<LLMResponse> {
    try {
      // Convert messages to Gemini format
      const systemMessage =
        messages.find((m) => m.role === "system")?.content || "";
      const userMessages = messages.filter((m) => m.role !== "system");

      // Combine system message with first user message if present
      const prompt = systemMessage
        ? `${systemMessage}\n\n${userMessages.map((m) => m.content).join("\n")}`
        : userMessages.map((m) => m.content).join("\n");

      const url = `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens,
            topP: options.topP,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          content: "",
          error: `Gemini API error: ${response.status} - ${errorText}`,
        };
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        return {
          success: false,
          content: "",
          error: "Gemini returned empty response",
        };
      }

      return {
        success: true,
        content: content.trim(),
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  getProviderInfo(): string {
    return `${this.config.provider} (${this.config.model})`;
  }
}

// ==================== Helper Functions ====================

export function createLLMClient(): UnifiedLLMClient | null {
  const config = parseLLMConfig();
  if (!config) {
    console.error(
      "Failed to parse LLM configuration. Please check your environment variables."
    );
    return null;
  }

  console.log(
    `Initializing LLM client: ${config.provider} with model ${config.model}`
  );
  return new UnifiedLLMClient(config);
}

