import { IsArray, IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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


export class ConfigureAsaasWebhookDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['SEQUENTIALLY', 'NON_SEQUENTIALLY'])
  sendType?: 'SEQUENTIALLY' | 'NON_SEQUENTIALLY';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];
}
