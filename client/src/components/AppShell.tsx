import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { bugReportUrl } from '@nocap/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { ROLE_LABEL } from '../format';

// Bug reports go to the project's public issue tracker. Point VITE_BUG_TRACKER_URL at another
// GitHub or Forgejo (Codeberg) repository to move them.
const TRACKER_URL =
  import.meta.env.VITE_BUG_TRACKER_URL ?? 'https://github.com/biswas2200/club-expense-tracker';

/** Header and page frame for logged-in pages. Sends logged-out visitors to /login. */
export function AppShell() {
  const { member, checking, logOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState<number | undefined>(undefined);

  // Refresh "waiting for me" on every page change, so it drops as soon as I respond.
  useEffect(() => {
    if (!member) return;
    let cancelled = false;
    api
      .myPayments()
      .then((rows) => !cancelled && setPending(rows.filter((r) => r.canRespond).length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [member, location.key]);

  if (checking) return <p className="page-status">Loading…</p>;
  if (!member) return <Navigate to="/login" replace />;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark" aria-label="NoCap home">
            NoCap
            <span className="wordmark-club">Sparks Club</span>
          </Link>
          <div className="whoami">
            <span className="whoami-name">{member.name}</span>
            <span className={`role-badge role-${member.role}`}>{ROLE_LABEL[member.role]}</span>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              onClick={async () => {
                await logOut();
                navigate('/login');
              }}
            >
              Log out
            </button>
          </div>
        </div>
        <nav className="mainnav" aria-label="Main">
          <NavLink to="/" end>
            Events
          </NavLink>
          <NavLink to="/me/payments" data-pending={pending}>
            My payments
            {pending ? <span className="count-badge">{pending}</span> : null}
          </NavLink>
          <NavLink to="/activity">Activity</NavLink>
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="pagefoot">
        <a
          href={bugReportUrl({
            trackerUrl: TRACKER_URL,
            version: import.meta.env.VITE_APP_VERSION,
            page: location.pathname,
            role: member.role,
            userAgent: navigator.userAgent,
            now: new Date(),
          })}
          target="_blank"
          rel="noopener noreferrer"
        >
          Report a bug
        </a>
        <span className="pagefoot-version">NoCap v{import.meta.env.VITE_APP_VERSION}</span>
      </footer>
    </>
  );
}
