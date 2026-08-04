import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUnitId } from '../../common/decorators/current-unit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { GlobalRole, User } from '../../database/entities';
import { ConfigureBillingDto } from './billing.dto';
import { BillingService } from './billing.service';

@ApiTags('Asaas por unidade')
@ApiBearerAuth()
@Controller('billing/asaas')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  get(@CurrentUnitId() unitId: string) {
    return this.service.get(unitId);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  configure(
    @CurrentUnitId() unitId: string,
    @Body() dto: ConfigureBillingDto,
    @CurrentUser() actor: User,
  ) {
    return this.service.configure(unitId, dto, actor);
  }

  @Post('test')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  test(@CurrentUnitId() unitId: string) {
    return this.service.test(unitId);
  }

  @Post('webhook/setup')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  setupWebhook(@CurrentUnitId() unitId: string, @CurrentUser() actor: User) {
    return this.service.setupWebhook(unitId, actor);
  }

  @Get('webhook')
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  webhookStatus(@CurrentUnitId() unitId: string) {
    return this.service.webhookStatus(unitId);
  }

  @Delete('webhook')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  removeWebhook(@CurrentUnitId() unitId: string, @CurrentUser() actor: User) {
    return this.service.removeWebhook(unitId, actor);
  }

  @Post('webhook/remove-backoff')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  removeBackoff(@CurrentUnitId() unitId: string, @CurrentUser() actor: User) {
    return this.service.removeBackoff(unitId, actor);
  }
}

@ApiTags('Compatibilidade administrativa Asaas')
@ApiBearerAuth()
@Controller('admin/tenants')
@UseGuards(JwtAuthGuard)
export class BillingAdminCompatibilityController {
  constructor(private readonly service: BillingService) {}

  private assertInstallationAdmin(user: User) {
    if (user.globalRole !== GlobalRole.INSTALLATION_ADMIN) throw new ForbiddenException();
  }

  @Get(':id/webhook')
  get(@CurrentUser() user: User, @Param('id') unitId: string) {
    this.assertInstallationAdmin(user);
    return this.service.webhookStatus(unitId);
  }

  @Post(':id/webhook/setup')
  setup(@CurrentUser() user: User, @Param('id') unitId: string) {
    this.assertInstallationAdmin(user);
    return this.service.setupWebhook(unitId, user);
  }

  @Delete(':id/webhook')
  remove(@CurrentUser() user: User, @Param('id') unitId: string) {
    this.assertInstallationAdmin(user);
    return this.service.removeWebhook(unitId, user);
  }

  @Post(':id/webhook/remove-backoff')
  removeBackoff(@CurrentUser() user: User, @Param('id') unitId: string) {
    this.assertInstallationAdmin(user);
    return this.service.removeBackoff(unitId, user);
  }
}
