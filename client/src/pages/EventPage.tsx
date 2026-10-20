import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { EntryDTO } from '@nocap/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { EntryFormDialog } from '../components/EntryFormDialog';
import { EntryList } from '../components/EntryList';
import { HistoryDialog } from '../components/HistoryDialog';
import { LedgerTotals } from '../components/LedgerTotals';
import { useResource } from '../useResource';

type FormState = { kind: 'add' } | { kind: 'correct'; entry: EntryDTO } | null;

export function EventPage() {
  const { eventId = '' } = useParams();
  const { member } = useAuth();
  const event = useResource(`event-${eventId}`, () => api.event(eventId));
  const entries = useResource(`entries-${eventId}`, () => api.entries(eventId));
  const [form, setForm] = useState<FormState>(null);
  const [historyOf, setHistoryOf] = useState<EntryDTO | null>(null);
  const isAdmin = member?.role === 'admin';

  if (event.error) {
    return (
      <div className="empty">
        <p className="empty-title">{event.error}</p>
        <Link to="/">Back to all events</Link>
      </div>
    );
  }
  if (!event.data) return <p className="page-status">Loading…</p>;

  const count = entries.data?.length ?? 0;

  return (
    <>
      <Link to="/" className="back-link">
        All events
      </Link>
      <div className="page-head">
        <h1 className="event-title">{event.data.name}</h1>
        {isAdmin && (
          <button type="button" className="btn" onClick={() => setForm({ kind: 'add' })}>
            Add entry
          </button>
        )}
      </div>

      <div className="event-layout">
        <LedgerTotals summary={event.data.summary} />

        <section className="ledger-section" aria-labelledby="ledger-heading">
          <div className="ledger-head">
            <h2 id="ledger-heading">Ledger</h2>
            <span className="muted">
              {count} {count === 1 ? 'entry' : 'entries'}, newest first
            </span>
          </div>
          {entries.error && (
            <p role="alert" className="alert">
              Could not load entries: {entries.error}
            </p>
          )}
          {entries.data?.length === 0 ? (
            <div className="empty empty-ledger">
              <p className="empty-title">No entries yet</p>
              <p className="muted">
                {isAdmin
                  ? 'Add the first payment or collection, with its screenshot or bill.'
                  : 'Entries appear here as soon as an admin records them.'}
              </p>
            </div>
          ) : (
            entries.data && (
              <EntryList
                entries={entries.data}
                canCorrect={isAdmin}
                onCorrect={(entry) => setForm({ kind: 'correct', entry })}
                onHistory={setHistoryOf}
              />
            )
          )}
        </section>
      </div>

      {form && (
        <EntryFormDialog
          eventId={eventId}
          correcting={form.kind === 'correct' ? form.entry : undefined}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            event.reload();
            entries.reload();
          }}
        />
      )}
      {historyOf && <HistoryDialog entry={historyOf} onClose={() => setHistoryOf(null)} />}
    </>
  );
}
