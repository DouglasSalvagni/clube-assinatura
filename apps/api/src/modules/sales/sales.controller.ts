import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { SalesService } from './sales.service';

@ApiTags('Vendas')
@ApiBearerAuth()
@Controller('vendas')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SALES_READ)
  list(@CurrentUnitIds() unitIds: string[] | null, @Query('page') page = 1, @Query('limit') limit = 15) {
    return this.service.list(unitIds, Number(page), Number(limit));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SALES_READ)
  get(@CurrentUnitId() unitId: string, @Param('id') id: string) { return this.service.get(unitId, id); }

  @Patch(':id/comissao')
  @RequirePermissions(PERMISSIONS.SALES_MANAGE)
  updateCommission(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: { comissao_paga: boolean }) {
    return this.service.commission(unitId, id, dto.comissao_paga);
  }
}
