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

  if (!metrics) return <section className="login-card card reveal"><span className="eyebrow">EMPLOYEE ACCESS</span><h2>Welcome back.</h2><p className="muted">Sign in with your authorized AFhomes employee account.</p><form onSubmit={login}><label>Email address<input name="email" type="email" autoComplete="username" placeholder="name@afhomes.com" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Your password" minLength={8} required /></label><button type="submit">Sign in <span aria-hidden="true">→</span></button>{error && <p className="error" role="alert">{error}</p>}</form></section>;

  const labels:Record<string,string>={activeMemberships:'Active memberships',cards:'VIP cards',transactions:"Today's transactions",openTickets:'Open support tickets'};
  return <><div className="session-row"><div><span className="eyebrow">LIVE OVERVIEW</span><h2>Good day{user ? `, ${user.display_name}` : ''}.</h2></div><button className="secondary" onClick={logout}>Sign out</button></div><section className="grid metrics">{Object.entries(metrics).map(([key,value],index) => <article className="card metric-card" style={{animationDelay:`${index*70}ms`}} key={key}><span className="metric-icon" aria-hidden="true">{['↗','◇','▣','◌'][index]}</span><div className="metric">{value.toLocaleString()}</div><div>{labels[key]||key.replace(/([A-Z])/g,' $1')}</div><small>Updated moments ago</small></article>)}</section></>;
}
