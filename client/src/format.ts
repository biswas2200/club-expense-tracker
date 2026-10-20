import type { Role } from '@nocap/shared';

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
const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** Payment dates are stored as UTC midnight, so they are formatted in UTC to keep the day. */
export const formatPaymentDate = (iso: string) => fullDate.format(new Date(iso));

export function paymentDateParts(iso: string) {
  const [day = '', month = ''] = dayMonth.format(new Date(iso)).split(' ');
  return { day, month };
}

export const formatTimestamp = (iso: string) => dateTime.format(new Date(iso));

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

/** Today's date in the user's time zone as YYYY-MM-DD, for date inputs. */
export function todayInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
