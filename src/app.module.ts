import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from './database/data-source';
import { AuthModule } from './auth/auth.module';
import { SecurityAuditService } from './common/audit/security-audit.service';
import { TenantContextMiddleware } from './common/context/tenant-context.middleware';
// TenantScopeGuard: isteğin sınırında kiracı izolasyonunu zorunlu kılar.
// Sadece global middleware (izin verici) değil, gerçek strict resolver devrede.
import { TenantScopeGuard } from './common/tenant/tenant-scope.guard';
import { PermissionAuthenticationGuard } from './common/guards/permission-authentication.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { CoursesModule } from './courses/courses.module';
import { DailyOperationsModule } from './daily-operations/daily-operations.module';
import { LeavesModule } from './leaves/leaves.module';
import { HealthModule } from './health/health.module';
import { RbacModule } from './rbac/rbac.module';
import { RoomsModule } from './rooms/rooms.module';
import { TeacherCoursesModule } from './teacher-courses/teacher-courses.module';
import { EokulSyncModule } from './eokul-sync/eokul-sync.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ReportsModule } from './reports/reports.module';
import { TeachersModule } from './teachers/teachers.module';
import { TenantsModule } from './tenants/tenants.module';
import { TimeSlotsModule } from './time-slots/time-slots.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from './schedules/schedule.module';

// #261 quarantine: eokul-sync / reports are UNSUPPORTED paths until their
// acceptance is real. Keep them OUT of the runtime graph unless explicitly
// enabled via env (default OFF).
const QUARANTINED_MODULES: any[] = [];
if (process.env.ENABLE_EOKUL_SYNC === 'true') {
  QUARANTINED_MODULES.push(EokulSyncModule);
}
if (process.env.ENABLE_REPORTS === 'true') {
  QUARANTINED_MODULES.push(ReportsModule);
}

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...AppDataSource.options, autoLoadEntities: true }),
    HealthModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    RbacModule,
    CoursesModule,
    RoomsModule,
    TimeSlotsModule,
    LeavesModule,
    DailyOperationsModule,
    TeachersModule,
    TeacherCoursesModule,
    AttendanceModule,
    NotificationsModule,
    ScheduleModule,

    ...QUARANTINED_MODULES,
  ],
  providers: [
    SecurityAuditService,
    // TenantScopeGuard global APP_GUARD DEĞİL — yalnızca ilgili controller'larda
    // @UseGuards(TenantScopeGuard) ile uygulanır (AuthGuard'tan SONRA çalışır).
    // Global APP_GUARD yapmak, AuthGuard sıralamasını bozup unauthenticated
    // isteklerin "Tenant resolution failed" yerine "Unauthorized" dönmesini engellerdi.
    { provide: APP_GUARD, useClass: PermissionAuthenticationGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
