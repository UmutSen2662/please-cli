# please-cli

AI-powered shell command assistant. Ask in natural language, get executable shell commands.

## Features

- **Natural language to shell commands** - Describe what you want, get the exact command
- **Interactive refinement** - Iterate on commands in a chat loop
- **Multiple AI providers** - Google Gemini, OpenAI, Ollama, or LM Studio
- **Dynamic model selection** - Fetch and choose from available models
- **Clarification questions** - AI asks follow-ups when context is needed
- **Beautiful TUI** - Built with @clack/prompts and marked-terminal
- **Shell integration** - Commands added to your shell history and executed
- **Cross-platform** - Bash, Zsh, and PowerShell support

## Quick Start

### 1. Install dependencies

```bash
cd please-cli
bun install
```

### 2. First-time setup

```bash
bun run dev --setup
```

This will prompt you to:
- Choose an AI provider (Google Gemini, OpenAI, Ollama, or LM Studio)
- Enter your API key
- Select a model (fetched dynamically from the provider)

### 3. Install shell wrapper

```bash
# Build install
# Points to the built CLI
bun run dev --install

# Dev mode install
# Points to the dev CLI
bun run dev --install --dev
```

After installing, reload your shell to activate the wrapper:
```bash
source ~/.bashrc  # or ~/.zshrc
```

### 4. Start asking

```bash
# Interactive mode
pls

# With a query
pls "list all docker containers"
pls "find files modified in the last 24 hours"
pls "compress all images in this directory"
```

## Usage

```
pls [options] [query]

Usage:
  pls                        Start interactive mode
  pls <query>                Ask a natural language query

Options:
  -h, --help                 Show help
      --setup                Run configuration setup
      --install              Install shell wrapper
      --uninstall            Remove shell wrapper
      --install --dev        Install wrapper in dev mode
      --model [name]         Change the model (prompts if no name given)

Examples:
  pls "show git log with graph"
  pls "create a tar.gz of the src folder"
  pls --model gemini-2.5-pro
```

## Configuration

Config is stored at `~/.config/please-cli/config.json`:

```json
{
  "provider": "google",
  "apiKey": "your-api-key",
  "model": "gemini-2.5-flash"
}
```

### Supported Providers

| Provider | Default Model | Notes |
|----------|---------------|-------|
| Google | `gemini-2.5-flash` | Recommended |
| OpenAI | `gpt-4o-mini` | Requires API key |
| Ollama | `llama3.2` | Local, endpoint: `http://localhost:11434` |
| LM Studio | `local-model` | Local, endpoint: `http://localhost:1234` |

## Shell Wrapper

The shell wrapper is required for commands to execute in your current shell. It:
1. Calls the CLI with your query
2. Checks for an approved command in `~/.ai_cmd_temp`
3. Adds the command to shell history
4. Executes it with `eval`

See `pls --install` for automatic installation.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Validation**: Zod
- **TUI**: @clack/prompts, picocolors
- **Markdown**: marked, marked-terminal
- **AI**: Vercel AI SDK
