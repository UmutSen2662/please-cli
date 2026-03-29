import { intro, outro, text, select, spinner, isCancel, cancel, log } from '@clack/prompts';
import pc from 'picocolors';
import type { CoreMessage } from 'ai';
import { loadConfig, saveConfig, runOnboarding, getDefaultModel, type Provider } from './config';
import { generateCommand, fetchModels, type ModelOption, type AIResponse } from './ai';
import { displayResult, showActionMenu, getRefineInput, showCancellation, displayQuestion, getAnswerInput, type Action } from './ui';
import { writeCommandToTemp, cleanupTempFile, generateWrapperInstructions, autoInstallWrapper, autoUninstallWrapper } from './shell';

export async function main(): Promise<void> {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const flags = {
    help: args.includes('--help') || args.includes('-h'),
    setup: args.includes('--setup'),
    install: args.includes('--install'),
    uninstall: args.includes('--uninstall'),
    dev: args.includes('--dev'),
    changeModel: args.includes('--model'),
  };

  // Handle --model with direct value (e.g., --model gemini-2.5-pro)
  let directModel: string | null = null;
  const modelIndex = args.findIndex(arg => arg === '--model');
  if (modelIndex !== -1 && modelIndex + 1 < args.length && !args[modelIndex + 1].startsWith('--')) {
    directModel = args[modelIndex + 1];
    flags.changeModel = false; // Don't trigger interactive flow if value provided directly
  }

  // Remove flags from args
  const queryArgs = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  const initialQuery = queryArgs.join(' ');

  // Handle help flag
  if (flags.help) {
    console.log(`
${pc.cyan('please-cli')} - AI-powered shell command assistant

Usage: pls [options] [query]

Usage:
  pls                        Start interactive mode
  pls <query>                Ask a natural language query

Flags:
  -h, --help                 Display this menu and exit
      --setup                Run configuration setup
      --install              Install shell wrapper
      --uninstall            Remove shell wrapper
      --install --dev        Install shell wrapper in dev mode (uses bun + source path)
      --model [name]         Change the model (prompts if no name given)
`);
    return;
  }

  // Handle change model flag (interactive mode - no value provided)
  if (flags.changeModel) {
    intro(pc.cyan('please-cli'));
    const config = loadConfig();
    if (!config) {
      log.warn('No configuration found. Run setup first:');
      console.log(pc.gray('  pls --setup'));
      process.exit(1);
    }

    const s = spinner();
    s.start('Fetching available models...');

    let models: ModelOption[] = [];
    try {
      models = await fetchModels(config.provider, config.apiKey);
      s.stop(`Found ${models.length} model${models.length === 1 ? '' : 's'}`);
    } catch {
      s.stop('Could not fetch models');
      log.warn(pc.yellow('Failed to retrieve models. You can enter a model name manually.'));
    }

    let finalModel: string;

    if (models.length > 0) {
      const model = await select<string>({
        message: 'Choose a new model:',
        options: [
          ...models.map(m => ({ value: m.value, label: m.label, hint: m.hint })),
          { value: 'custom', label: 'Custom model', hint: 'Enter model name manually' },
        ],
      });

      if (isCancel(model)) {
        cancel('Operation cancelled.');
        process.exit(0);
      }

      if (model === 'custom') {
        const customModel = await text({
          message: 'Enter custom model name:',
          placeholder: config.model || getDefaultModel(config.provider as Provider),
        });
        if (isCancel(customModel)) {
          cancel('Operation cancelled.');
          process.exit(0);
        }
        finalModel = customModel || (config.model || getDefaultModel(config.provider as Provider));
      } else {
        finalModel = model;
      }
    } else {
      const customModel = await text({
        message: 'Enter model name:',
        placeholder: config.model || getDefaultModel(config.provider as Provider),
      });
      if (isCancel(customModel)) {
        cancel('Operation cancelled.');
        process.exit(0);
      }
      finalModel = customModel || (config.model || getDefaultModel(config.provider as Provider));
    }

    saveConfig({ ...config, model: finalModel });
    outro(pc.green(`Model changed to: ${finalModel}`));
    return;
  }

  // Handle direct model assignment (e.g., --model gemini-2.5-pro)
  if (directModel) {
    intro(pc.cyan('please-cli'));
    const config = loadConfig();
    if (!config) {
      log.warn('No configuration found. Run setup first:');
      console.log(pc.gray('  pls --setup'));
      process.exit(1);
    }

    saveConfig({ ...config, model: directModel });
    outro(pc.green(`Model changed to: ${directModel}`));
    return;
  }
  if (flags.setup) {
    try {
      await runOnboarding();
      outro('Setup complete!');
    } catch (error) {
      log.error(`Setup failed: ${error}`);
      process.exit(1);
    }
    return;
  }

  // Handle install flag
  if (flags.install) {
    intro(pc.cyan('please-cli'));
    if (flags.dev) {
      log.info(pc.yellow('Dev mode: wrapper will use bun + source path'));
    }
    const installed = autoInstallWrapper(flags.dev);
    if (!installed) {
      generateWrapperInstructions(flags.dev);
    }
    outro('Done!');
    return;
  }

  // Handle uninstall flag
  if (flags.uninstall) {
    intro(pc.cyan('please-cli'));
    autoUninstallWrapper();
    outro('Done!');
    return;
  }

  intro(pc.cyan('please-cli'));

  // Load or create config
  let config = loadConfig();
  if (!config) {
    log.warn('No configuration found. Running first-time setup...');
    await runOnboarding();
    config = loadConfig();
    if (!config) {
      cancel('Failed to load configuration after setup.');
      process.exit(1);
    }
  }

  // Get user query
  let userQuery = initialQuery;
  if (!userQuery) {
    const input = await text({
      message: 'What do you want the shell to do?',
      placeholder: 'e.g., "Find all JS files modified today"',
    });

    if (isCancel(input)) {
      showCancellation();
      process.exit(0);
    }

    userQuery = input as string;
  }

  function isAIQuestion(response: AIResponse): response is { question: string } {
    return 'question' in response && typeof response.question === 'string';
  }

  // Initialize conversation
  const messages: CoreMessage[] = [];

  // Main interaction loop
  while (true) {
    // Add user message
    messages.push({ role: 'user', content: userQuery });

    // Generate command
    const s = spinner();
    s.start('Generating command...');

    try {
      const result = await generateCommand(config, messages);

      // Check if AI is asking a follow-up question
      if (isAIQuestion(result)) {
        s.stop(pc.cyan('Clarification needed:'));
        displayQuestion(result.question);
        const answer = await getAnswerInput();
        if (answer === null) {
          showCancellation();
          cleanupTempFile();
          process.exit(0);
        }

        // Add the AI's question and user's answer to conversation
        messages.push({
          role: 'assistant',
          content: JSON.stringify({ question: result.question }),
        });
        userQuery = answer;
        continue; // Loop back to generate with the new context
      }

      // It's a command result
      s.stop(pc.green('Command generated!'));

      // Display result
      displayResult(result);

      // Show action menu
      const action = await showActionMenu();

      switch (action) {
        case 'run': {
          writeCommandToTemp(result.command);

          // Check if running through wrapper by checking environment variable
          if (process.env.ASK_CLI_WRAPPER) {
            // Running through wrapper - it will handle execution
            outro('Command executed!');
            process.exit(0);
          } else {
            // Running directly - show command for manual execution
            log.message('\n' + pc.cyan('Generated command:'));
            log.message(pc.yellow(result.command));
            log.info(pc.gray('Tip: Install the shell wrapper to execute commands automatically:'));
            log.info(pc.gray('  pls --install'));
            outro('Done!');
            process.exit(0);
          }
        }

        case 'refine': {
          const refinement = await getRefineInput();
          if (refinement === null) {
            showCancellation();
            cleanupTempFile();
            process.exit(0);
          }

          // Add the previous assistant response and new refinement
          messages.push({
            role: 'assistant',
            content: JSON.stringify(result),
          });
          userQuery = refinement;
          break; // Continue loop with refinement
        }

        case 'cancel': {
          showCancellation();
          cleanupTempFile();
          process.exit(0);
        }
      }
    } catch (error) {
      s.stop('Failed to generate command');
      log.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
}
