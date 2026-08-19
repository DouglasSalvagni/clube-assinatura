import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { BillingType } from '../../database/entities';

const digits = ({ value }: { value: any }) => value == null ? value : String(value).replace(/\D/g, '');
const emptyToUndefined = ({ value }: { value: any }) => value === '' || value == null ? undefined : value;

export class UpdatePrimaryDto {
  @IsOptional() @IsString() nome?: string;
  @IsOptional() @IsString() @Transform(digits) cpfCnpj?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsEmail() email?: string;
  @IsOptional() @IsString() @Transform(digits) telefone?: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() enderecoNumero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() estado?: string;
  @IsOptional() @IsString() @Transform(digits) cep?: string;
}

export class UpdateCompanyContactsDto {
  @IsString() legalRepresentativeName: string;
  @IsString() @Transform(digits) legalRepresentativeTaxId: string;
  @IsString() financialContactName: string;
  @IsEmail() financialEmail: string;
  @IsString() @Transform(digits) financialPhone: string;
}

export class CreateDependentDto {
  @IsString() nome: string;
  @IsString() @Transform(digits) cpf: string;
  @IsOptional() @IsString() @Transform(digits) telefone?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsEmail() email?: string;
  @IsOptional() @IsDateString() dataNascimento?: string;
  @IsOptional() @IsString() relationship?: string;
}

export class UpdateDependentDto extends CreateDependentDto {
  @IsOptional() declare nome: string;
  @IsOptional() declare cpf: string;
}

export class SuspendSubscriptionDto {
  @IsOptional() @IsString() reasonCode?: string;
  @IsString() @MinLength(10) reason: string;
}

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

export class SettleDebtsDto {
  @IsOptional() @IsDateString() dueDate?: string;
}
