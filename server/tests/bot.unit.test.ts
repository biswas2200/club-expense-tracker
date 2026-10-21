import { describe, expect, it } from 'vitest';
import { addPngText, SAMPLE_PAYMENT_KEY, type FeesDTO } from '@nocap/shared';
import {
  isNo,
  isYes,
  matchEvent,
  matchIntent,
  parseCashCommand,
  parseDetails,
} from '../src/bot/intents';
import { mockScreenshotParser } from '../src/bot/parser';
import {
  helpReply,
  myStatusReply,
  remainingReply,
  spentReply,
  unpaidReply,
} from '../src/bot/replies';
import { placeholderPng } from './helpers';

describe('matchIntent', () => {
  it.each([
    ['@NoCap who hasn’t paid for freshers?', 'unpaid'],
    ['who hasnt paid', 'unpaid'],
    ["who hasn't paid yet", 'unpaid'],
    ['unpaid list please', 'unpaid'],
    ['who still owes money?', 'unpaid'],
    ['pending fees', 'unpaid'],
    ['how much is left for the fest?', 'remaining'],
    ['remaining budget', 'remaining'],
    ['balance?', 'remaining'],
    ['how much was spent on freshers', 'spent'],
    ['total expenses', 'spent'],
    ['my status', 'my-status'],
    ['Have I paid?', 'my-status'],
    ['did i pay for freshers', 'my-status'],
    ['help', 'help'],
    ['Hi', 'help'],
  ])('reads %j as %s', (text, intent) => {
    expect(matchIntent(text)).toBe(intent);
  });

  it('returns nothing for questions it has no keyword for', () => {
    expect(matchIntent('what is the weather like')).toBeUndefined();
    expect(matchIntent('')).toBeUndefined();
  });
});

describe('matchEvent', () => {
  const events = [{ name: 'Tech Fest 2026' }, { name: 'Freshers Party 2026' }];

  it.each([
    ["who hasn't paid for freshers?", 'Freshers Party 2026'],
    ['fresher party spending', 'Freshers Party 2026'],
    ['how much is left for the fest', 'Tech Fest 2026'],
    ['TECH FEST', 'Tech Fest 2026'],
  ])('finds the event named in %j', (text, name) => {
    expect(matchEvent(text, events)?.name).toBe(name);
  });

  it('ignores words every event shares, and questions that name no event', () => {
    expect(matchEvent('how much is left in 2026', events)).toBeUndefined();
    expect(matchEvent('how much is left', events)).toBeUndefined();
  });
});

describe('parseCashCommand', () => {
  it('reads cash in and cash out with an optional event', () => {
    expect(parseCashCommand('cash in 500 from Rahul Das')).toEqual({
      direction: 'in',
      amountPaise: 50000,
      counterparty: 'Rahul Das',
    });
    expect(parseCashCommand('Cash out ₹1,250.50 to Tea stall for freshers')).toEqual({
      direction: 'out',
      amountPaise: 125050,
      counterparty: 'Tea stall',
      eventHint: 'freshers',
    });
    expect(parseCashCommand('cash in Rs 300 from Meera')?.amountPaise).toBe(30000);
  });

  it('ignores anything else, and zero amounts', () => {
    expect(parseCashCommand('cash 500')).toBeUndefined();
    expect(parseCashCommand('pay 500 to Tea stall')).toBeUndefined();
    expect(parseCashCommand('cash in 0 from Rahul')).toBeUndefined();
  });
});

describe('parseDetails', () => {
  it('reads typed payment details with an optional UPI ref', () => {
    expect(parseDetails('1200 to Decor Shop')).toEqual({
      direction: 'out',
      amountPaise: 120000,
      counterparty: 'Decor Shop',
    });
    expect(parseDetails('₹500 from Sneha Kulkarni ref 5120 0614 8831')).toEqual({
      direction: 'in',
      amountPaise: 50000,
      counterparty: 'Sneha Kulkarni',
      txnId: '512006148831',
    });
  });

  it('ignores text in another shape', () => {
    expect(parseDetails('decor shop 1200')).toBeUndefined();
    expect(parseDetails('0 to Decor Shop')).toBeUndefined();
  });
});

describe('yes and no', () => {
  it.each(['YES', 'yes.', 'y', 'Yes!', 'haan', 'correct'])('%j is yes', (t) => {
    expect(isYes(t)).toBe(true);
    expect(isNo(t)).toBe(false);
  });
  it.each(['no', 'NO', 'n', 'nope', 'wrong'])('%j is no', (t) => {
    expect(isNo(t)).toBe(true);
    expect(isYes(t)).toBe(false);
  });
  it('treats a sentence as neither', () => {
    expect(isYes('yes I paid 300 not 500')).toBe(false);
    expect(isNo('no idea')).toBe(false);
  });
});

describe('mock screenshot parser', () => {
  const sample = (fields: unknown) =>
    Buffer.from(addPngText(placeholderPng(), SAMPLE_PAYMENT_KEY, JSON.stringify(fields)));

  it('reads the payment a sample screenshot carries', async () => {
    const parsed = await mockScreenshotParser.parse(
      sample({
        amountPaise: 120000,
        direction: 'out',
        counterparty: 'Decor Shop',
        txnId: '512014334210',
        paidAt: '2026-10-14T10:12:00.000Z',
      }),
    );
    expect(parsed).toEqual({
      amountPaise: 120000,
      direction: 'out',
      counterparty: 'Decor Shop',
      txnId: '512014334210',
      paidAt: new Date('2026-10-14T10:12:00.000Z'),
    });
  });

  it('cannot read real screenshots or broken sample data', async () => {
    expect(await mockScreenshotParser.parse(placeholderPng())).toBeUndefined();
    expect(await mockScreenshotParser.parse(sample({ amountPaise: -5 }))).toBeUndefined();
    const broken = Buffer.from(addPngText(placeholderPng(), SAMPLE_PAYMENT_KEY, '{not json'));
    expect(await mockScreenshotParser.parse(broken)).toBeUndefined();
  });
});

describe('reply templates', () => {
  const fees: FeesDTO = {
    feePaise: 50000,
    counts: { unpaid: 1, partly: 1, disputed: 1, awaiting: 2, paid: 4 },
    rows: [
      { member: { id: '1', name: 'Arjun Rao' }, state: 'unpaid', paidPaise: 0, paidBy: [] },
      { member: { id: '2', name: 'Kiran' }, state: 'partly', paidPaise: 20000, paidBy: [] },
      { member: { id: '3', name: 'Meera Joshi' }, state: 'disputed', paidPaise: 50000, paidBy: [] },
    ],
  };

  it('lists who has not paid, with the fee and the counts', () => {
    const text = unpaidReply('Freshers Party 2026', fees);
    expect(text).toContain('*Freshers Party 2026*');
    expect(text).toContain('₹500 fee');
    expect(text).toContain('Paid: 4 of 9');
    expect(text).toContain('Waiting for confirmation: 2');
    expect(text).toContain(
      'Not paid yet (3):\n• Arjun Rao\n• Kiran (₹200 of ₹500)\n• Meera Joshi (disputed)',
    );
  });

  it('says when everyone has paid, and when there is no fee', () => {
    const allPaid: FeesDTO = {
      ...fees,
      rows: [],
      counts: { ...fees.counts, unpaid: 0, partly: 0, disputed: 0 },
    };
    expect(unpaidReply('Fest', allPaid)).toContain('Everyone has paid');
    expect(unpaidReply('Tech Fest 2026', { ...fees, feePaise: 0 })).toBe(
      'Tech Fest 2026 has no member fee.',
    );
  });

  const summary = {
    budgetPaise: 2500000,
    collectedPaise: 1800000,
    spentPaise: 1143000,
    remainingBudgetPaise: 1357000,
    balancePaise: 657000,
    activeEntryCount: 10,
    unverifiedCount: 6,
    unverifiedPaise: 828000,
    disputedCount: 1,
    cashExpectedPaise: 127000,
  };
  const event = {
    id: 'e',
    name: 'Freshers Party 2026',
    budgetPaise: 2500000,
    feePaise: 50000,
    createdAt: '',
    summary,
  };

  it('answers how much is left from the event totals', () => {
    const text = remainingReply(event);
    expect(text).toContain('Left in the budget: ₹13,570 of ₹25,000');
    expect(text).toContain('Spent: ₹11,430');
    expect(text).toContain('Collected: ₹18,000');
    const over = remainingReply({
      ...event,
      summary: { ...summary, remainingBudgetPaise: -50000 },
    });
    expect(over).toContain('Over budget by ₹500');
  });

  it('answers how much was spent, with the biggest payment and what is unverified', () => {
    const entry = (amountPaise: number, counterparty: string, state = 'verified') =>
      ({
        direction: 'out',
        amountPaise,
        counterparty,
        status: 'active',
        verification: { state },
      }) as never;
    const text = spentReply(event, [
      entry(600000, 'Sound & Lights Co.'),
      entry(20000, 'Tea stall', 'unverified'),
    ]);
    expect(text).toContain('Spent so far: ₹11,430 on 2 payments');
    expect(text).toContain('Biggest: ₹6,000 to Sound & Lights Co.');
    expect(text).toContain('Not verified yet: ₹200');
    expect(spentReply(event, [])).toContain('Nothing spent yet');
  });

  it('describes a person’s fee status in each event that has a fee', () => {
    const text = myStatusReply('Sneha Kulkarni', [
      { eventName: 'Freshers Party 2026', feePaise: 50000, state: 'paid', paidPaise: 50000 },
      { eventName: 'Fest', feePaise: 30000, state: 'awaiting', paidPaise: 30000 },
      { eventName: 'Trip', feePaise: 100000, state: 'unpaid', paidPaise: 0 },
    ]);
    expect(text).toContain('Sneha');
    expect(text).toContain('• Freshers Party 2026: paid ₹500, confirmed');
    expect(text).toContain('• Fest: ₹300 recorded, waiting for confirmation');
    expect(text).toContain('• Trip: not paid (₹1,000 due)');
    expect(myStatusReply('Sneha Kulkarni', [])).toContain('No event has a fee');
  });

  it('shows admins how to record payments, and everyone how to ask', () => {
    expect(helpReply('admin')).toContain('cash in 500 from');
    expect(helpReply('admin')).toContain('screenshot');
    expect(helpReply('group')).toContain('@NoCap');
    expect(helpReply('member')).not.toContain('cash in');
  });
});
