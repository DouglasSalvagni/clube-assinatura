import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Membership, Unit } from '../database/entities';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { UnitAccessGuard } from './guards/unit-access.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Unit, Membership])],
  providers: [JwtAuthGuard, UnitAccessGuard, PermissionsGuard],
  exports: [JwtAuthGuard, UnitAccessGuard, PermissionsGuard],
})
export class AccessControlModule {}
