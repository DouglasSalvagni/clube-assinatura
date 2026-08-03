import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from './teams.dto';
import { TeamsService } from './teams.service';

@ApiTags('Times')
@ApiBearerAuth()
@Controller('teams')
@UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TEAMS_READ)
  list(@CurrentUnitIds() unitIds: string[] | null) { return this.service.list(unitIds); }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TEAMS_READ)
  get(@CurrentUnitId() unitId: string, @Param('id') id: string) { return this.service.get(unitId, id); }

  @Post()
  @RequirePermissions(PERMISSIONS.TEAMS_MANAGE)
  create(@CurrentUnitId() unitId: string, @Body() dto: CreateTeamDto) { return this.service.create(unitId, dto); }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TEAMS_MANAGE)
  update(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: UpdateTeamDto) { return this.service.update(unitId, id, dto); }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.TEAMS_MANAGE)
  remove(@CurrentUnitId() unitId: string, @Param('id') id: string) { return this.service.remove(unitId, id); }

  @Post(':id/members')
  @RequirePermissions(PERMISSIONS.TEAMS_MANAGE)
  addMember(@CurrentUnitId() unitId: string, @Param('id') id: string, @Body() dto: AddTeamMemberDto) { return this.service.add(unitId, id, dto.userId); }

  @Delete(':id/members/:userId')
  @RequirePermissions(PERMISSIONS.TEAMS_MANAGE)
  removeMember(@CurrentUnitId() unitId: string, @Param('id') id: string, @Param('userId') userId: string) { return this.service.removeMember(unitId, id, userId); }
}
