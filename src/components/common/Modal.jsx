import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { registerOpenModal } from './modalStore';

/**
 * Generic centered modal/dialog with a backdrop, escape-to-close and
 * focus restore on close.
 *
 * Focus rules (these exist because typing in a modal field used to bounce
 * focus back to the dialog after every keystroke):
 *  - Focus is moved into the dialog exactly ONCE, on the closed -> open
 *    transition, and only if nothing inside already took it (autoFocus).
 *  - The effect depends on `open` only. `onClose` is read through a ref, so
 *    a parent re-rendering on every keystroke can never re-run it.
 *  - When the dialog closes, focus returns to whatever opened it.
 *
 * @param {{ open: boolean, onClose: () => void, title: string, children: React.ReactNode, footer?: React.ReactNode, size?: 'md'|'lg' }} props
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    const unregister = registerOpenModal();
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      unregister();
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="presentation"
    >
      <div
        className="fixed inset-0 bg-ink-900/50 backdrop-blur-[2px] animate-[fadeIn_200ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={`relative w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} my-4 sm:my-8 rounded-2xl bg-surface-card dark:bg-surface-darkcard shadow-elevated border border-ink-500/10 dark:border-white/10 outline-none focus-visible:outline-none animate-[popIn_240ms_cubic-bezier(0.22,1,0.36,1)]`}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-ink-500/10 dark:border-white/10">
          <h2 id="modal-title" className="font-display font-semibold text-fluid-lg text-ink-900 dark:text-white">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-scroll px-5 sm:px-6 py-5 max-h-[calc(100svh-10rem)] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 sm:px-6 py-4 border-t border-ink-500/10 dark:border-white/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
