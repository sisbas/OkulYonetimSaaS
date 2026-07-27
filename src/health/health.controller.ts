import { Controller, Get } from '@nestjs/common';

export type HealthResponse = {
  status: 'ok';
  service: 'okul-yonetim-saas-api';
  applicationType: 'backend-api';
  databaseRequired: true;
  timestamp: string;
  uptimeSeconds: number;
};

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'okul-yonetim-saas-api',
      applicationType: 'backend-api',
      databaseRequired: true,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
