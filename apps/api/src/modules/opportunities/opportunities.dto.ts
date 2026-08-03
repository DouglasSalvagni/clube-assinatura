import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { BillingCycle, BillingType } from '../../database/entities';
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
  @IsOptional() @IsEnum(BillingCycle) cycle?: BillingCycle;
  @IsOptional() @IsUUID() planPriceId?: string;
  @IsOptional() @IsString() acquisitionSource?: string;
  @IsOptional() @IsString() notes?: string;
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
