import { Globe2, Lock } from 'lucide-react';

const OPTIONS = [
  { value: 'public', label: 'Public', Icon: Globe2 },
  { value: 'private', label: 'Private', Icon: Lock },
];

/**
 * Two-way Public / Private switch for a team. Changing it saves straight away (the parent calls the
 * server, which only lets the team owner do it). `disabled` is for while a save is running.
 */
export default function VisibilityToggle({ value, onChange, disabled = false, size = 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';
  return (
    <div role="group" aria-label="Team visibility" className="inline-flex rounded-full border border-ink-500/15 dark:border-white/10 p-0.5 bg-ink-500/5 dark:bg-white/5">
      {OPTIONS.map(({ value: v, label, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            disabled={disabled || active}
            onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 rounded-full ${pad} text-fluid-xs font-medium transition-colors ${
              active
                ? 'bg-brand-500 text-white cursor-default'
                : 'text-ink-700 dark:text-ink-300 hover:bg-ink-500/10 dark:hover:bg-white/10 disabled:opacity-50'
            }`}
          >
            <Icon size={12} /> {label}
          </button>
        );
      })}
    </div>
  );
}
