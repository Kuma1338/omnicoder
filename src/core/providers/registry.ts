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
    description: 'Claude Opus 4.6 / Sonnet 4.6 / Haiku 4.5 (March 2026)',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    category: 'official',
  },
  {
    id: 'openai-official',
    name: 'OpenAI (Official)',
    type: 'openai',
    baseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-5.4',
    description: 'GPT-5.4 / GPT-5.3-Codex / GPT-5.4 Mini (March 2026)',
    models: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-4o', 'o3'],
    category: 'official',
  },
  {
    id: 'gemini-official',
    name: 'Google Gemini',
    type: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.1-pro',
    description: 'Gemini 3.1 Pro / 3.1 Flash-Lite (March 2026)',
    models: ['gemini-3.1-pro', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    category: 'official',
  },

  // Local
  {
    id: 'ollama-local',
    name: 'Ollama (Local)',
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'qwen2.5-coder:32b',
    description: 'Local models via Ollama (Qwen, Llama, DeepSeek, etc.)',
    category: 'local',
  },

  // Relay / Third-party
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'custom',
    baseUrl: 'https://openrouter.ai/api',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    description: 'Multi-model relay with cost optimization',
    category: 'relay',
  },
  {
    id: 'together-ai',
    name: 'Together AI',
    type: 'custom',
    baseUrl: 'https://api.together.xyz',
    defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    description: 'Open-source model hosting',
    category: 'relay',
  },
  {
    id: 'deepseek-official',
    name: 'DeepSeek',
    type: 'custom',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    description: 'DeepSeek V3 / R1 (V4 coming soon, OpenAI-compatible)',
    category: 'official',
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'custom',
    baseUrl: 'https://api.groq.com/openai',
    defaultModel: 'llama-3.3-70b-versatile',
    description: 'Ultra-fast inference (Groq LPU)',
    category: 'relay',
  },
  {
    id: 'mistral-official',
    name: 'Mistral AI',
    type: 'custom',
    baseUrl: 'https://api.mistral.ai',
    defaultModel: 'mistral-large-latest',
    description: 'Mistral Large 3 / Small 4 (March 2026)',
    category: 'official',
  },
  {
    id: 'xai-grok',
    name: 'xAI Grok',
    type: 'custom',
    baseUrl: 'https://api.x.ai',
    defaultModel: 'grok-4.20',
    description: 'Grok 4.20 multi-agent (March 2026)',
    category: 'official',
  },
];
