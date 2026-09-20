import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth.guard';
import { RolesGuard } from '../src/roles.guard';

const context = (authorization?: string, user?: { sub: string; roles: string[] }) => ({
  getHandler: () => function handler() {},
  getClass: () => class Controller {},
  switchToHttp: () => ({ getRequest: () => ({ headers: { authorization }, user }) }),
}) as unknown as ExecutionContext;

describe('security guards', () => {
  it('rejects missing bearer tokens on protected routes', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid bearer token and attaches its claims', async () => {
    const request = { headers: { authorization: 'Bearer valid' } } as { headers: { authorization: string }; user?: unknown };
    const ctx = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'EMP-1', roles: ['ADMIN'] }) } as unknown as JwtService;
    await expect(new JwtAuthGuard(reflector, jwt).canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'EMP-1', roles: ['ADMIN'] });
  });

  it('rejects authenticated users without a required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['SUPER_ADMIN']) } as unknown as Reflector;
    expect(() => new RolesGuard(reflector).canActivate(context(undefined, { sub: 'CUS-1', roles: ['CUSTOMER'] }))).toThrow(ForbiddenException);
  });

  it('allows a matching role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['SUPER_ADMIN']) } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context(undefined, { sub: 'EMP-1', roles: ['SUPER_ADMIN'] }))).toBe(true);
  });
});
