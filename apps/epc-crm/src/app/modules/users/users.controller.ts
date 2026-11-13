import {
  // BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
// import { Roles } from '../../../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GetUser } from '../../../common/decorators/get-user.decorator';
// import { SystemRoles } from '@epc-crm/types';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMyNameDto } from './dto/update-my-name.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { Authorize } from '../../../common/guards/authorize.guard';

@Controller('users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'Get current logged in user',
  })
  @Get('myself')
  getMyUser(@GetUser() user) {
    return this.usersService.getMyself(user);
  }

  // @Roles(SystemRoles.SUPER_ADMIN, SystemRoles.ADMIN)
  @Post('invite/project')
  @ApiOperation({
    summary: 'Invite user to project',
  })
  async inviteToProject(@Body() dto: InviteUserDto, @GetUser() currentUser) {
    return this.usersService.inviteToProject(dto, currentUser);
  }

  @Put('myself')
  @ApiOperation({
    summary: 'Update my name',
  })
  updateMyName(@Body() dto: UpdateMyNameDto, @GetUser() user) {
    return this.usersService.updateMyName(user.id, dto.fullName);
  }
  
  @Put(':id')
  @Authorize({ permissions: ['users.edit'] })
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @GetUser() user){
    return this.usersService.updateUser(id, dto, user);
  }

  @Put(':id/status')
  @ApiOperation({
    summary: 'Activate or deactivate a user account',
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @GetUser() user,
  ) {
    return this.usersService.updateStatus(id, dto.isActive, user);
  }

  @Delete(':id')
  @Authorize({ permissions: ['users.delete'] })
  @ApiOperation({
    summary: 'Soft delete user',
  })
  softDeleteUser(@Param('id', ParseUUIDPipe) id: string, @GetUser() user) {
    if (id === user?.id) {
      throw new UnauthorizedException(
        'You are not authorized to delete this user',
      );
    }

    return this.usersService.softDeleteUser(id);
  }
}
