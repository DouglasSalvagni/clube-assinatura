import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Membership, Unit } from '../../database/entities';
import { AuthModule } from '../auth/auth.module';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';
@Module({ imports: [TypeOrmModule.forFeature([Unit, Membership]), AuthModule], controllers: [UnitsController], providers: [UnitsService], exports: [UnitsService] })
export class UnitsModule {}
