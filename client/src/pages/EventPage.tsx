import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { EntryDTO } from '@nocap/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { ActivityList } from '../components/ActivityList';
import { CashPanel } from '../components/CashPanel';
import { EntryFormDialog } from '../components/EntryFormDialog';
import { EntryList } from '../components/EntryList';
import { FeesPanel } from '../components/FeesPanel';
import { HistoryDialog } from '../components/HistoryDialog';
import { LedgerTotals } from '../components/LedgerTotals';
import { VerifyDialog } from '../components/VerifyDialog';
import { useResource } from '../useResource';

type FormState = { kind: 'add' } | { kind: 'correct'; entry: EntryDTO } | null;
const TABS = [
  ['ledger', 'Ledger'],
  ['fees', 'Fees'],
  ['cash', 'Cash'],
  ['activity', 'Activity'],
] as const;
type TabId = (typeof TABS)[number][0];

export function EventPage() {
  const { eventId = '' } = useParams();
  const { member } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.some(([id]) => id === params.get('tab'))
    ? (params.get('tab') as TabId)
    : 'ledger';
  // Bumped after every change so totals and every panel reload together.
  const [refreshKey, setRefreshKey] = useState(0);
  const event = useResource(`event-${eventId}-${refreshKey}`, () => api.event(eventId));
  const entries = useResource(`entries-${eventId}-${refreshKey}`, () => api.entries(eventId));
  const [form, setForm] = useState<FormState>(null);
  const [historyOf, setHistoryOf] = useState<EntryDTO | null>(null);
  const [checking, setChecking] = useState<{ entry: EntryDTO; asAdmin: boolean } | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isAdmin = member?.role === 'admin';
  const refresh = () => setRefreshKey((k) => k + 1);

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
  const select = (id: TabId) => setParams(id === 'ledger' ? {} : { tab: id }, { replace: true });
  function onTabKey(e: KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const [next] = TABS.at((index + step) % TABS.length)!;
    select(next);
    tabRefs.current[next]?.focus();
  }

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

        <div className="event-main">
          <div role="tablist" aria-label="Event sections" className="tabs">
            {TABS.map(([id, label], index) => (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-controls={`panel-${id}`}
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => select(id)}
                onKeyDown={(e) => onTabKey(e, index)}
              >
                {label}
              </button>
            ))}
          </div>

          <section
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="tabpanel"
          >
            {tab === 'ledger' && (
              <div className="ledger-section">
                <div className="ledger-head">
                  <h2>Ledger</h2>
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
                      me={member}
                      onCorrect={(entry) => setForm({ kind: 'correct', entry })}
                      onHistory={setHistoryOf}
                      onCheck={(entry, asAdmin) => setChecking({ entry, asAdmin })}
                    />
                  )
                )}
              </div>
            )}
            {tab === 'fees' && <FeesPanel eventId={eventId} refreshKey={refreshKey} />}
            {tab === 'cash' && (
              <CashPanel
                eventId={eventId}
                refreshKey={refreshKey}
                canCount={isAdmin}
                onCounted={refresh}
              />
            )}
            {tab === 'activity' && <EventActivity eventId={eventId} refreshKey={refreshKey} />}
          </section>
        </div>
      </div>

      {form && (
        <EntryFormDialog
          eventId={eventId}
          correcting={form.kind === 'correct' ? form.entry : undefined}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            refresh();
          }}
        />
      )}
      {historyOf && <HistoryDialog entry={historyOf} onClose={() => setHistoryOf(null)} />}
      {checking && (
        <VerifyDialog
          entry={checking.entry}
          asAdmin={checking.asAdmin}
          onClose={() => setChecking(null)}
          onSaved={() => {
            setChecking(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function EventActivity({ eventId, refreshKey }: { eventId: string; refreshKey: number }) {
  const { data, error } = useResource(`activity-${eventId}-${refreshKey}`, () =>
    api.activity(eventId),
  );
  if (error)
    return (
      <p role="alert" className="alert">
        Could not load activity: {error}
      </p>
    );
  return data ? <ActivityList items={data} /> : <p className="page-status">Loading…</p>;
}
