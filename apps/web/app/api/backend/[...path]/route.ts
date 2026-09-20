import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const allowedRoots = new Set(['dashboard', 'cards', 'transactions', 'reports', 'support']);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || !allowedRoots.has(path[0])) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const token = (await cookies()).get('afhomes_access')?.value;
  if (!token) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const target = `${API}/api/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const upstream = await fetch(target, {
    method: request.method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: request.method === 'GET' ? undefined : await request.text(),
    cache: 'no-store',
  });
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
}

export const GET = proxy;
export const POST = proxy;
