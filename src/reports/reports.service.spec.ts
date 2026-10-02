import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReportsService } from './reports.service';

describe('ReportsService release quarantine (#268)', () => {
  it('default-OFF AppModule metadata excludes both planning-only modules', async () => {
    const names = ['ENABLE_REPORTS', 'ENABLE_EOKUL_SYNC'];
    const previous = names.map((name) => process.env[name]);
    names.forEach((name) => delete process.env[name]);
    try {
      await jest.isolateModulesAsync(async () => {
        const { AppModule } = await import('../app.module');
        const imports: Array<{ name?: string }> = Reflect.getMetadata('imports', AppModule);
        expect(imports.map((entry) => entry.name)).not.toContain('ReportsModule');
        expect(imports.map((entry) => entry.name)).not.toContain('EokulSyncModule');
      });
    } finally {
      names.forEach((name, index) => {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      });
    }
  });

  it.each(['tenant-a', 'tenant-b', '', '=HYPERLINK("https://invalid")', '\t+formula']) (
    'denies generation without persistence or export for %j', async (tenant) => {
      // No repositories supplied: quarantine must precede all data access.
      const module = await Test.createTestingModule({ providers: [ReportsService] }).compile();
      try {
        await expect(module.get(ReportsService).generateReport(tenant, '=formula'))
          .rejects.toMatchObject({
            response: { statusCode: 503, code: 'REPORTING_QUARANTINED' },
          });
        await expect(module.get(ReportsService).generateReport(tenant, 'missing'))
          .rejects.toBeInstanceOf(ServiceUnavailableException);
      } finally {
        await module.close();
      }
    },
  );
});
