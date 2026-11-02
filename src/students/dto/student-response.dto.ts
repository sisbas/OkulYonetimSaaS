import { StudentEnrollmentStatus } from '../student.entity';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

/**
 * Öğrenci temel yanıtı. Veli/guardian iletişimi, doğum tarihi ve cinsiyet
 * bilinçli olarak yer almaz (KVKK veri minimizasyonu).
 */
export class StudentSummaryDto {
  id!: string;
  branchId!: string;
  studentCode!: string | null;
  firstName!: string;
  lastName!: string;
  enrollmentStatus!: StudentEnrollmentStatus;
}

export class StudentGroupSummaryDto {
  id!: string;
  branchId!: string;
  name!: string;
  code!: string | null;
}

export class StudentListResponseDto {
  data!: StudentSummaryDto[];
  meta!: PaginationMeta;
}

export class StudentRosterResponseDto {
  studentGroup!: StudentGroupSummaryDto;
  data!: StudentSummaryDto[];
  meta!: PaginationMeta;
}
