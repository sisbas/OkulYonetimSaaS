import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecurityAuditService } from '../common/audit/security-audit.service';
import { TeacherBranch } from './teacher-branch.entity';
import { TeacherIdentityService } from './teacher-identity.service';
import { Teacher } from './teacher.entity';
import { TeacherRepository } from './teacher.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Teacher, TeacherBranch])],
  providers: [SecurityAuditService, TeacherRepository, TeacherIdentityService],
  exports: [TeacherIdentityService, TeacherRepository],
})
export class TeachersModule {}
