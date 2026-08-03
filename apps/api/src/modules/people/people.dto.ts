import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { PersonKind } from '../../database/entities';
const digits = ({ value }: { value: any }) => value == null ? value : String(value).replace(/\D/g, '');
export class CreatePersonDto {
  @IsOptional() @IsEnum(PersonKind) kind?: PersonKind;
  @IsString() name: string;
  @IsOptional() @IsString() @Transform(digits) taxId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Transform(digits) phone?: string;
  @IsOptional() @IsString() @Transform(digits) whatsapp?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() addressNumber?: string;
  @IsOptional() @IsString() complement?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() @Transform(digits) postalCode?: string;
  @IsOptional() @IsObject() metadata?: Record<string, any>;
}
export class UpdatePersonDto extends CreatePersonDto { @IsOptional() declare name: string; }
