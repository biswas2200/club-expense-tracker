import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatPaise, parseRupees, type EventDTO } from '@nocap/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { Dialog } from '../components/Dialog';
import { BudgetMeter } from '../components/BudgetMeter';
import { useResource } from '../useResource';

export function EventsPage() {
  const { member } = useAuth();
  const { data: events, error } = useResource('events', api.events);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head">
        <h1>Events</h1>
        {member?.role === 'admin' && (
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            New event
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="alert">
          Could not load events: {error}
        </p>
      )}
      {events?.length === 0 && (
        <div className="empty">
          <p className="empty-title">No events yet</p>
          <p className="muted">
            {member?.role === 'admin'
              ? 'Create one to start recording money for it.'
              : 'An admin will add the first event.'}
          </p>
        </div>
      )}

      <div className="event-list">
        {events?.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {creating && <NewEventDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function EventCard({ event }: { event: EventDTO }) {
  const { summary } = event;
  return (
    <Link to={`/events/${event.id}`} className="event-card">
      <h2 className="event-card-name">{event.name}</h2>
      <BudgetMeter spentPaise={summary.spentPaise} budgetPaise={summary.budgetPaise} />
      <p className="event-card-foot">
        <span>
          Balance in hand{' '}
          <strong className={summary.balancePaise < 0 ? 'neg' : undefined}>
            {formatPaise(summary.balancePaise)}
          </strong>
        </span>
        <span className="muted">
          {summary.activeEntryCount} {summary.activeEntryCount === 1 ? 'entry' : 'entries'}
        </span>
      </p>
    </Link>
  );
}

function NewEventDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const budgetPaise = parseRupees(budget);
    if (!name.trim()) return setProblem('Give the event a name');
    if (budgetPaise === null) return setProblem('Enter a budget like 25000 or 25,000');
    setSaving(true);
    try {
      const event = await api.createEvent(name.trim(), budgetPaise);
      navigate(`/events/${event.id}`);
    } catch (err) {
      setProblem((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog title="New event" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {problem && (
          <p role="alert" className="alert">
            {problem}
          </p>
        )}
        <label className="field">
          <span className="field-label">Event name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Budget (₹)</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            placeholder="25,000"
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={saving}>
            Create event
          </button>
        </div>
      </form>
    </Dialog>
  );
}
