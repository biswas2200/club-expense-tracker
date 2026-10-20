import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import '@fontsource-variable/anek-latin/wdth.css';
import './styles.css';
import { AuthProvider } from './auth';
import { AppShell } from './components/AppShell';
import { EventPage } from './pages/EventPage';
import { EventsPage } from './pages/EventsPage';
import { LoginPage } from './pages/LoginPage';

function NotFound() {
  return (
    <div className="empty">
      <p className="empty-title">That page does not exist</p>
      <Link to="/">Go to events</Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<EventsPage />} />
            <Route path="events/:eventId" element={<EventPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
