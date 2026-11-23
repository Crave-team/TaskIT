/**
 * Accessible on/off toggle switch. Fully controlled — the parent owns the
 * boolean state and passes `onChange`, so every switch in the app (dark
 * mode, notification prefs, etc.) is guaranteed to actually update state
 * instead of just looking like a toggle.
 *
 * @param {{ checked: boolean, onChange: (next: boolean) => void, label: string, disabled?: boolean }} props
 */
export default function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center w-11 h-6 rounded-full overflow-hidden transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-brand-600' : 'bg-ink-500/25 dark:bg-white/20'
      }`}
    >
      {/*
        Plain ease-out, not the app's bouncy "springy" easing: a spring
        curve overshoots its target mid-transition, which on a 20px knob
        inside a 44px track was pushing the knob (and its shadow) past the
        track's rounded edge for a few frames. overflow-hidden above is a
        second safety net so nothing can ever visually escape the pill.
      */}
      <span
        className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform duration-150 ease-out ${
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}
