#!/usr/bin/env node
/**
 * OmniCoder CLI Mode
 * Run without GUI — pure terminal interface.
 * Usage: npx tsx src/cli/index.ts --provider anthropic --model claude-sonnet-4-6
 */

import * as readline from 'node:readline';

const args = process.argv.slice(2);

function getArg(name: string, defaultVal: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const providerType = getArg('provider', 'anthropic');
const model = getArg('model', 'claude-sonnet-4-6');
const baseUrl = getArg('base-url', providerType === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com');
const apiKey = getArg('api-key', process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? '');

if (!apiKey) {
  console.error('Error: No API key provided. Use --api-key <key> or set ANTHROPIC_API_KEY / OPENAI_API_KEY env var.');
  process.exit(1);
}

// Minimal streaming chat — uses fetch directly (no Tauri dependency)
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const messages: Message[] = [];

async function sendToAnthropic(msgs: Message[]): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: msgs,
      max_tokens: 8192,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text?: string }> };
  return data.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('');
}

async function sendToOpenAI(msgs: Message[]): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: msgs.map(m => ({ role: m.role, content: m.content })),
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? '';
}

const sendMessage = providerType === 'anthropic' ? sendToAnthropic : sendToOpenAI;

console.log(`\x1b[36m╔══════════════════════════════════════════╗\x1b[0m`);
console.log(`\x1b[36m║  OmniCoder CLI v0.2.0                    ║\x1b[0m`);
console.log(`\x1b[36m║  Provider: ${providerType.padEnd(29)}║\x1b[0m`);
console.log(`\x1b[36m║  Model: ${model.padEnd(32)}║\x1b[0m`);
console.log(`\x1b[36m╚══════════════════════════════════════════╝\x1b[0m`);
console.log(`Type your message. Press Ctrl+C to exit.\n`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\x1b[32m> \x1b[0m',
});

rl.prompt();

rl.on('line', async (line: string) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  if (input === '/quit' || input === '/exit') {
    console.log('Goodbye!');
    process.exit(0);
  }

  if (input === '/clear') {
    messages.length = 0;
    console.log('Chat history cleared.');
    rl.prompt();
    return;
  }

  messages.push({ role: 'user', content: input });

  process.stdout.write('\x1b[34m');
  try {
    const reply = await sendMessage(messages);
    console.log(reply);
    messages.push({ role: 'assistant', content: reply });
  } catch (err) {
    console.error(`\x1b[31mError: ${err}\x1b[0m`);
  }
  process.stdout.write('\x1b[0m');

  rl.prompt();
});

rl.on('close', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});
