import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RbacPolicyService } from './rbac-policy.service';
import { RbacRoleEntity } from './rbac-role.entity';

/**
 * OKUL-01 RBAC modülü.
 *
 * Policy engine (RbacPolicyService) uygulama genelinde tekil (provided+exported)
 * olarak sunulur; isteyen diğer modüller (guard'lar, interceptor'lar) bunu
 * enjekte edip tenant-aware karar alabilir. Tenant izolasyonu, RbacService
 * üzerinden aktör tenantId'siyle zorlanır.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RbacRoleEntity])],
  controllers: [RbacController],
  providers: [RbacService, RbacPolicyService],
  exports: [RbacPolicyService, RbacService],
})
export class RbacModule {}
