import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Sun, Moon, LayoutDashboard } from 'lucide-react';
import Logo from '../common/Logo';
import Button from '../common/Button';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { scrollToSection } from '../../utils/scroll';

const NAV = [
  { id: 'features', label: 'Features' },
  { id: 'about', label: 'About' },
];

/**
 * Homepage header: logo + TaskIT name, section links (Features, About),
 * theme toggle and Log in / Sign up (or "Open dashboard" when signed in).
 * Gains a hairline + blur once the page scrolls; collapses into a smooth
 * slide-down menu on small screens.
 */
export default function HomeHeader({ onLogin, onSignup }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // On the homepage we scroll; on other public pages (Privacy, Terms) we go home first.
  const go = (id) => {
    setOpen(false);
    if (pathname === '/') scrollToSection(id);
    else navigate('/', { state: { scrollTo: id } });
  };
  const login = () => {
    setOpen(false);
    if (onLogin) onLogin();
    else navigate('/?auth=login');
  };
  const signup = () => {
    setOpen(false);
    if (onSignup) onSignup();
    else navigate('/?auth=signup');
  };

  const linkClass =
    'px-3.5 py-2 rounded-full text-fluid-sm font-medium text-ink-700 dark:text-ink-300 hover:bg-brand-500/10 hover:text-brand-700 dark:hover:text-white transition-colors';

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ease-smooth bg-[#EFE9D9]/90 dark:bg-surface-dark/95 backdrop-blur-md border-b ${
        scrolled ? 'border-ink-500/15 dark:border-white/10 shadow-soft' : 'border-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto h-16 px-4 sm:px-8 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go('top')} aria-label="TaskIT — back to top" className="rounded-lg hover:opacity-90 transition-opacity">
          <Logo size={36} />
        </button>

        <nav className="hidden md:flex items-center gap-1" aria-label="Homepage sections">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => go(n.id)} className={linkClass}>{n.label}</button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-full text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 hover:text-ink-900 dark:hover:text-white transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div className="hidden md:flex items-center gap-2">
            {currentUser ? (
              <Link to="/dashboard">
                <Button size="md" icon={<LayoutDashboard size={15} />}>Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Button variant="ghost" onClick={login}>Log in</Button>
                <Button onClick={signup}>Sign up</Button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="md:hidden p-2 rounded-full text-ink-700 dark:text-ink-300 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* mobile menu */}
      <div className={`md:hidden grid transition-[grid-template-rows] duration-300 ease-smooth ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 flex flex-col gap-1 border-t border-ink-500/10 dark:border-white/10">
            {NAV.map((n) => (
              <button key={n.id} type="button" onClick={() => go(n.id)} className={`${linkClass} text-left`}>{n.label}</button>
            ))}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {currentUser ? (
                <Link to="/dashboard" className="col-span-2"><Button className="w-full">Open dashboard</Button></Link>
              ) : (
                <>
                  <Button variant="secondary" onClick={login}>Log in</Button>
                  <Button onClick={signup}>Sign up</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
