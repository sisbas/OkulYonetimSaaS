import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ReportRun } from './report-run.entity';

/** Planning-only (#268): out of release scope, including explicit env opt-in. */
@Injectable()
export class ReportsService {
  async generateReport(_tenantId: string, _definitionId: string): Promise<ReportRun> {
    // Deny before repository access: no empty/fallback success, export or PII.
    throw new ServiceUnavailableException({
      statusCode: 503,
      code: 'REPORTING_QUARANTINED',
      message: 'Reporting is planning-only and out of release scope.',
    });
  }
}
