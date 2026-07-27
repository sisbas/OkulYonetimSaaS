import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TeacherCourseEligibilityRepository } from './teacher-course-eligibility.repository';
import { TeacherCourse } from './teacher-course.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherCourse])],
  providers: [TeacherCourseEligibilityRepository],
  exports: [TeacherCourseEligibilityRepository],
})
export class TeacherCoursesModule {}
