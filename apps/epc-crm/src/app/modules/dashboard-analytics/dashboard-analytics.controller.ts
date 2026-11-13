import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Controller('dashboard/analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardAnalyticsController {
  constructor(private readonly analyticsService: DashboardAnalyticsService) {}

  @Get('agents/roster')
  @ApiOperation({ summary: 'Agent counts (total/active/inactive/pending) and per-agent lead load.' })
  getAgentRoster(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getAgentRoster(query, user);
  }

  @Get('agents/workload')
  @ApiOperation({ summary: 'What each agent is working on right now, by status.' })
  getAgentWorkload(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getAgentWorkload(query, user);
  }

  @Get('agents/performance')
  @ApiOperation({ summary: 'Agent leaderboard: close rate and response speed.' })
  getAgentPerformance(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getAgentPerformance(query, user);
  }

  @Get('response-time')
  @ApiOperation({ summary: 'Time-to-first-reply distribution across leads.' })
  getResponseTime(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getResponseTime(query, user);
  }

  @Get('status-trends')
  @ApiOperation({ summary: 'Lead volume and status-transition trends over time.' })
  getStatusTrends(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getStatusTrends(query, user);
  }

  @Get('sla-aging')
  @ApiOperation({ summary: 'Open-lead age distribution and overdue count.' })
  getSlaAging(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getSlaAging(query, user);
  }

  @Get('activity-heatmap')
  @ApiOperation({ summary: 'Agent reply volume by day-of-week and hour.' })
  getActivityHeatmap(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getActivityHeatmap(query, user);
  }

  @Get('project-comparison')
  @ApiOperation({ summary: 'Close rate and response speed, compared across projects.' })
  getProjectComparison(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getProjectComparison(query, user);
  }

  @Get('projects/overview')
  @ApiOperation({ summary: "Each project's lead counts by status and agent headcount." })
  getProjectOverview(@Query() query: AnalyticsQueryDto, @GetUser() user) {
    return this.analyticsService.getProjectOverview(query, user);
  }
}
