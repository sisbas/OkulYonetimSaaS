import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from './database/data-source';
import { AuthModule } from './auth/auth.module';
import { SecurityAuditService } from './common/audit/security-audit.service';
import { TenantContextMiddleware } from './common/context/tenant-context.middleware';
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
import { TeachersModule } from './teachers/teachers.module';
import { TenantsModule } from './tenants/tenants.module';
import { TimeSlotsModule } from './time-slots/time-slots.module';
import { UsersModule } from './users/users.module';

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
  ],
  providers: [
    SecurityAuditService,
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
