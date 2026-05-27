import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AnalyticsService, DashboardResult } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  async getDashboard(@Req() req: any): Promise<DashboardResult> {
    return this.analyticsService.getDashboard(req.user.merchantId);
  }
}
