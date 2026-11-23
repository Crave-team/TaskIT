import IconTopNav from './IconTopNav';
import SideNav from './SideNav';
import PageHeaderCard from './PageHeaderCard';
import OverdueWarning from './OverdueWarning';
import DueSoonReminder from './DueSoonReminder';

/**
 * Overall application shell: a slim top bar (logo + notifications +
 * profile), a vertical section-navigation rail docked to the right edge
 * of the screen, and a scrollable content area in between. Each page
 * passes its title/subtitle/optional header action down, rendered as a
 * rounded card at the top of the content — matching the reference
 * design's title + search + action row.
 *
 * Pass `hideHeader` to skip the title card (the Team page does this once a team is open).
 *
 * @param {{ title: string, subtitle?: string, action?: React.ReactNode, hideHeader?: boolean, children: React.ReactNode }} props
 */
export default function AppLayout({ title, subtitle, action, hideHeader = false, children }) {
  return (
    <div className="min-h-svh flex flex-col bg-transparent dark:bg-surface-dark">
      <IconTopNav />
      <div className="flex-1 flex items-start">
        <main className="order-1 flex-1 min-w-0">
          <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 pt-6">
            {!hideHeader && <PageHeaderCard title={title} subtitle={subtitle} action={action} />}
            {children}
          </div>
        </main>
        <SideNav />
      </div>
      <OverdueWarning />
      <DueSoonReminder />
    </div>
  );
}
