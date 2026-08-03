import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { BillingEnvironment } from '../../database/entities';
export class ConfigureBillingDto {
  @IsEnum(BillingEnvironment) environment: BillingEnvironment;
  @IsOptional() @IsString() @MinLength(10) apiKey?: string;
  @IsOptional() @IsString() @MinLength(16) webhookSecret?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
