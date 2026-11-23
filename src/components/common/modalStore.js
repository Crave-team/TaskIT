import { useSyncExternalStore } from 'react';

/**
 * Tiny shared counter of how many <Modal>s are open right now. Lets background pop-ups
 * (e.g. the due-tomorrow reminder) wait until the person has closed what they were doing
 * instead of stacking a second dialog on top of it.
 */
let openModals = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

/** Called by Modal when it opens; returns the cleanup to call when it closes. */
export function registerOpenModal() {
  openModals += 1;
  emit();
  return () => {
    openModals -= 1;
    emit();
  };
}

/** Number of dialogs currently open (re-renders the caller when it changes). */
export function useOpenModalCount() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => openModals,
  );
}
