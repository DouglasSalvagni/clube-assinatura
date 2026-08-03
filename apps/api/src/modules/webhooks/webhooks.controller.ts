import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { WebhookStatus } from '../../database/entities';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks Asaas')
@Controller()
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Post('webhooks/asaas/:slug')
  receive(@Param('slug') slug: string, @Body() payload: unknown, @Req() request: Request) {
    return this.service.receive(slug, payload, request.headers as Record<string, unknown>);
  }

  @Post('internal/webhooks/:id/process')
  process(@Param('id') id: string, @Headers('x-internal-worker-token') token: string) {
    if (!token || token !== process.env.INTERNAL_WORKER_TOKEN) throw new UnauthorizedException();
    return this.service.process(id);
  }
}

@ApiTags('Operação de webhooks')
@ApiBearerAuth()
@Controller('webhooks/events')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class WebhookEventsController {
  constructor(private readonly service: WebhooksService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BILLING_READ)
  list(
    @CurrentUnitIds() unitIds: string[] | null,
    @Query('status', new ParseEnumPipe(WebhookStatus, { optional: true })) status?: WebhookStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 30,
  ) {
    return this.service.list(unitIds, status, Number(page), Number(limit));
  }

  @Post(':id/retry')
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  retry(@CurrentUnitId() unitId: string, @Param('id') id: string) {
    return this.service.retry(unitId, id);
  }
}
