import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ALL_ENTITIES } from './database/entities';
import { AuthModule } from './modules/auth/auth.module';
import { UnitsModule } from './modules/units/units.module';
import { UsersModule } from './modules/users/users.module';
import { PeopleModule } from './modules/people/people.module';
import { PlansModule } from './modules/plans/plans.module';
import { TeamsModule } from './modules/teams/teams.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SalesModule } from './modules/sales/sales.module';
import { ProfileModule } from './modules/profile/profile.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { AccessControlModule } from './common/access-control.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { redisConnectionOptions } from './common/utils/redis';
import { CommercialModule } from './modules/commercial/commercial.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: ALL_ENTITIES,
      synchronize: false,
      logging: process.env.TYPEORM_LOGGING === 'true',
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      autoLoadEntities: false,
    }),
    BullModule.forRoot({ connection: redisConnectionOptions() }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AccessControlModule,
    LifecycleModule,
    AuthModule,
    UnitsModule,
    UsersModule,
    PeopleModule,
    PlansModule,
    TeamsModule,
    OpportunitiesModule,
    CommercialModule,
    SubscriptionsModule,
    BillingModule,
    WebhooksModule,
    AnalyticsModule,
    SalesModule,
    ProfileModule,
    AuditModule,
    HealthModule,
  ],
})
export class AppModule {}
