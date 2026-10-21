/**
 * Every message the bot sends is one of these fixed templates filled with numbers from the
 * database. Even when an AI model reads the question (v0.5), it never writes the answer, so the
 * bot can't make up an amount. *text* is WhatsApp's bold.
 */
import {
  formatPaise,
  type Direction,
  type EntryDTO,
  type EventDTO,
  type FeeState,
  type FeesDTO,
  type Mode,
} from '@nocap/shared';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const firstName = (name: string) => name.split(' ')[0] ?? name;

const dayMonth = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fullDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
/** Payment dates are stored as UTC midnight, so they are shown in UTC to keep the day. */
export const shortDate = (d: Date) => dayMonth.format(d);
export const longDate = (d: Date) => fullDate.format(d);

export function unpaidReply(eventName: string, fees: FeesDTO): string {
  if (fees.feePaise === 0) return `${eventName} has no member fee.`;
  const total = Object.values(fees.counts).reduce((a, b) => a + b, 0);
  const owing = fees.rows.filter((r) => ['unpaid', 'partly', 'disputed'].includes(r.state));
  const lines = [
    `*${eventName}* · ${formatPaise(fees.feePaise)} fee`,
    `Paid: ${fees.counts.paid} of ${total}`,
  ];
  if (fees.counts.awaiting) lines.push(`Waiting for confirmation: ${fees.counts.awaiting}`);
  if (owing.length === 0) {
    lines.push('Everyone has paid.');
  } else {
    lines.push(`Not paid yet (${owing.length}):`);
    for (const r of owing) {
      const extra =
        r.state === 'partly'
          ? ` (${formatPaise(r.paidPaise)} of ${formatPaise(fees.feePaise)})`
          : r.state === 'disputed'
            ? ' (disputed)'
            : '';
      lines.push(`• ${r.member.name}${extra}`);
    }
  }
  return lines.join('\n');
}

export function remainingReply(event: EventDTO): string {
  const s = event.summary;
  const left =
    s.remainingBudgetPaise >= 0
      ? `Left in the budget: ${formatPaise(s.remainingBudgetPaise)} of ${formatPaise(s.budgetPaise)}`
      : `Over budget by ${formatPaise(-s.remainingBudgetPaise)} (budget ${formatPaise(s.budgetPaise)})`;
  return [
    `*${event.name}*`,
    left,
    `Spent: ${formatPaise(s.spentPaise)} · Collected: ${formatPaise(s.collectedPaise)}`,
  ].join('\n');
}

export function spentReply(event: EventDTO, entries: EntryDTO[]): string {
  const out = entries.filter(
    (e) => e.status === 'active' && e.direction === 'out' && e.amountPaise > 0,
  );
  if (out.length === 0) return `*${event.name}*\nNothing spent yet.`;
  const biggest = out.reduce((a, b) => (b.amountPaise > a.amountPaise ? b : a));
  const unverified = out
    .filter((e) => e.verification.state !== 'verified')
    .reduce((n, e) => n + e.amountPaise, 0);
  const lines = [
    `*${event.name}*`,
    `Spent so far: ${formatPaise(event.summary.spentPaise)} on ${plural(out.length, 'payment')}`,
    `Biggest: ${formatPaise(biggest.amountPaise)} to ${biggest.counterparty}`,
  ];
  if (unverified) lines.push(`Not verified yet: ${formatPaise(unverified)}`);
  return lines.join('\n');
}

export interface MyFee {
  eventName: string;
  feePaise: number;
  state: FeeState;
  paidPaise: number;
}

const FEE_LINE: Record<FeeState, (f: MyFee) => string> = {
  paid: (f) => `paid ${formatPaise(f.paidPaise)}, confirmed`,
  awaiting: (f) => `${formatPaise(f.paidPaise)} recorded, waiting for confirmation`,
  partly: (f) => `paid ${formatPaise(f.paidPaise)} of ${formatPaise(f.feePaise)}`,
  disputed: () => 'disputed, the committee will sort it out',
  unpaid: (f) => `not paid (${formatPaise(f.feePaise)} due)`,
};

export function myStatusReply(name: string, fees: MyFee[]): string {
  if (fees.length === 0) return 'No event has a fee right now.';
  return [
    `Your fees, ${firstName(name)}:`,
    ...fees.map((f) => `• ${f.eventName}: ${FEE_LINE[f.state](f)}`),
  ].join('\n');
}

export const viewerStatusReply = (name: string) =>
  `${firstName(name)}, you're a viewer, so there are no fees for you.`;

const ASK_LINES = [
  '• who hasn’t paid for freshers?',
  '• how much is left for freshers?',
  '• how much was spent on freshers?',
  '• my status',
];

export function helpReply(mode: 'group' | 'admin' | 'member'): string {
  if (mode === 'group') {
    return ['Tag me with a question:', ...ASK_LINES.map((l) => l.replace('• ', '• @NoCap '))].join(
      '\n',
    );
  }
  const lines = ['You can ask me:', ...ASK_LINES];
  if (mode === 'admin') {
    lines.push(
      '',
      'To record a UPI payment, send me the screenshot. Add the event name as the caption.',
      'To record cash, type: cash in 500 from Rahul Das, or cash out 300 to Tea stall for freshers',
    );
  }
  return lines.join('\n');
}

export const notUnderstood = (mode: 'group' | 'admin' | 'member') =>
  `Sorry, I didn't get that.\n${helpReply(mode)}`;

export const NOT_REGISTERED =
  "This number isn't registered with NoCap. Ask a committee member to add you.";
export const ONLY_ADMINS =
  'Only committee members can record payments. If you paid someone, send the screenshot to an admin.';
export const PRIVATE_ONLY = 'Please send payment screenshots to me in a private chat.';
export const IMAGES_ONLY = 'I can only read a screenshot or photo (JPG, PNG or WebP).';
export const NO_EVENTS = 'There are no events yet. Create one in the NoCap app first.';

/** "₹1,200 paid to Decor Shop by UPI" */
export function describePayment(p: {
  amountPaise: number;
  direction: Direction;
  counterparty: string;
  mode: Mode;
  isMember?: boolean;
}) {
  const way = p.direction === 'in' ? 'received from' : 'paid to';
  const how = p.mode === 'upi' ? 'by UPI' : 'in cash';
  return `${formatPaise(p.amountPaise)} ${way} ${p.counterparty}${p.isMember ? ' (club member)' : ''} ${how}`;
}

export function draftReply(d: {
  amountPaise: number;
  direction: Direction;
  counterparty: string;
  mode: Mode;
  isMember: boolean;
  txnId?: string;
  occurredAt: Date;
  eventName: string;
}) {
  return [
    'Save this?',
    describePayment(d),
    ...(d.txnId ? [`UPI ref: ${d.txnId}`] : []),
    `Event: ${d.eventName}`,
    `Date: ${longDate(d.occurredAt)}`,
    'Reply 1 to save, 2 to fix.',
  ].join('\n');
}

export const FIX_MENU = [
  'What should I fix?',
  '1 Amount',
  '2 Name',
  '3 Money in or out',
  '4 Event',
  '5 Cancel (don’t save)',
].join('\n');

export const ASK_AMOUNT = 'Send the right amount in rupees, like 1200.';
export const BAD_AMOUNT = "That doesn't look like an amount. Send just the number, like 1200.";
export const ASK_NAME = 'Send the right name: who paid, or who was paid.';
export const CANCELLED = 'Cancelled. Nothing was saved.';
export const NOTHING_TO_SAVE =
  'There’s nothing waiting to be saved. Send a screenshot, or type a cash entry like: cash in 500 from Rahul Das';
export const ASK_DETAILS = [
  "I couldn't read the payment in this screenshot. Type it like this:",
  '1200 to Decor Shop',
  'or 500 from Sneha Kulkarni ref 512006148831',
].join('\n');

export const pickEventReply = (names: string[]) =>
  ['Which event?', ...names.map((n, i) => `${i + 1} ${n}`)].join('\n');

export function savedReply(eventName: string, confirmer: string | undefined) {
  const next = confirmer
    ? `I’ve asked ${confirmer} to confirm it.`
    : 'Another admin needs to check it in the app.';
  return `Saved ✓ It's in ${eventName} as unverified. ${next}`;
}

export function duplicateReply(d: {
  txnId: string;
  description: string;
  eventName: string;
  recordedBy: string;
}) {
  return `This UPI payment (ref ${d.txnId}) is already recorded: ${d.description} in ${d.eventName}, by ${d.recordedBy}. I didn't save it again.`;
}

export function pingText(p: {
  confirmerName: string;
  recordedBy: string;
  amountPaise: number;
  direction: Direction;
  mode: Mode;
  /** set when the confirmer paid for someone else */
  forName?: string;
  eventName: string;
  occurredAt: Date;
}) {
  const how = p.mode === 'upi' ? 'by UPI' : 'in cash';
  const what =
    p.direction === 'out'
      ? `the club paid you ${formatPaise(p.amountPaise)} ${how}`
      : `you paid ${formatPaise(p.amountPaise)}${p.forName ? ` for ${p.forName}` : ''} ${how}`;
  return `Hi ${firstName(p.confirmerName)}, ${p.recordedBy} recorded that ${what} for ${p.eventName} on ${shortDate(p.occurredAt)}. Is that right? Reply YES or NO.`;
}

export const ASK_WHATS_WRONG = 'What’s wrong? Reply in a few words, like: I paid ₹300, not ₹500.';
export const thanksConfirmed = (name: string) =>
  `Thanks, ${firstName(name)}. I've marked it as confirmed.`;
export const thanksDisputed = (name: string) =>
  `Thanks, ${firstName(name)}. I've marked it as disputed; the committee can see your note.`;
export const NOTHING_TO_ANSWER = 'There’s nothing waiting for your answer right now.';
export const ALREADY_ANSWERED = 'You already answered this one in the app.';
