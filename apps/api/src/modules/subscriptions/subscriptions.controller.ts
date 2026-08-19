import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { User } from '../../database/entities';
import {
  CancelSubscriptionDto,
  CreateDependentDto,
  CreatePaymentDto,
  SettleDebtsDto,
  SuspendSubscriptionDto,
  UpdateCompanyContactsDto,
  UpdateDependentDto,
  UpdatePrimaryDto,
} from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Assinaturas')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get() @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  list(@CurrentUnitIds() ids: string[] | null, @Query('page') page = 1, @Query('limit') limit = 20, @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.listLives(ids, { page: +page, limit: Math.min(+limit, 100), search, status });
  }

  @Get(':id') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  detail(@CurrentUnitId() unitId: string, @Param('id') id: string) { return this.service.detail(unitId, id); }

  @Patch(':id') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  update(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: UpdatePrimaryDto, @CurrentUser() actor: User) {
    return this.service.updatePrimary(unitId, id, dto, actor.id);
  }

  @Patch(':id/company-contacts') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  updateCompanyContacts(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: UpdateCompanyContactsDto, @CurrentUser() actor: User) {
    return this.service.updateCompanyContacts(unitId, id, dto, actor.id);
  }

  @Post(':id/suspend') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  suspend(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: SuspendSubscriptionDto, @CurrentUser() actor: User) {
    return this.service.suspend(unitId, id, dto, actor);
  }

  @Post(':id/cancel') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  cancel(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: CancelSubscriptionDto, @CurrentUser() actor: User) {
    return this.service.cancel(unitId, id, dto, actor);
  }

  @Post(':id/reactivate') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  reactivate(@CurrentUnitId() unitId: string, @Param('id') id: string, @CurrentUser() actor: User) {
    return this.service.reactivate(unitId, id, actor);
  }

  @Post(':id/members') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  add(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: CreateDependentDto, @CurrentUser() actor: User) {
    return this.service.addDependent(unitId, id, dto, actor.id);
  }

  @Patch(':id/members/:memberId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  updateMember(@CurrentUnitId() unitId: string, @Param('id') id: string, @Param('memberId') memberId: string, @Body() dto: UpdateDependentDto, @CurrentUser() actor: User) {
    return this.service.updateDependent(unitId, id, memberId, dto, actor.id);
  }

  @Delete(':id/members/:memberId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  removeMember(@CurrentUnitId() unitId: string, @Param('id') id: string, @Param('memberId') memberId: string, @CurrentUser() actor: User) {
    return this.service.removeDependent(unitId, id, memberId, actor.id);
  }

  @Get(':id/invoices') @RequirePermissions(PERMISSIONS.BILLING_READ)
  invoices(@CurrentUnitId() unitId: string, @Param('id') id: string, @Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.service.invoices(unitId, id, +limit, +offset);
  }

  @Get(':id/debts') @RequirePermissions(PERMISSIONS.BILLING_READ)
  debts(@CurrentUnitId() unitId: string, @Param('id') id: string) { return this.service.debtSummary(unitId, id); }

  @Post(':id/debts/settle') @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  settleDebts(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: SettleDebtsDto, @CurrentUser() actor: User) {
    return this.service.settleDebts(unitId, id, dto, actor);
  }

  @Post(':id/payments') @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  payment(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: CreatePaymentDto) {
    return this.service.createPayment(unitId, id, dto);
  }
}

@ApiTags('Compatibilidade - Vidas')
@ApiBearerAuth()
@Controller('vidas')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class LivesCompatibilityController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get() @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  list(@CurrentUnitIds() ids: string[] | null, @Query('page') page = 1, @Query('limit') limit = 15, @Query('search') search?: string, @Query('status') status?: string, @Query('subscription') subscription?: string, @Query('estado') estado?: string) {
    return this.service.listLives(ids, { page: +page, limit: Math.min(+limit, 100), search, status, subscription, estado });
  }

  @Post('sync-status') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  sync(@CurrentUnitId() unitId: string) { return this.service.syncStatus(unitId); }

  @Post('import-all') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  importAll() { return { imported: 0, warning: 'Importação guiada deve ser executada pelo utilitário de migração para preservar histórico.' }; }

  @Post('import-subscriptions') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  importSubscriptions() { return { updated: 0, warning: 'Use o reconciliador de assinaturas do worker.' }; }

  @Get(':customerId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  detail(@CurrentUnitId() unitId: string, @Param('customerId') id: string) { return this.service.detail(unitId, id); }

  @Patch(':customerId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  update(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Body() dto: UpdatePrimaryDto, @CurrentUser() actor: User) {
    return this.service.updatePrimary(unitId, id, dto, actor.id);
  }

  @Patch(':customerId/company-contacts') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  updateCompanyContacts(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Body() dto: UpdateCompanyContactsDto, @CurrentUser() actor: User) {
    return this.service.updateCompanyContacts(unitId, id, dto, actor.id);
  }

  @Post(':customerId/suspend') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  suspend(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Body() dto: SuspendSubscriptionDto, @CurrentUser() actor: User) {
    return this.service.suspend(unitId, id, dto, actor);
  }

  @Post(':customerId/cancel') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  cancel(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Body() dto: CancelSubscriptionDto, @CurrentUser() actor: User) {
    return this.service.cancel(unitId, id, dto, actor);
  }

  @Post(':customerId/reactivate') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  reactivate(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @CurrentUser() actor: User) {
    return this.service.reactivate(unitId, id, actor);
  }

  @Post(':customerId/create-payment') @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  payment(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Body() dto: CreatePaymentDto) {
    return this.service.createPayment(unitId, id, dto);
  }

  @Get(':customerId/invoices') @RequirePermissions(PERMISSIONS.BILLING_READ)
  invoices(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Query('limit') limit = 20, @Query('offset') offset = 0) {
    return this.service.invoices(unitId, id, +limit, +offset);
  }

  @Get(':customerId/debts') @RequirePermissions(PERMISSIONS.BILLING_READ)
  debts(@CurrentUnitId() unitId: string, @Param('customerId') id: string) { return this.service.debtSummary(unitId, id); }

  @Post(':customerId/debts/settle') @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  settleDebts(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Body() dto: SettleDebtsDto, @CurrentUser() actor: User) {
    return this.service.settleDebts(unitId, id, dto, actor);
  }

  @Post(':customerId/dependents') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  add(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Body() dto: CreateDependentDto, @CurrentUser() actor: User) {
    return this.service.addDependent(unitId, id, dto, actor.id);
  }

  @Patch(':customerId/dependents/:dependentId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  updateDep(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Param('dependentId') memberId: string, @Body() dto: UpdateDependentDto, @CurrentUser() actor: User) {
    return this.service.updateDependent(unitId, id, memberId, dto, actor.id);
  }

  @Delete(':customerId/dependents/:dependentId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  removeDep(@CurrentUnitId() unitId: string, @Param('customerId') id: string, @Param('dependentId') memberId: string, @CurrentUser() actor: User) {
    return this.service.removeDependent(unitId, id, memberId, actor.id);
  }

  @Post(':customerId/sync') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE)
  syncOne(@CurrentUnitId() unitId: string) { return this.service.syncStatus(unitId); }
}

@ApiTags('Interno - Assinaturas')
@Controller('internal/subscriptions')
export class InternalSubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Post('enforce-delinquency')
  enforce(@Headers('x-internal-worker-token') token: string) {
    if (!token || token !== process.env.INTERNAL_WORKER_TOKEN) throw new UnauthorizedException();
    return this.service.enforceDelinquencyGrace();
  }
}
