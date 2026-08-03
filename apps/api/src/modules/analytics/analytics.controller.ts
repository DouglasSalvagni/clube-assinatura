import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
@Controller()
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('analytics/dashboard')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  dashboard(@CurrentUnitIds() unitIds: string[] | null) { return this.service.dashboard(unitIds); }

  @Get('analytics/churn')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  churn(@CurrentUnitIds() unitIds: string[] | null, @Query('start') start?: string, @Query('end') end?: string) {
    return this.service.churn(unitIds, start ? new Date(start) : new Date(Date.now() - 30 * 86_400_000), end ? new Date(end) : new Date());
  }

  @Get('relatorios')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  catalog() { return this.service.catalog(); }

  @Get('relatorios/:tipo/csv')
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  async csv(@CurrentUnitIds() unitIds: string[] | null, @Param('tipo') type: string, @Query() query: Record<string, unknown>, @Res() response: Response) {
    const result = await this.service.generate(unitIds, type, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(this.service.csv(result));
  }

  @Get('relatorios/:tipo')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  generate(@CurrentUnitIds() unitIds: string[] | null, @Param('tipo') type: string, @Query() query: Record<string, unknown>) {
    return this.service.generate(unitIds, type, query);
  }
}
