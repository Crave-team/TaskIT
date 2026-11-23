import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { ForgotPasswordForm } from './ForgotPasswordModal';

const TITLES = { login: 'Log in to TaskIT', admin: 'Admin log in', signup: 'Create your account', 'admin-signup': 'Create an admin account', forgot: 'Reset your password' };

/**
 * The dialog itself. Mounted only while open, so its fields start fresh every time. WHICH view is showing is owned by
 * the caller (the homepage keeps it in the address as ?auth=), so a refresh brings back the same popup.
 */
function AuthModalInner({ view, setView, onClose, redirectTo }) {
  const navigate = useNavigate();
  const [notice, setNotice] = useState('');
  // Google sign-up already signs the person in: no "log in with your new password" step.
  const enterApp = () => {
    onClose();
    navigate(redirectTo, { replace: true });
  };

  return (
    <Modal open onClose={onClose} title={TITLES[view]}>
      {view === 'login' && (
        <LoginForm
          autoFocusEmail
          notice={notice}
          onSuccess={() => {
            onClose();
            navigate(redirectTo, { replace: true });
          }}
          onForgot={() => setView('forgot')}
          onSwitchToSignup={() => { setNotice(''); setView('signup'); }}
        />
      )}
      {view === 'admin' && (
        <LoginForm
          role="admin"
          notice={notice}
          autoFocusEmail
          onSuccess={() => {
            onClose();
            navigate(redirectTo, { replace: true });
          }}
          onForgot={() => setView('forgot')}
          onSwitchToMember={() => { setNotice(''); setView('login'); }}
          onSwitchToAdminSignup={() => { setNotice(''); setView('admin-signup'); }}
        />
      )}
      {view === 'signup' && (
        <SignupForm
          onSignedIn={enterApp}
          onCreated={() => {
            // Account created -> hand over to a BLANK login view (nothing is pre-filled), never
            // straight into the app: the person types their new email and password themselves.
            setNotice('Account created! Enter your new email and password to log in.');
            setView('login');
          }}
          onSwitchToLogin={() => { setNotice(''); setView('login'); }}
        />
      )}
      {view === 'admin-signup' && (
        <SignupForm
          role="admin"
          onSignedIn={enterApp}
          onCreated={() => {
            setNotice('Admin account created! Enter your new email and password to log in.');
            setView('admin');
          }}
          onSwitchToLogin={() => { setNotice(''); setView('admin'); }}
        />
      )}
      {view === 'forgot' && (
        <ForgotPasswordForm
          onDone={onClose}
          onBack={() => setView('login')}
        />
      )}
    </Modal>
  );
}

/**
 * Log in / Admin log in / Sign up / Reset password in ONE popup. Used from the homepage
 * (header, hero, footer) — there is no separate sign-up page.
 *
 * @param {{ open: boolean, view: 'login'|'admin'|'signup'|'admin-signup'|'forgot', onViewChange: (view: string) => void,
 *   onClose: () => void, redirectTo?: string }} props
 */
export default function AuthModal({ open, view = 'login', onViewChange, onClose, redirectTo = '/dashboard' }) {
  if (!open) return null;
  return <AuthModalInner view={view} setView={onViewChange} onClose={onClose} redirectTo={redirectTo} />;
}
