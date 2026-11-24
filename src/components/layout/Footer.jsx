import { Link } from 'react-router-dom';
import { Mail, ArrowUp, ShieldCheck } from 'lucide-react';
import Logo from '../common/Logo';
import { scrollToSection } from '../../utils/scroll';

const linkClass =
  'text-fluid-sm text-white/70 hover:text-brand-300 transition-colors text-left';

/**
 * Website footer — HOMEPAGE ONLY. Brand blurb, quick links, account links,
 * contact details, links to the Privacy Policy and Terms pages, and copyright.
 * Deliberately not rendered by any other page.
 *
 * The bottom bar also holds the discreet "Admin" entry that opens the admin
 * log-in popup (the member log-in popup no longer has an Admin tab).
 *
 * @param {{ onLogin?: () => void, onSignup?: () => void, onAdmin?: () => void }} props
 */
export default function Footer({ onLogin, onSignup, onAdmin }) {
  return (
    <footer className="w-full bg-[#10372D] dark:bg-surface-darkcard border-t border-transparent dark:border-white/10 text-white">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-12 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
          <div className="col-span-2">
            <Logo size={38} tone="light" />
            <p className="mt-4 text-fluid-sm text-white/70 max-w-xs leading-relaxed">
              Plan your projects, track your tasks, and stay in sync with your teams — all in one calm workspace.
            </p>
          </div>

          <nav aria-label="Footer">
            <h3 className="font-display font-semibold text-fluid-sm mb-4">Explore</h3>
            <ul className="space-y-2.5 flex flex-col items-start">
              <li><button type="button" onClick={() => scrollToSection('features')} className={linkClass}>Features</button></li>
              <li><button type="button" onClick={() => scrollToSection('about')} className={linkClass}>About</button></li>
              <li><button type="button" onClick={onLogin} className={linkClass}>Log in</button></li>
              <li><button type="button" onClick={onSignup} className={linkClass}>Create an account</button></li>
            </ul>
          </nav>

          <div>
            <h3 className="font-display font-semibold text-fluid-sm mb-4">Contact &amp; legal</h3>
            <ul className="space-y-2.5 flex flex-col items-start">
              <li>
                <a href="mailto:hello@taskit.app" className={`${linkClass} inline-flex items-center gap-1.5`}>
                  <Mail size={14} /> hello@taskit.app
                </a>
              </li>
              <li><Link to="/privacy" className={linkClass}>Privacy Policy</Link></li>
              <li><Link to="/terms" className={linkClass}>Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-fluid-xs text-white/60">
            © {new Date().getFullYear()} TaskIT. All rights reserved. · Version 1.0
          </p>
          <div className="self-start sm:self-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollToSection('top')}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-fluid-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              Back to top <ArrowUp size={13} />
            </button>
            {onAdmin && (
              <button
                type="button"
                onClick={onAdmin}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-fluid-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <ShieldCheck size={13} /> Admin
              </button>
            )}
          </div>
        </div>
      </div>

    </footer>
  );
}
