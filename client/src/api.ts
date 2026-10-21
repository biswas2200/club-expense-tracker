import type {
  ActivityDTO,
  CashCountDTO,
  CashDTO,
  EntryDTO,
  EventDTO,
  FeesDTO,
  MemberDTO,
  MyPaymentDTO,
} from '@nocap/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | undefined;

/** Lets the auth provider log the user out in the UI when the server says the session is gone. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isJson = init.body !== undefined && !(init.body instanceof FormData);
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: isJson ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  });
  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  me: () => request<MemberDTO>('/api/auth/me'),
  devMembers: () => request<MemberDTO[]>('/api/auth/dev-members'),
  devLogin: (memberId: string) => request<MemberDTO>('/api/auth/dev-login', json({ memberId })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  members: () => request<MemberDTO[]>('/api/members'),
  myPayments: () => request<MyPaymentDTO[]>('/api/me/payments'),
  activity: (eventId?: string) =>
    request<ActivityDTO[]>(
      eventId ? `/api/activity?eventId=${encodeURIComponent(eventId)}` : '/api/activity',
    ),

  events: () => request<EventDTO[]>('/api/events'),
  event: (id: string) => request<EventDTO>(`/api/events/${id}`),
  createEvent: (name: string, budgetPaise: number, feePaise: number) =>
    request<EventDTO>('/api/events', json({ name, budgetPaise, feePaise })),
  fees: (eventId: string) => request<FeesDTO>(`/api/events/${eventId}/fees`),
  cash: (eventId: string) => request<CashDTO>(`/api/events/${eventId}/cash`),
  countCash: (eventId: string, countedPaise: number, note?: string) =>
    request<CashCountDTO>(`/api/events/${eventId}/cash-counts`, json({ countedPaise, note })),

  entries: (eventId: string) => request<EntryDTO[]>(`/api/events/${eventId}/entries`),
  createEntry: (eventId: string, form: FormData) =>
    request<EntryDTO>(`/api/events/${eventId}/entries`, { method: 'POST', body: form }),
  history: (entryId: string) => request<EntryDTO[]>(`/api/entries/${entryId}/history`),
  verify: (entryId: string, form: FormData) =>
    request<EntryDTO>(`/api/entries/${entryId}/verifications`, { method: 'POST', body: form }),
};
