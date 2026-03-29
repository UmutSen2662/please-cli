import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';

const CONFIG_DIR = join(homedir(), '.config', 'please-cli');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export const ProviderSchema = z.enum(['google', 'openai', 'ollama', 'lmstudio']);
export type Provider = z.infer<typeof ProviderSchema>;

export const ConfigSchema = z.object({
  provider: ProviderSchema,
  apiKey: z.string(),
  model: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return ConfigSchema.parse(parsed);
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getDefaultModel(provider: Provider): string {
  switch (provider) {
    case 'google':
      return 'gemini-2.5-flash';
    case 'openai':
      return 'gpt-4o-mini';
    case 'ollama':
      return 'llama3.2';
    case 'lmstudio':
      return 'local-model';
    default:
      return 'gemini-2.5-flash';
  }
}
