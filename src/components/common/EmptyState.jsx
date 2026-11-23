/**
 * Friendly empty state shown when a list/page has no content yet — pairs an
 * icon with a short explanation and an optional call-to-action so a
 * first-time visitor always knows what to do next.
 *
 * @param {{ icon: React.ComponentType, title: string, description?: string, action?: React.ReactNode }} props
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-brand-500/10 flex items-center justify-center mb-4">
          <Icon size={22} className="text-brand-600" />
        </div>
      )}
      <p className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white mb-1">
        {title}
      </p>
      {description && (
        <p className="text-fluid-sm text-ink-500 max-w-sm mb-4">{description}</p>
      )}
      {action}
    </div>
  );
}
