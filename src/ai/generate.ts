import { generateText, type CoreMessage } from 'ai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { Config } from '../config';

export interface AIResult {
  command: string;
  explanation: string;
}

export interface AIQuestion {
  question: string;
}

export type AIResponse = AIResult | AIQuestion;

function isAIQuestion(response: AIResponse): response is AIQuestion {
  return 'question' in response && typeof response.question === 'string';
}

type RuntimeShell = 'powershell' | 'bash' | 'zsh' | 'unknown';

function getModel(config: Config) {
  switch (config.provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
      return google(config.model || 'gemini-2.5-flash');
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey: config.apiKey });
      return openai(config.model || 'gpt-4o-mini');
    }
    case 'ollama': {
      // Ollama provides an OpenAI-compatible API endpoint
      const ollama = createOpenAI({
        apiKey: 'ollama',
        baseURL: config.apiKey || 'http://localhost:11434/v1',
      });
      return ollama(config.model || 'llama3.2');
    }
    case 'lmstudio': {
      // LM Studio provides an OpenAI-compatible API endpoint
      const lmstudio = createOpenAI({
        apiKey: 'lmstudio',
        baseURL: config.apiKey || 'http://localhost:1234/v1',
      });
      return lmstudio(config.model || 'local-model');
    }
    default:
      return google('gemini-2.5-flash');
  }
}

function detectRuntimeShell(): RuntimeShell {
  if (process.platform === 'win32' || process.env.PSModulePath || process.env.ASK_CLI_WRAPPER) {
    return 'powershell';
  }

  const shell = (process.env.SHELL || '').toLowerCase();
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  return 'unknown';
}

function buildSystemPrompt(shell: RuntimeShell): string {
  const common = `You are please-cli, an expert shell command assistant. You help users translate natural language requests into precise shell commands.

IMPORTANT: You MUST respond with ONLY a valid JSON object. Do not include any markdown formatting, code blocks, or explanatory text outside the JSON.

You have TWO possible response formats:

1. If you need more information to generate a safe and accurate command, ask a follow-up question:
{
  "question": "your clarifying question here (e.g., 'Which directory should I search in?')"
}

2. If you have enough information, provide the command:
{
  "command": "the exact shell command to execute",
  "explanation": "a brief explanation of what the command does (1-2 short sentences, max ~180 chars), plain English"
}

Guidelines:
- Ask a question ONLY when the request is ambiguous, missing critical details, or could be dangerous without clarification
- The "command" must be a single line, executable command string
- The "explanation" should be concise: 1-2 short sentences, plain English only
- For dangerous operations (rm -rf, etc.), include a warning in the explanation
- Prefer safe, standard tools over exotic ones
- Include necessary flags for safety when available`;

  if (shell === 'powershell') {
    return `${common}

Environment: PowerShell on Windows.
PowerShell rules:
- Generate PowerShell-native commands only.
- Prefer cmdlets like Get-ChildItem, Where-Object, Select-Object, Measure-Object.
- Do NOT use bash/unix-only tools such as find, grep, sed, awk, wc, xargs, unless user explicitly asks for bash.`;
  }

  if (shell === 'bash' || shell === 'zsh') {
    return `${common}

Environment: ${shell} shell.
Shell rules:
- Generate POSIX/bash-style commands.
- It's acceptable to use common unix tools (find, grep, sed, awk, wc) when appropriate.`;
  }

  return `${common}

Environment: Unknown shell.
Prefer portable commands and avoid shell-specific syntax when possible.`;
}

function extractJSON(text: string): string | null {
  // Find the first opening brace
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  // Track brace depth to find the matching closing brace
  let depth = 0;
  let endIdx = -1;

  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return null;
  return text.slice(startIdx, endIdx + 1);
}

export async function generateCommand(
  config: Config,
  messages: CoreMessage[]
): Promise<AIResponse> {
  const model = getModel(config);
  const runtimeShell = detectRuntimeShell();

  const { text } = await generateText({
    model,
    system: buildSystemPrompt(runtimeShell),
    messages,
    temperature: 0.3,
  });

  try {
    // Clean up the response - remove markdown code blocks if present
    let cleanText = text.trim();

    // Remove markdown code block markers
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '');
    }
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '');
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.replace(/\s*```$/, '');
    }
    cleanText = cleanText.trim();

    const jsonStr = extractJSON(cleanText);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);

      // Check if it's a question response
      if (parsed.question && typeof parsed.question === 'string') {
        return { question: parsed.question.trim() };
      }

      // Otherwise treat as command result
      return {
        command: parsed.command?.toString().trim() || '',
        explanation: parsed.explanation?.toString().trim() || 'Command generated from natural language request.',
      };
    }

    // Fallback: treat entire response as command if no JSON found
    return {
      command: cleanText,
      explanation: 'Command generated from natural language request.',
    };
  } catch (error) {
    // If JSON parsing fails, return raw text as command
    return {
      command: text.trim(),
      explanation: 'Command generated from natural language request.',
    };
  }
}
