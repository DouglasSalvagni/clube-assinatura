import { Transform } from 'class-transformer';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateUnitDto {
  @IsString() @Matches(/^[a-z0-9-]+$/) @MaxLength(80) slug: string;
  @IsString() @MaxLength(180) name: string;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() @Transform(({ value }) => value?.replace(/\D/g, '')) taxId?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsObject() settings?: Record<string, any>;
  @IsOptional() @IsObject() branding?: Record<string, any>;
}
export class UpdateUnitDto extends CreateUnitDto {
  @IsOptional() declare slug: string;
  @IsOptional() declare name: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
