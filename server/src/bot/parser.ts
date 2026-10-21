import { z } from 'zod';
import {
  DIRECTIONS,
  MAX_PAISE,
  readPngText,
  SAMPLE_PAYMENT_KEY,
  type Direction,
} from '@nocap/shared';
import { normaliseTxnId } from '../lib/txnId';

/** What the bot needs from a payment screenshot. */
export interface ParsedPayment {
  amountPaise: number;
  direction: Direction;
  counterparty: string;
  txnId?: string;
  paidAt?: Date;
}

/**
 * Reads a payment screenshot. v0.3 ships the mock below; v0.5 adds an AI vision adapter
 * behind the same interface, and the mock stays for tests. undefined = could not read it.
 */
export interface ScreenshotParser {
  parse(image: Buffer): Promise<ParsedPayment | undefined>;
}

const sampleSchema = z.object({
  amountPaise: z.number().int().positive().max(MAX_PAISE),
  direction: z.enum(DIRECTIONS),
  counterparty: z.string().trim().min(1).max(120),
  txnId: z.string().trim().min(1).max(64).optional(),
  paidAt: z.string().datetime().optional(),
});

/**
 * Reads the payment a simulator sample screenshot carries in a PNG text chunk. Any other
 * image is "unreadable", which exercises the bot's ask-for-details path.
 */
export const mockScreenshotParser: ScreenshotParser = {
  async parse(image) {
    const text = readPngText(image, SAMPLE_PAYMENT_KEY);
    if (!text) return undefined;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return undefined;
    }
    const sample = sampleSchema.safeParse(json);
    if (!sample.success) return undefined;
    const { txnId, paidAt, ...rest } = sample.data;
    return {
      ...rest,
      ...(txnId ? { txnId: normaliseTxnId(txnId) } : {}),
      ...(paidAt ? { paidAt: new Date(paidAt) } : {}),
    };
  },
};
