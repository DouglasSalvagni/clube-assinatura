import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpServer } from '@nestjs/common/interfaces';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request } from 'express';

type RequestWithContext = Request & {
  user?: { id?: string };
  unitId?: string;
};

/**
 * O Nest não registra por padrão exceções HTTP tratadas, como os 400 gerados
 * pelo ValidationPipe. Este filtro mantém a resposta padrão e adiciona um log
 * sanitizado, sem corpo da requisição, senha, token ou dados pessoais.
 */
@Catch(HttpException)
export class HttpExceptionLoggingFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(applicationRef?: HttpServer) {
    super(applicationRef);
  }

  override catch(exception: HttpException, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<RequestWithContext>();
    const status = exception.getStatus();
    const response = exception.getResponse();
    const responseMessage = typeof response === 'string'
      ? response
      : response && typeof response === 'object' && 'message' in response
        ? (response as { message?: unknown }).message
        : exception.message;

    const context = JSON.stringify({
      method: request.method,
      path: request.originalUrl || request.url,
      status,
      message: responseMessage,
      userId: request.user?.id || null,
      unitId: request.unitId
        || request.headers['x-unit-id']
        || request.headers['x-tenant-id']
        || null,
    });

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(context, exception.stack);
    } else {
      this.logger.warn(context);
    }

    super.catch(exception, host);
  }
}
