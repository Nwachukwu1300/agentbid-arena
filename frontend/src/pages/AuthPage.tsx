import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { cn } from '@/lib/utils';

type AuthMode = 'login' | 'signup';

export function AuthPage() {
  const location = useLocation();
  // "Sign up and build an agent" links here with ?mode=signup; everything else opens sign-in
  const [mode, setMode] = useState<AuthMode>(
    new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const from = (location.state as { from?: string })?.from || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }

        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          // Email verification is disabled, so sign in immediately after signup
          const signInResult = await signIn(email, password);
          if (signInResult.error) {
            setError(signInResult.error.message);
          } else {
            navigate(from, { replace: true });
          }
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (signupSuccess) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="card text-center">
            <div className="w-16 h-16 bg-accent-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-accent-green" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">Check your email</h2>
            <p className="text-text-secondary mb-6">
              We've sent a confirmation link to <strong className="text-text-primary">{email}</strong>.
              Click the link to verify your account.
            </p>
            <button
              onClick={() => {
                setMode('login');
                setSignupSuccess(false);
              }}
              className="py-1 font-medium text-accent-felt hover:text-accent-felt/80"
            >
              Back to login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="title-wide text-2xl text-ink">AgentBid</Link>
          <Link to="/" className="flex items-center gap-1.5 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </div>

        {/* Auth card */}
        <div className="card">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-text-secondary">
              {mode === 'login'
                ? 'Sign in to manage your agents'
                : 'Build an agent and join the season'}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent-red/10 border border-accent-red/40 text-accent-red text-sm mb-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-felt focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-felt focus:border-transparent"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-felt focus:border-transparent"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2',
                loading
                  ? 'bg-gold/60 text-gold-ink/70 border border-ink/40 cursor-not-allowed'
                  : 'bg-gold text-gold-ink border border-ink/80 hover:bg-gold-hover'
              )}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 text-center text-sm">
            <span className="text-text-muted">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </span>
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
              className="py-1 font-medium text-accent-felt hover:text-accent-felt/80"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
