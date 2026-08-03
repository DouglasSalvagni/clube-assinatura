import { Body, Controller, Get, Headers, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '../../database/entities';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './auth.dto';
import { Request } from 'express';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent: string, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, false, { userAgent, ip });
  }

  @Post('admin/login')
  adminLogin(@Body() dto: LoginDto, @Headers('user-agent') userAgent: string, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, true, { userAgent, ip });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refreshToken); }

  @Post('logout')
  logout(@Body() dto: RefreshDto) { return this.auth.logout(dto.refreshToken); }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: User) { return this.auth.me(user); }
}
