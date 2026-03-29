import { text, select, isCancel, cancel, note, spinner, log } from '@clack/prompts';
import pc from 'picocolors';
import { saveConfig, type Provider, getDefaultModel } from './manager';
import { fetchModels, type ModelOption } from '../ai/models';

export async function runOnboarding(): Promise<void> {
  const provider = await select<Provider>({
    message: 'Choose your AI provider:',
    options: [
      { value: 'google', label: 'Google Gemini', hint: 'Recommended' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'ollama', label: 'Ollama (local)' },
      { value: 'lmstudio', label: 'LM Studio (local)' },
    ],
  });

  if (isCancel(provider)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const apiKey = await text({
    message: `Enter your ${provider === 'ollama' || provider === 'lmstudio' ? 'API endpoint (optional for local)' : 'API key'}:`,
    placeholder: provider === 'ollama' ? 'http://localhost:11434' : provider === 'lmstudio' ? 'http://localhost:1234' : 'sk-...',
    validate: (value: string) => {
      if (provider !== 'ollama' && provider !== 'lmstudio' && !value) {
        return 'API key is required';
      }
      return undefined;
    },
  });

  if (isCancel(apiKey)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const finalApiKey = apiKey || '';

  // Fetch available models dynamically from the provider
  const s = spinner();
  s.start('Fetching available models...');

  let models: ModelOption[] = [];
  try {
    models = await fetchModels(provider, finalApiKey);
    s.stop(`Found ${models.length} model${models.length === 1 ? '' : 's'}`);
  } catch {
    s.stop('Could not fetch models');
    log.warn(pc.yellow('Failed to retrieve models from provider. You can enter a model name manually.'));
  }

  let finalModel: string;

  if (models.length > 0) {
    const model = await select<string>({
      message: 'Choose a model:',
      options: [
        ...models.map(m => ({ value: m.value, label: m.label, hint: m.hint })),
        { value: 'custom', label: 'Custom model', hint: 'Enter model name manually' },
      ],
    });

    if (isCancel(model)) {
      cancel('Setup cancelled.');
      process.exit(0);
    }

    if (model === 'custom') {
      const customModel = await text({
        message: 'Enter custom model name:',
        placeholder: getDefaultModel(provider),
      });
      if (isCancel(customModel)) {
        cancel('Setup cancelled.');
        process.exit(0);
      }
      finalModel = customModel || getDefaultModel(provider);
    } else {
      finalModel = model;
    }
  } else {
    // Fallback: manual entry when dynamic fetch failed
    const customModel = await text({
      message: 'Enter model name:',
      placeholder: getDefaultModel(provider),
    });
    if (isCancel(customModel)) {
      cancel('Setup cancelled.');
      process.exit(0);
    }
    finalModel = customModel || getDefaultModel(provider);
  }

  saveConfig({
    provider,
    apiKey: finalApiKey,
    model: finalModel,
  });

  note(pc.green('Configuration saved to ~/.config/please-cli/config.json'), 'Setup Complete');
}
