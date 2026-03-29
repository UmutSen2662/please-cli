import { select, text, isCancel, cancel, log } from '@clack/prompts';
import pc from 'picocolors';
import wrapAnsi from 'wrap-ansi';
import type { AIResult } from '../ai';

export function displayResult(result: AIResult): void {
  const explanation = result.explanation?.trim();
  const command = result.command?.trim();

  if (explanation) {
    // Wrap explanation to terminal width with gutter offset
    const wrapped = wrapAnsi(explanation, (process.stdout.columns || 120) - 4);
    log.info(wrapped);
  }

  if (command) {
    // Wrap command and combine label with content for consistent bar
    const wrappedCmd = wrapAnsi(`  ${command}`, (process.stdout.columns || 120) - 4);
    log.message(pc.cyan('Command:') + '\n' + pc.yellow(wrappedCmd));
  }
}

export type Action = 'run' | 'refine' | 'cancel';

export async function showActionMenu(): Promise<Action> {
  const action = await select<Action>({
    message: 'What would you like to do?',
    options: [
      { value: 'run', label: 'Run this command', hint: 'Execute in your shell' },
      { value: 'refine', label: 'Refine / Modify', hint: 'Ask for changes' },
      { value: 'cancel', label: 'Cancel', hint: 'Exit without running' },
    ],
  });

  if (isCancel(action)) {
    return 'cancel';
  }

  return action;
}

export async function getRefineInput(): Promise<string | null> {
  const input = await text({
    message: 'How would you like to refine this command?',
    placeholder: 'e.g., "Add a progress bar" or "Make it recursive"',
    validate: (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'Please provide refinement instructions';
      }
      return undefined;
    },
  });

  if (isCancel(input)) {
    return null;
  }

  return input as string;
}

export function showCancellation(): void {
  cancel(pc.gray('Operation cancelled. No command was executed.'));
}

export function displayQuestion(question: string): void {
  // Wrap question and use log.message for consistent bar
  const wrapped = wrapAnsi(question, (process.stdout.columns || 120) - 4);
  log.message(pc.yellow(`  ${wrapped}`));
}

export async function getAnswerInput(): Promise<string | null> {
  const input = await text({
    message: 'Your answer:',
    placeholder: 'Provide the information requested...',
    validate: (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'Please provide an answer';
      }
      return undefined;
    },
  });

  if (isCancel(input)) {
    return null;
  }

  return input as string;
}
