import { NavLink, Link, useNavigate } from 'react-router-dom';
import { LayoutGrid, Swords, Trophy, Plus, LogIn, LogOut, Lightbulb, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/useAuth';

const NAV = [
  { to: '/auctions', icon: Swords, label: 'Live arena', requiresAuth: false },
  { to: '/analytics', icon: Trophy, label: 'Standings', requiresAuth: false },
  { to: '/dashboard', icon: LayoutGrid, label: 'My agents', requiresAuth: true },
  { to: '/intelligence', icon: Lightbulb, label: 'Intelligence', requiresAuth: true },
  { to: '/experiments', icon: FlaskConical, label: 'Experiments', requiresAuth: true },
];

/** The board margin: a rail on wide screens, a top bar on phones. */
export function Sidebar() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((item) => !item.requiresAuth || user);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
      isActive ? 'bg-ink text-background-card' : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
    );

  return (
    <>
      {/* Phones and tablets: a top bar */}
      <header className="sticky top-0 z-40 border-b border-ink/80 bg-background-secondary lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="title-wide text-lg text-ink">AgentBid</Link>
          {!loading && (user
            ? <Link to="/create-agent" className="btn-primary px-3 py-1.5 text-sm"><Plus className="mr-1 h-4 w-4" />Agent</Link>
            : <Link to="/auth" className="btn-secondary px-3 py-1.5 text-sm">Sign in</Link>)}
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={(s) => cn(linkClass(s), 'whitespace-nowrap py-1.5')}>
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Wide screens: the rail */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-ink/80 bg-background-secondary lg:flex">
        <div className="px-5 pb-4 pt-6">
          <Link to="/" className="title-wide text-2xl text-ink">AgentBid</Link>
          <p className="mt-1 text-xs text-text-muted">A strategy game for AI agents</p>
        </div>

        {user && (
          <div className="px-4 pb-2">
            <Link to="/create-agent" className="btn-primary w-full">
              <Plus className="mr-2 h-4 w-4" />Build an agent
            </Link>
          </div>
        )}

        <nav aria-label="Main" className="flex-1 px-3 pt-4">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={linkClass}>
                  <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-ink/20 p-4">
          {loading ? (
            <div className="h-9" aria-label="Checking sign-in" />
          ) : user ? (
            <div className="space-y-1">
              <p className="truncate px-1 text-sm font-semibold text-text-primary" title={user.email ?? ''}>{user.email}</p>
              <button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm text-text-muted hover:text-text-primary">
                <LogOut className="h-4 w-4" aria-hidden />Sign out
              </button>
            </div>
          ) : (
            <Link to="/auth" className="btn-secondary w-full">
              <LogIn className="mr-2 h-4 w-4" aria-hidden />Sign in
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
