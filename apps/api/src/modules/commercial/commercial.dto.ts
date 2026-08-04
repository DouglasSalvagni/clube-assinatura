import { Type, Transform } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsObject, IsOptional,
  IsString, IsUUID, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { BillingCycle, BillingType, ContractRelationType, CustomerType } from '../../database/entities';
import { EmptyToUndefined } from '../../common/decorators/empty-to-undefined.decorator';

export class DiscountDto {
  @IsIn(['PERCENTAGE', 'FIXED']) type: 'PERCENTAGE' | 'FIXED';
  @IsNumber() @Min(0) value: number;
  @IsOptional() @IsString() reason?: string;
}

export class SimulateNegotiationDto {
  @IsEnum(CustomerType) customerType: CustomerType;
  @IsEnum(BillingCycle) cycle: BillingCycle;
  @IsOptional() @IsEnum(BillingType) billingType?: BillingType;
  @IsNumber() @Min(0) baseAmount: number;
  @IsOptional() @IsNumber() @Min(0) dependentAmount?: number;
  @IsOptional() @IsInt() @Min(0) dependentCount?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsInt() @Min(1) lives?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DiscountDto) discounts?: DiscountDto[];
}

export class CreatePolicyDto {
  @IsString() name: string;
  @IsOptional() @IsIn(['OWNER','ADMIN','MANAGER','SALES','FINANCE','SUPPORT','VIEWER']) targetRole?: any;
  @EmptyToUndefined() @IsOptional() @IsUUID() targetUserId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) maxDiscountPercent?: number;
  @IsOptional() @IsNumber() @Min(0) maxDiscountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) minUnitPrice?: number;
  @IsOptional() @IsArray() @IsEnum(BillingType, { each: true }) allowedBillingTypes?: BillingType[];
  @IsOptional() @IsObject() rules?: Record<string, any>;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RequestApprovalDto { @IsString() @MinLength(5) reason: string; }
export class DecideApprovalDto {
  @IsIn(['APPROVED','REJECTED']) decision: 'APPROVED'|'REJECTED';
  @IsOptional() @IsString() notes?: string;
}
export class CreatePrecheckoutDto { @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number; }

export class UpdatePrecheckoutCustomerDto {
  @IsString() name: string;
  @IsString() @Transform(({value})=>String(value).replace(/\D/g,'')) taxId: string;
  @IsEmail() email: string;
  @IsString() phone: string;
  @IsString() postalCode: string;
  @IsString() address: string;
  @IsString() addressNumber: string;
  @IsString() district: string;
  @IsString() city: string;
  @IsString() state: string;
  @IsOptional() @IsString() complement?: string;
}
export class PrecheckoutParticipantDto {
  @IsString() name: string;
  @IsString() @Transform(({value})=>String(value).replace(/\D/g,'')) taxId: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() relationship?: string;
}
export class AcceptContractDto {
  @IsString() acceptedByName: string;
  @IsString() acceptedByTaxId: string;
  @IsBoolean() accepted: boolean;
}

export class StartAsaasCheckoutDto {
  @IsEnum(BillingType) billingType: BillingType;
}


export class CreateCommercialOfferDto {
  @IsString() name: string;
  @IsString() code: string;
  @IsEnum(CustomerType) customerType: CustomerType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() publicSlug?: string;
  @EmptyToUndefined() @IsOptional() @IsUUID() assignmentTeamId?: string;
  @EmptyToUndefined() @IsOptional() @IsUUID() assignmentUserId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
}

export class CreateCommercialOfferVersionDto {
  @IsEnum(BillingCycle) billingCycle: BillingCycle;
  @IsOptional() @IsNumber() @Min(0) holderAmount?: number;
  @IsOptional() @IsNumber() @Min(0) dependentAmount?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsInt() @Min(1) includedLives?: number;
  @IsOptional() @IsInt() @Min(0) maxDependents?: number;
  @IsOptional() @IsInt() @Min(1) minLives?: number;
  @IsOptional() @IsInt() @Min(1) maxLives?: number;
  @IsArray() @IsEnum(BillingType, { each: true }) allowedBillingTypes: BillingType[];
  @IsOptional() @IsObject() pricingRules?: Record<string, any>;
  @EmptyToUndefined() @IsOptional() @IsUUID() contractTemplateVersionId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
}

export class CreateCommercialPipelineDto {
  @IsString() name: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateCommercialPipelineStageDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsInt() @Min(0) position: number;
  @IsOptional() @IsIn(['DRAFT','NEGOTIATION','PENDING_APPROVAL','APPROVED','CHECKOUT_SENT','CONVERTED','LOST'])
  commercialStatus?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateContractTemplateDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsEnum(CustomerType) customerType: CustomerType;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
}

export class CreateContractTemplateVersionDto {
  @IsString() @MinLength(20) content: string;
  @IsArray() @IsString({ each: true }) variables: string[];
}

export class SimulatePublicOfferDto {
  @IsOptional() @IsInt() @Min(0) dependentCount?: number;
  @IsOptional() @IsInt() @Min(1) lives?: number;
}

export class StartPublicOfferDto extends UpdatePrecheckoutCustomerDto {
  @IsOptional() @IsInt() @Min(0) dependentCount?: number;
  @IsOptional() @IsInt() @Min(1) lives?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrecheckoutParticipantDto)
  participants?: PrecheckoutParticipantDto[];
}

export class UpdateCompanyContactsDto {
  @IsString() legalRepresentativeName: string;
  @IsString() legalRepresentativeTaxId: string;
  @IsEmail() financialEmail: string;
  @IsString() financialContactName: string;
  @IsString() financialPhone: string;
}

export class ContractRevisionTermsDto {
  @IsOptional() @IsDateString() effectiveAt?: string;
  @IsOptional() @IsEnum(BillingCycle) cycle?: BillingCycle;
  @IsOptional() @IsNumber() @Min(0) holderAmount?: number;
  @IsOptional() @IsNumber() @Min(0) dependentAmount?: number;
  @IsOptional() @IsInt() @Min(0) dependentCount?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsInt() @Min(1) lives?: number;
  @IsOptional() @IsArray() @IsEnum(BillingType, { each: true }) allowedBillingTypes?: BillingType[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DiscountDto) discounts?: DiscountDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateContractRevisionDto {
  @IsIn([ContractRelationType.AMENDMENT, ContractRelationType.RENEWAL, ContractRelationType.REPLACEMENT])
  relationType: ContractRelationType;
  @IsString() @MinLength(5) reason: string;
  @ValidateNested() @Type(() => ContractRevisionTermsDto) changes: ContractRevisionTermsDto;
  @IsOptional() @IsBoolean() requiresPayment?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}

export class UpdateCommercialFeatureDto {
  @IsBoolean() enabled: boolean;
}

