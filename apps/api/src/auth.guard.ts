import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { getSession } from '@goober/auth/server';
import type { Request } from 'express';
import { environment } from './env.js';
export type AuthenticatedRequest = Request & { actor: { id: string; email: string; name: string; role: string; sessionCreatedAt: Date; sessionId: string } };
export function requestHeaders(request: Request): Headers {
  const headers = new Headers();
  // Never trust caller supplied identity, forwarded host or proxy address headers.
  for (const key of ['cookie', 'user-agent', 'origin']) {
    const value = request.headers[key];
    if (typeof value === 'string') headers.set(key, value);
  }
  return headers;
}
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers.origin !== environment.origin || request.headers['x-goober-csrf'] !== '1') {
        throw new ForbiddenException('Origin and CSRF header required');
      }
      if (!request.is('application/json')) throw new ForbiddenException('JSON body required');
    }
    const session = await getSession(requestHeaders(request));
    if (!session) throw new UnauthorizedException('Sign in required');
    request.actor = {
      id: session.user.id, email: session.user.email, name: session.user.name,
      role: session.user.role, sessionCreatedAt: session.session.createdAt, sessionId: session.session.id,
    };
    return true;
  }
}
@Injectable()
export class AdminGuard extends AuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.actor.role !== 'ADMIN') throw new ForbiddenException('Administrator access required');
    return true;
  }
}
