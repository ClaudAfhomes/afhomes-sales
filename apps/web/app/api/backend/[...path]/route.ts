import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const allowedRoots = new Set(['dashboard', 'cards', 'members', 'transactions', 'reports', 'support']);

async function callApi(target:string,method:string,body:string|undefined,token:string){return fetch(target,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body,cache:'no-store'})}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || !allowedRoots.has(path[0])) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const cookieStore = await cookies();
  const token = cookieStore.get('afhomes_access')?.value;
  if (!token) return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  const target = `${API}/api/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const body=request.method==='GET'?undefined:await request.text();
  let upstream=await callApi(target,request.method,body,token);
  let rotated:{access_token:string;refresh_token:string}|undefined;
  if(upstream.status===401){const refreshToken=cookieStore.get('afhomes_refresh')?.value;if(refreshToken){const refresh=await fetch(`${API}/api/v1/auth/refresh`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refresh_token:refreshToken}),cache:'no-store'});if(refresh.ok){rotated=await refresh.json();upstream=await callApi(target,request.method,body,rotated!.access_token)}}}
  const response=new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
  if(rotated){response.cookies.set('afhomes_access',rotated.access_token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:15*60});response.cookies.set('afhomes_refresh',rotated.refresh_token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:30*24*60*60})}
  return response;
}

export const GET = proxy;
export const POST = proxy;
