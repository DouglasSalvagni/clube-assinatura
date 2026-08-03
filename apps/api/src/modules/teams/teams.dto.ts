import { IsOptional, IsString, IsUUID } from 'class-validator';
export class CreateTeamDto { @IsString() name:string; @IsOptional() @IsString() description?:string; }
export class UpdateTeamDto { @IsOptional() @IsString() name?:string; @IsOptional() @IsString() description?:string; }
export class AddTeamMemberDto { @IsUUID() userId:string; }
