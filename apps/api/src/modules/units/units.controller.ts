import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GlobalRole, User } from '../../database/entities';
import { CreateUnitDto, UpdateUnitDto } from './units.dto';
import { UnitsService } from './units.service';
import { ForbiddenException } from '@nestjs/common';

@ApiTags('Unidades')
@Controller('tenants')
export class UnitsController {
  constructor(private readonly service: UnitsService) {}
  @Get('public') publicList() { return this.service.publicList(); }

  @Get('available') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  available(@CurrentUser() user: User) { return this.service.available(user); }

  @Get() @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  list(@CurrentUser() user: User) { this.assertAdmin(user); return this.service.list(); }

  @Post() @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  create(@CurrentUser() user: User, @Body() dto: CreateUnitDto) { this.assertAdmin(user); return this.service.create(dto); }

  @Patch(':id') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateUnitDto) { this.assertAdmin(user); return this.service.update(id, dto); }

  @Delete(':id') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  remove(@CurrentUser() user: User, @Param('id') id: string) { this.assertAdmin(user); return this.service.deactivate(id); }

  private assertAdmin(user: User) { if (user.globalRole !== GlobalRole.INSTALLATION_ADMIN) throw new ForbiddenException('Acesso restrito ao administrador da instalação.'); }
}
