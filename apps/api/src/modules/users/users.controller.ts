import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { User } from '../../database/entities';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Usuários') @ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}
  @Get() @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@CurrentUnitIds() unitIds: string[] | null, @CurrentUser() user: User) { return this.service.list(unitIds, user); }
  @Post() @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  create(@CurrentUnitId() unitId: string, @CurrentUser() user: User, @Body() dto: CreateUserDto) { return this.service.create(unitId, dto, user); }
  @Patch(':id') @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(@Param('id') id: string, @CurrentUnitId() unitId: string, @CurrentUser() user: User, @Body() dto: UpdateUserDto) { return this.service.update(id, unitId, dto, user); }
  @Delete(':id') @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  remove(@Param('id') id: string, @CurrentUnitId() unitId: string, @CurrentUser() user: User) { return this.service.deactivate(id, unitId, user); }
}
