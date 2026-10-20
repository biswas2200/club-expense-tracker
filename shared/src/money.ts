/**
 * Money is stored and sent as whole paise (integers) everywhere. Rupee strings only exist
 * at the edges: what a person types into a form and what the UI shows.
 */

/** ₹1 crore. Anything larger is almost certainly a typo for a student club. */
export const MAX_PAISE = 1_000_000_000;

const RUPEE_INPUT = /^\d[\d,]*(\.\d{1,2})?$/;

/** Parses a rupee amount typed by a person ("1,200.50") into paise. Returns null if invalid. */
export function parseRupees(input: string): number | null {
  const text = input.trim();
  if (!RUPEE_INPUT.test(text) || /,,|,\.|,$/.test(text)) return null;

  const [whole = '', fraction = ''] = text.replace(/,/g, '').split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise) || paise > MAX_PAISE) return null;
  return paise;
}

const formatters = new Map<boolean, Intl.NumberFormat>();

function formatter(withPaise: boolean): Intl.NumberFormat {
  let f = formatters.get(withPaise);
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: withPaise ? 2 : 0,
      maximumFractionDigits: 2,
    });
    formatters.set(withPaise, f);
  }
  return f;
}

/** Formats paise for display with Indian digit grouping: 12000000 → "₹1,20,000". */
export function formatPaise(paise: number): string {
  return formatter(paise % 100 !== 0).format(paise / 100);
}

/** Converts paise back to a plain rupee string for prefilling a form: 120050 → "1200.50". */
export function paiseToRupeeInput(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, '0')}`;
}
