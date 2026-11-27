import { createContext, useContext, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

const ProfileContext = createContext(null);

/** Derives up-to-two-letter avatar initials from a display name. */
function initialsFromName(name) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function profileOf(account) {
  return {
    name: account.name,
    email: account.email,
    role: account.title,
    avatarInitials: initialsFromName(account.name),
    avatarUrl: account.avatarUrl ?? null,
    avatarColor: account.avatarColor || 'brand',
  };
}

/**
 * The signed-in person's editable profile (name, email, title, avatar).
 *
 * It is a view of the REAL account record in AuthContext: `updateProfile` saves straight into
 * the account. (It used to keep edits in a temporary override that was thrown away on log-out
 * and never reached the log-in check, so a changed email or name silently reverted.)
 */
export function ProfileProvider({ children }) {
  const { currentUser, updateAccount } = useAuth();

  const profile = useMemo(() => (currentUser ? profileOf(currentUser) : null), [currentUser]);

  /**
   * Saves profile changes. `role` is the account's title.
   * @returns {{ success: boolean, field?: string, error?: string }}
   */
  const updateProfile = useCallback((patch) => {
    if (!currentUser) return { success: false, error: 'Not signed in.' };
    const { role, ...rest } = patch;
    const accountPatch = { ...rest };
    if (role !== undefined) accountPatch.title = role;
    return updateAccount(currentUser.id, accountPatch);
  }, [currentUser, updateAccount]);

  return (
    <ProfileContext.Provider value={{ profile, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
  return ctx;
}
