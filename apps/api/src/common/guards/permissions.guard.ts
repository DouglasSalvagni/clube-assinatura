import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedRequest } from '../types/request-context';
import { hasPermissions } from '../utils/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) || [];
    if (!required.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!hasPermissions(request.user.globalRole, request.membership?.role, required)) {
      throw new ForbiddenException('Permissão insuficiente para esta operação.');
    }
    return true;
  }
}
