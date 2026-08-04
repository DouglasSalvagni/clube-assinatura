import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { Membership, User } from '../../database/entities';
import { AssignOpportunityDto, CancelOpportunityDto, CreateOpportunityDependentDto, CreateOpportunityDto, MoveOpportunityStageDto, UpdateOpportunityDependentDto, UpdateOpportunityDto } from './opportunities.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('Oportunidades') @ApiBearerAuth()
@Controller('oportunidades')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService) {}

  @Get() @RequirePermissions(PERMISSIONS.OPPORTUNITIES_READ)
  list(
    @CurrentUnitIds() unitIds:string[]|null,
    @CurrentUser()user:User,
    @CurrentMembership()membership:Membership|null,
    @Query('page')page=1,
    @Query('limit')limit=15,
    @Query('search')search?:string,
    @Query('status')status?:string,
    @Query('ownerUserId')ownerUserId?:string,
    @Query('teamId')teamId?:string,
    @Query('customerType')customerType?:any,
    @Query('commercialStatus')commercialStatus?:any,
  ){
    return this.service.list(
      unitIds,user.id,membership?.role||null,user.globalRole,+page,Math.min(+limit,100),search,status,
      {ownerUserId,teamId,customerType,commercialStatus},
    );
  }
  @Get('board/kanban') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_READ)
  kanban(
    @CurrentUnitIds() unitIds:string[]|null,
    @CurrentUser()user:User,
    @CurrentMembership()membership:Membership|null,
    @Query('ownerUserId')ownerUserId?:string,
    @Query('teamId')teamId?:string,
    @Query('customerType')customerType?:any,
    @Query('commercialStatus')commercialStatus?:any,
  ){
    return this.service.kanban(
      unitIds,user.id,membership?.role||null,user.globalRole,
      {ownerUserId,teamId,customerType,commercialStatus},
    );
  }
  @Post() @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  create(@CurrentUnitId()unitId:string,@CurrentUser()user:User,@Body()dto:CreateOpportunityDto){return this.service.create(unitId,user.id,dto)}
  @Get(':id') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_READ)
  detail(@CurrentUnitId()unitId:string,@Param('id')id:string,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null){return this.service.detail(unitId,id,user.id,membership?.role||null,user.globalRole)}
  @Patch(':id') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  update(@CurrentUnitId()unitId:string,@Param('id')id:string,@Body()dto:UpdateOpportunityDto,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null){return this.service.update(unitId,id,dto,user.id,membership?.role||null,user.globalRole)}
  @Patch(':id/assignment') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_ASSIGN)
  assign(
    @CurrentUnitId()unitId:string,
    @Param('id')id:string,
    @Body()dto:AssignOpportunityDto,
    @CurrentUser()user:User,
    @CurrentMembership()membership:Membership|null,
  ){
    return this.service.assign(unitId,id,dto,user.id,membership?.role||null,user.globalRole);
  }
  @Patch(':id/stage') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  moveStage(
    @CurrentUnitId()unitId:string,
    @Param('id')id:string,
    @Body()dto:MoveOpportunityStageDto,
    @CurrentUser()user:User,
    @CurrentMembership()membership:Membership|null,
  ){
    return this.service.moveStage(unitId,id,dto,user.id,membership?.role||null,user.globalRole);
  }
  @Delete(':id') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  remove(@CurrentUnitId()unitId:string,@Param('id')id:string,@Body()dto:CancelOpportunityDto,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null){return this.service.cancel(unitId,id,dto.motivo,user.id,membership?.role||null,user.globalRole)}
  @Post(':id/dependentes') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  addDependent(@CurrentUnitId()unitId:string,@Param('id')id:string,@Body()dto:CreateOpportunityDependentDto,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null){return this.service.addDependent(unitId,id,dto,user.id,membership?.role||null,user.globalRole)}
  @Patch(':id/dependentes/:dependenteId') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  updateDependent(@CurrentUnitId()unitId:string,@Param('id')id:string,@Param('dependenteId')memberId:string,@Body()dto:UpdateOpportunityDependentDto,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null){return this.service.updateDependent(unitId,id,memberId,dto,user.id,membership?.role||null,user.globalRole)}
  @Delete(':id/dependentes/:dependenteId') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  deleteDependent(@CurrentUnitId()unitId:string,@Param('id')id:string,@Param('dependenteId')memberId:string,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null){return this.service.deleteDependent(unitId,id,memberId,user.id,membership?.role||null,user.globalRole)}
  @Post(':id/checkout') @RequirePermissions(PERMISSIONS.CHECKOUT_GENERATE)
  checkout(@CurrentUnitId()unitId:string,@Param('id')id:string,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null){return this.service.generateCheckout(unitId,id,user,membership?.role||null)}
  @Get(':id/payment-book') @RequirePermissions(PERMISSIONS.BILLING_READ)
  async paymentBook(@CurrentUnitId()unitId:string,@Param('id')id:string,@CurrentUser()user:User,@CurrentMembership()membership:Membership|null,@Res()res:Response){const buffer=await this.service.paymentBook(unitId,id,user.id,membership?.role||null,user.globalRole);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="carne-${id}.pdf"`);res.send(buffer)}
}
