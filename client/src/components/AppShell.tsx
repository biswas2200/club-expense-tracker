import { Link, Navigate, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { ROLE_LABEL } from '../format';

/** Header and page frame for logged-in pages. Sends logged-out visitors to /login. */
export function AppShell() {
  const { member, checking, logOut } = useAuth();
  const navigate = useNavigate();

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
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
