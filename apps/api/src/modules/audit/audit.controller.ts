import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { AuditService } from './audit.service';
@ApiTags('Auditoria') @ApiBearerAuth() @Controller('audit') @UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly service: AuditService) {}
  @Get() @RequirePermissions(PERMISSIONS.AUDIT_READ)
  list(@CurrentUnitIds() unitIds: string[] | null, @Query('page') page = 1, @Query('limit') limit = 50) { return this.service.list(unitIds, Number(page), Math.min(Number(limit), 200)); }
}
