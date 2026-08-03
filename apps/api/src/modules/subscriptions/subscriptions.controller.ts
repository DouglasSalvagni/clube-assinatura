import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { User } from '../../database/entities';
import { AsaasClient } from '../billing/asaas.client';
import { CancelSubscriptionDto, CreateDependentDto, CreatePaymentDto, UpdateDependentDto, UpdatePrimaryDto } from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Assinaturas') @ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}
  @Get() @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  list(@CurrentUnitIds() ids: string[] | null, @Query('page') page=1, @Query('limit') limit=20, @Query('search') search?:string, @Query('status') status?:string) {
    return this.service.listLives(ids,{page:+page,limit:Math.min(+limit,100),search,status});
  }
  @Get(':id') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ) detail(@CurrentUnitId() unitId:string,@Param('id')id:string){return this.service.detail(unitId,id)}
  @Patch(':id') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) update(@CurrentUnitId()u:string,@Param('id')id:string,@Body()d:UpdatePrimaryDto){return this.service.updatePrimary(u,id,d)}
  @Post(':id/cancel') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) cancel(@CurrentUnitId()u:string,@Param('id')id:string,@Body()d:CancelSubscriptionDto,@CurrentUser()a:User){return this.service.cancel(u,id,d,a)}
  @Post(':id/reactivate') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) reactivate(@CurrentUnitId()u:string,@Param('id')id:string,@CurrentUser()a:User){return this.service.reactivate(u,id,a)}
  @Post(':id/members') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) add(@CurrentUnitId()u:string,@Param('id')id:string,@Body()d:CreateDependentDto){return this.service.addDependent(u,id,d)}
  @Patch(':id/members/:memberId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) updateMember(@CurrentUnitId()u:string,@Param('id')id:string,@Param('memberId')m:string,@Body()d:UpdateDependentDto){return this.service.updateDependent(u,id,m,d)}
  @Delete(':id/members/:memberId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) removeMember(@CurrentUnitId()u:string,@Param('id')id:string,@Param('memberId')m:string,@CurrentUser()a:User){return this.service.removeDependent(u,id,m,a.id)}
  @Get(':id/invoices') @RequirePermissions(PERMISSIONS.BILLING_READ) invoices(@CurrentUnitId()u:string,@Param('id')id:string,@Query('limit')l=20,@Query('offset')o=0){return this.service.invoices(u,id,+l,+o)}
  @Post(':id/payments') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) payment(@CurrentUnitId()u:string,@Param('id')id:string,@Body()d:CreatePaymentDto){return this.service.createPayment(u,id,d)}
}

@ApiTags('Compatibilidade - Vidas') @ApiBearerAuth()
@Controller('vidas')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class LivesCompatibilityController {
  constructor(private readonly service: SubscriptionsService, private readonly asaas: AsaasClient) {}
  @Get() @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  list(@CurrentUnitIds() ids:string[]|null,@Query('page')page=1,@Query('limit')limit=15,@Query('search')search?:string,@Query('status')status?:string,@Query('subscription')subscription?:string,@Query('estado')estado?:string){return this.service.listLives(ids,{page:+page,limit:Math.min(+limit,100),search,status,subscription,estado})}
  @Post('sync-status') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) sync(@CurrentUnitId()u:string){return this.service.syncStatus(u)}
  @Post('import-all') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) importAll(){return {imported:0,warning:'Importação guiada deve ser executada pelo utilitário de migração para preservar histórico.'}}
  @Post('import-subscriptions') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) importSubscriptions(){return {updated:0,warning:'Use o reconciliador de assinaturas do worker.'}}
  @Get(':customerId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ) detail(@CurrentUnitId()u:string,@Param('customerId')id:string){return this.service.detail(u,id)}
  @Patch(':customerId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) update(@CurrentUnitId()u:string,@Param('customerId')id:string,@Body()d:UpdatePrimaryDto){return this.service.updatePrimary(u,id,d)}
  @Post(':customerId/cancel') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) cancel(@CurrentUnitId()u:string,@Param('customerId')id:string,@Body()d:CancelSubscriptionDto,@CurrentUser()a:User){return this.service.cancel(u,id,d,a)}
  @Post(':customerId/reactivate') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) reactivate(@CurrentUnitId()u:string,@Param('customerId')id:string,@CurrentUser()a:User){return this.service.reactivate(u,id,a)}
  @Post(':customerId/create-payment') @RequirePermissions(PERMISSIONS.BILLING_MANAGE) payment(@CurrentUnitId()u:string,@Param('customerId')id:string,@Body()d:CreatePaymentDto){return this.service.createPayment(u,id,d)}
  @Get(':customerId/invoices') @RequirePermissions(PERMISSIONS.BILLING_READ) invoices(@CurrentUnitId()u:string,@Param('customerId')id:string,@Query('limit')l=20,@Query('offset')o=0){return this.service.invoices(u,id,+l,+o)}
  @Post(':customerId/dependents') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) add(@CurrentUnitId()u:string,@Param('customerId')id:string,@Body()d:CreateDependentDto){return this.service.addDependent(u,id,d)}
  @Patch(':customerId/dependents/:dependentId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) updateDep(@CurrentUnitId()u:string,@Param('customerId')id:string,@Param('dependentId')m:string,@Body()d:UpdateDependentDto){return this.service.updateDependent(u,id,m,d)}
  @Delete(':customerId/dependents/:dependentId') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) removeDep(@CurrentUnitId()u:string,@Param('customerId')id:string,@Param('dependentId')m:string,@CurrentUser()a:User){return this.service.removeDependent(u,id,m,a.id)}
  @Post(':customerId/sync') @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_MANAGE) syncOne(@CurrentUnitId()u:string){return this.service.syncStatus(u)}
}
