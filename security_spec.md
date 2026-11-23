# EduTest Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Official Firebase Auth Enforcement (`request.auth != null`)**: Every authenticated operation (both Google Sign-In and Email/Password) uses real Firebase Authentication UIDs and tokens. Manual password credentials under `/users/{userId}/private/*` are permanently denied (`allow read, write: if false`).
2. **Identity Integrity & Anti-Spoofing**:
   - Unauthenticated writes are strictly denied across all collections.
   - Non-admin user creation in `/users/{userId}` enforces `incoming().uid == request.auth.uid`, `incoming().email == request.auth.token.email`, and forbids `isMasterAdmin == true`.
   - Creators of `exams`, `bundles`, `courses`, `classrooms`, `classroomCodes`, `classroomHomeworks`, `results`, `courseProgress`, `homeworkSubmissions`, `teacherRequests`, and `feedbacks` are bound to `request.auth.uid` or verified owner email.
3. **Immutable Audit Timestamps**: `updatedAt` MUST equal `request.time`; `createdAt` cannot be forged to arbitrary client-supplied timestamps (`existing().createdAt` or `request.time` only).
4. **Payload & Schema Validation**: All IDs match `^[a-zA-Z0-9_\-]+$` (`1..128` chars), all fields match strict `.keys().hasOnly(...)` allowlists, and every string/list enforces bounded `.size()` constraints.
5. **Delta Sync & WriteBatch Compatibility**: `allow list` allows authenticated (`request.auth != null`) delta queries (`where('updatedAt', '>', sinceTs)`), and public guest discovery (`where('visibility', 'in', ...)`) on public `exams`, `bundles`, `courses`, and `siteConfig`.

## 2. Adversarial Verification Matrix
1. **Unauthenticated Write**: Anonymous/signed-out client attempts to create or update `/exams/e1`. -> **PERMISSION_DENIED**.
2. **Privilege Escalation**: Non-admin user attempts `create` on `/users/u1` with `isMasterAdmin: true`. -> **PERMISSION_DENIED**.
3. **UID Spoofing**: User A attempts to create `/users/u2` with `uid: "other_uid"`. -> **PERMISSION_DENIED**.
4. **Legacy Private Credentials Access**: Any client attempts read or write on `/users/u1/private/credentials`. -> **PERMISSION_DENIED**.
5. **Shadow Ghost Field Injection**: User updates `/users/own_id` with undeclared field `ghostAdminFlag: true`. -> **PERMISSION_DENIED**.
6. **Client-Forged Timestamp**: Creator sets `updatedAt: "2020-01-01T00:00:00Z"` instead of `request.time`. -> **PERMISSION_DENIED**.
7. **Oversized ID Poisoning**: Attacker targets `/exams/` with a 200-char or invalid-character ID `exam$../../admin`. -> **PERMISSION_DENIED**.
8. **Type/Size Value Poisoning**: Authenticated user updates `/exams/e1` with `title: 999999` or oversized `subject`. -> **PERMISSION_DENIED**.
9. **Unauthorized Exam Deletion**: Student B attempts to delete Teacher A's `/exams/exam_1`. -> **PERMISSION_DENIED**.
10. **Self-Approved Teacher Request**: Student attempts to create `/teacherRequests/req_1` with `status: "approved"`. -> **PERMISSION_DENIED**.
11. **Terminal Request Tampering**: Student updates `/teacherRequests/req_1` after `status: "rejected"`. -> **PERMISSION_DENIED**.
12. **Unauthorized NavTab/LiveText Config Overwrite**: Non-admin user attempts to overwrite `/siteConfig/navTabs`. -> **PERMISSION_DENIED**.
