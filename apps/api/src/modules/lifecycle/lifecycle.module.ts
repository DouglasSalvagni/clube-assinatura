import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LifecycleEvent } from '../../database/entities';
import { LifecycleService } from './lifecycle.service';
@Global()
@Module({ imports: [TypeOrmModule.forFeature([LifecycleEvent])], providers: [LifecycleService], exports: [LifecycleService] })
export class LifecycleModule {}
