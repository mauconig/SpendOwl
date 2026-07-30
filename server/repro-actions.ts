// Does the coach pick the right tool for the four card/subscription intents?
// Messages name a shop where one is required — the prompt deliberately asks
// rather than inventing a merchant, so a message without one tests nothing.
import Anthropic from '@anthropic-ai/sdk';
import { systemPrompt, buildTools } from './src/routes/chat.ts';

const RUNS = 6;
const client = new Anthropic({ apiKey: process.env.LLM_API_KEY!, baseURL: 'https://api.deepseek.com/anthropic' });
const model = process.env.LLM_MODEL ?? 'deepseek-v4-flash';
const system = systemPrompt('PYG');
const tools = buildTools('PYG');

type Case = { name: string; text: string; want: string; check?: (i: Record<string, unknown>) => string };
const hasCard = (i: Record<string, unknown>) =>
  /visa|master/i.test(String(i.paidWithCard ?? '')) ? '' : `paidWithCard=${JSON.stringify(i.paidWithCard)}`;

const cases: Case[] = [
  { name: 'bought WITH a card', text: 'Compré una campera de 200000 en Falabella con la Visa', want: 'propose_expense', check: hasCard },
  { name: 'bought WITH a card (en)', text: 'I bought a jacket for 200000 at Falabella using my Visa', want: 'propose_expense', check: hasCard },
  { name: 'paid TO a card', text: 'Pagué 50000 a la Visa', want: 'propose_card_payment',
    check: i => (Number(i.amount) === 50000 ? '' : `amount=${JSON.stringify(i.amount)}`) },
  { name: 'paid TO a card (en)', text: 'I paid 50000 towards my Mastercard', want: 'propose_card_payment',
    check: i => (/master/i.test(String(i.card ?? '')) ? '' : `card=${JSON.stringify(i.card)}`) },
  { name: 'cancel a subscription', text: 'Cancelé Netflix', want: 'propose_cancel_subscription',
    check: i => (/netflix/i.test(String(i.subscription ?? '')) ? '' : `subscription=${JSON.stringify(i.subscription)}`) },
  { name: 'new subscription', text: 'Me suscribí a Disney+ y me cuesta 45000 por mes', want: 'propose_new_subscription',
    check: i => (Number(i.monthlyPrice) === 45000 ? '' : `monthlyPrice=${JSON.stringify(i.monthlyPrice)}`) },
  { name: 'plain expense, no card', text: 'Gasté 15000 en Superseis', want: 'propose_expense',
    check: i => (i.paidWithCard ? `wrongly set paidWithCard=${JSON.stringify(i.paidWithCard)}` : '') },
  // Echoing back the words they typed ("super") is fine; inventing a specific
  // named shop they never mentioned is the failure this guards against.
  { name: 'no merchant -> never invents a named shop', text: 'Gasté 15000 en el super', want: 'ANY',
    check: i => (/mercado|superseis|stock|biggie|luisito/i.test(String(i.merchant ?? '')) ? `invented merchant=${JSON.stringify(i.merchant)}` : '') },
];

for (const c of cases) {
  const problems: string[] = [];
  for (let run = 0; run < RUNS; run++) {
    const res = await client.messages.create({ model, max_tokens: 2048, system, tools, messages: [{ role: 'user', content: c.text }] });
    const call = res.content.find(b => b.type === 'tool_use');
    const got = call && call.type === 'tool_use' ? call.name : 'NONE';
    if (c.want !== 'ANY' && got !== c.want) { problems.push(`called ${got}`); continue; }
    if (call && call.type === 'tool_use') {
      const bad = c.check?.(call.input as Record<string, unknown>);
      if (bad) problems.push(bad);
    }
  }
  const pass = RUNS - problems.length;
  console.log(`${pass === RUNS ? 'PASS' : 'FAIL'}  ${pass}/${RUNS}  ${c.name}`);
  if (problems.length) console.log(`        ${[...new Set(problems)].join(' | ')}`);
}
