import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { BillingCycle, BillingType } from '../../database/entities';
export class CreatePlanDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) maxDependents?: number;
  @IsOptional() @IsArray() benefits?: any[];
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsEnum(BillingCycle) billingCycle?: BillingCycle;
  @IsOptional() @IsEnum(BillingType) billingType?: BillingType;
}
export class UpdatePlanDto extends CreatePlanDto {
  @IsOptional() declare code: string;
  @IsOptional() declare name: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class CreatePlanPriceDto {
  @IsNumber() @Min(0) amount: number;
  @IsEnum(BillingCycle) billingCycle: BillingCycle;
  @IsOptional() @IsEnum(BillingType) billingType?: BillingType;
  @IsOptional() @IsString() effectiveFrom?: string;
}
