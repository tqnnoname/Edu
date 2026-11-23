/**
 * Rules Verification Matrix for EduTest Firestore Security Rules (Firebase Auth SDK).
 */

export interface SecurityRuleTestCase {
  id: string;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
  enforcedByRule: string;
}

export const DIRTY_DOZEN_RULE_TESTS: SecurityRuleTestCase[] = [
  {
    id: 'DD-01',
    name: 'Reject unauthenticated write on /exams/{examId}',
    collectionPath: 'exams/exam_1',
    operation: 'create',
    auth: null,
    payload: { id: 'exam_1', title: 'Unauth Exam' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'exams.create requires isSignedIn() (request.auth != null)',
  },
  {
    id: 'DD-02',
    name: 'Reject self-assigned isMasterAdmin privilege on /users/{userId}',
    collectionPath: 'users/uid_student',
    operation: 'create',
    auth: { uid: 'uid_student', email: 'student@gmail.com', email_verified: false },
    payload: {
      id: 'uid_student',
      uid: 'uid_student',
      email: 'student@gmail.com',
      username: 'attacker',
      fullName: 'Attacker',
      role: 'student',
      isMasterAdmin: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'users.create forbids isMasterAdmin == true for non-admin callers',
  },
  {
    id: 'DD-03',
    name: 'Reject UID spoofing on /users/{userId} create',
    collectionPath: 'users/uid_victim',
    operation: 'create',
    auth: { uid: 'uid_attacker', email: 'attacker@gmail.com', email_verified: true },
    payload: { id: 'uid_victim', uid: 'uid_victim', email: 'victim@gmail.com' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'users.create enforces incoming().uid == request.auth.uid and incoming().email == userEmail()',
  },
  {
    id: 'DD-04',
    name: 'Reject all reads and writes on legacy /users/{userId}/private/credentials',
    collectionPath: 'users/uid_student/private/credentials',
    operation: 'get',
    auth: { uid: 'uid_student', email: 'student@gmail.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'users/private/{credId} permanently disabled (allow read, write: if false)',
  },
  {
    id: 'DD-05',
    name: 'Reject shadow ghost field injection on user update',
    collectionPath: 'users/uid_student',
    operation: 'update',
    auth: { uid: 'uid_student', email: 'student@gmail.com', email_verified: true },
    payload: { fullName: 'Updated', ghostAdminFlag: true },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidUserProfile(incoming()) uses keys().hasOnly(...)',
  },
  {
    id: 'DD-06',
    name: 'Reject client-forged updatedAt timestamp on exam create',
    collectionPath: 'exams/exam_1',
    operation: 'create',
    auth: { uid: 'uid_teacher', email: 'teacher@gmail.com', email_verified: true },
    payload: { id: 'exam_1', updatedAt: '2020-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'incoming().updatedAt == request.time',
  },
  {
    id: 'DD-07',
    name: 'Reject malformed or oversized document ID',
    collectionPath: `exams/${'x'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'uid_teacher', email: 'teacher@gmail.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidId(examId) requires size <= 128 and ^[a-zA-Z0-9_\\-]+$',
  },
  {
    id: 'DD-08',
    name: 'Reject type/size poisoning on exam update',
    collectionPath: 'exams/exam_1',
    operation: 'update',
    auth: { uid: 'uid_teacher', email: 'teacher@gmail.com', email_verified: true },
    payload: { title: 999999 },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidExam(incoming()) enforces data.title is string && data.title.size() <= 300',
  },
  {
    id: 'DD-09',
    name: 'Reject unauthorized exam deletion by non-owner',
    collectionPath: 'exams/exam_teacher',
    operation: 'delete',
    auth: { uid: 'uid_student', email: 'student@gmail.com', email_verified: true },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'exams.delete restricts deletion to creatorUid, creatorEmail, or isAdmin()',
  },
  {
    id: 'DD-10',
    name: 'Reject non-admin creating pre-approved teacherRequest',
    collectionPath: 'teacherRequests/req_1',
    operation: 'create',
    auth: { uid: 'uid_student', email: 'student@gmail.com', email_verified: false },
    payload: { id: 'req_1', userUid: 'uid_student', status: 'approved' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'teacherRequests.create requires status == pending for non-admin',
  },
  {
    id: 'DD-11',
    name: 'Reject non-admin updating rejected/approved teacherRequest',
    collectionPath: 'teacherRequests/req_1',
    operation: 'update',
    auth: { uid: 'uid_student', email: 'student@gmail.com', email_verified: false },
    payload: { status: 'approved' },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'teacherRequests.update restricts non-admin updates to existing().status == pending',
  },
  {
    id: 'DD-12',
    name: 'Reject non-admin modifying /siteConfig/navTabs',
    collectionPath: 'siteConfig/navTabs',
    operation: 'update',
    auth: { uid: 'uid_teacher', email: 'teacher@gmail.com', email_verified: true },
    payload: { id: 'navTabs', items: [] },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByRule: 'siteConfig restricts navTabs/liveText writes to isAdmin()',
  },
];
