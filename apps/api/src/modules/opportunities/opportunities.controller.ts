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
import { CancelOpportunityDto, CreateOpportunityDependentDto, CreateOpportunityDto, UpdateOpportunityDependentDto, UpdateOpportunityDto } from './opportunities.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('Oportunidades') @ApiBearerAuth()
@Controller('oportunidades')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService) {}

  @Get() @RequirePermissions(PERMISSIONS.OPPORTUNITIES_READ)
  list(@CurrentUnitIds() unitIds:string[]|null,@Query('page')page=1,@Query('limit')limit=15,@Query('search')search?:string,@Query('status')status?:string){return this.service.list(unitIds,+page,Math.min(+limit,100),search,status)}
  @Post() @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  create(@CurrentUnitId()unitId:string,@CurrentUser()user:User,@Body()dto:CreateOpportunityDto){return this.service.create(unitId,user.id,dto)}
  @Get(':id') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_READ)
  detail(@CurrentUnitId()unitId:string,@Param('id')id:string){return this.service.detail(unitId,id)}
  @Patch(':id') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  update(@CurrentUnitId()unitId:string,@Param('id')id:string,@Body()dto:UpdateOpportunityDto){return this.service.update(unitId,id,dto)}
  @Delete(':id') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  remove(@CurrentUnitId()unitId:string,@Param('id')id:string,@Body()dto:CancelOpportunityDto,@CurrentUser()user:User){return this.service.cancel(unitId,id,dto.motivo,user.id)}
  @Post(':id/dependentes') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  addDependent(@CurrentUnitId()unitId:string,@Param('id')id:string,@Body()dto:CreateOpportunityDependentDto){return this.service.addDependent(unitId,id,dto)}
  @Patch(':id/dependentes/:dependenteId') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  updateDependent(@CurrentUnitId()unitId:string,@Param('id')id:string,@Param('dependenteId')memberId:string,@Body()dto:UpdateOpportunityDependentDto){return this.service.updateDependent(unitId,id,memberId,dto)}
  @Delete(':id/dependentes/:dependenteId') @RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
  deleteDependent(@CurrentUnitId()unitId:string,@Param('id')id:string,@Param('dependenteId')memberId:string){return this.service.deleteDependent(unitId,id,memberId)}
  @Post(':id/checkout') @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  checkout(@CurrentUnitId()unitId:string,@Param('id')id:string,@CurrentUser()user:User){return this.service.generateCheckout(unitId,id,user)}
  @Get(':id/payment-book') @RequirePermissions(PERMISSIONS.BILLING_READ)
  async paymentBook(@CurrentUnitId()unitId:string,@Param('id')id:string,@Res()res:Response){const buffer=await this.service.paymentBook(unitId,id);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="carne-${id}.pdf"`);res.send(buffer)}
}
