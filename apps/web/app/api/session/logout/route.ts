import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST() {
  const refreshToken = (await cookies()).get('afhomes_refresh')?.value;
  if (refreshToken) await fetch(`${API}/api/v1/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }), cache: 'no-store' }).catch(() => undefined);
  const response = NextResponse.json({ success: true });
  response.cookies.delete('afhomes_access');
  response.cookies.delete('afhomes_refresh');
  return response;
}
