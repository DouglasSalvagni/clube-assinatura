import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { BillingType } from '../../database/entities';
const digits = ({ value }: { value: any }) => value == null ? value : String(value).replace(/\D/g, '');
export class UpdatePrimaryDto {
  @IsOptional() @IsString() nome?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() @Transform(digits) telefone?: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() enderecoNumero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() @Transform(digits) cep?: string;
}
export class CreateDependentDto {
  @IsString() nome: string;
  @IsString() @Transform(digits) cpf: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsDateString() dataNascimento?: string;
  @IsOptional() @IsString() relationship?: string;
}
export class UpdateDependentDto extends CreateDependentDto { @IsOptional() declare nome: string; @IsOptional() declare cpf: string; }
export class CancelSubscriptionDto {
  @IsOptional() @IsString() reasonCode?: string;
  @IsString() @MinLength(10) reason: string;
}
export class CreatePaymentDto {
  @IsNumber() @Min(0.01) value: number;
  @IsDateString() dueDate: string;
  @IsEnum(BillingType) billingType: BillingType;
  @IsOptional() @IsString() description?: string;
}
