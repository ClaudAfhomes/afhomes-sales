'use client';

import { useEffect, useState } from 'react';

type Metrics = { activeMemberships: number; cards: number; transactions: number; openTickets: number };
type User = { public_id: string; display_name: string; roles: string[] };

export default function DashboardClient() {
  const [user, setUser] = useState<User | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState('');

  async function loadDashboard() {
    const response = await fetch('/api/backend/dashboard', { cache: 'no-store' });
    if (response.status === 401) return;
    if (!response.ok) throw new Error('Dashboard is unavailable');
    setMetrics(await response.json());
  }

  useEffect(() => { loadDashboard().catch(() => setError('Dashboard is unavailable.')); }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/session/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    const payload = await response.json();
    if (!response.ok) { setError(payload.message || 'Sign-in failed'); return; }
    setUser(payload.user);
    await loadDashboard();
  }

  async function logout() {
    await fetch('/api/session/logout', { method: 'POST' });
    setUser(null); setMetrics(null);
  }

  if (!metrics) return <section className="login-card card"><h2>Employee sign in</h2><p className="muted">Use an authorized AFhomes employee account.</p><form onSubmit={login}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label><button type="submit">Sign in</button>{error && <p className="error" role="alert">{error}</p>}</form></section>;

  return <><div className="session-row"><p>Signed in{user ? ` as ${user.display_name}` : ''}</p><button className="secondary" onClick={logout}>Sign out</button></div><section className="grid">{Object.entries(metrics).map(([key,value]) => <article className="card" key={key}><div className="metric">{value}</div><div>{key.replace(/([A-Z])/g, ' $1')}</div></article>)}</section></>;
}
