import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorityResolverService } from './authority-resolver.service';
import { BranchScopeService } from './branch-scope.service';
import { ContextCatalogController } from './context-catalog.controller';
import { ContextCatalogService } from './context-catalog.service';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { RbacPolicyService } from './rbac-policy.service';
import { RbacRoleEntity } from './rbac-role.entity';

/**
 * OKUL-01 RBAC + güvenlik bağlamı (security context) modülü.
 *
 * Policy engine (RbacPolicyService) uygulama genelinde tekil (provided+exported)
 * olarak sunulur; isteyen diğer modüller (guard'lar, interceptor'lar) bunu
 * enjekte edip tenant-aware karar alabilir. Tenant izolasyonu, RbacService
 * üzerinden aktör tenantId'siyle zorlanır.
 *
 * #339 R4: güvenlik bağlamı bileşenleri (yetki çözümleyici + önbellek
 * geçersizleştirme, şube kapsamı, versioned context kataloğu) de bu modülde
 * sağlanır ve export edilir; global APP_GUARD'lar (PermissionGuard) bunları
 * AppModule üzerinden enjekte eder (app.module.ts değişikliği gerekmez).
 */
@Module({
  imports: [TypeOrmModule.forFeature([RbacRoleEntity])],
  controllers: [RbacController, ContextCatalogController],
  providers: [
    RbacService,
    RbacPolicyService,
    AuthorityResolverService,
    BranchScopeService,
    ContextCatalogService,
  ],
  exports: [
    RbacPolicyService,
    RbacService,
    AuthorityResolverService,
    BranchScopeService,
    ContextCatalogService,
  ],
})
export class RbacModule {}
