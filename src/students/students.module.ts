import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  StudentController,
  StudentGroupController,
} from './student.controller';
import { TeachersModule } from '../teachers/teachers.module';
import { StudentGroupMember } from './student-group-member.entity';
import { StudentGroup } from './student-group.entity';
import { StudentRepository } from './student.repository';
import { Student } from './student.entity';
import { StudentService } from './student.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, StudentGroup, StudentGroupMember]),
    TeachersModule,
  ],
  controllers: [StudentController, StudentGroupController],
  providers: [StudentRepository, StudentService],
  exports: [StudentRepository, StudentService],
})
export class StudentsModule {}
