// Diagnostic for the coach prompt. Failures here are stochastic, so each case
// runs N times and reports a rate — a single green run proves nothing.
//
//   node --env-file-if-exists=../.env.local repro-coach.ts
//
// Builds histories out of real message rows and runs them through the actual
// buildHistory(), so this exercises the production code path rather than a
// hand-rolled approximation of it.

import Anthropic from '@anthropic-ai/sdk';
import { systemPrompt, buildTools, buildHistory } from './src/routes/chat.ts';

const RUNS = 8;

const client = new Anthropic({
  apiKey: process.env.LLM_API_KEY!,
  baseURL: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/anthropic',
});
const model = process.env.LLM_MODEL ?? 'deepseek-v4-flash';
const system = systemPrompt('PYG');
const tools = buildTools('PYG');

type Row = { kind: string; payload: Record<string, unknown> };
const user = (text: string): Row => ({ kind: 'user', payload: { text } });
const ai = (text: string): Row => ({ kind: 'ai', payload: { text } });
const card = (merchant: string, amountMinor: number, note = 'manzana'): Row => ({
  kind: 'card',
  payload: { merchant, cat: 'food', amountMinor, note },
});

// What the seed leaves in every new account's chat history.
const SEEDED: Row[] = [user('add my lunch — 12.40 at the market'), card('Mercado Central', 1240, 'Lunch')];

const ARETE = 'Gasté 50000 en Supermercado Areté comprando una manzana';

/** Returns '' on success, or a description of what was wrong. */
type Check = (t: Anthropic.ToolUseBlock | undefined) => string;

/** The full extraction: amount, merchant and note all read off the message. */
const extractsArete: Check = t => {
  if (!t) return 'no tool call — prose only';
  const i = t.input as Record<string, unknown>;
  const problems: string[] = [];
  if (Number(i.amount) !== 50000) problems.push(`amount=${JSON.stringify(i.amount)}`);
  if (!/aret/i.test(String(i.merchant ?? ''))) problems.push(`merchant=${JSON.stringify(i.merchant)}`);
  if (!/manzana|apple/i.test(String(i.note ?? ''))) problems.push(`note=${JSON.stringify(i.note)}`);
  return problems.join(', ');
};

const cases: { label: string; want: string; rows: Row[]; check: Check }[] = [
  {
    label: 'A. no shop named — must ask, not invent one',
    want: 'no tool call; ask which shop',
    rows: [...SEEDED, user('Compré una manzana por 5000')],
    check: t => (t ? `invented merchant=${JSON.stringify((t.input as Record<string, unknown>).merchant)}` : ''),
  },
  {
    label: 'B. fresh message with all three facts',
    want: 'amount 50000, merchant Areté, note manzana',
    rows: [...SEEDED, user(ARETE)],
    check: extractsArete,
  },
  {
    label: 'C. a card already exists — this is a NEW expense, not an edit',
    want: 'propose again; all three facts from the new message',
    rows: [...SEEDED, user('Compré una manzana por 5000'), card('Mercado Central', 5000), ai('Listo, revisá la tarjeta.'), user(ARETE)],
    check: extractsArete,
  },
  {
    label: 'D. real transcript — history polluted with the model\'s own prose',
    want: 'propose again despite prose descriptions earlier in the conversation',
    rows: [
      ...SEEDED,
      user('Compré una manzana por 5000'),
      card('Mercado Central', 5000),
      ai('Listo, te armé un borrador: **₲5.000 en Mercado Central** (categoría: comida, nota: manzana).'),
      user('Yo a ustedes 5000 en areté supermercados comprando una manzana'),
      ai('Entendido, te armé el borrador con los datos correctos:\n\n- **Mercadería:** Areté Supermercados\n- **Monto:** ₲5.000'),
      user(ARETE),
    ],
    check: extractsArete,
  },
  {
    label: 'E. several cards already in history',
    want: 'still proposes; not put off by a pile of earlier drafts',
    rows: [
      ...SEEDED,
      user('Compré una manzana por 5000'),
      card('Mercado Central', 5000),
      ai('Listo, revisá la tarjeta.'),
      user('y un café por 8000 en Cafe Luna'),
      card('Cafe Luna', 8000, 'café'),
      ai('Listo, revisá la tarjeta.'),
      user(ARETE),
    ],
    check: extractsArete,
  },
];

let totalFail = 0;
for (const testCase of cases) {
  const messages = buildHistory(testCase.rows, 'PYG');
  const results: string[] = [];
  let passes = 0;

  for (let i = 0; i < RUNS; i++) {
    const response = await client.messages.create({ model, max_tokens: 1024, system, tools, messages });
    const toolUse = response.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    const problem = testCase.check(toolUse);
    if (!problem) passes++;
    results.push(problem ? `BAD  ${problem}` : 'ok');
  }

  totalFail += RUNS - passes;
  console.log(`\n=== ${testCase.label}`);
  console.log(`want  : ${testCase.want}`);
  results.forEach((r, i) => console.log(`  run ${i + 1}: ${r}`));
  console.log(`RATE  : ${passes}/${RUNS} passing`);
}

console.log(`\n${totalFail === 0 ? 'ALL PASSING' : `${totalFail} failing runs across ${cases.length} cases`}`);
