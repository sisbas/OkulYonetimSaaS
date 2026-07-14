import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CourseAuditService } from './course-audit.service';
import { CourseController } from './course.controller';
import { Course } from './course.entity';
import { CourseRepository } from './course.repository';
import { CourseService } from './course.service';

@Module({
  imports: [TypeOrmModule.forFeature([Course])],
  controllers: [CourseController],
  providers: [CourseAuditService, CourseRepository, CourseService],
  exports: [CourseService],
})
export class CoursesModule {}
