import OpenAI from 'openai';
import { Ollama } from 'ollama';
import type { Provider } from '../config/manager';

export interface ModelOption {
  value: string;
  label: string;
  hint?: string;
}

export async function fetchModels(provider: Provider, apiKey: string): Promise<ModelOption[]> {
  switch (provider) {
    case 'openai':
      return fetchOpenAIModels(apiKey);
    case 'google':
      return fetchGoogleModels(apiKey);
    case 'ollama':
      return fetchOllamaModels(apiKey);
    case 'lmstudio':
      return fetchLmStudioModels(apiKey);
  }
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelOption[]> {
  const client = new OpenAI({ apiKey });
  const list = await client.models.list();

  const chatPrefixes = ['gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4', 'chatgpt-'];

  return list.data
    .filter(m => chatPrefixes.some(p => m.id.startsWith(p)))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(m => ({
      value: m.id,
      label: m.id,
    }));
}

async function fetchGoogleModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`
  );
  if (!res.ok) throw new Error(`Google API returned ${res.status}`);

  const data: any = await res.json();

  return (data.models ?? [])
    .filter((m: any) =>
      m.supportedGenerationMethods?.includes('generateContent') &&
      m.name?.includes('gemini')
    )
    .map((m: any) => ({
      value: (m.name as string).replace('models/', ''),
      label: m.displayName ?? (m.name as string).replace('models/', ''),
    }));
}

async function fetchOllamaModels(baseUrl?: string): Promise<ModelOption[]> {
  const client = new Ollama({ host: baseUrl || 'http://localhost:11434' });
  const response = await client.list();

  return response.models.map(m => ({
    value: m.name,
    label: m.name,
    hint: `${(m.size / 1e9).toFixed(1)}GB`,
  }));
}

async function fetchLmStudioModels(baseUrl?: string): Promise<ModelOption[]> {
  const url = baseUrl ? `${baseUrl}/v1/models` : 'http://localhost:1234/v1/models';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LM Studio API returned ${res.status}`);

  const data: any = await res.json();

  return (data.data ?? [])
    .map((m: any) => ({
      value: m.id,
      label: m.id,
    }));
}
