import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTeamDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() managerId?: string | null;
}

export class UpdateTeamDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() managerId?: string | null;
}

export class AddTeamMemberDto {
  @IsUUID() userId: string;
}
