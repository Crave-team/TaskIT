import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import WorkspacePage from './pages/WorkspacePage';
import CalendarPage from './pages/CalendarPage';
import TeamPage from './pages/TeamPage';
import SettingsPage from './pages/SettingsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminWorkspacePage from './pages/admin/AdminWorkspacePage';
import AdminTeamPage from './pages/admin/AdminTeamPage';
import UsersPage from './pages/admin/UsersPage';
import SystemSettingsPage from './pages/admin/SystemSettingsPage';
import ActivityLogPage from './pages/admin/ActivityLogPage';
import LegalPage from './pages/LegalPage';
import HomePage from './pages/HomePage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { useTasks } from './context/TaskContext';

/**
 * Root route table. The homepage (/), /privacy and /terms are public (log-in and sign-up are popups on the
 * homepage; /login and /signup just open them); every other route is wrapped in ProtectedRoute
 * so it redirects to the homepage log-in popup when signed out. The signed-in dashboard lives at /dashboard.
 * /users, /system and /activity additionally require an admin account, and the
 * Dashboard, My Workspace and Team routes show the site-wide admin version of
 * those pages to an admin (members get their own).
 */
/** Shows the super-admin page to admins and the regular page to everyone else. */
function ByRole({ admin, member }) {
  const { currentUser } = useAuth();
  return currentUser?.accountRole === 'admin' ? admin : member;
}

const PAGE_LABELS = {
  '/dashboard': ['Dashboard', 'other'],
  '/tasks': ['My Workspace', 'workspace'],
  '/team': ['Team', 'team'],
  '/calendar': ['Calendar', 'other'],
  '/settings': ['Settings', 'other'],
  '/users': ['Users', 'other'],
  '/system': ['System Settings', 'other'],
  '/activity': ['Activity Log', 'other'],
};

/** Records every page a signed-in person opens, for the admin's Activity Log. */
function AccessTracker() {
  const { pathname } = useLocation();
  const { currentUser } = useAuth();
  const { logAccess } = useTasks();
  const last = useRef('');
  const userId = currentUser?.id ?? null;
  useEffect(() => {
    if (!userId) {
      last.current = '';
      return;
    }
    const info = PAGE_LABELS[pathname];
    const key = `${userId}:${pathname}`;
    if (!info || last.current === key) return;
    last.current = key;
    logAccess('opened', info[0], info[1]);
  }, [pathname, userId, logAccess]);
  return null;
}

/** Old /groups links (invite links included) now live under the Team hub. */
function GroupsRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.has('group')) {
    params.set('team', params.get('group'));
    params.delete('group');
  }
  const qs = params.toString();
  return <Navigate to={`/team${qs ? `?${qs}` : ''}`} replace />;
}

export default function App() {
  return (
    <>
    <AccessTracker />
    <Routes>
      {/* The old stand-alone log-in page is gone: /login opens the homepage log-in popup. */}
      <Route path="/login" element={<Navigate to="/?auth=login" replace />} />
      <Route path="/signup" element={<Navigate to="/?auth=signup" replace />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/" element={<HomePage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <ByRole admin={<AdminDashboardPage />} member={<Dashboard />} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <ByRole admin={<AdminWorkspacePage />} member={<WorkspacePage />} />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <Navigate to="/tasks" replace />
        }
      />
      <Route path="/groups" element={<GroupsRedirect />} />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <CalendarPage />
          </ProtectedRoute>
        }
      />
      {/* Reports now live inside each team (Team → Reports tab). */}
      <Route path="/reports" element={<Navigate to="/team" replace />} />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <ByRole admin={<AdminTeamPage />} member={<TeamPage />} />
          </ProtectedRoute>
        }
      />
      {/* The old Admin Panel is now "Users"; System Settings and the Activity Log are their own menu items. */}
      <Route path="/admin" element={<Navigate to="/users" replace />} />
      <Route path="/users" element={<ProtectedRoute requireRole="admin"><UsersPage /></ProtectedRoute>} />
      <Route path="/system" element={<ProtectedRoute requireRole="admin"><SystemSettingsPage /></ProtectedRoute>} />
      <Route path="/activity" element={<ProtectedRoute requireRole="admin"><ActivityLogPage /></ProtectedRoute>} />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

