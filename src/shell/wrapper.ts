import { homedir } from 'os';
import { dirname, join } from 'path';
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'fs';
import { log } from '@clack/prompts';
import pc from 'picocolors';

const POWERSHELL_WRAPPER_START = '# >>> please-cli wrapper >>>';
const POWERSHELL_WRAPPER_END = '# <<< please-cli wrapper <<<';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Dev mode is explicitly set via --dev flag at install time.
// No auto-detection needed — Bun runs .ts directly in all cases,
// making runtime detection between npm link and dev unreliable.


function getBashWrapper(devMode: boolean): string {
  const cliCmd = devMode
    ? `bun run "${process.cwd()}/src/cli.ts"`
    : 'command pls';

  return `# please-cli wrapper function (${devMode ? 'dev mode' : 'npm install'})
pls() {
  export ASK_CLI_WRAPPER=1
  # Add pls command to history using fc
  fc -s "pls $*" 2>/dev/null || history -s "pls $*" 2>/dev/null
  ${cliCmd} "$@"
  
  if [[ -f ~/.ai_cmd_temp ]]; then
    local cmd=$(cat ~/.ai_cmd_temp)
    rm ~/.ai_cmd_temp
    if [[ -n "$cmd" ]]; then
      # Add to shell history
      if [[ -n "$ZSH_VERSION" ]]; then
        print -s "$cmd"
      else
        history -s "$cmd"
      fi
      eval "$cmd"
    fi
  fi
}
`;
}

function getPowerShellWrapper(devMode: boolean): string {
  const devPath = process.cwd().replace(/\//g, '\\') + '\\src\\cli.ts';

  const callCmd = devMode
    ? `$ASK_CLI_PATH = "${devPath}"
  bun run "$ASK_CLI_PATH" @args`
    : '$plsCmd = (Get-Command pls -CommandType Application | Select-Object -First 1).Source; if ($plsCmd) { & $plsCmd @args }';

  return `# please-cli wrapper function (${devMode ? 'dev mode' : 'npm install'})
function pls {
  $env:ASK_CLI_WRAPPER = "1"
  ${callCmd}
  
  $tempFile = Join-Path $HOME ".ai_cmd_temp"
  if (Test-Path $tempFile) {
    $cmd = Get-Content $tempFile -Raw
    Remove-Item $tempFile
    if ($cmd) {
      # Add to PSReadLine history
      [Microsoft.PowerShell.PSConsoleReadLine]::AddToHistory($cmd)
      Invoke-Expression $cmd
    }
  }
}
`;
}

function detectShell(): 'bash' | 'zsh' | 'powershell' | 'unknown' {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (process.platform === 'win32') return 'powershell';
  
  // Check for PowerShell on Linux/WSL by examining the shell path
  if (shell.includes('pwsh') || shell.includes('powershell')) return 'powershell';
  
  return 'unknown';
}

export function generateWrapperInstructions(devMode: boolean = false): void {
  const shell = detectShell();

  log.message(pc.cyan('=== please-cli Setup ==='));
  log.info('Add the following function to your shell config file:');

  if (shell === 'powershell' || process.platform === 'win32') {
    log.info(pc.yellow('For PowerShell, add to your $PROFILE:'));
    console.log(getPowerShellWrapper(devMode));
    log.info(pc.gray('Note: You may need to run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser'));
  } else {
    log.info(pc.yellow('For Bash (~/.bashrc) or Zsh (~/.zshrc):'));
    console.log(getBashWrapper(devMode));
  }

  log.info(pc.cyan('After adding, reload your shell config:'));
  log.info(pc.gray('  source ~/.bashrc  # or'));
  log.info(pc.gray('  source ~/.zshrc   # or'));
  log.info(pc.gray('  . $PROFILE        # for PowerShell'));
}

export function autoInstallWrapper(devMode: boolean = false): boolean {
  try {
    const shell = detectShell();

    if (shell === 'bash') {
      const bashrc = join(homedir(), '.bashrc');
      if (existsSync(bashrc)) {
        const content = readFileSync(bashrc, 'utf-8');
        if (!content.includes('pls()')) {
          appendFileSync(bashrc, '\n' + getBashWrapper(devMode));
          log.success(pc.green('Wrapper installed to ~/.bashrc'));
          return true;
        }
      }
    } else if (shell === 'zsh') {
      const zshrc = join(homedir(), '.zshrc');
      if (existsSync(zshrc)) {
        const content = readFileSync(zshrc, 'utf-8');
        if (!content.includes('pls()')) {
          appendFileSync(zshrc, '\n' + getBashWrapper(devMode));
          log.success(pc.green('Wrapper installed to ~/.zshrc'));
          return true;
        }
      }
    } else if (shell === 'powershell') {
      const userHome = process.env.USERPROFILE || homedir();
      const profileCandidates = [
        join(userHome, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        join(userHome, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
      ];

      const profilePath = profileCandidates.find(path => existsSync(path)) || profileCandidates[0];
      mkdirSync(dirname(profilePath), { recursive: true });
      if (!existsSync(profilePath)) {
        writeFileSync(profilePath, '', 'utf-8');
      }

      const content = readFileSync(profilePath, 'utf-8');
      const wrapper = getPowerShellWrapper(devMode);
      const managedBlock = `${POWERSHELL_WRAPPER_START}\n${wrapper}\n${POWERSHELL_WRAPPER_END}`;
      const blockRegex = new RegExp(
        `${escapeRegExp(POWERSHELL_WRAPPER_START)}[\\s\\S]*?${escapeRegExp(POWERSHELL_WRAPPER_END)}`,
        'm'
      );

      if (blockRegex.test(content)) {
        const updated = content.replace(blockRegex, managedBlock);
        writeFileSync(profilePath, updated, 'utf-8');
        log.success(pc.green(`Wrapper updated in ${profilePath}`));
      } else {
        appendFileSync(profilePath, `\n${managedBlock}\n`);
        log.success(pc.green(`Wrapper installed to ${profilePath}`));
      }

      return true;
    }

    return false;
  } catch (error) {
    log.error(pc.red(`Failed to auto-install wrapper: ${error}`));
    return false;
  }
}

export function autoUninstallWrapper(): boolean {
  try {
    const shell = detectShell();
    let removed = false;

    if (shell === 'bash') {
      const bashrc = join(homedir(), '.bashrc');
      if (existsSync(bashrc)) {
        const content = readFileSync(bashrc, 'utf-8');
        if (content.includes('pls()')) {
          const lines = content.split('\n');
          const newLines: string[] = [];
          let inWrapper = false;
          for (const line of lines) {
            if (line.includes('please-cli wrapper function')) {
              inWrapper = true;
              continue;
            }
            if (inWrapper && line.trim() === '}') {
              inWrapper = false;
              continue;
            }
            if (!inWrapper) {
              newLines.push(line);
            }
          }
          writeFileSync(bashrc, newLines.join('\n'), 'utf-8');
          log.success(pc.green('Wrapper removed from ~/.bashrc'));
          removed = true;
        }
      }
    } else if (shell === 'zsh') {
      const zshrc = join(homedir(), '.zshrc');
      if (existsSync(zshrc)) {
        const content = readFileSync(zshrc, 'utf-8');
        if (content.includes('pls()')) {
          const lines = content.split('\n');
          const newLines: string[] = [];
          let inWrapper = false;
          for (const line of lines) {
            if (line.includes('please-cli wrapper function')) {
              inWrapper = true;
              continue;
            }
            if (inWrapper && line.trim() === '}') {
              inWrapper = false;
              continue;
            }
            if (!inWrapper) {
              newLines.push(line);
            }
          }
          writeFileSync(zshrc, newLines.join('\n'), 'utf-8');
          log.success(pc.green('Wrapper removed from ~/.zshrc'));
          removed = true;
        }
      }
    } else if (shell === 'powershell') {
      const userHome = process.env.USERPROFILE || homedir();
      const profileCandidates = [
        join(userHome, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
        join(userHome, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
      ];

      for (const profilePath of profileCandidates) {
        if (existsSync(profilePath)) {
          const content = readFileSync(profilePath, 'utf-8');
          const blockRegex = new RegExp(
            `${escapeRegExp(POWERSHELL_WRAPPER_START)}[\\s\\S]*?${escapeRegExp(POWERSHELL_WRAPPER_END)}`,
            'm'
          );

          if (blockRegex.test(content)) {
            const updated = content.replace(blockRegex, '');
            writeFileSync(profilePath, updated, 'utf-8');
            log.success(pc.green(`Wrapper removed from ${profilePath}`));
            removed = true;
          }
        }
      }
    }

    if (!removed) {
      log.warn(pc.yellow('No wrapper found to remove.'));
    }
    return removed;
  } catch (error) {
    log.error(pc.red(`Failed to remove wrapper: ${error}`));
    return false;
  }
}
