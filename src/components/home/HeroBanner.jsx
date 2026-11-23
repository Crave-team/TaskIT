import { CheckCircle2, CalendarClock } from 'lucide-react';
import AppWindow, { ScaleToFit } from './preview/AppWindow';
import { SAMPLE_TASKS, SAMPLE_PROJECTS } from './preview/sample';
import HeroStat from '../dashboard/HeroStat';
import PriorityBreakdown from '../dashboard/PriorityBreakdown';
import UpcomingDeadlines from '../dashboard/UpcomingDeadlines';

/**
 * Hero "banner image": the real TaskIT dashboard — the same HeroStat,
 * PriorityBreakdown and UpcomingDeadlines components the signed-in app uses,
 * fed with the demo workspace data — shown inside a Windows-style window
 * with two floating notification chips.
 */
export default function HeroBanner() {
  return (
    <div className="relative mx-auto w-full max-w-[640px]" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-brand-500/25 via-transparent to-amber-500/20 blur-2xl" />

      <div className="relative">
        <ScaleToFit designWidth={860} designHeight={640}>
          <AppWindow title="Dashboard" active="dashboard" pageTitle="Dashboard" subtitle="Welcome back, Alex — here's your workspace today">
            <div className="space-y-4">
              <HeroStat tasks={SAMPLE_TASKS} projects={SAMPLE_PROJECTS} />
              <div className="grid grid-cols-2 gap-4">
                <PriorityBreakdown tasks={SAMPLE_TASKS} />
                <UpcomingDeadlines tasks={SAMPLE_TASKS} />
              </div>
            </div>
          </AppWindow>
        </ScaleToFit>
      </div>

      <div className="absolute -top-4 -right-2 sm:-right-6 animate-floaty">
        <div className="flex items-center gap-2 rounded-xl bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-elevated px-3 py-2">
          <span className="w-7 h-7 rounded-lg bg-brand-500/15 flex items-center justify-center">
            <CheckCircle2 size={15} className="text-brand-600 dark:text-brand-300" />
          </span>
          <div>
            <p className="text-[0.7rem] font-semibold text-ink-900 dark:text-white leading-tight">Task completed</p>
            <p className="text-[0.62rem] text-ink-500 leading-tight">Sprint review deck</p>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-2 sm:-left-8 animate-floaty-slow">
        <div className="flex items-center gap-2 rounded-xl bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-elevated px-3 py-2">
          <span className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <CalendarClock size={15} className="text-amber-600 dark:text-amber-500" />
          </span>
          <div>
            <p className="text-[0.7rem] font-semibold text-ink-900 dark:text-white leading-tight">Due in 2 days</p>
            <p className="text-[0.62rem] text-ink-500 leading-tight">Launch success metrics</p>
          </div>
        </div>
      </div>
    </div>
  );
}
