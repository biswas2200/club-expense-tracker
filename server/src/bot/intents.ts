/**
 * Turns chat text into something the bot can act on, with plain keyword rules. Questions the
 * keywords miss go to the AI classifier in v0.5; everything common is answered without it.
 */
import { parseRupees, type Direction } from '@nocap/shared';
import { normaliseTxnId } from '../lib/txnId';

export type Intent = 'unpaid' | 'remaining' | 'spent' | 'my-status' | 'help';

/** Lower case, straight apostrophes, single spaces, no punctuation except apostrophes. */
function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'₹.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Checked in order: "have I paid" must win over "paid", "how much was spent" over "how much".
const INTENT_RULES: [Intent, RegExp][] = [
  ['my-status', /\b(my (status|fee|fees|payment|payments|dues)|have i paid|did i pay|do i owe)\b/],
  [
    'unpaid',
    /\b(unpaid|not paid|has ?n'?t paid|have ?n'?t paid|yet to pay|did ?n'?t pay|who owes|owes?|pending fees?|dues)\b/,
  ],
  ['spent', /\b(spent|spend|spending|expenses?|expenditure)\b/],
  ['remaining', /\b(left|remaining|balance|budget)\b/],
  ['help', /^(help|hi|hii+|hello|hey|menu|start|commands)\b/],
];

export function matchIntent(text: string): Intent | undefined {
  const t = normalise(text);
  return INTENT_RULES.find(([, rule]) => rule.test(t))?.[0];
}

const words = (text: string) =>
  normalise(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/s$/, ''));

/**
 * The event a message names, by the words in event names. Words shared by several events
 * ("2026", "party") don't count, and a tie means the message didn't really pick one.
 */
export function matchEvent<T extends { name: string }>(text: string, events: T[]): T | undefined {
  const asked = new Set(words(text));
  const wordSets = events.map((e) => new Set(words(e.name)));
  const seen = new Map<string, number>();
  for (const set of wordSets) for (const w of set) seen.set(w, (seen.get(w) ?? 0) + 1);

  let best: T | undefined;
  let bestScore = 0;
  let tie = false;
  events.forEach((event, i) => {
    const score = [...wordSets[i]!].filter((w) => seen.get(w) === 1 && asked.has(w)).length;
    if (score > bestScore) {
      [best, bestScore, tie] = [event, score, false];
    } else if (score > 0 && score === bestScore) {
      tie = true;
    }
  });
  return tie ? undefined : best;
}

const AMOUNT = String.raw`(?:₹|rs\.?)?\s*(\d[\d,]*(?:\.\d{1,2})?)`;

function amountOf(raw: string | undefined) {
  const paise = raw ? parseRupees(raw) : null;
  return paise && paise > 0 ? paise : undefined;
}

export interface CashCommand {
  direction: Direction;
  amountPaise: number;
  counterparty: string;
  eventHint?: string;
}

const CASH = new RegExp(
  `^cash\\s+(in|out)\\s+${AMOUNT}\\s+(?:from|to)\\s+(.+?)(?:\\s+for\\s+(.+))?$`,
  'i',
);

/** "cash in 500 from Rahul Das", "cash out ₹300 to Tea stall for freshers" */
export function parseCashCommand(text: string): CashCommand | undefined {
  const m = CASH.exec(text.trim());
  const amountPaise = amountOf(m?.[2]);
  if (!m || !amountPaise) return undefined;
  return {
    direction: m[1]!.toLowerCase() as Direction,
    amountPaise,
    counterparty: m[3]!.trim(),
    ...(m[4] ? { eventHint: m[4].trim() } : {}),
  };
}

export interface TypedDetails {
  direction: Direction;
  amountPaise: number;
  counterparty: string;
  txnId?: string;
}

const DETAILS = new RegExp(`^${AMOUNT}\\s+(to|from)\\s+(.+?)(?:\\s+ref\\s+([a-z0-9 ]+))?$`, 'i');

/** "1200 to Decor Shop", "500 from Sneha Kulkarni ref 512006148831" */
export function parseDetails(text: string): TypedDetails | undefined {
  const m = DETAILS.exec(text.trim());
  const amountPaise = amountOf(m?.[1]);
  if (!m || !amountPaise) return undefined;
  return {
    direction: m[2]!.toLowerCase() === 'to' ? 'out' : 'in',
    amountPaise,
    counterparty: m[3]!.trim(),
    ...(m[4] ? { txnId: normaliseTxnId(m[4]) } : {}),
  };
}

const answer = (text: string) => normalise(text).replace(/[.,!]+$/, '');

// Words only: an admin's "1" and "2" belong to the save-or-fix question, never to a ping.
export const isYes = (text: string) =>
  /^(yes|y|yeah|yep|yup|haan|ha|correct|right|confirm)$/.test(answer(text));
export const isNo = (text: string) =>
  /^(no|n|nope|nah|wrong|not correct|incorrect)$/.test(answer(text));
