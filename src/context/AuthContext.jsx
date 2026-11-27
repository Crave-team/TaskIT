import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useApi } from './ApiContext';

export { DEFAULT_PREFS } from '../api/services/authService.js';

const AuthContext = createContext(null);

/**
 * @typedef {'user' | 'admin'} AccountRole
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {AccountRole} accountRole
 * @property {string} title
 */

/**
 * Sign-in state and account management, as a thin adapter over the data layer (`api.auth`).
 * Credentials are checked and hashed by the auth service, "who is signed in" comes from the
 * session, and the account list a person receives is filtered by the service (a member only
 * gets teammates' public details; the site admin gets every account, never its password).
 *
 * Calls that need an outcome (`login`, `signup`, `updateAccount`, ...) resolve
 * `{ success, error?, field? }`; the rest are fire-and-forget.
 */
export function AuthProvider({ children }) {
  const { snapshot, ready, loadError, retryLoad, run, attempt } = useApi();
  const currentUser = snapshot.me;
  // True after an explicit log-out, so protected pages send people to the homepage (not the login screen).
  const [signedOut, setSignedOut] = useState(false);

  /** `expectedRole` is the tab chosen on the log-in screen ("Member" or "Admin"). */
  const login = useCallback(async ({ email, password, expectedRole }) => {
    const result = await attempt((api) => api.auth.login({ email, password, expectedRole }));
    // A correct password that still needs its emailed code is NOT a sign-in yet: `result.data.codeRequired` says so.
    if (result.success && !result.data?.codeRequired) setSignedOut(false);
    return result;
  }, [attempt]);

  /**
   * Signs in (or creates the account on first use) with a Google ID token. The server verifies the token; for the
   * admin tab it also needs `inviteCode` when the admin account does not exist yet.
   */
  const loginWithGoogle = useCallback(async ({ credential, expectedRole, inviteCode }) => {
    const result = await attempt((api) => api.auth.loginWithGoogle({ credential, expectedRole, inviteCode }));
    if (result.success) setSignedOut(false);
    return result;
  }, [attempt]);

  /**
   * Second step after the password when the server emails a 6-digit code: sends the code plus the challenge token, and
   * on success the person is signed in (a new sign-up is created at this moment).
   */
  const verifyEmailCode = useCallback(async ({ challengeToken, code }) => {
    const result = await attempt((api) => api.auth.verifyEmailCode({ challengeToken, code }));
    if (result.success) setSignedOut(false);
    return result;
  }, [attempt]);

  const resendEmailCode = useCallback(({ challengeToken }) => attempt((api) => api.auth.resendEmailCode({ challengeToken })), [attempt]);

  /** Registers an account without signing in (the popup hands over to the log-in view). With email codes on, the account is only created once the code is entered. */
  const signup = useCallback((input) => attempt((api) => api.auth.register(input)), [attempt]);

  const logout = useCallback(async () => {
    setSignedOut(true);
    await run((api) => api.auth.logout(), { quiet: true });
  }, [run]);

  const requestPasswordReset = useCallback((email) => attempt((api) => api.auth.requestPasswordReset({ email })), [attempt]);
  const resetPassword = useCallback(({ challengeToken, code, newPassword }) => attempt((api) => api.auth.resetPassword({ challengeToken, code, newPassword })), [attempt]);

  /** Saves profile fields, notification preferences, the two-factor choice... on the signed-in account. */
  const updateAccount = useCallback((_accountId, patch) => attempt((api) => api.auth.updateProfile(patch)), [attempt]);

  const markTourDone = useCallback(() => run((api) => api.auth.updateProfile({ tourPending: false }), { quiet: true }), [run]);

  const changePassword = useCallback((_accountId, current, next) => attempt((api) => api.auth.changePassword({ current, next })), [attempt]);

  // Site admin
  const setAccountRole = useCallback((accountId, role) => run((api) => api.auth.setAccountRole(accountId, role)), [run]);
  const setAccountStatus = useCallback((accountId, status) => run((api) => api.auth.setAccountStatus(accountId, status)), [run]);
  /** Deletes the account together with everything that depended on it (done by the service). */
  const removeAccount = useCallback((accountId) => run((api) => api.auth.deleteUser(accountId)), [run]);
  const updateSystemSettings = useCallback((patch) => run((api) => api.auth.updateSettings(patch)), [run]);

  // System Settings → Session timeout: sign the person out after that many idle minutes.
  const signedInId = currentUser?.id ?? null;
  const idleMinutes = Number(snapshot.settings.sessionTimeout) || 0;
  useEffect(() => {
    if (!signedInId || !idleMinutes) return undefined;
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, idleMinutes * 60 * 1000);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [signedInId, idleMinutes, logout]);

  // A banned/deleted person's session ends server-side; reflect that if we were signed in.
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.status === 'suspended') logout();
  }, [currentUser, logout]);

  const value = {
    currentUser,
    // True until the server has told us whether a session already exists (a reload while signed in).
    loading: !ready,
    // The first load failed although a session exists (server unreachable): show "Try again", not the log-in popup.
    loadError,
    retryLoad,
    signedOut,
    accounts: snapshot.accounts,
    login,
    loginWithGoogle,
    verifyEmailCode,
    resendEmailCode,
    signup,
    logout,
    setAccountRole,
    removeAccount,
    setAccountStatus,
    requestPasswordReset,
    resetPassword,
    changePassword,
    markTourDone,
    updateAccount,
    systemSettings: snapshot.settings,
    updateSystemSettings,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
