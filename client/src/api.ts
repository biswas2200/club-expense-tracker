import type { EntryDTO, EventDTO, MemberDTO } from '@nocap/shared';

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

export const api = {
  me: () => request<MemberDTO>('/api/auth/me'),
  devMembers: () => request<MemberDTO[]>('/api/auth/dev-members'),
  devLogin: (memberId: string) =>
    request<MemberDTO>('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  events: () => request<EventDTO[]>('/api/events'),
  event: (id: string) => request<EventDTO>(`/api/events/${id}`),
  createEvent: (name: string, budgetPaise: number) =>
    request<EventDTO>('/api/events', {
      method: 'POST',
      body: JSON.stringify({ name, budgetPaise }),
    }),

  entries: (eventId: string) => request<EntryDTO[]>(`/api/events/${eventId}/entries`),
  createEntry: (eventId: string, form: FormData) =>
    request<EntryDTO>(`/api/events/${eventId}/entries`, { method: 'POST', body: form }),
  history: (entryId: string) => request<EntryDTO[]>(`/api/entries/${entryId}/history`),
};
