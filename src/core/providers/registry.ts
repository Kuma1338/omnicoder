/**
 * Provider Registry
 * Central registry for all AI provider instances
 */

import type { IProvider, ProviderConfig, ProviderPreset, ProviderType } from './types';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';

// Provider factory map
type ProviderFactory = (config: ProviderConfig) => IProvider;

const PROVIDER_FACTORIES: Record<ProviderType, ProviderFactory> = {
  anthropic: (config) => new AnthropicProvider(config),
  openai: (config) => new OpenAIProvider(config),
  gemini: (config) => new OpenAIProvider({ ...config, type: 'openai' }), // Gemini supports OpenAI-compatible API
  ollama: (config) => new OpenAIProvider({ ...config, type: 'openai' }), // Ollama is OpenAI-compatible
  custom: (config) => new OpenAIProvider({ ...config, type: 'openai' }), // Default to OpenAI-compatible
};

export class ProviderRegistry {
  private providers = new Map<string, IProvider>();
  private configs = new Map<string, ProviderConfig>();

  /** Register a provider from config */
  register(config: ProviderConfig): IProvider {
    const factory = PROVIDER_FACTORIES[config.type];
    if (!factory) {
      throw new Error(`Unknown provider type: ${config.type}`);
    }

    const provider = factory(config);
    this.providers.set(config.id, provider);
    this.configs.set(config.id, config);
    return provider;
  }

  /** Get a registered provider by ID */
  get(id: string): IProvider | undefined {
    return this.providers.get(id);
  }

  /** Get all registered providers */
  getAll(): IProvider[] {
    return Array.from(this.providers.values());
  }

  /** Remove a provider */
  remove(id: string): boolean {
    this.configs.delete(id);
    return this.providers.delete(id);
  }

  /** Get provider config by ID */
  getConfig(id: string): ProviderConfig | undefined {
    return this.configs.get(id);
  }

  /** Update provider config and re-create instance */
  update(config: ProviderConfig): IProvider {
    this.remove(config.id);
    return this.register(config);
  }

  /** Get all configs for persistence */
  getAllConfigs(): ProviderConfig[] {
    return Array.from(this.configs.values());
  }
}

// --- Built-in Presets ---

export const BUILT_IN_PRESETS: ProviderPreset[] = [
  // Official providers
  {
    id: 'anthropic-official',
    name: 'Anthropic (Official)',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    description: 'Anthropic official API',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    category: 'official',
  },
  {
    id: 'openai-official',
    name: 'OpenAI (Official)',
    type: 'openai',
    baseUrl: 'https://api.openai.com',
    defaultModel: 'codex-mini-latest',
    description: 'OpenAI official API (Codex, GPT-4o, o3)',
    models: ['codex-mini-latest', 'gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o3', 'gpt-4-turbo'],
    category: 'official',
  },
  {
    id: 'gemini-official',
    name: 'Google Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-pro',
    description: 'Google AI Studio (OpenAI-compatible endpoint)',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    category: 'official',
  },

  // Local
  {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'qwen2.5-coder:32b',
    description: 'Local models via Ollama',
    category: 'local',
  },

  // Relay / Third-party
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'custom',
    baseUrl: 'https://openrouter.ai/api',
    defaultModel: 'anthropic/claude-sonnet-4',
    description: 'Multi-model relay with cost optimization',
    category: 'relay',
  },
  {
    id: 'together-ai',
    name: 'Together AI',
    type: 'custom',
    baseUrl: 'https://api.together.xyz',
    defaultModel: 'meta-llama/Llama-3-70b-chat-hf',
    description: 'Open-source model hosting',
    category: 'relay',
  },
  {
    id: 'deepseek-official',
    name: 'DeepSeek',
    type: 'custom',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-coder',
    description: 'DeepSeek AI API (OpenAI-compatible)',
    category: 'official',
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'custom',
    baseUrl: 'https://api.groq.com/openai',
    defaultModel: 'llama-3.1-70b-versatile',
    description: 'Ultra-fast inference',
    category: 'relay',
  },
  {
    id: 'mistral-official',
    name: 'Mistral AI',
    type: 'custom',
    baseUrl: 'https://api.mistral.ai',
    defaultModel: 'mistral-large-latest',
    description: 'Mistral AI official API',
    category: 'official',
  },
  {
    id: 'xai-grok',
    name: 'xAI Grok',
    type: 'custom',
    baseUrl: 'https://api.x.ai',
    defaultModel: 'grok-2',
    description: 'xAI Grok API (OpenAI-compatible)',
    category: 'official',
  },
];
