type TeacherScope = { teacherId: string; branchIds: string[]; classroomIds: string[] };
type StudentSummary = { studentId: string; branchId: string; classroomId: string; fullName: string; parentPhone?: string; medicalNote?: string };

class TeacherVisibilityPolicy {
  canViewStudent(scope: TeacherScope, student: StudentSummary): boolean {
    return scope.branchIds.includes(student.branchId) && scope.classroomIds.includes(student.classroomId);
  }

  projectStudent(scope: TeacherScope, student: StudentSummary): Pick<StudentSummary, 'studentId' | 'branchId' | 'classroomId' | 'fullName'> | null {
    if (!this.canViewStudent(scope, student)) return null;
    const { studentId, branchId, classroomId, fullName } = student;
    return { studentId, branchId, classroomId, fullName };
  }
}

describe('KVKK teacher visibility policy', () => {
  const policy = new TeacherVisibilityPolicy();
  const scope: TeacherScope = { teacherId: 'teacher-1', branchIds: ['branch-1'], classroomIds: ['classroom-1'] };

  it('allows only students inside the teacher branch and classroom scope', () => {
    expect(policy.canViewStudent(scope, { studentId: 'student-1', branchId: 'branch-1', classroomId: 'classroom-1', fullName: 'Ada' })).toBe(true);
    expect(policy.canViewStudent(scope, { studentId: 'student-2', branchId: 'branch-2', classroomId: 'classroom-1', fullName: 'Ece' })).toBe(false);
    expect(policy.canViewStudent(scope, { studentId: 'student-3', branchId: 'branch-1', classroomId: 'classroom-2', fullName: 'Can' })).toBe(false);
  });

  it('returns a data-minimized student projection for visible students', () => {
    expect(policy.projectStudent(scope, { studentId: 'student-1', branchId: 'branch-1', classroomId: 'classroom-1', fullName: 'Ada', parentPhone: '+90555', medicalNote: 'private' })).toEqual({
      studentId: 'student-1', branchId: 'branch-1', classroomId: 'classroom-1', fullName: 'Ada',
    });
  });
});
