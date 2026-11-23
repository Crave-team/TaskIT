import { Layers, Users2, ShieldCheck } from 'lucide-react';
import Reveal from './Reveal';

const POINTS = [
  { icon: Layers, title: 'One calm workspace', text: 'Tasks, projects, calendar and team reports share one design — nothing to stitch together.' },
  { icon: Users2, title: 'Built for teams', text: 'Chat, announcements and task hand-offs live right beside the work they belong to.' },
  { icon: ShieldCheck, title: 'You stay in control', text: 'Member and admin portals, account controls and a full audit trail keep things accountable.' },
];

const STEPS = [
  ['1', 'Create your account', 'Sign up as a member in under a minute.'],
  ['2', 'Plan your work', 'Add projects and tasks, or join a team.'],
  ['3', 'Track to done', 'Follow deadlines, time and progress.'],
];

/** About + "how it works" in one compact section. */
export default function AboutSection() {
  return (
    <section id="about" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          <Reveal from="left">
            <p className="text-fluid-xs font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">About TaskIT</p>
            <h2 className="mt-2 font-display font-extrabold text-fluid-3xl text-ink-900 dark:text-white leading-tight">
              Task management that gets out of your way.
            </h2>
            <p className="mt-4 text-fluid-base text-ink-500 leading-relaxed max-w-xl">
              TaskIT is a task and project management system for individuals and teams. It brings planning, tracking and
              collaboration into a single, quiet interface so people spend their energy on the work — not on managing the tool.
            </p>

            <ol className="mt-7 grid sm:grid-cols-3 gap-3">
              {STEPS.map(([n, t, d], i) => (
                <Reveal as="li" key={n} delay={i * 100} className="rounded-2xl bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 p-4">
                  <span className="w-7 h-7 rounded-full bg-brand-700 text-white text-fluid-xs font-bold flex items-center justify-center">{n}</span>
                  <p className="mt-2.5 font-display font-bold text-fluid-sm text-ink-900 dark:text-white">{t}</p>
                  <p className="mt-1 text-fluid-xs text-ink-500 leading-relaxed">{d}</p>
                </Reveal>
              ))}
            </ol>
          </Reveal>

          <div className="space-y-3">
            {POINTS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} from="right" delay={i * 120}>
                <div className="flex gap-4 rounded-2xl bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 p-5 transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-elevated">
                  <span className="w-11 h-11 shrink-0 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <Icon size={20} className="text-brand-700 dark:text-brand-300" />
                  </span>
                  <div>
                    <h3 className="font-display font-bold text-fluid-base text-ink-900 dark:text-white">{title}</h3>
                    <p className="mt-1 text-fluid-sm text-ink-500 leading-relaxed">{text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
