import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BillingEnvironment } from '../../database/entities';

export class ConfigureBillingDto {
  @IsEnum(BillingEnvironment)
  environment: BillingEnvironment;

  @IsOptional()
  @IsString()
  @MinLength(10)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(255)
  webhookSecret?: string;

  @IsOptional()
  @IsEmail()
  webhookEmail?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
