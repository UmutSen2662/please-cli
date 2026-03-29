import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const TEMP_FILE = join(homedir(), '.ai_cmd_temp');

export function writeCommandToTemp(command: string): void {
  writeFileSync(TEMP_FILE, command, 'utf-8');
}

export function cleanupTempFile(): void {
  if (existsSync(TEMP_FILE)) {
    try {
      unlinkSync(TEMP_FILE);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export function getTempFilePath(): string {
  return TEMP_FILE;
}
