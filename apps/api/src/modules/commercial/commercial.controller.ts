import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentMembership } from '../../common/decorators/current-membership.decorator';
import { CurrentUnitId } from '../../common/decorators/current-unit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { CustomerType, Membership, User } from '../../database/entities';
import {
  AcceptContractDto,
  CreateCommercialOfferDto,
  CreateCommercialOfferVersionDto,
  CreateCommercialPriceTableVersionDto,
  CreateCommercialPipelineDto,
  CreateCommercialPipelineStageDto,
  CreateContractRevisionDto,
  CreateContractTemplateDto,
  CreateContractTemplateVersionDto,
  CreatePolicyDto,
  DecideApprovalDto,
  PrecheckoutParticipantDto,
  RequestApprovalDto,
  SimulateNegotiationDto,
  SimulatePublicOfferDto,
  StartAsaasCheckoutDto,
  StartPublicOfferDto,
  UpdateCommercialFeatureDto,
  UpdateCompanyContactsDto,
  UpdatePrecheckoutCustomerDto,
} from './commercial.dto';
import { CommercialConfigService } from './commercial-config.service';
import { CommercialWorkflowService } from './commercial-workflow.service';
import { CommercialMetricsService } from './commercial-metrics.service';
import { CommercialFeatureService } from './commercial-feature.service';
import { PricingService } from './pricing.service';

@ApiTags('Comercial')
@ApiBearerAuth()
@Controller('commercial')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class CommercialController {
  constructor(
    private readonly pricing: PricingService,
    private readonly workflow: CommercialWorkflowService,
    private readonly config: CommercialConfigService,
    private readonly metricsService: CommercialMetricsService,
    private readonly featureService: CommercialFeatureService,
  ) {}

  @Post('pricing/simulate')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_EDIT)
  simulate(@Body() dto: SimulateNegotiationDto) {
    return this.pricing.calculate(dto);
  }

  @Get('opportunities/:id/contracts')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_EDIT)
  contracts(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: Membership | null,
  ) {
    return this.workflow.listContracts(unitId, id, user.id, membership?.role || null, user.globalRole);
  }

  @Post('contracts/:id/revisions')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_APPROVE)
  createContractRevision(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Body() dto: CreateContractRevisionDto,
    @CurrentUser() user: User,
    @CurrentMembership() membership: Membership | null,
  ) {
    return this.workflow.createContractRevision(unitId, id, dto, user.id, membership?.role || null, user.globalRole);
  }

  @Get('feature')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  featureStatus(@CurrentUnitId() unitId: string) {
    return this.featureService.status(unitId);
  }

  @Patch('feature')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  updateFeature(@CurrentUnitId() unitId: string, @Body() dto: UpdateCommercialFeatureDto) {
    return this.featureService.setEnabled(unitId, dto.enabled);
  }

  @Get('policies')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  policies(@CurrentUnitId() unitId: string) {
    return this.workflow.listPolicies(unitId);
  }

  @Post('policies')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createPolicy(@CurrentUnitId() unitId: string, @Body() dto: CreatePolicyDto, @CurrentUser() user: User) {
    return this.workflow.savePolicy(unitId, dto, undefined, user.id);
  }

  @Patch('policies/:id')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  updatePolicy(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Body() dto: CreatePolicyDto,
    @CurrentUser() user: User,
  ) {
    return this.workflow.savePolicy(unitId, dto, id, user.id);
  }

  @Post('policies/:id/activate')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  activatePolicy(@CurrentUnitId() unitId: string, @Param('id') id: string, @CurrentUser() user: User) {
    return this.workflow.setPolicyActive(unitId, id, true, user.id);
  }

  @Post('policies/:id/deactivate')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  deactivatePolicy(@CurrentUnitId() unitId: string, @Param('id') id: string, @CurrentUser() user: User) {
    return this.workflow.setPolicyActive(unitId, id, false, user.id);
  }

  @Delete('policies/:id')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  archivePolicy(@CurrentUnitId() unitId: string, @Param('id') id: string, @CurrentUser() user: User) {
    return this.workflow.archivePolicy(unitId, id, user.id);
  }

  @Post('policies/:id/restore')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  restorePolicy(@CurrentUnitId() unitId: string, @Param('id') id: string, @CurrentUser() user: User) {
    return this.workflow.restorePolicy(unitId, id, user.id);
  }

  @Get('approvals')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_APPROVE)
  approvals(@CurrentUnitId() unitId: string) {
    return this.workflow.listApprovals(unitId);
  }

  @Get('opportunities/:id/evaluation')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_EDIT)
  evaluateOpportunity(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: Membership | null,
  ) {
    return this.workflow.evaluateOpportunity(unitId, id, user.id, membership?.role || null, user.globalRole);
  }

  @Post('opportunities/:id/request-approval')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_REQUEST_APPROVAL)
  requestApproval(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: Membership | null,
    @Body() dto: RequestApprovalDto,
  ) {
    return this.workflow.requestApproval(unitId, id, user.id, membership?.role || null, dto);
  }

  @Post('approvals/:id/decision')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_APPROVE)
  decide(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.workflow.decide(unitId, id, user.id, dto);
  }

  @Post('opportunities/:id/precheckout')
  @RequirePermissions(PERMISSIONS.CHECKOUT_GENERATE)
  createPrecheckout(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: Membership | null,
  ) {
    return this.workflow.createPrecheckout(unitId, id, 7, user.id, membership?.role || null, user.globalRole);
  }

  @Post('opportunities/:id/precheckout/revoke')
  @RequirePermissions(PERMISSIONS.CHECKOUT_GENERATE)
  revokePrecheckout(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: Membership | null,
  ) {
    return this.workflow.revokePrecheckout(unitId, id, user.id, membership?.role || null, user.globalRole);
  }

  @Get('metrics')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  metrics(@CurrentUnitId() unitId: string, @Query('days') days = 30) {
    return this.metricsService.summary(unitId, Number(days));
  }

  @Get('offers')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  offers(@CurrentUnitId() unitId: string) {
    return this.config.listOffers(unitId);
  }

  @Post('offers')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createOffer(@CurrentUnitId() unitId: string, @Body() dto: CreateCommercialOfferDto) {
    return this.config.saveOffer(unitId, dto);
  }

  @Patch('offers/:id')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  updateOffer(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: CreateCommercialOfferDto) {
    return this.config.saveOffer(unitId, dto, id);
  }

  @Post('offers/:id/revoke')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  revokeOffer(@CurrentUnitId() unitId: string, @Param('id') id: string) {
    return this.config.revokeOffer(unitId, id);
  }

  @Post('offers/:id/restore')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  restoreOffer(@CurrentUnitId() unitId: string, @Param('id') id: string) {
    return this.config.restoreOffer(unitId, id);
  }

  @Post('offers/:id/versions')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createOfferVersion(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommercialOfferVersionDto,
  ) {
    return this.config.createOfferVersion(unitId, id, dto);
  }

  @Post('offers/:id/versions/:versionId/publish')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  publishOfferVersion(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.config.publishOfferVersion(unitId, id, versionId);
  }


  @Get('price-tables')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  priceTables(@CurrentUnitId() unitId: string) {
    return this.config.listPriceTableVersions(unitId);
  }

  @Get('price-tables/current')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_EDIT)
  currentPriceTable(
    @CurrentUnitId() unitId: string,
    @Query('customerType') customerType: CustomerType,
  ) {
    return this.config.currentPriceTable(unitId, customerType);
  }

  @Get('price-tables/versions/:versionId')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_EDIT)
  priceTableVersion(
    @CurrentUnitId() unitId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.config.priceTableVersion(unitId, versionId);
  }

  @Post('price-tables/versions')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createPriceTableVersion(
    @CurrentUnitId() unitId: string,
    @Body() dto: CreateCommercialPriceTableVersionDto,
  ) {
    return this.config.createPriceTableVersion(unitId, dto);
  }

  @Post('price-tables/versions/:versionId/publish')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  publishPriceTableVersion(
    @CurrentUnitId() unitId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.config.publishPriceTableVersion(unitId, versionId);
  }

  @Get('contract-template-options')
  @RequirePermissions(PERMISSIONS.NEGOTIATIONS_EDIT)
  contractTemplateOptions(
    @CurrentUnitId() unitId: string,
    @Query('customerType') customerType?: CustomerType,
  ) {
    return this.config.publishedTemplateOptions(unitId, customerType);
  }

  @Get('pipelines')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  pipelines(@CurrentUnitId() unitId: string) {
    return this.config.listPipelines(unitId);
  }

  @Post('pipelines')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createPipeline(@CurrentUnitId() unitId: string, @Body() dto: CreateCommercialPipelineDto) {
    return this.config.createPipeline(unitId, dto);
  }

  @Patch('pipelines/:id')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  updatePipeline(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommercialPipelineDto,
  ) {
    return this.config.updatePipeline(unitId, id, dto);
  }

  @Delete('pipelines/:id')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  removePipeline(@CurrentUnitId() unitId: string, @Param('id') id: string) {
    return this.config.archivePipeline(unitId, id);
  }

  @Post('pipelines/:id/stages')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createPipelineStage(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommercialPipelineStageDto,
  ) {
    return this.config.createStage(unitId, id, dto);
  }

  @Patch('pipelines/:id/stages/:stageId')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  updatePipelineStage(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() dto: CreateCommercialPipelineStageDto,
  ) {
    return this.config.updateStage(unitId, id, stageId, dto);
  }

  @Delete('pipelines/:id/stages/:stageId')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  removePipelineStage(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Param('stageId') stageId: string,
  ) {
    return this.config.archiveStage(unitId, id, stageId);
  }

  @Get('contract-templates')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  contractTemplates(@CurrentUnitId() unitId: string) {
    return this.config.listTemplates(unitId);
  }

  @Post('contract-templates')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createContractTemplate(@CurrentUnitId() unitId: string, @Body() dto: CreateContractTemplateDto) {
    return this.config.createTemplate(unitId, dto);
  }

  @Patch('contract-templates/:id')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  updateContractTemplate(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Body() dto: CreateContractTemplateDto,
  ) {
    return this.config.updateTemplate(unitId, id, dto);
  }

  @Post('contract-templates/:id/revoke')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  revokeContractTemplate(@CurrentUnitId() unitId: string, @Param('id') id: string) {
    return this.config.revokeTemplate(unitId, id);
  }

  @Post('contract-templates/:id/restore')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  restoreContractTemplate(@CurrentUnitId() unitId: string, @Param('id') id: string) {
    return this.config.restoreTemplate(unitId, id);
  }

  @Post('contract-templates/:id/versions')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  createContractTemplateVersion(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Body() dto: CreateContractTemplateVersionDto,
  ) {
    return this.config.createTemplateVersion(unitId, id, dto);
  }

  @Patch('contract-templates/:id/versions/:versionId')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  updateContractTemplateVersion(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateContractTemplateVersionDto,
  ) {
    return this.config.updateTemplateVersion(unitId, id, versionId, dto);
  }

  @Post('contract-templates/:id/versions/:versionId/publish')
  @RequirePermissions(PERMISSIONS.COMMERCIAL_CONFIG_MANAGE)
  publishContractTemplateVersion(
    @CurrentUnitId() unitId: string,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.config.publishTemplateVersion(unitId, id, versionId);
  }
}

@ApiTags('Ofertas públicas')
@Controller('public/offers')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicOffersController {
  constructor(private readonly config: CommercialConfigService) {}

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.config.publicOffer(slug);
  }

  @Post(':slug/simulate')
  simulate(@Param('slug') slug: string, @Body() dto: SimulatePublicOfferDto) {
    return this.config.simulatePublicOffer(slug, dto);
  }

  @Post(':slug/start')
  start(@Param('slug') slug: string, @Body() dto: StartPublicOfferDto) {
    return this.config.startPublicOffer(slug, dto);
  }
}

@ApiTags('Pré-checkout público')
@Controller('public/precheckout')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PublicPrecheckoutController {
  constructor(private readonly workflow: CommercialWorkflowService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.workflow.publicGet(token);
  }

  @Patch(':token/customer')
  customer(@Param('token') token: string, @Body() dto: UpdatePrecheckoutCustomerDto) {
    return this.workflow.updateCustomer(token, dto);
  }

  @Patch(':token/company-contacts')
  companyContacts(@Param('token') token: string, @Body() dto: UpdateCompanyContactsDto) {
    return this.workflow.updateCompanyContacts(token, dto);
  }

  @Post(':token/participants')
  participant(@Param('token') token: string, @Body() dto: PrecheckoutParticipantDto) {
    return this.workflow.addParticipant(token, dto);
  }

  @Post(':token/participants/:id/remove')
  remove(@Param('token') token: string, @Param('id') id: string) {
    return this.workflow.removeParticipant(token, id);
  }

  @Post(':token/contract')
  contract(@Param('token') token: string) {
    return this.workflow.prepareContract(token);
  }

  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptContractDto, @Req() req: Request) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim() || req.ip || null;
    return this.workflow.accept(token, dto, ip, req.headers['user-agent'] || null);
  }

  @Post(':token/payment')
  payment(@Param('token') token: string, @Body() dto: StartAsaasCheckoutDto) {
    return this.workflow.startAsaasCheckout(token, dto);
  }
}
