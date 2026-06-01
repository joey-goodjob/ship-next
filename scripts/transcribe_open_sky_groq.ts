import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve('.env.local'));

const audioPath = '/Users/joey/Downloads/Open Sky Tonight (3).mp3';

async function main() {
  const [{ getAllConfigs }, { GroqProvider }] = await Promise.all([
    import('../src/modules/config/service'),
    import('../src/core/ai/groq'),
  ]);

  const configs = await getAllConfigs();
  const model = 'whisper-large-v3';
  const baseUrl = configs.groq_base_url || 'https://api.groq.com/openai/v1';

  if (!configs.groq_api_key) {
    throw new Error('Missing config: groq_api_key');
  }

  const provider = new GroqProvider({
    apiKey: configs.groq_api_key,
    baseUrl,
    transcribeModel: model,
  });

  const result = await provider.transcribeFile({
    body: await readFile(audioPath),
    filename: 'Open Sky Tonight (3).mp3',
    contentType: 'audio/mpeg',
  });

  console.log(
    JSON.stringify(
      {
        file: audioPath,
        provider: 'groq',
        base_url: baseUrl,
        model,
        raw: result.raw,
        lines: result.lines,
        words: result.words,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
