import { useState } from 'react';
import {
  UsersRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import './App.css';

export default function App() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    if (!supabase) {
      setMessage('Supabase is not configured yet. Add your URL and publishable key to frontend/.env.local, then restart the app.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setMessage(data.session
          ? 'Account created! You can now continue.'
          : 'Account created. Check your email to confirm your account.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setMessage('Signed in successfully!');
      }
    } catch (error) {
      setMessage(error.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow glow-one" aria-hidden="true" />
      <div className="auth-glow glow-two" aria-hidden="true" />
      <section className="auth-card">
        <div className="brand-mark">
          <UsersRound size={29} strokeWidth={2.2} />
          <span className="brand-pin"><MapPin size={14} /></span>
        </div>
        <div className="brand-name">Find My Family</div>
        <p className="tagline">Your loved ones, closer than ever.</p>
        <div className="welcome-icon"><ShieldCheck size={24} /></div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="subtitle">
          {mode === 'login'
            ? 'Sign in to stay connected with your family.'
            : 'Create an account to get started.'}
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <div className="input-wrap">
            <Mail size={18} aria-hidden="true" />
            <input id="email" type="email" placeholder="you@example.com"
              value={email} onChange={(event) => setEmail(event.target.value)}
              autoComplete="email" required />
          </div>
          <label htmlFor="password">Password</label>
          <div className="input-wrap">
            <Lock size={18} aria-hidden="true" />
            <input id="password" type={showPassword ? 'text' : 'password'}
              placeholder="At least 6 characters" value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6} required />
            <button className="password-toggle" type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button className="submit-button" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <p className="switch-mode">
          {mode === 'login' ? "Don't have an account?" : 'Already registered?'}{' '}
          <button type="button" onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setMessage('');
          }}>
            {mode === 'login' ? 'Create account' : 'Sign in'}
          </button>
        </p>
        <div className="privacy-note">
          <ShieldCheck size={15} />
          <span>Your account helps keep your family space private.</span>
        </div>
      </section>
    </main>
  );
}
