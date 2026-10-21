import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import type { MemberDTO, Role } from '@nocap/shared';
import { api } from '../api';
import { initials } from '../format';
import { useAuth } from '../auth';
import { useResource } from '../useResource';

const GROUPS: { role: Role; title: string; can: string }[] = [
  { role: 'admin', title: 'Admins', can: 'Add entries and corrections' },
  { role: 'member', title: 'Members', can: 'See every entry and its proof' },
  { role: 'viewer', title: 'Viewers', can: 'Read-only, for the faculty coordinator' },
];

export function LoginPage() {
  const { member, checking, logIn } = useAuth();
  const navigate = useNavigate();
  const { data: people, error } = useResource('dev-members', api.devMembers);
  const [failed, setFailed] = useState<string | null>(null);

  if (!checking && member) return <Navigate to="/" replace />;

  async function choose(person: MemberDTO) {
    try {
      await logIn(person.id);
      navigate('/');
    } catch (err) {
      setFailed((err as Error).message);
    }
  }

  return (
    <main className="login">
      <div className="login-intro">
        <p className="wordmark wordmark-large">NoCap</p>
        <p className="tagline">No cap, where every rupee went.</p>
      </div>

      <div className="login-panel">
        <h1>Who is using NoCap?</h1>
        <p className="muted">
          This is the local development login. Pick a person to see the app the way they would.
          Phone and PIN login replaces it in v0.4.
        </p>
        {(error || failed) && (
          <p role="alert" className="alert">
            {failed ??
              `Could not load people: ${error}. Is the API running and the database seeded?`}
          </p>
        )}

        {GROUPS.map((group) => (
          <section
            key={group.role}
            aria-labelledby={`group-${group.role}`}
            className="people-group"
          >
            <div className="people-group-head">
              <h2 id={`group-${group.role}`}>{group.title}</h2>
              <span className="muted">{group.can}</span>
            </div>
            <div className="people">
              {people
                ?.filter((p) => p.role === group.role)
                .map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="person"
                    onClick={() => choose(person)}
                  >
                    <span className="avatar" aria-hidden="true">
                      {initials(person.name)}
                    </span>
                    {person.name}
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
