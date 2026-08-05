import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { BillingCycle, BillingType, CommercialStatus, CustomerType } from '../../database/entities';
import { EmptyToUndefined } from '../../common/decorators/empty-to-undefined.decorator';
const digits = ({ value }: { value: any }) => value == null ? value : String(value).replace(/\D/g, '');
export class CreateOpportunityDto {
  @IsString() nome: string;
  @IsOptional() @IsString() @Transform(digits) cpfCnpj?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() @Transform(digits) telefone?: string;
  @IsOptional() @IsDateString() dataNascimento?: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() enderecoNumero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() @Transform(digits) cep?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsNumber() @Min(0) valor?: number;
  @IsOptional() @IsEnum(BillingType) billingType?: BillingType;
  @IsOptional() @IsArray() @IsEnum(BillingType, { each: true }) allowedBillingTypes?: BillingType[];
  @IsOptional() @IsEnum(BillingCycle) cycle?: BillingCycle;
  @EmptyToUndefined() @IsOptional() @IsUUID() planPriceId?: string;
  @IsOptional() @IsString() acquisitionSource?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(CustomerType) customerType?: CustomerType;
  @IsOptional() @IsEnum(CommercialStatus) commercialStatus?: CommercialStatus;
  @EmptyToUndefined() @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() negotiation?: Record<string, any>;
}
export class UpdateOpportunityDto extends CreateOpportunityDto { @IsOptional() declare nome: string; }
export class CreateOpportunityDependentDto {
  @IsString() nome:string;
  @IsString() @Transform(digits) cpf:string;
  @IsOptional() @IsString() relationship?:string;
  @IsOptional() @IsDateString() dataNascimento?:string;
}
export class UpdateOpportunityDependentDto extends CreateOpportunityDependentDto { @IsOptional() declare nome:string; @IsOptional() declare cpf:string; }
export class CancelOpportunityDto { @IsString() @MinLength(10) motivo:string; }

export class AssignOpportunityDto {
  @EmptyToUndefined() @IsOptional() @IsUUID() ownerUserId?: string | null;
  @EmptyToUndefined() @IsOptional() @IsUUID() teamId?: string | null;
}
export class MoveOpportunityStageDto {
  @IsUUID() stageId: string;
}


export enum AutomaticDistributionMode {
  QUEUE_ONLY = 'QUEUE_ONLY',
  REBALANCE_ALL = 'REBALANCE_ALL',
}

export class BulkAssignOpportunitiesDto {
  @IsUUID() teamId: string;
  @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) opportunityIds: string[];
  @IsOptional() @IsUUID() ownerUserId?: string | null;
}

export class AutoDistributeOpportunitiesDto {
  @IsUUID() teamId: string;
  @IsOptional() @IsEnum(AutomaticDistributionMode) mode?: AutomaticDistributionMode;
  @IsOptional() @IsBoolean() includeManager?: boolean;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsUUID(undefined, { each: true }) opportunityIds?: string[];
}
