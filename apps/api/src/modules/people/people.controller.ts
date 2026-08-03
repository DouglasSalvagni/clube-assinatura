import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUnitId, CurrentUnitIds } from '../../common/decorators/current-unit.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { UnitAccessGuard } from '../../common/guards/unit-access.guard';
import { PERMISSIONS } from '../../common/utils/permissions';
import { CreatePersonDto, UpdatePersonDto } from './people.dto';
import { PeopleService } from './people.service';
@ApiTags('Pessoas') @ApiBearerAuth() @Controller('people') @UseGuards(JwtAuthGuard, UnitAccessGuard, PermissionsGuard)
export class PeopleController {
  constructor(private readonly service: PeopleService) {}
  @Get() @RequirePermissions(PERMISSIONS.PEOPLE_READ) list(@CurrentUnitIds() ids: string[] | null, @Query('page') p=1, @Query('limit') l=20, @Query('search') s?: string) { return this.service.list(ids, +p, Math.min(+l,100), s); }
  @Post() @RequirePermissions(PERMISSIONS.PEOPLE_MANAGE) create(@CurrentUnitId() id: string, @Body() dto: CreatePersonDto) { return this.service.create(id,dto); }
  @Get(':id') @RequirePermissions(PERMISSIONS.PEOPLE_READ) get(@CurrentUnitId() unitId: string,@Param('id') id:string){ return this.service.get(unitId,id); }
  @Patch(':id') @RequirePermissions(PERMISSIONS.PEOPLE_MANAGE) update(@CurrentUnitId() unitId:string,@Param('id') id:string,@Body() dto:UpdatePersonDto){return this.service.update(unitId,id,dto);}
}
