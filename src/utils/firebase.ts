import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  setPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  linkWithCredential,
  linkWithPopup,
  fetchSignInMethodsForEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
  deleteField,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
  DocumentReference,
  Query,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  Exam,
  ExamBundle,
  MicroCourse,
  CourseChapter,
  CourseChapterIndexItem,
  CourseLesson,
  LessonBlock,
  LessonSection,
  Question,
  Classroom,
  ExamResult,
  StudentCourseProgress,
  ClassroomHomework,
  HomeworkSubmission,
  TeacherRoleRequest,
  FeedbackItem,
  UserAccount,
  CustomSubject,
  NavTabItem,
  ClassJoinRequest,
  Scoreboard,
} from '../types/exam';
import { hashUsernameLookupId } from './crypto';
import {
  courseHasEmbeddedBase64,
  offloadClassroomHomeworkMediaToUrls,
  offloadCourseBase64MediaToUrls,
  offloadExamBase64MediaToUrls,
  offloadHomeworkSubmissionMediaToUrls,
  sanitizeAttachmentsForFirestore,
  sanitizeInlineImagesForFirestore,
  sanitizeUrlForFirestore,
} from './courseMedia';
import { registerMediaFirestoreProvider } from './mediaAssets';

export const MASTER_ADMIN_EMAIL_LOWER = 'tranquangnhat418@gmail.com';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const db = (() => {
  try {
    return typeof window !== 'undefined'
      ? initializeFirestore(
          app,
          { experimentalForceLongPolling: true },
          firebaseConfig.firestoreDatabaseId
        )
      : getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
})();

// Session-only Auth persistence: opening the web in a new tab/browser requires login first
// instead of automatically entering the previous account, while keeping F5 refresh inside the active tab.
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    const existingAuth = getAuth(app);
    void setPersistence(existingAuth, browserSessionPersistence).catch(() => {});
    return existingAuth;
  }
})();

registerMediaFirestoreProvider(() => ({ db, auth }));

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isActiveFirebaseUser(fbUser: FirebaseUser | null | undefined): fbUser is FirebaseUser {
  return Boolean(fbUser && !fbUser.isAnonymous && fbUser.uid);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function sanitizeDocId(rawId: string): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || 'doc_' + Date.now();
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : stripUndefined(item))) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    if (value instanceof Timestamp) return value;
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      return value;
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function toIsoString(val: any, fallback = new Date().toISOString()): string {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  return fallback;
}

function toTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val === 'string') {
    const ms = new Date(val).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function normalizeEmailList(emails: (string | undefined | null)[]): string[] {
  const set = new Set<string>();
  for (const e of emails) {
    if (typeof e === 'string') {
      const clean = e.trim().toLowerCase();
      if (clean) set.add(clean);
    }
  }
  return Array.from(set).slice(0, 500);
}

// Track known cloud document keys ("collection/docId") & delta sync cursor
const LAST_DELTA_SYNC_MS_KEY = 'edutest_last_delta_sync_ms_v2';
const knownCloudDocIds = new Set<string>();

function markCloudDocKnown(col: string, id: string): void {
  if (col && id) knownCloudDocIds.add(`${col}/${id}`);
}

export function getLastDeltaSyncMs(): number {
  try {
    const raw = localStorage.getItem(LAST_DELTA_SYNC_MS_KEY);
    const num = raw ? Number(raw) : 0;
    return Number.isFinite(num) && num > 0 ? num : 0;
  } catch {
    return 0;
  }
}

export function setLastDeltaSyncMs(ms: number): void {
  try {
    if (ms > 0) {
      localStorage.setItem(LAST_DELTA_SYNC_MS_KEY, String(ms));
    } else {
      localStorage.removeItem(LAST_DELTA_SYNC_MS_KEY);
    }
  } catch {}
}

export function clearCloudSyncCursor(): void {
  knownCloudDocIds.clear();
  setLastDeltaSyncMs(0);
  clearSessionReadCaches();
}

// Connection probe: run at most once per browser tab session
async function testConnection() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage?.getItem('edutest_fs_conn_ok_v1') === '1') {
      return;
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('edutest_fs_conn_ok_v1', '1');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function mapFirebaseAuthErrorMessage(err: any): string {
  const code = err?.code || '';
  const msg = String(err?.message || '');
  if (code === 'auth/email-already-in-use') {
    return 'Email này đã được đăng ký! Hãy đăng nhập hoặc nhấn Quên mật khẩu / Đăng nhập Google.';
  }
  if (code === 'auth/weak-password') {
    return 'Mật khẩu quá yếu! Vui lòng chọn mật khẩu có ít nhất 6 ký tự.';
  }
  if (code === 'auth/invalid-email') {
    return 'Địa chỉ email không hợp lệ!';
  }
  if (code === 'auth/user-not-found') {
    return 'Không tìm thấy tài khoản với email này!';
  }
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Email hoặc mật khẩu không chính xác! (Nếu bạn từng đăng ký bằng Google, hãy bấm "Đăng nhập bằng Google" rồi thêm mật khẩu trong mục Đổi mật khẩu).';
  }
  if (code === 'auth/too-many-requests') {
    return 'Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại!';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Phiên đăng nhập đã cũ. Vui lòng đăng xuất và đăng nhập lại trước khi đổi mật khẩu!';
  }
  if (code === 'auth/account-exists-with-different-credential' || code === 'auth/credential-already-in-use') {
    return 'Email này đã được liên kết với một phương thức đăng nhập khác!';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Cửa sổ đăng nhập Google đã bị đóng.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt đã chặn popup Google Sign-In. Vui lòng cho phép popup cho trang web này!';
  }
  if (code === 'auth/network-request-failed') {
    return 'Lỗi kết nối mạng tới máy chủ xác thực Firebase!';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Phương thức đăng nhập Email/Mật khẩu chưa được bật trong Firebase Authentication Console.';
  }
  return msg || 'Xác thực Firebase thất bại. Vui lòng thử lại!';
}

// =========================================================================
// FIREBASE AUTHENTICATION SDK (Official SDK + 0ms browserLocalPersistence)
// =========================================================================

export function subscribeFirebaseAuthState(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    cb(isActiveFirebaseUser(user) ? user : null);
  });
}

export function getFirebaseAuthUser(): FirebaseUser | null {
  const u = auth.currentUser;
  return isActiveFirebaseUser(u) ? u : null;
}

export function getFirebaseAuthProviderIds(): string[] {
  return auth.currentUser?.providerData.map((p) => p.providerId) || [];
}

export function isMasterAdminFirebaseUser(user: FirebaseUser | null): boolean {
  if (!user || !user.email) return false;
  return user.email.trim().toLowerCase() === MASTER_ADMIN_EMAIL_LOWER;
}

export async function signUpWithEmailPasswordFirebase(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<{ success: boolean; user?: FirebaseUser; code?: string; error?: string }> {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, params.password);
    if (params.fullName.trim()) {
      await updateProfile(cred.user, { displayName: params.fullName.trim() }).catch(() => {});
    }
    return { success: true, user: cred.user };
  } catch (err: any) {
    return {
      success: false,
      code: err?.code || '',
      error: mapFirebaseAuthErrorMessage(err),
    };
  }
}

export async function signInWithEmailPasswordFirebase(params: {
  email: string;
  password: string;
}): Promise<{ success: boolean; user?: FirebaseUser; code?: string; error?: string }> {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, params.password);
    return { success: true, user: cred.user };
  } catch (err: any) {
    const code = err?.code || '';
    // Check if account exists under Google-only sign-in method to give clearer feedback
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      try {
        const methods = await withTimeout(
          fetchSignInMethodsForEmail(auth, params.email.trim().toLowerCase()),
          2500,
          [] as string[]
        );
        if (methods.includes('google.com') && !methods.includes('password')) {
          return {
            success: false,
            code,
            error:
              'Email này đang đăng nhập bằng Google và chưa có mật khẩu riêng. Hãy nhấn "Đăng nhập bằng Google" để vào cùng tài khoản (sau đó bạn có thể đặt thêm mật khẩu trong mục Đổi mật khẩu).',
          };
        }
      } catch {}
    }
    return {
      success: false,
      code,
      error: mapFirebaseAuthErrorMessage(err),
    };
  }
}

export async function sendPasswordResetEmailFirebase(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: mapFirebaseAuthErrorMessage(err),
    };
  }
}

export async function updatePasswordFirebase(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; linkedNewPassword?: boolean; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !fbUser.email) {
    return {
      success: false,
      error: 'Phiên đăng nhập Firebase không tồn tại. Vui lòng đăng nhập lại!',
    };
  }

  const providers = fbUser.providerData.map((p) => p.providerId);
  try {
    if (providers.includes('password')) {
      if (!currentPassword) {
        return { success: false, error: 'Vui lòng nhập mật khẩu hiện tại!' };
      }
      const cred = EmailAuthProvider.credential(fbUser.email, currentPassword);
      await reauthenticateWithCredential(fbUser, cred);
      await updatePassword(fbUser, newPassword);
      return { success: true, linkedNewPassword: false };
    } else {
      // Account signed up via Google: link Email/Password credential to same UID
      const cred = EmailAuthProvider.credential(fbUser.email, newPassword);
      await linkWithCredential(fbUser, cred);
      return { success: true, linkedNewPassword: true };
    }
  } catch (err: any) {
    return {
      success: false,
      error: mapFirebaseAuthErrorMessage(err),
    };
  }
}

export async function linkGoogleAccountFirebase(): Promise<{
  success: boolean;
  user?: FirebaseUser;
  error?: string;
}> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    return signInWithGooglePopup();
  }
  const providers = fbUser.providerData.map((p) => p.providerId);
  if (providers.includes('google.com')) {
    return { success: true, user: fbUser };
  }
  try {
    const res = await linkWithPopup(fbUser, googleProvider);
    return { success: true, user: res.user };
  } catch (err: any) {
    return {
      success: false,
      error: mapFirebaseAuthErrorMessage(err),
    };
  }
}

export async function signInWithGooglePopup(): Promise<{
  success: boolean;
  user?: FirebaseUser;
  error?: string;
}> {
  try {
    const res = await signInWithPopup(auth, googleProvider);
    return { success: true, user: res.user };
  } catch (err: any) {
    return {
      success: false,
      error: mapFirebaseAuthErrorMessage(err),
    };
  }
}

export async function signOutFirebase(): Promise<void> {
  clearCloudSyncCursor();
  clearLiveAccountCaches();
  try {
    await signOut(auth);
  } catch {}
}

// =========================================================================
// ACCOUNT UNIFICATION & LIGHTWEIGHT USERS/{UID} PROFILE (<1KB)
// =========================================================================

export async function resolveEmailByIdentifierInFirestore(
  identifier: string
): Promise<string | null> {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return null;
  if (clean.includes('@')) return clean;

  try {
    const unameDoc = await withTimeout(
      getDocFromServer(doc(db, 'accountLookups', hashUsernameLookupId(clean))).catch(() =>
        getDoc(doc(db, 'accountLookups', hashUsernameLookupId(clean)))
      ),
      2500,
      null as any
    );
    if (unameDoc && unameDoc.exists()) {
      const data = unameDoc.data();
      if (data?.email) return String(data.email).trim().toLowerCase();
    }
  } catch {}

  if (isActiveFirebaseUser(auth.currentUser)) {
    try {
      const snap = await withTimeout(
        getDocs(query(collection(db, 'users'), where('username', '==', clean))),
        2500,
        null as any
      );
      if (snap && !snap.empty) {
        const d = snap.docs[0].data();
        if (d?.email) return String(d.email).trim().toLowerCase();
      }
    } catch {}
  }

  return null;
}

export async function syncUsernameLookupInFirestore(user: UserAccount): Promise<void> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !user.username || !user.email) return;
  const cleanUsername = user.username.trim().toLowerCase();
  const cleanEmail = user.email.trim().toLowerCase();
  if (!cleanUsername || !cleanEmail) return;

  try {
    const lid = hashUsernameLookupId(cleanUsername);
    const ref = doc(db, 'accountLookups', lid);
    const existing = knownCloudDocIds.has(`accountLookups/${lid}`);
    await setDoc(
      ref,
      stripUndefined({
        id: lid,
        type: 'username',
        userId: sanitizeDocId(user.uid || fbUser.uid || user.id),
        email: cleanEmail.slice(0, 180),
        ...(existing ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    markCloudDocKnown('accountLookups', lid);
  } catch {}
}

// =========================================================================
// ISOLATED SECONDARY FIREBASE AUTH PROVISIONER & CROSS-DEVICE CREDENTIAL VAULT
// =========================================================================

function getProvisionerAuthAndDb() {
  const appName = 'EduTestProvisioner';
  const pApp = getApps().find((a) => a.name === appName) || initializeApp(firebaseConfig, appName);
  const pAuth = (() => {
    try {
      return initializeAuth(pApp, { persistence: inMemoryPersistence });
    } catch {
      return getAuth(pApp);
    }
  })();
  const pDb = (() => {
    try {
      return typeof window !== 'undefined'
        ? initializeFirestore(
            pApp,
            { experimentalForceLongPolling: true },
            firebaseConfig.firestoreDatabaseId
          )
        : getFirestore(pApp, firebaseConfig.firestoreDatabaseId);
    } catch {
      return getFirestore(pApp, firebaseConfig.firestoreDatabaseId);
    }
  })();
  return { pAuth, pDb };
}

export function computeStudentTeacherEmails(
  target: { uid?: string; id?: string; email?: string; studentCode?: string },
  classrooms: Classroom[]
): string[] {
  const tEmail = String(target.email || '').trim().toLowerCase();
  const tCode = String(target.studentCode || '').trim().toUpperCase();
  const tIds = new Set([target.uid, target.id].filter((x): x is string => Boolean(x)));
  const out = new Set<string>();

  for (const cls of classrooms || []) {
    if (!cls || !cls.teacherEmail) continue;
    const clsTeacherEmail = cls.teacherEmail.trim().toLowerCase();
    if (!clsTeacherEmail) continue;
    const isMember = (cls.students || []).some((s) => {
      if (!s) return false;
      if (s.id && tIds.has(s.id)) return true;
      if (tEmail && s.email && s.email.trim().toLowerCase() === tEmail) return true;
      if (tCode && s.studentCode && s.studentCode.trim().toUpperCase() === tCode) return true;
      return false;
    });
    if (isMember) {
      out.add(clsTeacherEmail);
    }
  }
  return Array.from(out).slice(0, 100);
}

export interface LiveCredentialEntry {
  uid: string;
  email: string;
  username: string;
  fullName: string;
  role: 'student' | 'teacher';
  isMasterAdmin?: boolean;
  school?: string;
  studentCode?: string;
  classId?: string;
  teacherEmails: string[];
  visiblePassword?: string;
  isGoogleAuth?: boolean;
  createdAtStr?: string;
  updatedAtIso?: string;
}

const liveUsersById = new Map<string, UserAccount>();
const liveCredsById = new Map<string, LiveCredentialEntry>();
let liveUsersStreamWarmed = false;
let liveCredsStreamWarmed = false;
let liveUsersLastFetchMs = 0;
let liveCredsLastFetchMs = 0;
let liveStreamOwnerUid = '';
const DIRECTORY_CACHE_TTL_MS = 3 * 60 * 1000;

const siteConfigReadCache = new Map<string, { data: any; fetchedAtMs: number }>();
const SITE_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const TOMBSTONES_CACHE_TTL_MS = 60 * 1000;

export function clearSessionReadCaches(): void {
  siteConfigReadCache.clear();
  liveUsersLastFetchMs = 0;
  liveCredsLastFetchMs = 0;
}

export function invalidateSiteConfigCache(configId?: string): void {
  if (configId) {
    siteConfigReadCache.delete(configId);
  } else {
    siteConfigReadCache.clear();
  }
}

export function clearLiveAccountCaches(): void {
  liveUsersById.clear();
  liveCredsById.clear();
  liveUsersStreamWarmed = false;
  liveCredsStreamWarmed = false;
  liveUsersLastFetchMs = 0;
  liveCredsLastFetchMs = 0;
  liveStreamOwnerUid = '';
}

function emitAccountsUpdatedNow(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('edutest-accounts-updated'));
  }
}

function upsertLiveUserCache(u: UserAccount): void {
  if (!u || !u.email) return;
  const key = sanitizeDocId(u.uid || u.id || u.email);
  const prev = liveUsersById.get(key);
  liveUsersById.set(key, {
    ...(prev || {}),
    ...u,
    id: u.uid || u.id || prev?.id || key,
    uid: u.uid || prev?.uid || u.id || key,
    email: u.email.trim().toLowerCase(),
  });
}

function upsertLiveCredCache(entry: Partial<LiveCredentialEntry> & { uid: string; email: string }): void {
  const key = sanitizeDocId(entry.uid);
  const cleanEmail = entry.email.trim().toLowerCase();
  if (!key || !cleanEmail) return;
  const prev = liveCredsById.get(key);
  const mergedTeachers = Array.from(
    new Set([...(prev?.teacherEmails || []), ...(entry.teacherEmails || [])].map((e) => e.trim().toLowerCase()).filter(Boolean))
  );
  liveCredsById.set(key, {
    uid: entry.uid || prev?.uid || key,
    email: cleanEmail,
    username: entry.username || prev?.username || cleanEmail.split('@')[0],
    fullName: entry.fullName || prev?.fullName || cleanEmail.split('@')[0],
    role: entry.role || prev?.role || 'student',
    isMasterAdmin: entry.isMasterAdmin ?? prev?.isMasterAdmin ?? (cleanEmail === MASTER_ADMIN_EMAIL_LOWER),
    school: entry.school || prev?.school,
    studentCode: entry.studentCode || prev?.studentCode,
    classId: entry.classId || prev?.classId,
    teacherEmails: mergedTeachers,
    visiblePassword: entry.visiblePassword || prev?.visiblePassword,
    isGoogleAuth: entry.isGoogleAuth ?? prev?.isGoogleAuth,
    createdAtStr: entry.createdAtStr || prev?.createdAtStr || new Date().toISOString().split('T')[0],
    updatedAtIso: entry.updatedAtIso || new Date().toISOString(),
  });
}

export async function syncUserCredentialToFirestore(params: {
  uid: string;
  email: string;
  username: string;
  fullName: string;
  role: 'student' | 'teacher';
  isMasterAdmin?: boolean;
  school?: string;
  studentCode?: string;
  classId?: string;
  teacherEmails?: string[];
  visiblePassword?: string;
  isGoogleAuth?: boolean;
  pendingActivation?: boolean;
  classrooms?: Classroom[];
  targetDb?: ReturnType<typeof getFirestore>;
}): Promise<boolean> {
  const firestoreInstance = params.targetDb || db;
  if (!params.targetDb && !getFirebaseAuthUser()) return false;

  const cleanUid = sanitizeDocId(params.uid);
  const cleanEmail = String(params.email || '').trim().toLowerCase().slice(0, 180);
  if (!cleanUid || !cleanEmail) return false;

  const cleanUsername = (
    String(params.username || cleanEmail.split('@')[0] || '').trim().toLowerCase() ||
    `user_${cleanUid.slice(0, 8)}`
  ).slice(0, 100);
  const cleanName = (String(params.fullName || cleanUsername).trim() || 'Thành viên').slice(0, 150);
  const computedTeachers = computeStudentTeacherEmails(
    { uid: cleanUid, id: params.uid, email: cleanEmail, studentCode: params.studentCode },
    params.classrooms || []
  );
  const mergedTeachers = normalizeEmailList([
    ...(params.teacherEmails || []),
    ...computedTeachers,
  ]);
  const isKnown = knownCloudDocIds.has(`userCredentials/${cleanUid}`);
  const cleanPwd =
    typeof params.visiblePassword === 'string' && params.visiblePassword.trim().length > 0
      ? params.visiblePassword.trim().slice(0, 128)
      : undefined;

  const docData = stripUndefined({
    id: cleanUid,
    uid: params.uid.slice(0, 128),
    email: cleanEmail,
    username: cleanUsername,
    fullName: cleanName,
    studentCode: params.studentCode ? String(params.studentCode).slice(0, 60) : undefined,
    role: params.role === 'teacher' ? 'teacher' : 'student',
    isMasterAdmin: Boolean(params.isMasterAdmin || cleanEmail === MASTER_ADMIN_EMAIL_LOWER),
    school: params.school ? String(params.school).slice(0, 200) : undefined,
    classId: params.classId ? sanitizeDocId(params.classId) : undefined,
    teacherEmails: mergedTeachers,
    ...(cleanPwd ? { visiblePassword: cleanPwd } : {}),
    isGoogleAuth: Boolean(params.isGoogleAuth),
    ...(typeof params.pendingActivation === 'boolean'
      ? { pendingActivation: params.pendingActivation }
      : {}),
    ...(isKnown ? {} : { createdAt: serverTimestamp(), createdAtStr: new Date().toISOString().split('T')[0] }),
    updatedAt: serverTimestamp(),
  });

  // Update in-memory credential cache immediately for instant UI visibility
  upsertLiveCredCache({
    uid: params.uid,
    email: cleanEmail,
    username: cleanUsername,
    fullName: cleanName,
    role: params.role === 'teacher' ? 'teacher' : 'student',
    isMasterAdmin: Boolean(params.isMasterAdmin || cleanEmail === MASTER_ADMIN_EMAIL_LOWER),
    school: params.school,
    studentCode: params.studentCode,
    classId: params.classId,
    teacherEmails: mergedTeachers,
    ...(cleanPwd ? { visiblePassword: cleanPwd } : {}),
    isGoogleAuth: Boolean(params.isGoogleAuth),
    updatedAtIso: new Date().toISOString(),
  });
  emitAccountsUpdatedNow();

  try {
    await setDoc(doc(firestoreInstance, 'userCredentials', cleanUid), docData, { merge: true });
    markCloudDocKnown('userCredentials', cleanUid);
    return true;
  } catch (err) {
    console.warn('[syncUserCredentialToFirestore] warning:', err);
    return false;
  }
}

export async function provisionOrUpdateStudentFirebaseAuth(params: {
  email: string;
  password: string;
  previousPassword?: string;
  fullName: string;
  username: string;
  studentCode?: string;
  school?: string;
  role?: 'student' | 'teacher';
  classId?: string;
  teacherEmails?: string[];
}): Promise<{
  success: boolean;
  uid?: string;
  alreadyExisted?: boolean;
  needsEmailReset?: boolean;
  error?: string;
}> {
  const cleanEmail = String(params.email || '').trim().toLowerCase();
  const nextPass = String(params.password || '').trim();
  const prevPass = String(params.previousPassword || '').trim();
  if (!cleanEmail || !nextPass) {
    return { success: false, error: 'Thiếu email hoặc mật khẩu.' };
  }

  const { pAuth, pDb } = getProvisionerAuthAndDb();
  let targetUser: FirebaseUser | null = null;

  try {
    if (prevPass) {
      try {
        const signInCred = await signInWithEmailAndPassword(pAuth, cleanEmail, prevPass);
        targetUser = signInCred.user;
        if (prevPass !== nextPass) {
          await updatePassword(targetUser, nextPass);
        }
      } catch (signInErr: any) {
        const code = signInErr?.code || '';
        if (code === 'auth/user-not-found') {
          const created = await createUserWithEmailAndPassword(pAuth, cleanEmail, nextPass);
          targetUser = created.user;
        } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          try {
            const created = await createUserWithEmailAndPassword(pAuth, cleanEmail, nextPass);
            targetUser = created.user;
          } catch (createErr: any) {
            if (createErr?.code === 'auth/email-already-in-use') {
              return { success: false, alreadyExisted: true, needsEmailReset: true };
            }
            return { success: false, error: mapFirebaseAuthErrorMessage(createErr) };
          }
        } else {
          return { success: false, error: mapFirebaseAuthErrorMessage(signInErr) };
        }
      }
    } else {
      try {
        const created = await createUserWithEmailAndPassword(pAuth, cleanEmail, nextPass);
        targetUser = created.user;
      } catch (createErr: any) {
        if (createErr?.code === 'auth/email-already-in-use') {
          return { success: false, alreadyExisted: true, needsEmailReset: true };
        }
        return { success: false, error: mapFirebaseAuthErrorMessage(createErr) };
      }
    }

    if (!targetUser) {
      return { success: false, error: 'Không thể khởi tạo tài khoản Firebase.' };
    }

    const uid = targetUser.uid;
    const cleanUsername = (params.username || cleanEmail.split('@')[0]).trim().toLowerCase().slice(0, 100);
    const cleanFullName = (params.fullName.trim() || cleanUsername).slice(0, 150);
    const lid = hashUsernameLookupId(cleanUsername);
    const role = params.role === 'teacher' ? 'teacher' : 'student';

    // Update live caches immediately BEFORE/ALONGSIDE Firestore commits for zero-lag password visibility
    upsertLiveUserCache({
      id: uid,
      uid,
      email: cleanEmail,
      username: cleanUsername,
      fullName: cleanFullName,
      name: cleanFullName,
      role,
      isMasterAdmin: cleanEmail === MASTER_ADMIN_EMAIL_LOWER,
      school: String(params.school || 'Trường THPT').slice(0, 200),
      studentCode: params.studentCode,
      isGoogleAuth: false,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString(),
    });

    await Promise.all([
      params.fullName.trim() && targetUser.displayName !== params.fullName.trim()
        ? updateProfile(targetUser, { displayName: params.fullName.trim() }).catch(() => {})
        : Promise.resolve(),
      setDoc(
        doc(pDb, 'users', uid),
        stripUndefined({
          id: uid,
          uid,
          email: cleanEmail.slice(0, 180),
          username: cleanUsername,
          fullName: cleanFullName,
          displayName: cleanFullName,
          role,
          isMasterAdmin: cleanEmail === MASTER_ADMIN_EMAIL_LOWER,
          school: String(params.school || 'Trường THPT').slice(0, 200),
          studentCode: params.studentCode ? String(params.studentCode).slice(0, 60) : undefined,
          isGoogleAuth: false,
          createdAtStr: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      ).catch(() => {}),
      setDoc(
        doc(pDb, 'accountLookups', lid),
        stripUndefined({
          id: lid,
          type: 'username',
          userId: uid,
          email: cleanEmail.slice(0, 180),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      ).catch(() => {}),
      syncUserCredentialToFirestore({
        uid,
        email: cleanEmail,
        username: cleanUsername,
        fullName: cleanFullName,
        role,
        school: params.school,
        studentCode: params.studentCode,
        classId: params.classId,
        teacherEmails: params.teacherEmails,
        visiblePassword: nextPass,
        isGoogleAuth: false,
        pendingActivation: false,
        targetDb: pDb,
      }),
    ]);

    return { success: true, uid };
  } catch (err: any) {
    return { success: false, error: mapFirebaseAuthErrorMessage(err) };
  } finally {
    // Non-blocking teardown so caller receives password & UID instantly
    void signOut(pAuth).catch(() => {});
  }
}

export async function linkExistingStudentToTeacherCredentialsFirestore(params: {
  uid: string;
  email: string;
  username: string;
  fullName: string;
  studentCode?: string;
  school?: string;
  classId: string;
  teacherEmails: string[];
}): Promise<LiveCredentialEntry | null> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) return null;

  const cleanUid = sanitizeDocId(params.uid);
  const cleanClassId = sanitizeDocId(params.classId);
  const cleanEmail = String(params.email || '').trim().toLowerCase().slice(0, 180);
  const cleanTeachers = normalizeEmailList([
    ...(params.teacherEmails || []),
    fbUser.email || '',
  ]);
  if (!cleanUid || !cleanEmail || cleanTeachers.length === 0) return null;

  const credRef = doc(db, 'userCredentials', cleanUid);

  try {
    await updateDoc(credRef, {
      teacherEmails: arrayUnion(...cleanTeachers),
      classId: cleanClassId,
      updatedAt: serverTimestamp(),
    });
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'not-found' || String(err?.message || '').includes('No document to update')) {
      try {
        await setDoc(
          credRef,
          stripUndefined({
            id: cleanUid,
            uid: params.uid.slice(0, 128),
            email: cleanEmail,
            username: (params.username || cleanEmail.split('@')[0]).trim().toLowerCase().slice(0, 100),
            fullName: (params.fullName.trim() || cleanEmail.split('@')[0]).slice(0, 150),
            studentCode: params.studentCode ? String(params.studentCode).slice(0, 60) : undefined,
            school: params.school ? String(params.school).slice(0, 200) : undefined,
            classId: cleanClassId,
            role: 'student',
            isMasterAdmin: false,
            teacherEmails: cleanTeachers,
            isGoogleAuth: false,
            pendingActivation: true,
            createdAtStr: new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );
      } catch (createErr) {
        console.warn('[linkExistingStudentToTeacherCredentialsFirestore] create fallback warning:', createErr);
      }
    } else {
      console.warn('[linkExistingStudentToTeacherCredentialsFirestore] update warning:', err);
    }
  }

  // Now teacher is in teacherEmails on the server — fetch doc so teacher immediately gets visiblePassword!
  try {
    const snap = await getDoc(credRef);
    if (snap.exists()) {
      markCloudDocKnown('userCredentials', snap.id);
      const cd = snap.data();
      const entry: LiveCredentialEntry = {
        uid: String(cd.uid || cd.id || snap.id),
        email: String(cd.email || cleanEmail).trim().toLowerCase(),
        username: String(cd.username || params.username || cleanEmail.split('@')[0]),
        fullName: String(cd.fullName || params.fullName || cleanEmail.split('@')[0]),
        role: cd.role === 'teacher' ? 'teacher' : 'student',
        isMasterAdmin: Boolean(cd.isMasterAdmin),
        school: cd.school || params.school,
        studentCode: cd.studentCode || params.studentCode,
        classId: cd.classId || cleanClassId,
        teacherEmails: Array.isArray(cd.teacherEmails) ? cd.teacherEmails : cleanTeachers,
        visiblePassword: cd.visiblePassword ? String(cd.visiblePassword) : undefined,
        isGoogleAuth: Boolean(cd.isGoogleAuth),
        createdAtStr: cd.createdAtStr,
        updatedAtIso: toIsoString(cd.updatedAt, new Date().toISOString()),
      };
      upsertLiveCredCache(entry);
      emitAccountsUpdatedNow();
      return entry;
    }
  } catch {}

  upsertLiveCredCache({
    uid: params.uid,
    email: cleanEmail,
    username: params.username,
    fullName: params.fullName,
    role: 'student',
    school: params.school,
    studentCode: params.studentCode,
    classId: cleanClassId,
    teacherEmails: cleanTeachers,
  });
  emitAccountsUpdatedNow();
  return liveCredsById.get(cleanUid) || null;
}

export async function fetchLiveUsersForDirectoryFromFirestore(): Promise<UserAccount[]> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) return Array.from(liveUsersById.values());

  const now = Date.now();
  if (
    liveStreamOwnerUid === fbUser.uid &&
    ((liveUsersStreamWarmed && liveUsersById.size > 0) ||
      (liveUsersLastFetchMs > 0 && now - liveUsersLastFetchMs < DIRECTORY_CACHE_TTL_MS))
  ) {
    return Array.from(liveUsersById.values());
  }

  const snap = await getDocs(query(collection(db, 'users'), limit(500))).catch(() => null);
  if (snap) {
    snap.docs.forEach((d) => {
      markCloudDocKnown('users', d.id);
      const u = fromFirestoreUserDoc(d.data(), d.id);
      if (u.email) upsertLiveUserCache(u);
    });
    liveUsersLastFetchMs = now;
    liveStreamOwnerUid = fbUser.uid;
  }
  return Array.from(liveUsersById.values());
}

function buildMergedAdminUsersFromCaches(fallbackClassrooms?: Classroom[]): UserAccount[] {
  const byEmail = new Map<string, UserAccount>();
  const upsertAcc = (incoming: Partial<UserAccount> & { email: string; id: string }) => {
    const emailKey = incoming.email.trim().toLowerCase();
    if (!emailKey) return;
    const prev = byEmail.get(emailKey);
    const merged: UserAccount = {
      id: incoming.uid || incoming.id || prev?.id || emailKey,
      uid: incoming.uid || prev?.uid || incoming.id,
      email: emailKey,
      username: incoming.username || prev?.username || emailKey.split('@')[0],
      fullName: incoming.fullName || incoming.name || prev?.fullName || emailKey.split('@')[0],
      name: incoming.fullName || incoming.name || prev?.name || emailKey.split('@')[0],
      role:
        emailKey === MASTER_ADMIN_EMAIL_LOWER ||
        incoming.role === 'teacher' ||
        prev?.role === 'teacher'
          ? 'teacher'
          : 'student',
      isMasterAdmin:
        emailKey === MASTER_ADMIN_EMAIL_LOWER ||
        Boolean(incoming.isMasterAdmin || prev?.isMasterAdmin),
      school: incoming.school || prev?.school || 'Hệ thống EduTest',
      schoolOrOrg: incoming.school || prev?.schoolOrOrg || 'Hệ thống EduTest',
      studentCode: incoming.studentCode || prev?.studentCode,
      avatar: incoming.avatar || prev?.avatar,
      isGoogleAuth: Boolean(incoming.isGoogleAuth ?? prev?.isGoogleAuth),
      visiblePassword: incoming.visiblePassword || prev?.visiblePassword,
      createdAt: incoming.createdAt || prev?.createdAt || new Date().toISOString().split('T')[0],
      updatedAt: incoming.updatedAt || prev?.updatedAt,
    };
    byEmail.set(emailKey, merged);
  };

  liveUsersById.forEach((u) => {
    if (u.email) upsertAcc(u);
  });

  liveCredsById.forEach((cd) => {
    if (!cd.email) return;
    upsertAcc({
      id: cd.uid,
      uid: cd.uid,
      email: cd.email,
      username: cd.username,
      fullName: cd.fullName,
      role: cd.role,
      isMasterAdmin: cd.isMasterAdmin,
      school: cd.school,
      studentCode: cd.studentCode,
      isGoogleAuth: cd.isGoogleAuth,
      visiblePassword: cd.visiblePassword,
      createdAt: cd.createdAtStr || new Date().toISOString().split('T')[0],
      updatedAt: cd.updatedAtIso,
    });
  });

  for (const cls of fallbackClassrooms || []) {
    for (const s of cls.students || []) {
      const sEmail = String(s.email || '').trim().toLowerCase();
      const fallbackUname = s.studentCode
        ? `hs_${s.studentCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`
        : `hs_${s.id}`;
      const effectiveEmail = sEmail || `${fallbackUname}@edutest.vn`;
      if (!byEmail.has(effectiveEmail)) {
        upsertAcc({
          id: s.id,
          email: effectiveEmail,
          username: fallbackUname,
          fullName: s.name,
          role: 'student',
          school: cls.name,
          studentCode: s.studentCode,
          createdAt: s.joinedAt || new Date().toISOString().split('T')[0],
        });
      }
    }
  }

  return Array.from(byEmail.values());
}

export async function fetchAllUsersAndCredentialsFromFirestore(
  fallbackClassrooms?: Classroom[],
  forceRefresh: boolean = false
): Promise<UserAccount[]> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !isMasterAdminFirebaseUser(fbUser)) return [];

  const now = Date.now();
  const usersFresh =
    !forceRefresh &&
    liveStreamOwnerUid === fbUser.uid &&
    ((liveUsersStreamWarmed && liveUsersById.size > 0) ||
      (liveUsersLastFetchMs > 0 && now - liveUsersLastFetchMs < DIRECTORY_CACHE_TTL_MS));
  const credsFresh =
    !forceRefresh &&
    liveStreamOwnerUid === fbUser.uid &&
    (liveCredsStreamWarmed ||
      (liveCredsLastFetchMs > 0 && now - liveCredsLastFetchMs < DIRECTORY_CACHE_TTL_MS));

  if (usersFresh && credsFresh) {
    return buildMergedAdminUsersFromCaches(fallbackClassrooms);
  }

  const [usersSnap, credsSnap] = await Promise.all([
    usersFresh
      ? Promise.resolve(null)
      : getDocs(query(collection(db, 'users'), limit(500))).catch((err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'users');
          } catch {}
          return null;
        }),
    credsFresh
      ? Promise.resolve(null)
      : getDocs(query(collection(db, 'userCredentials'), limit(500))).catch((err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'userCredentials');
          } catch {}
          return null;
        }),
  ]);

  if (usersSnap) {
    usersSnap.docs.forEach((d) => {
      markCloudDocKnown('users', d.id);
      const u = fromFirestoreUserDoc(d.data(), d.id);
      if (u.email) upsertLiveUserCache(u);
    });
    liveUsersStreamWarmed = true;
    liveUsersLastFetchMs = now;
    liveStreamOwnerUid = fbUser.uid;
  }

  if (credsSnap) {
    credsSnap.docs.forEach((d) => {
      markCloudDocKnown('userCredentials', d.id);
      const cd = d.data();
      const email = String(cd.email || '').trim().toLowerCase();
      if (!email) return;
      upsertLiveCredCache({
        uid: String(cd.uid || cd.id || d.id),
        email,
        username: String(cd.username || email.split('@')[0]),
        fullName: String(cd.fullName || email.split('@')[0]),
        role: cd.role === 'teacher' ? 'teacher' : 'student',
        isMasterAdmin: Boolean(cd.isMasterAdmin),
        school: cd.school || undefined,
        studentCode: cd.studentCode || undefined,
        classId: cd.classId || undefined,
        teacherEmails: Array.isArray(cd.teacherEmails) ? cd.teacherEmails : [],
        visiblePassword: cd.visiblePassword ? String(cd.visiblePassword) : undefined,
        isGoogleAuth: Boolean(cd.isGoogleAuth),
        createdAtStr: cd.createdAtStr || toIsoString(cd.createdAt).split('T')[0],
        updatedAtIso: toIsoString(cd.updatedAt, ''),
      });
    });
    liveCredsStreamWarmed = true;
    liveCredsLastFetchMs = now;
    liveStreamOwnerUid = fbUser.uid;
  }

  return buildMergedAdminUsersFromCaches(fallbackClassrooms);
}

function buildTeacherStudentMapFromCache(
  isAdmin: boolean,
  cleanTeacherEmail: string,
  classStudents: { id: string; email?: string; studentCode?: string }[]
): Record<
  string,
  { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean; uid?: string }
> {
  const creds = Array.from(liveCredsById.values()).filter(
    (c) =>
      isAdmin ||
      c.teacherEmails.includes(cleanTeacherEmail)
  );
  const out: Record<
    string,
    { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean; uid?: string }
  > = {};

  for (const s of classStudents || []) {
    const sEmail = String(s.email || '').trim().toLowerCase();
    const sCode = String(s.studentCode || '').trim().toUpperCase();
    const matched = creds.find(
      (c) =>
        c.uid === s.id ||
        (sEmail && c.email === sEmail) ||
        (sCode && c.studentCode && String(c.studentCode).trim().toUpperCase() === sCode)
    );
    if (matched) {
      const canView =
        isAdmin ||
        (!matched.isMasterAdmin &&
          matched.email !== MASTER_ADMIN_EMAIL_LOWER &&
          matched.role !== 'teacher');
      const pwd = canView && matched.visiblePassword ? String(matched.visiblePassword) : undefined;
      out[s.id] = {
        uid: matched.uid,
        username: matched.username,
        email: matched.email || sEmail,
        ...(pwd ? { visiblePassword: pwd } : {}),
        ...(matched.isGoogleAuth && !pwd ? { isGoogleOnly: true } : {}),
      };
    }
  }
  return out;
}

export async function fetchTeacherStudentCredentialsFromFirestore(
  teacherEmail: string,
  classStudents: { id: string; email?: string; studentCode?: string }[],
  forceRefresh: boolean = false
): Promise<
  Record<
    string,
    { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean; uid?: string }
  >
> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) return {};
  const cleanTeacherEmail = String(teacherEmail || fbUser.email || '').trim().toLowerCase();
  const isAdmin = isMasterAdminFirebaseUser(fbUser);

  const now = Date.now();
  if (
    !forceRefresh &&
    liveStreamOwnerUid === fbUser.uid &&
    (liveCredsStreamWarmed ||
      (liveCredsLastFetchMs > 0 && now - liveCredsLastFetchMs < DIRECTORY_CACHE_TTL_MS))
  ) {
    return buildTeacherStudentMapFromCache(isAdmin, cleanTeacherEmail, classStudents);
  }

  const q = isAdmin
    ? query(collection(db, 'userCredentials'), limit(500))
    : query(
        collection(db, 'userCredentials'),
        where('teacherEmails', 'array-contains', cleanTeacherEmail),
        limit(300)
      );

  const snap = await getDocs(q).catch(() => null);
  if (!snap) return buildTeacherStudentMapFromCache(isAdmin, cleanTeacherEmail, classStudents);

  snap.docs.forEach((d) => {
    markCloudDocKnown('userCredentials', d.id);
    const cd = d.data();
    const email = String(cd.email || '').trim().toLowerCase();
    if (!email) return;
    upsertLiveCredCache({
      uid: String(cd.uid || cd.id || d.id),
      email,
      username: String(cd.username || email.split('@')[0]),
      fullName: String(cd.fullName || email.split('@')[0]),
      role: cd.role === 'teacher' ? 'teacher' : 'student',
      isMasterAdmin: Boolean(cd.isMasterAdmin),
      school: cd.school || undefined,
      studentCode: cd.studentCode || undefined,
      classId: cd.classId || undefined,
      teacherEmails: Array.isArray(cd.teacherEmails) ? cd.teacherEmails : [],
      visiblePassword: cd.visiblePassword ? String(cd.visiblePassword) : undefined,
      isGoogleAuth: Boolean(cd.isGoogleAuth),
      createdAtStr: cd.createdAtStr || toIsoString(cd.createdAt).split('T')[0],
      updatedAtIso: toIsoString(cd.updatedAt, ''),
    });
  });
  liveCredsStreamWarmed = true;
  liveCredsLastFetchMs = now;
  liveStreamOwnerUid = fbUser.uid;

  return buildTeacherStudentMapFromCache(isAdmin, cleanTeacherEmail, classStudents);
}

/**
 * Resolve & unify lightweight users/{uid} document (< 1KB).
 * Merges legacy user profile docs matching the same email into users/{fbUser.uid}.
 */
export async function resolveOrCreateUnifiedUserProfile(
  fbUser: FirebaseUser,
  hints?: Partial<UserAccount>
): Promise<UserAccount> {
  const uid = fbUser.uid;
  const email = String(fbUser.email || hints?.email || '')
    .trim()
    .toLowerCase();
  const isMaster = email === MASTER_ADMIN_EMAIL_LOWER;
  const uidRef = doc(db, 'users', uid);

  let uidDocData: any = null;
  try {
    const snap = await withTimeout(
      getDoc(uidRef).catch(() => getDocFromServer(uidRef)),
      2500,
      null as any
    );
    if (snap && snap.exists()) {
      uidDocData = snap.data();
      markCloudDocKnown('users', uid);
    }
  } catch {}

  // Look up any legacy profile documents sharing the same email to unify roles/ownership
  const legacyMatches: { id: string; data: any }[] = [];
  if (email) {
    try {
      const emailSnap = await withTimeout(
        getDocs(query(collection(db, 'users'), where('email', '==', email))),
        2500,
        null as any
      );
      if (emailSnap) {
        emailSnap.docs.forEach((d: any) => {
          markCloudDocKnown('users', d.id);
          if (d.id !== uid) {
            legacyMatches.push({ id: d.id, data: d.data() });
          }
        });
      }
    } catch {}
  }

  const legacyData = legacyMatches.reduce<any>((acc, item) => {
    const d = item.data || {};
    return {
      ...acc,
      ...d,
      role: acc.role === 'teacher' || d.role === 'teacher' ? 'teacher' : acc.role || d.role,
      isMasterAdmin: Boolean(acc.isMasterAdmin || d.isMasterAdmin),
    };
  }, {});

  const collectedLegacyIds = new Set<string>();
  if (Array.isArray(uidDocData?.legacyUserIds)) {
    uidDocData.legacyUserIds.forEach((x: string) => x && collectedLegacyIds.add(x));
  }
  if (Array.isArray(hints?.legacyUserIds)) {
    hints.legacyUserIds.forEach((x) => x && collectedLegacyIds.add(x));
  }
  if (hints?.id && hints.id !== uid) collectedLegacyIds.add(hints.id);
  legacyMatches.forEach((m) => {
    collectedLegacyIds.add(m.id);
    if (m.data?.id && m.data.id !== uid) collectedLegacyIds.add(String(m.data.id));
  });
  if (isMaster) collectedLegacyIds.add('usr_master_teacher');

  const hasTeacherRole =
    isMaster ||
    uidDocData?.role === 'teacher' ||
    legacyData?.role === 'teacher' ||
    hints?.role === 'teacher';

  const resolvedFullName = String(
    uidDocData?.fullName ||
      hints?.fullName ||
      fbUser.displayName ||
      legacyData?.fullName ||
      email.split('@')[0] ||
      'Thành viên EduTest'
  )
    .trim()
    .slice(0, 150);

  const resolvedUsername = String(
    uidDocData?.username ||
      legacyData?.username ||
      hints?.username ||
      email.split('@')[0] ||
      uid.slice(0, 12)
  )
    .trim()
    .toLowerCase()
    .slice(0, 100);

  const resolvedSchool = String(
    uidDocData?.school || legacyData?.school || hints?.school || 'Trường THPT'
  ).slice(0, 200);

  const resolvedStudentCode =
    uidDocData?.studentCode || legacyData?.studentCode || hints?.studentCode || undefined;

  const isGoogle =
    fbUser.providerData.some((p) => p.providerId === 'google.com') ||
    Boolean(uidDocData?.isGoogleAuth);

  const createdAtStr =
    uidDocData?.createdAtStr ||
    legacyData?.createdAtStr ||
    hints?.createdAt ||
    new Date().toISOString().split('T')[0];

  const compactAvatar =
    (hints?.avatar && hints.avatar.length <= 512 && hints.avatar) ||
    (fbUser.photoURL && fbUser.photoURL.length <= 512 && fbUser.photoURL) ||
    (uidDocData?.avatar && String(uidDocData.avatar).length <= 512 && String(uidDocData.avatar)) ||
    undefined;

  const firestoreProfile = stripUndefined({
    id: uid,
    uid,
    email: email.slice(0, 180),
    username: resolvedUsername,
    fullName: resolvedFullName,
    displayName: resolvedFullName,
    role: hasTeacherRole ? 'teacher' : 'student',
    isMasterAdmin: isMaster || Boolean(uidDocData?.isMasterAdmin || legacyData?.isMasterAdmin),
    school: resolvedSchool,
    studentCode: resolvedStudentCode ? String(resolvedStudentCode).slice(0, 60) : undefined,
    avatar: compactAvatar,
    isGoogleAuth: isGoogle,
    legacyUserIds: Array.from(collectedLegacyIds).slice(0, 20),
    createdAtStr: String(createdAtStr).slice(0, 64),
    ...(uidDocData ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });

  const needsProfileWrite =
    !uidDocData ||
    uidDocData.email !== firestoreProfile.email ||
    uidDocData.username !== firestoreProfile.username ||
    uidDocData.fullName !== firestoreProfile.fullName ||
    uidDocData.role !== firestoreProfile.role ||
    Boolean(uidDocData.isMasterAdmin) !== Boolean(firestoreProfile.isMasterAdmin) ||
    uidDocData.school !== firestoreProfile.school ||
    (uidDocData.studentCode || undefined) !== firestoreProfile.studentCode;

  if (needsProfileWrite) {
    void withTimeout(
      setDoc(uidRef, firestoreProfile, { merge: true }).then(() => {
        markCloudDocKnown('users', uid);
      }),
      3500,
      undefined
    ).catch((err) => {
      console.warn('[resolveOrCreateUnifiedUserProfile] background write skipped:', err);
    });
  }

  const finalAccount: UserAccount = {
    id: uid,
    uid,
    legacyUserIds: Array.from(collectedLegacyIds),
    email,
    username: resolvedUsername,
    fullName: resolvedFullName,
    name: resolvedFullName,
    role: hasTeacherRole ? 'teacher' : 'student',
    isMasterAdmin: Boolean(firestoreProfile.isMasterAdmin),
    school: resolvedSchool,
    schoolOrOrg: resolvedSchool,
    studentCode: resolvedStudentCode,
    avatar: compactAvatar || hints?.avatar || fbUser.photoURL || undefined,
    isGoogleAuth: isGoogle,
    createdAt: String(createdAtStr),
    updatedAt: new Date().toISOString(),
  };

  if (needsProfileWrite) {
    void syncUsernameLookupInFirestore(finalAccount);
  }
  return finalAccount;
}

// Lightweight payload converter (< 1KB per users/{uid} document)
function toSafeUserDoc(user: UserAccount, ownerUid: string, isKnownUpdate: boolean) {
  const fbUser = getFirebaseAuthUser();
  const resolvedRawEmail =
    fbUser && ownerUid === fbUser.uid && fbUser.email
      ? fbUser.email
      : user.email || fbUser?.email || '';
  const email = (resolvedRawEmail.trim().toLowerCase() || 'user@edutest.local').slice(0, 180);
  const isMaster = email === MASTER_ADMIN_EMAIL_LOWER;
  const cleanId = sanitizeDocId(user.uid || user.id || ownerUid);
  const fullName = (
    String(user.fullName || user.name || email.split('@')[0] || '').trim() || 'Thành viên'
  ).slice(0, 150);
  const username = (
    String(user.username || email.split('@')[0] || '').trim().toLowerCase() ||
    `user_${cleanId.slice(0, 8)}`
  ).slice(0, 100);
  const compactAvatar =
    user.avatar && user.avatar.length <= 512 ? user.avatar : undefined;

  return stripUndefined({
    id: cleanId,
    uid: user.uid || ownerUid,
    email,
    username,
    fullName,
    displayName: fullName,
    role: isMaster ? 'teacher' : user.role === 'teacher' ? 'teacher' : 'student',
    isMasterAdmin: isMaster,
    school: user.school ? String(user.school).slice(0, 200) : undefined,
    studentCode: user.studentCode ? String(user.studentCode).slice(0, 60) : undefined,
    avatar: compactAvatar,
    isGoogleAuth: Boolean(user.isGoogleAuth),
    legacyUserIds: Array.isArray(user.legacyUserIds)
      ? user.legacyUserIds.filter((x): x is string => typeof x === 'string').slice(0, 20)
      : undefined,
    createdAtStr: (user.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreUserDoc(d: any, docId?: string): UserAccount {
  const email = String(d.email || '')
    .trim()
    .toLowerCase();
  const isMaster = email === MASTER_ADMIN_EMAIL_LOWER || Boolean(d.isMasterAdmin);
  const resolvedId = String(d.uid || d.id || docId || '');
  const fullName = String(d.fullName || d.displayName || email.split('@')[0] || 'Thành viên');
  return {
    id: resolvedId,
    uid: String(d.uid || resolvedId),
    legacyUserIds: Array.isArray(d.legacyUserIds) ? d.legacyUserIds : undefined,
    email,
    username: String(d.username || email.split('@')[0] || ''),
    fullName,
    name: fullName,
    role: isMaster ? 'teacher' : d.role === 'teacher' ? 'teacher' : 'student',
    isMasterAdmin: isMaster,
    school: d.school || undefined,
    schoolOrOrg: d.school || undefined,
    studentCode: d.studentCode || undefined,
    avatar: d.avatar || undefined,
    isGoogleAuth: Boolean(d.isGoogleAuth),
    createdAt: d.createdAtStr || toIsoString(d.createdAt).split('T')[0],
    updatedAt: toIsoString(d.updatedAt),
  };
}

function resolveUserAccessEmails(user?: UserAccount | null): string[] {
  const fbUser = getFirebaseAuthUser();
  return normalizeEmailList([fbUser?.email, user?.email]);
}

function getEffectiveUid(activeWebUser?: UserAccount | null): string {
  const fbUser = getFirebaseAuthUser();
  if (fbUser) return fbUser.uid;
  return sanitizeDocId(activeWebUser?.uid || activeWebUser?.id || '');
}

// =========================================================================
// DOMAIN CONVERTERS
// =========================================================================

function isPlainObject(v: unknown): v is Record<string, any> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function filterObjects(arr: unknown, maxItems: number): Record<string, any>[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPlainObject).slice(0, maxItems);
}

function filterStrings(arr: unknown, maxItems: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string').slice(0, maxItems);
}

function pickEnum<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  return typeof val === 'string' && (allowed as readonly string[]).includes(val)
    ? (val as T)
    : fallback;
}

function safeNonEmptyEmail(raw: unknown, fallbackEmail: string): string {
  const clean = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (clean.length >= 3 ? clean : fallbackEmail).slice(0, 180);
}

function safeFiniteNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function toSafeExamDoc(
  exam: Exam,
  ownerUid: string,
  ownerEmail: string,
  classrooms: Classroom[],
  isKnownUpdate: boolean
) {
  const assignedCls = exam.assignedClassId
    ? classrooms.find((c) => c.id === exam.assignedClassId)
    : undefined;
  const allowedEmails = normalizeEmailList([
    ownerEmail,
    exam.creatorEmail,
    assignedCls?.teacherEmail,
    ...(assignedCls?.students || []).map((s) => s.email),
  ]);

  const safeAttachedFile = exam.attachedFile
    ? stripUndefined({
        id: String(exam.attachedFile.id || 'att_exam').slice(0, 128),
        name: String(exam.attachedFile.name || 'document').slice(0, 220),
        mimeType: String(exam.attachedFile.mimeType || 'application/octet-stream').slice(0, 140),
        sizeBytes: safeFiniteNumber(exam.attachedFile.sizeBytes),
        dataUrl:
          exam.attachedFile.dataUrl && exam.attachedFile.dataUrl.length <= 720000
            ? exam.attachedFile.dataUrl
            : undefined,
        url: exam.attachedFile.url ? String(exam.attachedFile.url).slice(0, 2000) : undefined,
        uploadedAt: exam.attachedFile.uploadedAt
          ? String(exam.attachedFile.uploadedAt).slice(0, 64)
          : undefined,
      })
    : undefined;

  const buildPayload = (
    questionsArr: any[],
    attFile: typeof safeAttachedFile
  ) =>
    stripUndefined({
      id: sanitizeDocId(exam.id),
      title: (String(exam.title || '').trim() || 'Đề thi không tên').slice(0, 300),
      subject: (String(exam.subject || '').trim() || 'general').slice(0, 64),
      grade: String(exam.grade || 'Tổng hợp').slice(0, 64),
      durationMinutes: safeFiniteNumber(exam.durationMinutes) ?? 45,
      description: String(exam.description || '').slice(0, 4000),
      instructions: exam.instructions ? String(exam.instructions).slice(0, 4000) : undefined,
      settings: isPlainObject(exam.settings) ? exam.settings : {},
      parts: Array.isArray(exam.parts) ? filterObjects(exam.parts, 50) : undefined,
      attachedFile: attFile,
      questions: questionsArr,
      totalQuestions: safeFiniteNumber(exam.totalQuestions ?? exam.questions?.length) ?? 0,
      totalPoints: safeFiniteNumber(exam.totalPoints) ?? 10,
      isCustom: Boolean(exam.isCustom ?? true),
      visibility: pickEnum(
        exam.visibility,
        ['public', 'exam_only', 'private', 'class', 'bundle_only'] as const,
        'public'
      ),
      assignedClassId: exam.assignedClassId ? String(exam.assignedClassId).slice(0, 128) : undefined,
      assignedClassName: exam.assignedClassName
        ? String(exam.assignedClassName).slice(0, 200)
        : undefined,
      allowedEmails,
      status: pickEnum(
        exam.status,
        ['draft', 'scheduled', 'open', 'closed', 'published'] as const,
        'open'
      ),
      openTime: exam.openTime ? String(exam.openTime).slice(0, 64) : undefined,
      closeTime: exam.closeTime ? String(exam.closeTime).slice(0, 64) : undefined,
      modeType: pickEnum(exam.modeType, ['both', 'exam_only', 'practice_only'] as const, 'both'),
      maxAttempts: safeFiniteNumber(exam.maxAttempts),
      maxTabSwitches: safeFiniteNumber(exam.maxTabSwitches),
      allowCopy: exam.allowCopy ?? true,
      showAnswersAfterExam: exam.showAnswersAfterExam ?? true,
      showOnlyStudentAnswersAfterExam: exam.showOnlyStudentAnswersAfterExam ?? false,
      showLiveScoreDuringExam: exam.showLiveScoreDuringExam ?? true,
      showScoreAfterExam: exam.showScoreAfterExam ?? true,
      examCode: exam.examCode ? String(exam.examCode).slice(0, 32) : undefined,
      randomQuestionCount: safeFiniteNumber(exam.randomQuestionCount),
      lockExitUntilTimeout: exam.lockExitUntilTimeout ?? false,
      minSubmitMinutes: safeFiniteNumber(exam.minSubmitMinutes),
      requireAccessCode: exam.requireAccessCode ?? false,
      accessSecurityCode: exam.accessSecurityCode
        ? String(exam.accessSecurityCode).slice(0, 64)
        : undefined,
      accessMode: pickEnum(exam.accessMode, ['direct_and_code', 'code_only'] as const, 'direct_and_code'),
      teacherMode: pickEnum(
        exam.teacherMode || (exam.isCreatorOnlyMode ? 'creator' : 'normal'),
        ['normal', 'creator', 'grading', 'presenting'] as const,
        'normal'
      ),
      isCreatorOnlyMode: Boolean(exam.isCreatorOnlyMode || exam.teacherMode === 'creator'),
      isOfficialClassExam: Boolean(exam.isOfficialClassExam),
      preExamLockMinutes: safeFiniteNumber(exam.preExamLockMinutes),
      allowExitAfterSubmit: Boolean(exam.allowExitAfterSubmit),
      creatorId: sanitizeDocId(exam.creatorId || ownerUid),
      creatorUid:
        ownerEmail.trim().toLowerCase() === MASTER_ADMIN_EMAIL_LOWER && (exam as any).creatorUid
          ? sanitizeDocId(String((exam as any).creatorUid))
          : ownerUid,
      creatorEmail: safeNonEmptyEmail(exam.creatorEmail || ownerEmail, 'teacher@edutest.local'),
      creatorName: exam.creatorName ? String(exam.creatorName).slice(0, 150) : undefined,
      createdAtStr: (exam.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
      ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });

  const rawQuestions = filterObjects(exam.questions, 300);
  const hasLargeBase64InQuestion = (q: any): boolean => {
    if (!q || typeof q !== 'object') return false;
    const checkStr = (s: unknown) => typeof s === 'string' && s.startsWith('data:') && s.length > 2000;
    if (checkStr(q.imageUrl) || checkStr(q.explanationImageUrl)) return true;
    if (q.inlineImages && typeof q.inlineImages === 'object') {
      if (Object.values(q.inlineImages).some(checkStr)) return true;
    }
    if (Array.isArray(q.matchingLeftItems) && q.matchingLeftItems.some((it: any) => checkStr(it?.imageUrl))) {
      return true;
    }
    if (Array.isArray(q.matchingRightItems) && q.matchingRightItems.some((it: any) => checkStr(it?.imageUrl))) {
      return true;
    }
    if (Array.isArray(q.subQuestions) && q.subQuestions.some(hasLargeBase64InQuestion)) {
      return true;
    }
    return false;
  };

  let safeQuestions: Record<string, any>[] = rawQuestions;
  let safeAtt: Record<string, any> | undefined = safeAttachedFile;
  if (rawQuestions.some(hasLargeBase64InQuestion)) {
    safeQuestions = rawQuestions
      .map((q) => sanitizeQuestionForCourseBlock(q as Question))
      .filter((q): q is Question => Boolean(q));
  }

  let candidate = buildPayload(safeQuestions, safeAtt as typeof safeAttachedFile);
  try {
    let approxBytes = JSON.stringify(candidate).length;
    if (approxBytes > 860000 && safeQuestions === rawQuestions) {
      safeQuestions = rawQuestions
        .map((q) => sanitizeQuestionForCourseBlock(q as Question))
        .filter((q): q is Question => Boolean(q));
      candidate = buildPayload(safeQuestions, safeAtt as typeof safeAttachedFile);
      approxBytes = JSON.stringify(candidate).length;
    }
    if (approxBytes > 900000 && safeAtt?.dataUrl) {
      const { dataUrl: _omit, ...restAtt } = safeAtt;
      safeAtt = stripUndefined(restAtt);
      candidate = buildPayload(safeQuestions, safeAtt as typeof safeAttachedFile);
    }
  } catch {}

  return candidate;
}

function fromFirestoreExamDoc(d: any): Exam {
  return {
    ...d,
    id: d.id,
    createdAt: d.createdAtStr || toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt, ''),
  } as Exam;
}

function toSafeBundleDoc(
  bundle: ExamBundle,
  ownerUid: string,
  ownerEmail: string,
  classrooms: Classroom[],
  isKnownUpdate: boolean
) {
  const assignedCls = bundle.assignedClassId
    ? classrooms.find((c) => c.id === bundle.assignedClassId)
    : undefined;
  const allowedEmails = normalizeEmailList([
    ownerEmail,
    bundle.creatorEmail,
    assignedCls?.teacherEmail,
    ...(assignedCls?.students || []).map((s) => s.email),
  ]);

  return stripUndefined({
    id: sanitizeDocId(bundle.id),
    title: (String(bundle.title || '').trim() || 'Tổ hợp thi').slice(0, 300),
    description: String(bundle.description || '').slice(0, 4000),
    bundleCode: bundle.bundleCode ? String(bundle.bundleCode).slice(0, 32) : undefined,
    breakMinutes: safeFiniteNumber(bundle.breakMinutes) ?? 5,
    intermissionMinutes: safeFiniteNumber(bundle.intermissionMinutes),
    examIds: filterStrings(bundle.examIds, 100),
    selectionMode: pickEnum(
      bundle.selectionMode,
      ['all_compulsory', 'has_electives'] as const,
      'all_compulsory'
    ),
    timingMode: pickEnum(
      bundle.timingMode,
      ['compulsory_seq_elective_cluster_max', 'all_sequential_independent'] as const,
      'compulsory_seq_elective_cluster_max'
    ),
    compulsoryExamIds: Array.isArray(bundle.compulsoryExamIds)
      ? filterStrings(bundle.compulsoryExamIds, 100)
      : undefined,
    electiveGroups: Array.isArray(bundle.electiveGroups)
      ? filterObjects(bundle.electiveGroups, 50)
      : undefined,
    minGroupsToSelect: safeFiniteNumber(bundle.minGroupsToSelect),
    maxGroupsToSelect: safeFiniteNumber(bundle.maxGroupsToSelect),
    selectionTimeLimitSeconds: safeFiniteNumber(bundle.selectionTimeLimitSeconds),
    randomQuestionCountPerExam: isPlainObject(bundle.randomQuestionCountPerExam)
      ? bundle.randomQuestionCountPerExam
      : undefined,
    openTime: bundle.openTime ? String(bundle.openTime).slice(0, 64) : undefined,
    closeTime: bundle.closeTime ? String(bundle.closeTime).slice(0, 64) : undefined,
    status: pickEnum(
      bundle.status,
      ['draft', 'scheduled', 'open', 'closed', 'published'] as const,
      'open'
    ),
    maxAttempts: safeFiniteNumber(bundle.maxAttempts),
    visibility: pickEnum(
      bundle.visibility,
      ['public', 'exam_only', 'private', 'class', 'bundle_only'] as const,
      'public'
    ),
    assignedClassId: bundle.assignedClassId
      ? String(bundle.assignedClassId).slice(0, 128)
      : undefined,
    assignedClassName: bundle.assignedClassName
      ? String(bundle.assignedClassName).slice(0, 200)
      : undefined,
    allowedEmails,
    accessMode: pickEnum(
      bundle.accessMode,
      ['direct_and_code', 'code_only'] as const,
      'direct_and_code'
    ),
    lockExitUntilTimeout: bundle.lockExitUntilTimeout ?? false,
    showScoreAfterExam: bundle.showScoreAfterExam ?? true,
    showAnswersAfterExam: bundle.showAnswersAfterExam ?? true,
    showOnlyStudentAnswersAfterExam: bundle.showOnlyStudentAnswersAfterExam ?? false,
    minSubmitMinutes: safeFiniteNumber(bundle.minSubmitMinutes),
    requireAccessCode: bundle.requireAccessCode ?? false,
    accessSecurityCode: bundle.accessSecurityCode
      ? String(bundle.accessSecurityCode).slice(0, 64)
      : undefined,
    allowCopy: bundle.allowCopy ?? true,
    maxTabSwitches: safeFiniteNumber(bundle.maxTabSwitches),
    sections: Array.isArray(bundle.sections) ? filterObjects(bundle.sections, 50) : undefined,
    isCustom: Boolean(bundle.isCustom ?? true),
    creatorId: sanitizeDocId(bundle.creatorId || ownerUid),
    creatorUid:
      ownerEmail.trim().toLowerCase() === MASTER_ADMIN_EMAIL_LOWER && (bundle as any).creatorUid
        ? sanitizeDocId(String((bundle as any).creatorUid))
        : ownerUid,
    creatorEmail: safeNonEmptyEmail(bundle.creatorEmail || ownerEmail, 'teacher@edutest.local'),
    creatorName: bundle.creatorName ? String(bundle.creatorName).slice(0, 150) : undefined,
    createdAtStr: (bundle.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreBundleDoc(d: any): ExamBundle {
  return {
    ...d,
    id: d.id,
    createdAt: d.createdAtStr || toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt, ''),
  } as ExamBundle;
}

function normalizeCourseChapters(course: MicroCourse): CourseChapter[] {
  if (Array.isArray(course.chapters) && course.chapters.length > 0) {
    return [...course.chapters].sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  if (Array.isArray(course.lessons) && course.lessons.length > 0) {
    return [
      {
        id: `chap_${sanitizeDocId(course.id)}_default`,
        title: 'Chương 1: Các bài học trọng tâm',
        order: 1,
        lessons: course.lessons,
      },
    ];
  }
  return [];
}

function sanitizeQuestionForCourseBlock(q?: Question): Question | undefined {
  if (!q || typeof q !== 'object') return undefined;
  const copy: any = { ...q };
  if (copy.imageUrl !== undefined) {
    copy.imageUrl = sanitizeUrlForFirestore(copy.imageUrl);
  }
  if (copy.explanationImageUrl !== undefined) {
    copy.explanationImageUrl = sanitizeUrlForFirestore(copy.explanationImageUrl);
  }
  if (copy.inlineImages !== undefined) {
    copy.inlineImages = sanitizeInlineImagesForFirestore(copy.inlineImages);
  }
  if (Array.isArray(copy.matchingLeftItems)) {
    copy.matchingLeftItems = copy.matchingLeftItems.map((it: any) =>
      it && typeof it === 'object'
        ? { ...it, imageUrl: sanitizeUrlForFirestore(it.imageUrl) }
        : it
    );
  }
  if (Array.isArray(copy.matchingRightItems)) {
    copy.matchingRightItems = copy.matchingRightItems.map((it: any) =>
      it && typeof it === 'object'
        ? { ...it, imageUrl: sanitizeUrlForFirestore(it.imageUrl) }
        : it
    );
  }
  if (Array.isArray(copy.subQuestions)) {
    copy.subQuestions = copy.subQuestions
      .map((sub: Question) => sanitizeQuestionForCourseBlock(sub))
      .filter(Boolean);
  }
  return stripUndefined(copy) as Question;
}

function sanitizeSectionsForCourseLesson(sections?: LessonSection[]): LessonSection[] | undefined {
  if (!Array.isArray(sections)) return undefined;
  return sections
    .filter((s) => s && typeof s === 'object')
    .slice(0, 100)
    .map((s, idx) =>
      stripUndefined({
        id: sanitizeDocId(s.id || `sec_${idx + 1}`),
        title: String(s.title || 'Phân mục').slice(0, 300),
        summary: s.summary ? String(s.summary).slice(0, 4000) : undefined,
        parentSectionId: s.parentSectionId ? sanitizeDocId(s.parentSectionId) : undefined,
        order: safeFiniteNumber(s.order) ?? idx + 1,
        inlineImages: sanitizeInlineImagesForFirestore(s.inlineImages),
      }) as LessonSection
    );
}

function toSafeCourseDoc(
  course: MicroCourse,
  ownerUid: string,
  ownerEmail: string,
  classrooms: Classroom[],
  isKnownUpdate: boolean,
  options?: { stripLegacyFields?: boolean }
) {
  const assignedCls = course.assignedClassId
    ? classrooms.find((c) => c.id === course.assignedClassId)
    : undefined;
  const allowedEmails = normalizeEmailList([
    ownerEmail,
    course.creatorEmail,
    assignedCls?.teacherEmail,
    ...(assignedCls?.students || []).map((s) => s.email),
  ]);

  const hasHydratedContent = course.detailsLoaded !== false;
  const chapters = hasHydratedContent ? normalizeCourseChapters(course) : [];
  const chapterCount = hasHydratedContent
    ? chapters.length
    : safeFiniteNumber(course.chapterCount) ?? 0;
  const lessonCount = hasHydratedContent
    ? chapters.reduce((sum, ch) => sum + (Array.isArray(ch.lessons) ? ch.lessons.length : 0), 0)
    : safeFiniteNumber(course.lessonCount) ?? 0;
  const chapterIndex: CourseChapterIndexItem[] | undefined = hasHydratedContent
    ? chapters.slice(0, 100).map((ch, idx) => ({
        id: sanitizeDocId(ch.id || `chap_${idx + 1}`),
        title: String(ch.title || 'Chương học').slice(0, 200),
        order: safeFiniteNumber(ch.order) ?? idx + 1,
        lessonCount: Array.isArray(ch.lessons) ? ch.lessons.length : 0,
      }))
    : Array.isArray(course.chapterIndex)
    ? filterObjects(course.chapterIndex, 100).map((idxItem: any, idx: number) => ({
        id: sanitizeDocId(idxItem.id || `chap_${idx + 1}`),
        title: String(idxItem.title || 'Chương học').slice(0, 200),
        order: safeFiniteNumber(idxItem.order) ?? idx + 1,
        lessonCount: safeFiniteNumber(idxItem.lessonCount) ?? 0,
      }))
    : undefined;

  const base: Record<string, any> = stripUndefined({
    id: sanitizeDocId(course.id),
    title: (String(course.title || '').trim() || 'Khóa học').slice(0, 300),
    subject: (String(course.subject || '').trim() || 'general').slice(0, 64),
    grade: String(course.grade || 'Lớp 12').slice(0, 64),
    description: String(course.description || '').slice(0, 4000),
    coverImageUrl: sanitizeUrlForFirestore(course.coverImageUrl),
    inlineImages: sanitizeInlineImagesForFirestore(course.inlineImages),
    instructor: String(course.instructor || 'Giáo viên').slice(0, 150),
    schemaVersion: 2,
    chapterCount,
    lessonCount,
    chapterIndex,
    finalExamId: course.finalExamId ? String(course.finalExamId).slice(0, 128) : undefined,
    finalExamTitle: course.finalExamTitle ? String(course.finalExamTitle).slice(0, 300) : undefined,
    status: pickEnum(
      course.status,
      ['draft', 'scheduled', 'open', 'closed', 'published'] as const,
      'open'
    ),
    openTime: course.openTime ? String(course.openTime).slice(0, 64) : undefined,
    closeTime: course.closeTime ? String(course.closeTime).slice(0, 64) : undefined,
    visibility: pickEnum(
      course.visibility,
      ['public', 'exam_only', 'private', 'class', 'bundle_only'] as const,
      'public'
    ),
    assignedClassId: course.assignedClassId
      ? String(course.assignedClassId).slice(0, 128)
      : undefined,
    assignedClassName: course.assignedClassName
      ? String(course.assignedClassName).slice(0, 200)
      : undefined,
    allowedEmails,
    creatorId: sanitizeDocId(course.creatorId || ownerUid),
    creatorUid:
      ownerEmail.trim().toLowerCase() === MASTER_ADMIN_EMAIL_LOWER && (course as any).creatorUid
        ? sanitizeDocId(String((course as any).creatorUid))
        : ownerUid,
    creatorEmail: safeNonEmptyEmail(course.creatorEmail || ownerEmail, 'teacher@edutest.local'),
    creatorName: course.creatorName ? String(course.creatorName).slice(0, 150) : undefined,
    isScormEnabled: course.isScormEnabled ?? true,
    scormVersion: pickEnum(course.scormVersion, ['1.2', '2004'] as const, '1.2'),
    createdAtStr: (course.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });

  if (isKnownUpdate && options?.stripLegacyFields) {
    base.chapters = deleteField();
    base.lessons = deleteField();
  }

  return base;
}

function toSafeCourseChapterDoc(
  courseId: string,
  chap: CourseChapter,
  orderIdx: number,
  ownerUid: string,
  ownerEmail: string,
  isKnownUpdate: boolean
) {
  const cleanCourseId = sanitizeDocId(courseId);
  const cleanChapId = sanitizeDocId(chap.id);
  const lessonIds = filterStrings(
    (chap.lessons || []).map((l) => sanitizeDocId(l.id)),
    200
  );
  return stripUndefined({
    id: cleanChapId,
    courseId: cleanCourseId,
    title: (String(chap.title || '').trim() || `Chương ${orderIdx + 1}`).slice(0, 300),
    description: chap.description ? String(chap.description).slice(0, 4000) : undefined,
    inlineImages: sanitizeInlineImagesForFirestore(chap.inlineImages),
    order: safeFiniteNumber(chap.order) ?? orderIdx + 1,
    lessonIds,
    chapterExamId: chap.chapterExamId ? String(chap.chapterExamId).slice(0, 128) : undefined,
    chapterExamTitle: chap.chapterExamTitle ? String(chap.chapterExamTitle).slice(0, 300) : undefined,
    creatorUid: ownerUid,
    creatorEmail: safeNonEmptyEmail(ownerEmail, 'teacher@edutest.local'),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function toSafeCourseLessonDoc(
  courseId: string,
  chapId: string,
  les: CourseLesson,
  orderIdx: number,
  ownerUid: string,
  ownerEmail: string,
  isKnownUpdate: boolean
) {
  const cleanCourseId = sanitizeDocId(courseId);
  const cleanChapId = sanitizeDocId(chapId);
  const cleanLesId = sanitizeDocId(les.id);
  const blockIds = filterStrings(
    (les.blocks || []).map((b) => sanitizeDocId(b.id)),
    300
  );
  return stripUndefined({
    id: cleanLesId,
    courseId: cleanCourseId,
    chapterId: cleanChapId,
    title: (String(les.title || '').trim() || `Bài ${orderIdx + 1}`).slice(0, 300),
    order: orderIdx + 1,
    durationMinutes: safeFiniteNumber(les.durationMinutes),
    summary: les.summary ? String(les.summary).slice(0, 20000) : undefined,
    contentMarkdown: les.contentMarkdown ? String(les.contentMarkdown).slice(0, 100000) : undefined,
    inlineImages: sanitizeInlineImagesForFirestore(les.inlineImages),
    sections: sanitizeSectionsForCourseLesson(les.sections),
    attachments: sanitizeAttachmentsForFirestore(les.attachments),
    blockIds,
    practiceExamId: les.practiceExamId ? String(les.practiceExamId).slice(0, 128) : undefined,
    practiceExamTitle: les.practiceExamTitle ? String(les.practiceExamTitle).slice(0, 300) : undefined,
    homework: isPlainObject(les.homework)
      ? stripUndefined({
          ...les.homework,
          inlineImages: sanitizeInlineImagesForFirestore((les.homework as any).inlineImages),
          attachments: sanitizeAttachmentsForFirestore((les.homework as any).attachments),
        })
      : undefined,
    creatorUid: ownerUid,
    creatorEmail: safeNonEmptyEmail(ownerEmail, 'teacher@edutest.local'),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function toSafeCourseBlockDoc(
  courseId: string,
  chapId: string,
  lesId: string,
  blk: LessonBlock,
  orderIdx: number,
  ownerUid: string,
  ownerEmail: string,
  isKnownUpdate: boolean
) {
  const cleanCourseId = sanitizeDocId(courseId);
  const cleanChapId = sanitizeDocId(chapId);
  const cleanLesId = sanitizeDocId(lesId);
  const cleanBlkId = sanitizeDocId(blk.id);
  return stripUndefined({
    id: cleanBlkId,
    courseId: cleanCourseId,
    chapterId: cleanChapId,
    lessonId: cleanLesId,
    order: orderIdx + 1,
    type: pickEnum(
      blk.type,
      ['theory', 'question', 'callout', 'image', 'file', 'practice_link'] as const,
      'theory'
    ),
    sectionId: blk.sectionId ? sanitizeDocId(blk.sectionId) : undefined,
    title: blk.title ? String(blk.title).slice(0, 300) : undefined,
    contentMarkdown: blk.contentMarkdown ? String(blk.contentMarkdown).slice(0, 100000) : undefined,
    imageUrl: sanitizeUrlForFirestore(blk.imageUrl),
    caption: blk.caption ? String(blk.caption).slice(0, 1000) : undefined,
    inlineImages: sanitizeInlineImagesForFirestore(blk.inlineImages),
    calloutType: blk.calloutType
      ? pickEnum(blk.calloutType, ['info', 'tip', 'warning', 'formula'] as const, 'info')
      : undefined,
    attachments: sanitizeAttachmentsForFirestore(blk.attachments),
    question: sanitizeQuestionForCourseBlock(blk.question),
    practiceExamId: blk.practiceExamId ? String(blk.practiceExamId).slice(0, 128) : undefined,
    practiceExamTitle: blk.practiceExamTitle ? String(blk.practiceExamTitle).slice(0, 300) : undefined,
    creatorUid: ownerUid,
    creatorEmail: safeNonEmptyEmail(ownerEmail, 'teacher@edutest.local'),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreCourseDoc(d: any): MicroCourse {
  const hasInline =
    (Array.isArray(d.chapters) && d.chapters.length > 0) ||
    (Array.isArray(d.lessons) && d.lessons.length > 0);
  const isV2 = d.schemaVersion === 2 && !hasInline;
  return {
    ...d,
    id: d.id,
    chapters: Array.isArray(d.chapters) ? d.chapters : [],
    lessons: Array.isArray(d.lessons) ? d.lessons : [],
    hasLegacyInlineContent: hasInline,
    detailsLoaded: !isV2,
    createdAt: d.createdAtStr || toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt, ''),
  } as MicroCourse;
}

const courseSubcollectionIdsCache = new Map<
  string,
  { chapters: Set<string>; lessons: Set<string>; blocks: Set<string> }
>();
const courseFullDetailsCache = new Map<
  string,
  { course: MicroCourse; updatedAt: string; fetchedAtMs: number }
>();
const COURSE_DETAILS_CACHE_TTL_MS = 60 * 1000;

export function invalidateCourseDetailsCache(courseId?: string): void {
  if (courseId) {
    const cleanId = sanitizeDocId(courseId);
    courseFullDetailsCache.delete(cleanId);
  } else {
    courseFullDetailsCache.clear();
  }
}

export async function loadCourseFullDetailsFromFirestore(
  courseId: string,
  baseCourse?: MicroCourse | null,
  options?: { forceRefresh?: boolean }
): Promise<MicroCourse | null> {
  const cleanId = sanitizeDocId(courseId);
  if (!cleanId) return baseCourse || null;

  const cached = courseFullDetailsCache.get(cleanId);
  const baseUpdated = baseCourse?.updatedAt || '';
  if (
    !options?.forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAtMs < COURSE_DETAILS_CACHE_TTL_MS &&
    (!baseUpdated || cached.updatedAt === baseUpdated)
  ) {
    return baseCourse ? { ...baseCourse, ...cached.course, detailsLoaded: true } : cached.course;
  }

  let rootMeta = baseCourse || null;
  if (!rootMeta) {
    const rootSnap = await getDoc(doc(db, 'courses', cleanId)).catch(() => null);
    if (rootSnap?.exists()) {
      markCloudDocKnown('courses', rootSnap.id);
      rootMeta = fromFirestoreCourseDoc(rootSnap.data());
    }
  }

  const [chapSnap, lesSnap, blkSnap] = await Promise.all([
    getDocs(query(collection(db, 'courses', cleanId, 'chapters'), limit(200))).catch(() => null),
    getDocs(query(collection(db, 'courses', cleanId, 'lessons'), limit(500))).catch(() => null),
    getDocs(query(collection(db, 'courses', cleanId, 'blocks'), limit(1500))).catch(() => null),
  ]);

  const chapDocs = chapSnap ? chapSnap.docs : [];
  const lesDocs = lesSnap ? lesSnap.docs : [];
  const blkDocs = blkSnap ? blkSnap.docs : [];

  if (chapDocs.length > 0 || lesDocs.length > 0 || blkDocs.length > 0) {
    const chapIdSet = new Set<string>();
    const lesIdSet = new Set<string>();
    const blkIdSet = new Set<string>();

    const blocksByLesson = new Map<string, { order: number; block: LessonBlock }[]>();
    for (const d of blkDocs) {
      blkIdSet.add(d.id);
      markCloudDocKnown(`courses/${cleanId}/blocks`, d.id);
      const raw = d.data();
      const blk: LessonBlock = {
        id: raw.id || d.id,
        type: raw.type || 'theory',
        sectionId: raw.sectionId,
        title: raw.title,
        contentMarkdown: raw.contentMarkdown,
        imageUrl: raw.imageUrl,
        caption: raw.caption,
        inlineImages: raw.inlineImages,
        calloutType: raw.calloutType,
        attachments: Array.isArray(raw.attachments) ? raw.attachments : undefined,
        question: raw.question,
        practiceExamId: raw.practiceExamId,
        practiceExamTitle: raw.practiceExamTitle,
      };
      const lid = String(raw.lessonId || '');
      const list = blocksByLesson.get(lid) || [];
      list.push({ order: Number(raw.order) || 0, block: blk });
      blocksByLesson.set(lid, list);
    }

    const lessonsByChapter = new Map<string, { order: number; lesson: CourseLesson }[]>();
    for (const d of lesDocs) {
      lesIdSet.add(d.id);
      markCloudDocKnown(`courses/${cleanId}/lessons`, d.id);
      const raw = d.data();
      const rawBlocks = blocksByLesson.get(raw.id || d.id) || [];
      const blockOrderIds: string[] = Array.isArray(raw.blockIds) ? raw.blockIds : [];
      const blockOrderMap = new Map(blockOrderIds.map((bid, idx) => [bid, idx]));
      rawBlocks.sort((a, b) => {
        const ai = blockOrderMap.get(a.block.id);
        const bi = blockOrderMap.get(b.block.id);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.order - b.order;
      });

      const lesson: CourseLesson = {
        id: raw.id || d.id,
        title: raw.title || 'Bài học',
        durationMinutes: raw.durationMinutes,
        summary: raw.summary,
        contentMarkdown: raw.contentMarkdown,
        inlineImages: raw.inlineImages,
        sections: Array.isArray(raw.sections) ? raw.sections : undefined,
        attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
        blocks: rawBlocks.map((x) => x.block),
        practiceExamId: raw.practiceExamId,
        practiceExamTitle: raw.practiceExamTitle,
        homework: raw.homework,
      };
      const cid = String(raw.chapterId || '');
      const list = lessonsByChapter.get(cid) || [];
      list.push({ order: Number(raw.order) || 0, lesson });
      lessonsByChapter.set(cid, list);
    }

    const chapters: CourseChapter[] = chapDocs.map((d) => {
      chapIdSet.add(d.id);
      markCloudDocKnown(`courses/${cleanId}/chapters`, d.id);
      const raw = d.data();
      const rawLessons = lessonsByChapter.get(raw.id || d.id) || [];
      const lessonOrderIds: string[] = Array.isArray(raw.lessonIds) ? raw.lessonIds : [];
      const lessonOrderMap = new Map(lessonOrderIds.map((lid, idx) => [lid, idx]));
      rawLessons.sort((a, b) => {
        const ai = lessonOrderMap.get(a.lesson.id);
        const bi = lessonOrderMap.get(b.lesson.id);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        if (ai !== undefined) return -1;
        if (bi !== undefined) return 1;
        return a.order - b.order;
      });
      return {
        id: raw.id || d.id,
        title: raw.title || 'Chương học',
        description: raw.description,
        inlineImages: raw.inlineImages,
        order: Number(raw.order) || 0,
        lessons: rawLessons.map((x) => x.lesson),
        chapterExamId: raw.chapterExamId,
        chapterExamTitle: raw.chapterExamTitle,
      };
    });

    chapters.sort((a, b) => (a.order || 0) - (b.order || 0));
    courseSubcollectionIdsCache.set(cleanId, {
      chapters: chapIdSet,
      lessons: lesIdSet,
      blocks: blkIdSet,
    });

    const hydrated: MicroCourse = {
      ...(rootMeta || ({ id: cleanId, title: 'Khóa học', subject: 'general', grade: '', description: '', instructor: '', lessons: [], createdAt: '' } as MicroCourse)),
      chapters,
      lessons: [],
      schemaVersion: 2,
      chapterCount: chapters.length,
      lessonCount: chapters.reduce((s, ch) => s + ch.lessons.length, 0),
      hasLegacyInlineContent: false,
      detailsLoaded: true,
    };
    courseFullDetailsCache.set(cleanId, {
      course: hydrated,
      updatedAt: hydrated.updatedAt || baseUpdated,
      fetchedAtMs: Date.now(),
    });
    return hydrated;
  }

  // Fallback: check legacy inline fields directly on courses/{courseId}
  if (rootMeta && (rootMeta.chapters?.length || rootMeta.lessons?.length)) {
    const normalizedChapters = normalizeCourseChapters(rootMeta);
    const legacyHydrated: MicroCourse = {
      ...rootMeta,
      chapters: normalizedChapters,
      hasLegacyInlineContent: true,
      detailsLoaded: true,
    };
    return legacyHydrated;
  }

  // Check server root doc explicitly in case baseCourse was an empty stub from v2 metadata
  if (!baseCourse || (!baseCourse.chapters?.length && !baseCourse.lessons?.length)) {
    const freshRootSnap = await getDocFromServer(doc(db, 'courses', cleanId)).catch(() => null);
    if (freshRootSnap?.exists()) {
      markCloudDocKnown('courses', freshRootSnap.id);
      const parsed = fromFirestoreCourseDoc(freshRootSnap.data());
      if (parsed.chapters?.length || parsed.lessons?.length) {
        return {
          ...parsed,
          chapters: normalizeCourseChapters(parsed),
          hasLegacyInlineContent: true,
          detailsLoaded: true,
        };
      }
      const emptyCourse: MicroCourse = {
        ...parsed,
        chapters: [],
        lessons: [],
        schemaVersion: 2,
        detailsLoaded: true,
        hasLegacyInlineContent: false,
      };
      courseFullDetailsCache.set(cleanId, {
        course: emptyCourse,
        updatedAt: emptyCourse.updatedAt || '',
        fetchedAtMs: Date.now(),
      });
      return emptyCourse;
    }
  }

  if (rootMeta) {
    return { ...rootMeta, detailsLoaded: true };
  }
  return null;
}

async function deleteDocRefsInBatches(refs: DocumentReference[]): Promise<void> {
  if (refs.length === 0) return;
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const chunk = refs.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach((r) => batch.delete(r));
    try {
      await batch.commit();
    } catch {
      await Promise.all(chunk.map((r) => deleteDoc(r).catch(() => {})));
    }
  }
}

export async function syncCourseSubcollectionsToFirestore(
  course: MicroCourse,
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null,
  options?: {
    migrateLegacyRoot?: boolean;
    pruneRemovedChildren?: boolean;
    onMediaOffloaded?: (cleanCourse: MicroCourse) => void;
  }
): Promise<{ ok: boolean; course: MicroCourse; migratedMediaCount: number; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !course?.id) {
    return { ok: false, course, migratedMediaCount: 0, error: 'Chưa đăng nhập Firebase.' };
  }
  const effectiveUid = fbUser.uid;
  const primaryEmail = (fbUser.email || activeWebUser?.email || course.creatorEmail || '')
    .trim()
    .toLowerCase();
  const cleanId = sanitizeDocId(course.id);
  const rootKey = `courses/${cleanId}`;

  try {
    // 1. Offload any embedded Base64 images/attachments to /api/upload-file URLs first
    const offloadRes = await offloadCourseBase64MediaToUrls(course);
    const cleanCourse = offloadRes.course;
    if (offloadRes.migratedCount > 0 && options?.onMediaOffloaded) {
      try {
        options.onMediaOffloaded(cleanCourse);
      } catch {}
    }

    const isRootKnown = knownCloudDocIds.has(rootKey);

    // Safety guard: never wipe subcollections when syncing an unhydrated v2 metadata stub
    if (cleanCourse.schemaVersion === 2 && cleanCourse.detailsLoaded === false) {
      const rootPayload = toSafeCourseDoc(
        cleanCourse,
        effectiveUid,
        primaryEmail,
        classrooms,
        isRootKnown
      );
      await setDoc(doc(db, 'courses', cleanId), rootPayload, { merge: true });
      markCloudDocKnown('courses', cleanId);
      return { ok: true, course: cleanCourse, migratedMediaCount: offloadRes.migratedCount };
    }

    const chapters = normalizeCourseChapters(cleanCourse);
    const shouldStripLegacy = Boolean(
      options?.migrateLegacyRoot ||
        cleanCourse.hasLegacyInlineContent ||
        (cleanCourse.schemaVersion !== 2 && isRootKnown)
    );

    const rootPayload = toSafeCourseDoc(
      { ...cleanCourse, detailsLoaded: true },
      effectiveUid,
      primaryEmail,
      classrooms,
      isRootKnown,
      { stripLegacyFields: shouldStripLegacy }
    );

    // Commit root course document first so subcollection security rules checking parent get() always succeed
    await setDoc(doc(db, 'courses', cleanId), rootPayload, { merge: true });
    markCloudDocKnown('courses', cleanId);

    // Collect existing subcollection IDs for orphan deletion
    let cachedSubIds = courseSubcollectionIdsCache.get(cleanId);
    if (!cachedSubIds && isRootKnown) {
      const [cSnap, lSnap, bSnap] = await Promise.all([
        getDocs(query(collection(db, 'courses', cleanId, 'chapters'), limit(200))).catch(() => null),
        getDocs(query(collection(db, 'courses', cleanId, 'lessons'), limit(500))).catch(() => null),
        getDocs(query(collection(db, 'courses', cleanId, 'blocks'), limit(1500))).catch(() => null),
      ]);
      cachedSubIds = {
        chapters: new Set(cSnap ? cSnap.docs.map((d) => d.id) : []),
        lessons: new Set(lSnap ? lSnap.docs.map((d) => d.id) : []),
        blocks: new Set(bSnap ? bSnap.docs.map((d) => d.id) : []),
      };
    }

    const subOps: BatchWriteOp[] = [];
    const nextChapIds = new Set<string>();
    const nextLesIds = new Set<string>();
    const nextBlkIds = new Set<string>();

    chapters.forEach((chap, cIdx) => {
      const chapId = sanitizeDocId(chap.id || `chap_${cIdx + 1}`);
      nextChapIds.add(chapId);
      const chapDocKey = `courses/${cleanId}/chapters/${chapId}`;
      subOps.push({
        ref: doc(db, 'courses', cleanId, 'chapters', chapId),
        data: toSafeCourseChapterDoc(
          cleanId,
          { ...chap, id: chapId },
          cIdx,
          effectiveUid,
          primaryEmail,
          knownCloudDocIds.has(chapDocKey)
        ),
        docKey: chapDocKey,
      });

      (chap.lessons || []).forEach((les, lIdx) => {
        const lesId = sanitizeDocId(les.id || `les_${cIdx}_${lIdx}`);
        nextLesIds.add(lesId);
        const lesDocKey = `courses/${cleanId}/lessons/${lesId}`;
        subOps.push({
          ref: doc(db, 'courses', cleanId, 'lessons', lesId),
          data: toSafeCourseLessonDoc(
            cleanId,
            chapId,
            { ...les, id: lesId },
            lIdx,
            effectiveUid,
            primaryEmail,
            knownCloudDocIds.has(lesDocKey)
          ),
          docKey: lesDocKey,
        });

        (les.blocks || []).forEach((blk, bIdx) => {
          const blkId = sanitizeDocId(blk.id || `blk_${lesId}_${bIdx}`);
          nextBlkIds.add(blkId);
          const blkDocKey = `courses/${cleanId}/blocks/${blkId}`;
          subOps.push({
            ref: doc(db, 'courses', cleanId, 'blocks', blkId),
            data: toSafeCourseBlockDoc(
              cleanId,
              chapId,
              lesId,
              { ...blk, id: blkId },
              bIdx,
              effectiveUid,
              primaryEmail,
              knownCloudDocIds.has(blkDocKey)
            ),
            docKey: blkDocKey,
          });
        });
      });
    });

    if (subOps.length > 0) {
      await commitBatchOperations(subOps);
      for (const op of subOps) {
        knownCloudDocIds.add(op.docKey);
      }
    }

    // Only prune deleted chapters / lessons / blocks when explicitly saving a non-empty hydrated course
    if (cachedSubIds && options?.pruneRemovedChildren === true && chapters.length > 0) {
      const orphanRefs: DocumentReference[] = [];
      cachedSubIds.blocks.forEach((id) => {
        if (!nextBlkIds.has(id)) orphanRefs.push(doc(db, 'courses', cleanId, 'blocks', id));
      });
      cachedSubIds.lessons.forEach((id) => {
        if (!nextLesIds.has(id)) orphanRefs.push(doc(db, 'courses', cleanId, 'lessons', id));
      });
      cachedSubIds.chapters.forEach((id) => {
        if (!nextChapIds.has(id)) orphanRefs.push(doc(db, 'courses', cleanId, 'chapters', id));
      });
      if (orphanRefs.length > 0) {
        await deleteDocRefsInBatches(orphanRefs);
      }
    }

    courseSubcollectionIdsCache.set(cleanId, {
      chapters: nextChapIds,
      lessons: nextLesIds,
      blocks: nextBlkIds,
    });

    const finalizedCourse: MicroCourse = {
      ...cleanCourse,
      chapters,
      lessons: [],
      schemaVersion: 2,
      chapterCount: chapters.length,
      lessonCount: chapters.reduce((s, ch) => s + ch.lessons.length, 0),
      hasLegacyInlineContent: false,
      detailsLoaded: true,
    };
    courseFullDetailsCache.set(cleanId, {
      course: finalizedCourse,
      updatedAt: finalizedCourse.updatedAt || '',
      fetchedAtMs: Date.now(),
    });

    return {
      ok: true,
      course: finalizedCourse,
      migratedMediaCount: offloadRes.migratedCount,
    };
  } catch (err: any) {
    console.error('[syncCourseSubcollectionsToFirestore] Error:', err);
    return {
      ok: false,
      course,
      migratedMediaCount: 0,
      error: err?.message || String(err),
    };
  }
}

export async function migrateLegacyCourseToSubcollections(
  course: MicroCourse,
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null
): Promise<{ ok: boolean; course: MicroCourse; migratedMediaCount: number; error?: string }> {
  const hydrated =
    (course.chapters && course.chapters.length > 0) || (course.lessons && course.lessons.length > 0)
      ? { ...course, chapters: normalizeCourseChapters(course), detailsLoaded: true }
      : (await loadCourseFullDetailsFromFirestore(course.id, course, { forceRefresh: true })) || course;

  return await syncCourseSubcollectionsToFirestore(hydrated, classrooms, activeWebUser, {
    migrateLegacyRoot: true,
  });
}

export async function deleteCourseFromFirestoreCascade(
  courseId: string,
  options?: { userConfirmedDelete?: boolean }
): Promise<void> {
  if (options?.userConfirmedDelete !== true) {
    console.warn('[deleteCourseFromFirestoreCascade] Blocked auto-delete without explicit user confirmation:', courseId);
    return;
  }
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !courseId) return;
  const cleanId = sanitizeDocId(courseId);
  const [bSnap, lSnap, cSnap] = await Promise.all([
    getDocs(query(collection(db, 'courses', cleanId, 'blocks'), limit(1500))).catch(() => null),
    getDocs(query(collection(db, 'courses', cleanId, 'lessons'), limit(500))).catch(() => null),
    getDocs(query(collection(db, 'courses', cleanId, 'chapters'), limit(200))).catch(() => null),
  ]);
  const refs: DocumentReference[] = [
    ...(bSnap ? bSnap.docs.map((d) => d.ref) : []),
    ...(lSnap ? lSnap.docs.map((d) => d.ref) : []),
    ...(cSnap ? cSnap.docs.map((d) => d.ref) : []),
  ];
  await deleteDocRefsInBatches(refs);
  courseSubcollectionIdsCache.delete(cleanId);
  courseFullDetailsCache.delete(cleanId);

  const targetRef = doc(db, 'courses', cleanId);
  const snap = await getDoc(targetRef).catch(() => null);
  if (snap && snap.exists()) {
    await deleteDoc(targetRef);
  }
  knownCloudDocIds.delete(`courses/${cleanId}`);
}

export function isCourseLegacyOrBloated(course: MicroCourse): boolean {
  return Boolean(course.hasLegacyInlineContent || course.schemaVersion !== 2 || courseHasEmbeddedBase64(course));
}

function toSafeClassroomDoc(
  cls: Classroom,
  ownerUid: string,
  ownerEmail: string,
  isKnownUpdate: boolean
) {
  const teacherEmail = safeNonEmptyEmail(cls.teacherEmail || ownerEmail, 'teacher@edutest.local');
  const safeStudents = (Array.isArray(cls.students) ? cls.students : [])
    .filter(isPlainObject)
    .slice(0, 500)
    .map((s) => {
      const copy: any = { ...s };
      delete copy.password;
      delete copy.username;
      if (copy.email) copy.email = String(copy.email).trim().toLowerCase();
      return copy;
    });

  const memberEmails = normalizeEmailList([
    teacherEmail,
    ...safeStudents.map((s) => s.email),
  ]);

  return stripUndefined({
    id: sanitizeDocId(cls.id),
    name: (String(cls.name || '').trim() || 'Lớp học').slice(0, 200),
    grade: String(cls.grade || '').slice(0, 64),
    code: sanitizeDocId(String(cls.code || 'CLASS').trim().toUpperCase()).slice(0, 64),
    teacherId: sanitizeDocId(cls.teacherId || ownerUid),
    teacherUid: ownerUid,
    teacherName: String(cls.teacherName || 'Giáo viên').slice(0, 150),
    teacherEmail,
    description: cls.description ? String(cls.description).slice(0, 2000) : undefined,
    students: safeStudents,
    memberEmails,
    pendingRequests: filterObjects(cls.pendingRequests, 200),
    assignedExamIds: filterStrings(cls.assignedExamIds, 200),
    assignedCourseIds: filterStrings(cls.assignedCourseIds, 200),
    createdAtStr: (cls.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreClassroomDoc(d: any, subRequests?: ClassJoinRequest[]): Classroom {
  const cleanStudents = Array.isArray(d.students)
    ? d.students.map((s: any) => {
        if (!s || typeof s !== 'object') return s;
        const copy = { ...s };
        delete copy.password;
        delete copy.username;
        return copy;
      })
    : [];

  const memberIds = new Set<string>(
    cleanStudents.map((s: any) => String(s?.id || '').trim()).filter(Boolean)
  );
  const memberEmails = new Set<string>(
    cleanStudents.map((s: any) => String(s?.email || '').trim().toLowerCase()).filter(Boolean)
  );
  const memberCodes = new Set<string>(
    cleanStudents.map((s: any) => String(s?.studentCode || '').trim().toUpperCase()).filter(Boolean)
  );

  const pendingMap = new Map<string, ClassJoinRequest>();
  if (Array.isArray(d.pendingRequests)) {
    for (const r of d.pendingRequests) {
      if (r?.id) pendingMap.set(r.id, r);
    }
  }
  if (Array.isArray(subRequests)) {
    for (const r of subRequests) {
      if (r?.id) pendingMap.set(r.id, r);
    }
  }

  // Strictly keep ONLY requests still in 'pending' status whose student is NOT already a member
  const filteredPending = Array.from(pendingMap.values()).filter((r) => {
    if (r.status && r.status !== 'pending') return false;
    const rId = String(r.studentId || '').trim();
    const rEmail = String(r.studentEmail || '').trim().toLowerCase();
    const rCode = String(r.studentCode || '').trim().toUpperCase();
    if (rId && memberIds.has(rId)) return false;
    if (rEmail && memberEmails.has(rEmail)) return false;
    if (rCode && memberCodes.has(rCode)) return false;
    return true;
  });

  return {
    ...d,
    id: d.id,
    students: cleanStudents,
    pendingRequests: filteredPending,
    createdAt: d.createdAtStr || toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt, ''),
  } as Classroom;
}

function toSafeResultDoc(
  r: ExamResult,
  ownerUid: string,
  ownerEmail: string,
  exams: Exam[],
  classrooms: Classroom[],
  isKnownUpdate: boolean,
  isMineByOwner: boolean = true
) {
  const exam = exams.find((e) => e.id === r.examId);
  const cls = r.classId ? classrooms.find((c) => c.id === r.classId) : undefined;
  const teacherEmail = (cls?.teacherEmail || exam?.creatorEmail || '').trim().toLowerCase();
  const resolvedStudentUid = isMineByOwner
    ? ownerUid
    : String((r as any).studentUid || '').trim() || sanitizeDocId(r.userId || ownerUid);

  return stripUndefined({
    id: sanitizeDocId(r.id),
    examId: sanitizeDocId(r.examId || 'exam_unknown'),
    examTitle: (String(r.examTitle || '').trim() || 'Bài thi').slice(0, 300),
    subject: r.subject ? String(r.subject).slice(0, 64) : undefined,
    grade: r.grade ? String(r.grade).slice(0, 64) : undefined,
    studentUid: resolvedStudentUid.slice(0, 128),
    userId: r.userId ? String(r.userId).slice(0, 128) : ownerUid.slice(0, 128),
    userEmail: safeNonEmptyEmail(r.userEmail || ownerEmail, 'student@edutest.local'),
    teacherEmail: teacherEmail ? teacherEmail.slice(0, 180) : undefined,
    studentName: r.studentName ? String(r.studentName).slice(0, 150) : undefined,
    studentCode: r.studentCode ? String(r.studentCode).slice(0, 60) : undefined,
    classId: r.classId ? String(r.classId).slice(0, 128) : undefined,
    className: r.className ? String(r.className).slice(0, 200) : undefined,
    bundleId: r.bundleId ? String(r.bundleId).slice(0, 128) : undefined,
    bundleAttemptId: r.bundleAttemptId ? String(r.bundleAttemptId).slice(0, 128) : undefined,
    earnedPoints: safeFiniteNumber(r.earnedPoints),
    totalPoints: safeFiniteNumber(r.totalPoints),
    scoreOnTenScale: safeFiniteNumber(r.scoreOnTenScale),
    score: safeFiniteNumber(r.score) ?? 0,
    percentage: safeFiniteNumber(r.percentage),
    correctCount: safeFiniteNumber(r.correctCount),
    partialCount: safeFiniteNumber(r.partialCount),
    wrongCount: safeFiniteNumber(r.wrongCount),
    skippedCount: safeFiniteNumber(r.skippedCount),
    totalQuestions: safeFiniteNumber(r.totalQuestions),
    timeSpentSeconds: safeFiniteNumber(r.timeSpentSeconds),
    totalDurationSeconds: safeFiniteNumber(r.totalDurationSeconds),
    completedAt: (String(r.completedAt || '').trim() || new Date().toISOString()).slice(0, 64),
    examCode: r.examCode ? String(r.examCode).slice(0, 32) : undefined,
    submissionReason: r.submissionReason ? String(r.submissionReason).slice(0, 500) : undefined,
    tabSwitchCount: safeFiniteNumber(r.tabSwitchCount),
    answers: isPlainObject(r.answers) ? r.answers : {},
    inlineImages: isPlainObject(r.inlineImages) ? r.inlineImages : undefined,
    questions: filterObjects(r.questions, 300),
    scoreDetails: isPlainObject(r.scoreDetails) ? r.scoreDetails : {},
    topicBreakdown: isPlainObject(r.topicBreakdown) ? r.topicBreakdown : {},
    partBreakdowns: Array.isArray(r.partBreakdowns) ? filterObjects(r.partBreakdowns, 50) : undefined,
    showScoreAfterExam:
      r.showScoreAfterExam !== undefined ? Boolean(r.showScoreAfterExam) : undefined,
    showAnswersAfterExam:
      r.showAnswersAfterExam !== undefined ? Boolean(r.showAnswersAfterExam) : undefined,
    showOnlyStudentAnswersAfterExam:
      r.showOnlyStudentAnswersAfterExam !== undefined
        ? Boolean(r.showOnlyStudentAnswersAfterExam)
        : undefined,
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreResultDoc(d: any): ExamResult {
  return {
    ...d,
    id: d.id,
    updatedAt: toIsoString(d.updatedAt, ''),
  } as ExamResult;
}

function toSafeCourseProgressDoc(
  p: StudentCourseProgress,
  progressKey: string,
  ownerUid: string,
  ownerEmail: string,
  courses: MicroCourse[],
  isKnownUpdate: boolean
) {
  const course = courses.find((c) => c.id === p.courseId);
  return stripUndefined({
    id: sanitizeDocId(progressKey),
    courseId: sanitizeDocId(p.courseId),
    studentId: sanitizeDocId(p.studentId || ownerUid),
    studentUid: ownerUid,
    studentEmail: safeNonEmptyEmail(ownerEmail, 'student@edutest.local'),
    teacherEmail: course?.creatorEmail
      ? course.creatorEmail.trim().toLowerCase().slice(0, 180)
      : undefined,
    completedLessonIds: filterStrings(p.completedLessonIds, 500),
    completedBlockIds: filterStrings(p.completedBlockIds, 2000),
    currentChapterId: p.currentChapterId ? String(p.currentChapterId).slice(0, 128) : undefined,
    currentLessonId: p.currentLessonId ? String(p.currentLessonId).slice(0, 128) : undefined,
    currentBlockIdsByLesson: isPlainObject(p.currentBlockIdsByLesson)
      ? p.currentBlockIdsByLesson
      : {},
    interactiveAnswers: isPlainObject(p.interactiveAnswers) ? p.interactiveAnswers : {},
    completedExamIds: filterStrings(p.completedExamIds, 200),
    scormData: isPlainObject(p.scormData) ? p.scormData : undefined,
    lastStudiedAt: (String(p.lastStudiedAt || '').trim() || new Date().toISOString()).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function toSafeClassroomHomeworkDoc(
  hw: ClassroomHomework,
  ownerUid: string,
  ownerEmail: string,
  classrooms: Classroom[],
  isKnownUpdate: boolean
) {
  const cls = classrooms.find((c) => c.id === hw.classId);
  const teacherEmail = safeNonEmptyEmail(cls?.teacherEmail || ownerEmail, 'teacher@edutest.local');
  const allowedEmails = normalizeEmailList([
    ownerEmail,
    teacherEmail,
    ...(cls?.students || []).map((s) => s.email),
  ]);

  return stripUndefined({
    id: sanitizeDocId(hw.id),
    classId: sanitizeDocId(hw.classId),
    title: (String(hw.title || '').trim() || 'Bài tập về nhà').slice(0, 300),
    instructions: hw.instructions ? String(hw.instructions).slice(0, 20000) : undefined,
    inlineImages: sanitizeInlineImagesForFirestore(hw.inlineImages),
    attachments: sanitizeAttachmentsForFirestore(hw.attachments),
    openTime: hw.openTime ? String(hw.openTime).slice(0, 64) : undefined,
    closeTime: hw.closeTime ? String(hw.closeTime).slice(0, 64) : undefined,
    maxScore: safeFiniteNumber(hw.maxScore) ?? 10,
    createdBy: hw.createdBy ? String(hw.createdBy).slice(0, 150) : undefined,
    teacherUid: ownerUid,
    teacherEmail,
    allowedEmails,
    createdAtStr: (hw.createdAt || new Date().toISOString()).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function toSafeHomeworkSubmissionDoc(
  sub: HomeworkSubmission,
  ownerUid: string,
  ownerEmail: string,
  classrooms: Classroom[],
  courses: MicroCourse[],
  isKnownUpdate: boolean,
  isStudentOwner: boolean = true
) {
  const cls = sub.classId ? classrooms.find((c) => c.id === sub.classId) : undefined;
  const course = sub.courseId ? courses.find((c) => c.id === sub.courseId) : undefined;
  const teacherEmail = (cls?.teacherEmail || course?.creatorEmail || '').trim().toLowerCase();
  const resolvedStudentUid = isStudentOwner
    ? ownerUid
    : String((sub as any).studentUid || '').trim() || sanitizeDocId(sub.studentId || ownerUid);

  return stripUndefined({
    id: sanitizeDocId(sub.id),
    classId: sub.classId ? sanitizeDocId(sub.classId) : undefined,
    homeworkId: sub.homeworkId ? sanitizeDocId(sub.homeworkId) : undefined,
    homeworkTitle: sub.homeworkTitle ? String(sub.homeworkTitle).slice(0, 300) : undefined,
    courseId: sub.courseId ? sanitizeDocId(sub.courseId) : undefined,
    courseTitle: sub.courseTitle ? String(sub.courseTitle).slice(0, 300) : undefined,
    lessonId: sub.lessonId ? sanitizeDocId(sub.lessonId) : undefined,
    lessonTitle: sub.lessonTitle ? String(sub.lessonTitle).slice(0, 300) : undefined,
    studentUid: resolvedStudentUid.slice(0, 128),
    studentId: sanitizeDocId(sub.studentId || ownerUid),
    studentName: (String(sub.studentName || '').trim() || 'Học sinh').slice(0, 150),
    studentEmail: safeNonEmptyEmail(sub.studentEmail || ownerEmail, 'student@edutest.local'),
    studentCode: sub.studentCode ? String(sub.studentCode).slice(0, 60) : undefined,
    teacherEmail: teacherEmail ? teacherEmail.slice(0, 180) : undefined,
    imageUrls: filterStrings(sub.imageUrls, 20),
    attachments: sanitizeAttachmentsForFirestore(sub.attachments),
    textAnswer: sub.textAnswer ? String(sub.textAnswer).slice(0, 50000) : undefined,
    inlineImages: sanitizeInlineImagesForFirestore(sub.inlineImages),
    note: sub.note ? String(sub.note).slice(0, 2000) : undefined,
    submittedAt: (String(sub.submittedAt || '').trim() || new Date().toISOString()).slice(0, 64),
    score: safeFiniteNumber(sub.score),
    maxScore: safeFiniteNumber(sub.maxScore),
    teacherFeedback: sub.teacherFeedback ? String(sub.teacherFeedback).slice(0, 4000) : undefined,
    gradedAt: sub.gradedAt ? String(sub.gradedAt).slice(0, 64) : undefined,
    gradedBy: sub.gradedBy ? String(sub.gradedBy).slice(0, 180) : undefined,
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function toSafeScoreboardDoc(
  sb: Scoreboard,
  ownerUid: string,
  ownerEmail: string,
  isKnownUpdate: boolean
) {
  return stripUndefined({
    id: sanitizeDocId(sb.id),
    title: (String(sb.title || '').trim() || 'Bảng điểm vinh danh').slice(0, 300),
    description: sb.description ? String(sb.description).slice(0, 2000) : undefined,
    mode: pickEnum(sb.mode, ['1v1', 'group', 'top_n'] as const, 'group'),
    topN: safeFiniteNumber(sb.topN),
    specialMode: pickEnum(
      sb.specialMode,
      ['normal', 'creator', 'grading', 'presenting'] as const,
      'normal'
    ),
    classId: sb.classId ? String(sb.classId).slice(0, 128) : undefined,
    className: sb.className ? String(sb.className).slice(0, 200) : undefined,
    rounds: filterObjects(sb.rounds, 50),
    participants: filterObjects(sb.participants, 500),
    creatorId: sanitizeDocId(sb.creatorId || ownerUid),
    creatorUid: ownerUid,
    creatorEmail: safeNonEmptyEmail(sb.creatorEmail || ownerEmail, 'teacher@edutest.local'),
    creatorName: sb.creatorName ? String(sb.creatorName).slice(0, 150) : undefined,
    createdAtStr: (sb.createdAt || new Date().toISOString()).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreScoreboardDoc(d: any): Scoreboard {
  return {
    ...d,
    id: d.id,
    rounds: Array.isArray(d.rounds) ? d.rounds : [],
    participants: Array.isArray(d.participants) ? d.participants : [],
    createdAt: d.createdAtStr || toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt, ''),
  } as Scoreboard;
}

// =========================================================================
// BATCHED FIRESTORE WRITES (< 0.3s atomic batch commits + per-op fallback)
// =========================================================================

interface BatchWriteOp {
  ref: DocumentReference;
  data: Record<string, any>;
  docKey: string;
}

async function commitBatchOperations(ops: BatchWriteOp[]): Promise<void> {
  if (ops.length === 0) return;
  const CHUNK_SIZE = 400; // Safe margin under Firestore's 500 write limit per batch
  const failedDetails: { docKey: string; message: string }[] = [];

  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(op.ref, op.data, { merge: true });
    }
    try {
      await batch.commit();
      for (const op of chunk) {
        const [col, id] = op.docKey.split('/');
        markCloudDocKnown(col, id);
      }
    } catch (batchErr: any) {
      // Fallback per-op write so a single invalid/denied doc never blocks all valid user writes,
      // and surface the exact failing document path via FirestoreErrorInfo.
      await Promise.all(
        chunk.map(async (op) => {
          try {
            await setDoc(op.ref, op.data, { merge: true });
            const [col, id] = op.docKey.split('/');
            markCloudDocKnown(col, id);
          } catch (opErr: any) {
            const message = opErr instanceof Error ? opErr.message : String(opErr);
            failedDetails.push({ docKey: op.docKey, message });
            try {
              handleFirestoreError(opErr, OperationType.WRITE, op.docKey);
            } catch {}
          }
        })
      );
      if (failedDetails.length === 0) {
        throw batchErr;
      }
    }
  }

  if (failedDetails.length > 0) {
    const summary = failedDetails
      .slice(0, 5)
      .map((f) => `${f.docKey}: ${f.message}`)
      .join(' | ');
    throw new Error(summary);
  }
}

// =========================================================================
// PULL & DELTA SYNC
// =========================================================================

export interface FirestoreSyncSnapshot {
  users?: UserAccount[];
  customExams?: Exam[];
  customBundles?: ExamBundle[];
  courses?: MicroCourse[];
  classrooms?: Classroom[];
  results?: ExamResult[];
  courseProgress?: { [key: string]: StudentCourseProgress };
  classroomHomeworks?: ClassroomHomework[];
  homeworkSubmissions?: HomeworkSubmission[];
  teacherRequests?: TeacherRoleRequest[];
  feedbacks?: FeedbackItem[];
  scoreboards?: Scoreboard[];
  myJoinRequests?: ClassJoinRequest[];
  joinRequestsByClassId?: Record<string, ClassJoinRequest[]>;
  subjects?: CustomSubject[];
  navTabs?: NavTabItem[];
  navTabsUpdatedAt?: string;
  liveTextOverrides?: Record<string, string>;
  liveTextUpdatedAt?: string;
  deletedExamIds?: string[];
  deletedBundleIds?: string[];
  deletedClassroomIds?: string[];
  deletedCourseIds?: string[];
  deletedUserIds?: string[];
  deletedResultIds?: string[];
  deletedHomeworkIds?: string[];
  deletedClassroomHomeworkIds?: string[];
  deletedSubjectIds?: string[];
  deletedScoreboardIds?: string[];
  falselyTombstonedCourseIds?: string[];
  falselyTombstonedExamIds?: string[];
  falselyTombstonedBundleIds?: string[];
  falselyTombstonedClassroomIds?: string[];
  falselyTombstonedResultIds?: string[];
  falselyTombstonedClassroomHomeworkIds?: string[];
  falselyTombstonedHomeworkIds?: string[];
  falselyTombstonedScoreboardIds?: string[];
  isDeltaSync?: boolean;
  pulledAtMs?: number;
}

export async function safeDeleteFirestoreDoc(
  col: string,
  id: string,
  options?: { userConfirmedDelete?: boolean }
): Promise<void> {
  if (options?.userConfirmedDelete !== true) {
    console.warn('[safeDeleteFirestoreDoc] Blocked auto-delete without explicit user confirmation:', col, id);
    return;
  }
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) return;
  const cleanId = sanitizeDocId(id);
  const targetRef = doc(db, col, cleanId);
  try {
    if (col === 'courses') {
      await deleteCourseFromFirestoreCascade(cleanId, { userConfirmedDelete: true });
      return;
    }
    const snap = await getDoc(targetRef).catch(() => null);
    if (snap && !snap.exists()) {
      knownCloudDocIds.delete(`${col}/${cleanId}`);
      return;
    }
    await deleteDoc(targetRef);
    knownCloudDocIds.delete(`${col}/${cleanId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${col}/${cleanId}`);
  }
}

async function getCachedSiteConfigDoc(
  configId: 'subjects' | 'navTabs' | 'liveText' | 'tombstones',
  forceRefresh: boolean = false
): Promise<Record<string, any> | null> {
  const ttl = configId === 'tombstones' ? TOMBSTONES_CACHE_TTL_MS : SITE_CONFIG_CACHE_TTL_MS;
  const cached = siteConfigReadCache.get(configId);
  const now = Date.now();
  if (!forceRefresh && cached && now - cached.fetchedAtMs < ttl) {
    return cached.data;
  }
  const snap = await getDoc(doc(db, 'siteConfig', configId)).catch(() => null);
  if (snap?.exists()) {
    markCloudDocKnown('siteConfig', configId);
    const data = snap.data();
    siteConfigReadCache.set(configId, { data, fetchedAtMs: now });
    return data;
  }
  return cached?.data || null;
}

function mergeQuerySnapDocs(snaps: (Awaited<ReturnType<typeof getDocs>> | null)[]) {
  const map = new Map<string, any>();
  for (const snap of snaps) {
    if (!snap || snap.empty) continue;
    for (const d of snap.docs) {
      map.set(d.id, d);
    }
  }
  return Array.from(map.values());
}

export async function pullPublicDataFromFirestore(options?: {
  forceRefresh?: boolean;
}): Promise<FirestoreSyncSnapshot> {
  const out: FirestoreSyncSnapshot = {};
  const forceRefresh = Boolean(options?.forceRefresh);

  const [examSnap, bundleSnap, courseSnap, subjData, navData, liveData, tombData] =
    await Promise.all([
      getDocs(
        query(
          collection(db, 'exams'),
          where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
          limit(200)
        )
      ).catch(() => null),
      getDocs(
        query(
          collection(db, 'bundles'),
          where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
          limit(150)
        )
      ).catch(() => null),
      getDocs(
        query(collection(db, 'courses'), where('visibility', '==', 'public'), limit(150))
      ).catch(() => null),
      getCachedSiteConfigDoc('subjects', forceRefresh),
      getCachedSiteConfigDoc('navTabs', forceRefresh),
      getCachedSiteConfigDoc('liveText', forceRefresh),
      getCachedSiteConfigDoc('tombstones', forceRefresh),
    ]);

  if (examSnap && !examSnap.empty) {
    out.customExams = examSnap.docs.map((d) => {
      markCloudDocKnown('exams', d.id);
      return fromFirestoreExamDoc(d.data());
    });
  }
  if (bundleSnap && !bundleSnap.empty) {
    out.customBundles = bundleSnap.docs.map((d) => {
      markCloudDocKnown('bundles', d.id);
      return fromFirestoreBundleDoc(d.data());
    });
  }
  if (courseSnap && !courseSnap.empty) {
    out.courses = courseSnap.docs.map((d) => {
      markCloudDocKnown('courses', d.id);
      return fromFirestoreCourseDoc(d.data());
    });
  }

  if (subjData && Array.isArray(subjData.items)) {
    out.subjects = subjData.items;
  }
  if (navData && Array.isArray(navData.items)) {
    out.navTabs = navData.items;
    if (navData.updatedAt) {
      out.navTabsUpdatedAt = toIsoString(navData.updatedAt, '');
    }
  }
  if (liveData && liveData.overrides) {
    out.liveTextOverrides = liveData.overrides;
    if (liveData.updatedAt) {
      out.liveTextUpdatedAt = toIsoString(liveData.updatedAt, '');
    }
  }
  if (tombData) {
    out.deletedExamIds = tombData.deletedExamIds || [];
    out.deletedBundleIds = tombData.deletedBundleIds || [];
    out.deletedClassroomIds = tombData.deletedClassroomIds || [];
    out.deletedCourseIds = tombData.deletedCourseIds || [];
    out.deletedUserIds = tombData.deletedUserIds || [];
    out.deletedResultIds = tombData.deletedResultIds || [];
    out.deletedHomeworkIds = tombData.deletedHomeworkIds || [];
    out.deletedClassroomHomeworkIds = tombData.deletedClassroomHomeworkIds || [];
    out.deletedSubjectIds = tombData.deletedSubjectIds || [];
    out.deletedScoreboardIds = tombData.deletedScoreboardIds || [];
  }

  return out;
}

/**
 * Pull collections for Admin with single-field Delta Sync (`where('updatedAt', '>', sinceTs)`)
 * whenever `sinceMs > 0` and `!forceFull`. Always capped by `limit(...)`.
 */
async function queryCollectionDeltaSafe(
  colName: string,
  sinceTs: Timestamp | null,
  maxDocs: number = 350
) {
  const baseRef = collection(db, colName);
  if (sinceTs) {
    try {
      const q: Query = query(baseRef, where('updatedAt', '>', sinceTs), limit(maxDocs));
      return await getDocs(q);
    } catch {
      return await getDocs(query(baseRef, limit(maxDocs))).catch(() => null);
    }
  }
  return await getDocs(query(baseRef, limit(maxDocs))).catch(() => null);
}

let lastNonAdminLibraryPullMs = 0;
const NON_ADMIN_LIBRARY_CACHE_MS = 90 * 1000;

export async function pullAuthenticatedDataFromFirestore(
  activeWebUser?: UserAccount | null,
  options?: { forceFull?: boolean; forceCoursesFull?: boolean; sinceMs?: number; activeClassId?: string }
): Promise<FirestoreSyncSnapshot> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    return await pullPublicDataFromFirestore();
  }

  const nowMs = Date.now();
  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  const isAdmin = isMasterAdminFirebaseUser(fbUser) || primaryEmail === MASTER_ADMIN_EMAIL_LOWER;
  const isTeacher = isAdmin || activeWebUser?.role === 'teacher';
  const forceFull = Boolean(options?.forceFull);

  const effectiveSinceMs = forceFull
    ? 0
    : options?.sinceMs !== undefined
    ? options.sinceMs
    : getLastDeltaSyncMs();

  // Subtract small 5-second clock skew safety margin during delta sync
  const sinceTs =
    effectiveSinceMs > 5000 ? Timestamp.fromMillis(effectiveSinceMs - 5000) : null;

  const out: FirestoreSyncSnapshot = {
    isDeltaSync: Boolean(sinceTs),
    pulledAtMs: nowMs,
  };

  // Non-admin library skip if recently pulled & not forced (scoped onSnapshot keeps active view updated)
  const shouldPullLibraryNow =
    isAdmin || forceFull || !sinceTs || nowMs - lastNonAdminLibraryPullMs >= NON_ADMIN_LIBRARY_CACHE_MS;

  const pullExamsDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('exams', sinceTs, 400);
      return snap ? snap.docs : [];
    }
    if (!shouldPullLibraryNow) return [];
    const queries = [
      getDocs(
        query(
          collection(db, 'exams'),
          where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
          limit(250)
        )
      ).catch(() => null),
      ...(primaryEmail
        ? [
            getDocs(
              query(
                collection(db, 'exams'),
                where('allowedEmails', 'array-contains', primaryEmail),
                limit(200)
              )
            ).catch(() => null),
          ]
        : []),
      ...(isTeacher
        ? [
            getDocs(
              query(collection(db, 'exams'), where('creatorUid', '==', fbUser.uid), limit(250))
            ).catch(() => null),
            ...(primaryEmail
              ? [
                  getDocs(
                    query(collection(db, 'exams'), where('creatorEmail', '==', primaryEmail), limit(250))
                  ).catch(() => null),
                ]
              : []),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const pullBundlesDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('bundles', sinceTs, 250);
      return snap ? snap.docs : [];
    }
    if (!shouldPullLibraryNow) return [];
    const queries = [
      getDocs(
        query(
          collection(db, 'bundles'),
          where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
          limit(150)
        )
      ).catch(() => null),
      ...(primaryEmail
        ? [
            getDocs(
              query(
                collection(db, 'bundles'),
                where('allowedEmails', 'array-contains', primaryEmail),
                limit(150)
              )
            ).catch(() => null),
          ]
        : []),
      ...(isTeacher
        ? [
            getDocs(
              query(collection(db, 'bundles'), where('creatorUid', '==', fbUser.uid), limit(150))
            ).catch(() => null),
            ...(primaryEmail
              ? [
                  getDocs(
                    query(collection(db, 'bundles'), where('creatorEmail', '==', primaryEmail), limit(150))
                  ).catch(() => null),
                ]
              : []),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const forceCourses = Boolean(forceFull || options?.forceCoursesFull);

  const pullCoursesDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('courses', forceCourses ? null : sinceTs, 350);
      return snap ? snap.docs : [];
    }
    if (!shouldPullLibraryNow && !forceCourses) return [];
    const queries = [
      getDocs(query(collection(db, 'courses'), where('visibility', '==', 'public'), limit(150))).catch(
        () => null
      ),
      ...(primaryEmail
        ? [
            getDocs(
              query(
                collection(db, 'courses'),
                where('allowedEmails', 'array-contains', primaryEmail),
                limit(150)
              )
            ).catch(() => null),
          ]
        : []),
      ...(isTeacher
        ? [
            getDocs(
              query(collection(db, 'courses'), where('creatorUid', '==', fbUser.uid), limit(150))
            ).catch(() => null),
            ...(primaryEmail
              ? [
                  getDocs(
                    query(collection(db, 'courses'), where('creatorEmail', '==', primaryEmail), limit(150))
                  ).catch(() => null),
                ]
              : []),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const pullClassroomsDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('classrooms', sinceTs, 200);
      return snap ? snap.docs : [];
    }
    if (!shouldPullLibraryNow) return [];
    const queries = [
      ...(primaryEmail
        ? [
            getDocs(
              query(
                collection(db, 'classrooms'),
                where('memberEmails', 'array-contains', primaryEmail),
                limit(100)
              )
            ).catch(() => null),
          ]
        : []),
      ...(isTeacher
        ? [
            getDocs(
              query(collection(db, 'classrooms'), where('teacherUid', '==', fbUser.uid), limit(100))
            ).catch(() => null),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const pullResultsDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('results', sinceTs, 350);
      return snap ? snap.docs : [];
    }
    const queries = [
      getDocs(query(collection(db, 'results'), where('studentUid', '==', fbUser.uid), limit(200))).catch(
        () => null
      ),
      ...(isTeacher && primaryEmail
        ? [
            getDocs(
              query(collection(db, 'results'), where('teacherEmail', '==', primaryEmail), limit(300))
            ).catch(() => null),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const pullProgressDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('courseProgress', sinceTs, 350);
      return snap ? snap.docs : [];
    }
    const queries = [
      getDocs(
        query(collection(db, 'courseProgress'), where('studentUid', '==', fbUser.uid), limit(150))
      ).catch(() => null),
      ...(isTeacher && primaryEmail
        ? [
            getDocs(
              query(
                collection(db, 'courseProgress'),
                where('teacherEmail', '==', primaryEmail),
                limit(300)
              )
            ).catch(() => null),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const pullHomeworksDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('classroomHomeworks', sinceTs, 250);
      return snap ? snap.docs : [];
    }
    if (!shouldPullLibraryNow) return [];
    const queries = [
      ...(primaryEmail
        ? [
            getDocs(
              query(
                collection(db, 'classroomHomeworks'),
                where('allowedEmails', 'array-contains', primaryEmail),
                limit(150)
              )
            ).catch(() => null),
          ]
        : []),
      ...(isTeacher
        ? [
            getDocs(
              query(
                collection(db, 'classroomHomeworks'),
                where('teacherUid', '==', fbUser.uid),
                limit(150)
              )
            ).catch(() => null),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const pullHomeworkSubDocs = async () => {
    if (isAdmin) {
      const snap = await queryCollectionDeltaSafe('homeworkSubmissions', sinceTs, 350);
      return snap ? snap.docs : [];
    }
    const queries = [
      getDocs(
        query(
          collection(db, 'homeworkSubmissions'),
          where('studentUid', '==', fbUser.uid),
          limit(200)
        )
      ).catch(() => null),
      ...(isTeacher && primaryEmail
        ? [
            getDocs(
              query(
                collection(db, 'homeworkSubmissions'),
                where('teacherEmail', '==', primaryEmail),
                limit(300)
              )
            ).catch(() => null),
          ]
        : []),
    ];
    return mergeQuerySnapDocs(await Promise.all(queries));
  };

  const [
    subjData,
    navData,
    liveData,
    tombData,
    examDocs,
    bundleDocs,
    courseDocs,
    classroomDocs,
    resultDocs,
    progressDocs,
    hwDocs,
    hwSubDocs,
    reqSnap,
    fbSnap,
    sbSnap,
    myJrSnap,
  ] = await Promise.all([
    getCachedSiteConfigDoc('subjects', forceFull),
    getCachedSiteConfigDoc('navTabs', forceFull),
    getCachedSiteConfigDoc('liveText', forceFull),
    getCachedSiteConfigDoc('tombstones', forceFull),
    pullExamsDocs(),
    pullBundlesDocs(),
    pullCoursesDocs(),
    pullClassroomsDocs(),
    pullResultsDocs(),
    pullProgressDocs(),
    pullHomeworksDocs(),
    pullHomeworkSubDocs(),
    isAdmin
      ? queryCollectionDeltaSafe('teacherRequests', sinceTs, 150)
      : getDocs(
          query(collection(db, 'teacherRequests'), where('userUid', '==', fbUser.uid), limit(10))
        ).catch(() => null),
    isAdmin
      ? queryCollectionDeltaSafe('feedbacks', sinceTs, 150)
      : getDocs(
          query(collection(db, 'feedbacks'), where('authorUid', '==', fbUser.uid), limit(20))
        ).catch(() => null),
    isAdmin
      ? queryCollectionDeltaSafe('scoreboards', sinceTs, 200)
      : isTeacher
      ? getDocs(
          query(collection(db, 'scoreboards'), where('creatorUid', '==', fbUser.uid), limit(100))
        ).catch(() => null)
      : Promise.resolve(null),
    !isAdmin
      ? getDocs(
          query(collectionGroup(db, 'joinRequests'), where('studentUid', '==', fbUser.uid), limit(50))
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!isAdmin && shouldPullLibraryNow) {
    lastNonAdminLibraryPullMs = nowMs;
  }

  if (subjData && Array.isArray(subjData.items)) {
    out.subjects = subjData.items;
  }
  if (navData && Array.isArray(navData.items)) {
    out.navTabs = navData.items;
    if (navData.updatedAt) out.navTabsUpdatedAt = toIsoString(navData.updatedAt, '');
  }
  if (liveData && liveData.overrides) {
    out.liveTextOverrides = liveData.overrides;
    if (liveData.updatedAt) {
      out.liveTextUpdatedAt = toIsoString(liveData.updatedAt, '');
    }
  }
  if (tombData) {
    // Only apply raw deletion tombstones on full pulls so partial delta-sync queries
    // never let stale tombstones mask older, unmodified live Cloud documents.
    const canApplyGeneralTombstones = !sinceTs;
    const canApplyCourseTombstones = !sinceTs || forceCourses;

    const liveExamIds = new Set(examDocs.map((d) => d.id));
    const rawDeletedExams: string[] = Array.isArray(tombData.deletedExamIds)
      ? tombData.deletedExamIds
      : [];
    const falselyTombstonedExams = rawDeletedExams.filter(
      (id) => liveExamIds.has(sanitizeDocId(id)) && !id.startsWith('exam_e2e_')
    );
    if (falselyTombstonedExams.length > 0) {
      out.falselyTombstonedExamIds = falselyTombstonedExams;
    }
    const falseExamSet = new Set(falselyTombstonedExams);
    if (canApplyGeneralTombstones) {
      out.deletedExamIds = rawDeletedExams.filter((id) => !falseExamSet.has(id));
    }

    const liveBundleIds = new Set(bundleDocs.map((d) => d.id));
    const rawDeletedBundles: string[] = Array.isArray(tombData.deletedBundleIds)
      ? tombData.deletedBundleIds
      : [];
    const falselyTombstonedBundles = rawDeletedBundles.filter((id) =>
      liveBundleIds.has(sanitizeDocId(id))
    );
    if (falselyTombstonedBundles.length > 0) {
      out.falselyTombstonedBundleIds = falselyTombstonedBundles;
    }
    const falseBundleSet = new Set(falselyTombstonedBundles);
    if (canApplyGeneralTombstones) {
      out.deletedBundleIds = rawDeletedBundles.filter((id) => !falseBundleSet.has(id));
    }

    const liveClassIds = new Set(classroomDocs.map((d) => d.id));
    const rawDeletedClasses: string[] = Array.isArray(tombData.deletedClassroomIds)
      ? tombData.deletedClassroomIds
      : [];
    const falselyTombstonedClasses = rawDeletedClasses.filter((id) =>
      liveClassIds.has(sanitizeDocId(id))
    );
    if (falselyTombstonedClasses.length > 0) {
      out.falselyTombstonedClassroomIds = falselyTombstonedClasses;
    }
    const falseClassSet = new Set(falselyTombstonedClasses);
    if (canApplyGeneralTombstones) {
      out.deletedClassroomIds = rawDeletedClasses.filter((id) => !falseClassSet.has(id));
    }

    const liveCourseIds = new Set(courseDocs.map((d) => d.id));
    const rawDeletedCourses: string[] = Array.isArray(tombData.deletedCourseIds)
      ? tombData.deletedCourseIds
      : [];
    const falselyTombstoned = rawDeletedCourses.filter(
      (id) => liveCourseIds.has(sanitizeDocId(id)) && !id.startsWith('course_e2e_')
    );
    if (falselyTombstoned.length > 0) {
      out.falselyTombstonedCourseIds = falselyTombstoned;
    }
    const falseSet = new Set(falselyTombstoned);
    if (canApplyCourseTombstones) {
      out.deletedCourseIds = rawDeletedCourses.filter((id) => !falseSet.has(id));
    }

    if (canApplyGeneralTombstones) {
      out.deletedUserIds = tombData.deletedUserIds || [];
    }

    const liveResultIds = new Set(resultDocs.map((d) => d.id));
    const rawDeletedResults: string[] = Array.isArray(tombData.deletedResultIds)
      ? tombData.deletedResultIds
      : [];
    const falselyTombstonedResults = rawDeletedResults.filter((id) =>
      liveResultIds.has(sanitizeDocId(id))
    );
    if (falselyTombstonedResults.length > 0) {
      out.falselyTombstonedResultIds = falselyTombstonedResults;
    }
    const falseResultSet = new Set(falselyTombstonedResults);
    if (canApplyGeneralTombstones) {
      out.deletedResultIds = rawDeletedResults.filter((id) => !falseResultSet.has(id));
    }

    const liveHwSubIds = new Set(hwSubDocs.map((d) => d.id));
    const rawDeletedHwSubs: string[] = Array.isArray(tombData.deletedHomeworkIds)
      ? tombData.deletedHomeworkIds
      : [];
    const falselyTombstonedHwSubs = rawDeletedHwSubs.filter((id) =>
      liveHwSubIds.has(sanitizeDocId(id))
    );
    if (falselyTombstonedHwSubs.length > 0) {
      out.falselyTombstonedHomeworkIds = falselyTombstonedHwSubs;
    }
    const falseHwSubSet = new Set(falselyTombstonedHwSubs);
    if (canApplyGeneralTombstones) {
      out.deletedHomeworkIds = rawDeletedHwSubs.filter((id) => !falseHwSubSet.has(id));
    }

    const liveClassHwIds = new Set(hwDocs.map((d) => d.id));
    const rawDeletedClassHws: string[] = Array.isArray(tombData.deletedClassroomHomeworkIds)
      ? tombData.deletedClassroomHomeworkIds
      : [];
    const falselyTombstonedClassHws = rawDeletedClassHws.filter((id) =>
      liveClassHwIds.has(sanitizeDocId(id))
    );
    if (falselyTombstonedClassHws.length > 0) {
      out.falselyTombstonedClassroomHomeworkIds = falselyTombstonedClassHws;
    }
    const falseClassHwSet = new Set(falselyTombstonedClassHws);
    if (canApplyGeneralTombstones) {
      out.deletedClassroomHomeworkIds = rawDeletedClassHws.filter((id) => !falseClassHwSet.has(id));
    }

    if (canApplyGeneralTombstones) {
      out.deletedSubjectIds = tombData.deletedSubjectIds || [];
    }

    const liveSbIds = new Set((sbSnap && !sbSnap.empty ? sbSnap.docs : []).map((d) => d.id));
    const rawDeletedSbs: string[] = Array.isArray(tombData.deletedScoreboardIds)
      ? tombData.deletedScoreboardIds
      : [];
    const falselyTombstonedSbs = rawDeletedSbs.filter((id) =>
      liveSbIds.has(sanitizeDocId(id))
    );
    if (falselyTombstonedSbs.length > 0) {
      out.falselyTombstonedScoreboardIds = falselyTombstonedSbs;
    }
    const falseSbSet = new Set(falselyTombstonedSbs);
    if (canApplyGeneralTombstones) {
      out.deletedScoreboardIds = rawDeletedSbs.filter((id) => !falseSbSet.has(id));
    }
  }

  if (!sinceTs) {
    void resolveOrCreateUnifiedUserProfile(fbUser, activeWebUser || undefined).catch(() => null);
  }

  if (examDocs.length > 0) {
    out.customExams = examDocs.map((d) => {
      markCloudDocKnown('exams', d.id);
      return fromFirestoreExamDoc(d.data());
    });
  }

  if (bundleDocs.length > 0) {
    out.customBundles = bundleDocs.map((d) => {
      markCloudDocKnown('bundles', d.id);
      return fromFirestoreBundleDoc(d.data());
    });
  }

  if (courseDocs.length > 0) {
    out.courses = courseDocs.map((d) => {
      markCloudDocKnown('courses', d.id);
      return fromFirestoreCourseDoc(d.data());
    });
  }

  if (classroomDocs.length > 0) {
    // Only fetch pending joinRequests for a teacher's activeClassId (or max 1 owned class if none selected)
    const activeClsId = options?.activeClassId;
    const clsList: Classroom[] = [];
    await Promise.all(
      classroomDocs.map(async (d) => {
        markCloudDocKnown('classrooms', d.id);
        const raw = d.data();
        const isOwnerTeacher =
          isAdmin ||
          (isTeacher &&
            (raw.teacherUid === fbUser.uid ||
              String(raw.teacherEmail || '').toLowerCase() === primaryEmail));
        let subRequests: ClassJoinRequest[] = [];
        if (isOwnerTeacher && activeClsId && d.id === activeClsId) {
          try {
            const jrSnap = await getDocs(
              query(
                collection(db, 'classrooms', d.id, 'joinRequests'),
                where('status', '==', 'pending'),
                limit(100)
              )
            );
            subRequests = jrSnap.docs.map((jr) => {
              markCloudDocKnown(`classrooms/${d.id}/joinRequests`, jr.id);
              const jd = jr.data();
              return {
                ...jd,
                id: jd.id,
                createdAt: jd.createdAtStr || toIsoString(jd.createdAt),
                updatedAt: toIsoString(jd.updatedAt, ''),
              } as ClassJoinRequest;
            });
          } catch {}
        }
        clsList.push(fromFirestoreClassroomDoc(raw, subRequests));
      })
    );
    out.classrooms = clsList;
  }

  if (resultDocs.length > 0) {
    out.results = resultDocs.map((d) => {
      markCloudDocKnown('results', d.id);
      return fromFirestoreResultDoc(d.data());
    });
  }

  if (progressDocs.length > 0) {
    const progressMap: { [key: string]: StudentCourseProgress } = {};
    progressDocs.forEach((d) => {
      markCloudDocKnown('courseProgress', d.id);
      const pd = d.data();
      const key = `${pd.courseId}::${pd.studentId}`;
      progressMap[key] = {
        courseId: pd.courseId,
        studentId: pd.studentId,
        completedLessonIds: pd.completedLessonIds || [],
        completedBlockIds: pd.completedBlockIds || [],
        currentChapterId: pd.currentChapterId,
        currentLessonId: pd.currentLessonId,
        currentBlockIdsByLesson: pd.currentBlockIdsByLesson || {},
        interactiveAnswers: pd.interactiveAnswers || {},
        completedExamIds: pd.completedExamIds || [],
        scormData: pd.scormData,
        lastStudiedAt: pd.lastStudiedAt || toIsoString(pd.updatedAt),
      };
    });
    out.courseProgress = progressMap;
  }

  if (hwDocs.length > 0) {
    out.classroomHomeworks = hwDocs.map((d) => {
      markCloudDocKnown('classroomHomeworks', d.id);
      const hd = d.data();
      return {
        ...hd,
        id: hd.id,
        createdAt: hd.createdAtStr || toIsoString(hd.createdAt),
        updatedAt: toIsoString(hd.updatedAt, ''),
      } as ClassroomHomework;
    });
  }

  if (hwSubDocs.length > 0) {
    out.homeworkSubmissions = hwSubDocs.map((d) => {
      markCloudDocKnown('homeworkSubmissions', d.id);
      const sd = d.data();
      return {
        ...sd,
        id: sd.id,
        updatedAt: toIsoString(sd.updatedAt, ''),
      } as HomeworkSubmission;
    });
  }

  if (reqSnap && !reqSnap.empty) {
    out.teacherRequests = reqSnap.docs.map((d) => {
      markCloudDocKnown('teacherRequests', d.id);
      const rd = d.data();
      return {
        ...rd,
        id: rd.id,
        createdAt: rd.createdAtStr || toIsoString(rd.createdAt),
        updatedAt: toIsoString(rd.updatedAt, ''),
      } as TeacherRoleRequest;
    });
  }

  if (fbSnap && !fbSnap.empty) {
    out.feedbacks = fbSnap.docs.map((d) => {
      markCloudDocKnown('feedbacks', d.id);
      const fd = d.data();
      return {
        ...fd,
        id: fd.id,
        createdAt: fd.createdAtStr || toIsoString(fd.createdAt),
        updatedAt: toIsoString(fd.updatedAt, ''),
      } as FeedbackItem;
    });
  }

  if (sbSnap && !sbSnap.empty) {
    out.scoreboards = sbSnap.docs.map((d) => {
      markCloudDocKnown('scoreboards', d.id);
      return fromFirestoreScoreboardDoc(d.data());
    });
  }

  if (myJrSnap && !myJrSnap.empty) {
    out.myJoinRequests = myJrSnap.docs.map((d) => {
      const jd = d.data();
      return {
        ...jd,
        id: jd.id || d.id,
        createdAt: jd.createdAtStr || toIsoString(jd.createdAt),
        updatedAt: toIsoString(jd.updatedAt, ''),
      } as ClassJoinRequest;
    });
  }

  setLastDeltaSyncMs(nowMs);
  return out;
}

export interface CloudCourseRecoveryScanResult {
  cloudCourses: MicroCourse[];
  tombstonedCourseIds: string[];
  liveCloudTombstonedIds: string[];
  orphanReferencedCourseIds: string[];
  error?: string;
}

export async function scanRecoverableCloudCourses(
  activeWebUser?: UserAccount | null
): Promise<CloudCourseRecoveryScanResult> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || fbUser.isAnonymous) {
    return {
      cloudCourses: [],
      tombstonedCourseIds: [],
      liveCloudTombstonedIds: [],
      orphanReferencedCourseIds: [],
      error: 'Bạn cần đăng nhập tài khoản Giáo viên / Quản trị viên để quét khóa học trên Cloud Firestore.',
    };
  }

  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  const isAdmin = isMasterAdminFirebaseUser(fbUser) || primaryEmail === MASTER_ADMIN_EMAIL_LOWER;
  const isTeacher = isAdmin || activeWebUser?.role === 'teacher';

  try {
    const [tombSnap, clsSnap] = await Promise.all([
      getDocFromServer(doc(db, 'siteConfig', 'tombstones')).catch(() =>
        getDoc(doc(db, 'siteConfig', 'tombstones')).catch(() => null)
      ),
      isAdmin
        ? getDocs(query(collection(db, 'classrooms'), limit(200))).catch(() => null)
        : isTeacher
        ? getDocs(query(collection(db, 'classrooms'), where('teacherUid', '==', fbUser.uid), limit(100))).catch(() => null)
        : Promise.resolve(null),
    ]);

    const tombData = tombSnap?.exists() ? tombSnap.data() : null;
    const tombstonedCourseIds: string[] = Array.isArray(tombData?.deletedCourseIds)
      ? tombData.deletedCourseIds.filter((x: unknown): x is string => typeof x === 'string')
      : [];

    let docs: any[] = [];
    if (isAdmin) {
      const snap = await getDocs(query(collection(db, 'courses'), limit(500))).catch(() => null);
      docs = snap ? snap.docs : [];
    } else {
      const queries = [
        getDocs(query(collection(db, 'courses'), where('visibility', '==', 'public'), limit(200))).catch(() => null),
        ...(primaryEmail
          ? [
              getDocs(
                query(collection(db, 'courses'), where('allowedEmails', 'array-contains', primaryEmail), limit(200))
              ).catch(() => null),
            ]
          : []),
        ...(isTeacher
          ? [
              getDocs(query(collection(db, 'courses'), where('creatorUid', '==', fbUser.uid), limit(200))).catch(() => null),
              ...(primaryEmail
                ? [getDocs(query(collection(db, 'courses'), where('creatorEmail', '==', primaryEmail), limit(200))).catch(() => null)]
                : []),
            ]
          : []),
      ];
      docs = mergeQuerySnapDocs(await Promise.all(queries));
    }

    const foundById = new Map<string, MicroCourse>();
    for (const d of docs) {
      markCloudDocKnown('courses', d.id);
      const parsed = fromFirestoreCourseDoc(d.data());
      foundById.set(parsed.id, parsed);
    }

    // Also probe specific IDs referenced in tombstones or classrooms in case query filters missed any
    const referencedIds = new Set<string>(tombstonedCourseIds);
    if (clsSnap && !clsSnap.empty) {
      clsSnap.docs.forEach((d) => {
        const assigned = d.data()?.assignedCourseIds;
        if (Array.isArray(assigned)) {
          assigned.forEach((cid: unknown) => {
            if (typeof cid === 'string' && cid) referencedIds.add(cid);
          });
        }
      });
    }

    const missingFromQuery = Array.from(referencedIds).filter((id) => !foundById.has(id));
    if (missingFromQuery.length > 0) {
      await Promise.all(
        missingFromQuery.slice(0, 40).map(async (cid) => {
          try {
            const snap = await getDocFromServer(doc(db, 'courses', sanitizeDocId(cid))).catch(() =>
              getDoc(doc(db, 'courses', sanitizeDocId(cid)))
            );
            if (snap && snap.exists()) {
              markCloudDocKnown('courses', snap.id);
              const parsed = fromFirestoreCourseDoc(snap.data());
              foundById.set(parsed.id, parsed);
            }
          } catch {}
        })
      );
    }

    const cloudCourses = Array.from(foundById.values());
    const tombSet = new Set(tombstonedCourseIds);
    const liveCloudTombstonedIds = cloudCourses.filter((c) => tombSet.has(c.id)).map((c) => c.id);
    const orphanReferencedCourseIds = Array.from(referencedIds).filter(
      (id) => !foundById.has(id) && !id.startsWith('course_e2e_')
    );

    return {
      cloudCourses,
      tombstonedCourseIds,
      liveCloudTombstonedIds,
      orphanReferencedCourseIds,
    };
  } catch (err: any) {
    return {
      cloudCourses: [],
      tombstonedCourseIds: [],
      liveCloudTombstonedIds: [],
      orphanReferencedCourseIds: [],
      error: err?.message || String(err),
    };
  }
}

export async function clearCoursesFromCloudTombstones(
  courseIdsToUnblock: string[],
  coursesToUpload: MicroCourse[],
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null
): Promise<{ ok: boolean; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || fbUser.isAnonymous) {
    return { ok: false, error: 'Chưa đăng nhập Firebase.' };
  }
  const effectiveUid = fbUser.uid;
  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  const unblockSet = new Set(courseIdsToUnblock);

  try {
    const tombRef = doc(db, 'siteConfig', 'tombstones');
    const tombSnap = await getDocFromServer(tombRef).catch(() => getDoc(tombRef).catch(() => null));
    if (tombSnap && tombSnap.exists()) {
      const existing = tombSnap.data() || {};
      const nextDeletedCourses = (Array.isArray(existing.deletedCourseIds) ? existing.deletedCourseIds : []).filter(
        (id: string) => !unblockSet.has(id)
      );
      await setDoc(
        tombRef,
        stripUndefined({
          ...existing,
          id: 'tombstones',
          deletedCourseIds: nextDeletedCourses,
          updatedById: effectiveUid,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      markCloudDocKnown('siteConfig', 'tombstones');
      invalidateSiteConfigCache('tombstones');
    }

    if (coursesToUpload.length > 0) {
      for (const c of coursesToUpload) {
        const res = await migrateLegacyCourseToSubcollections(c, classrooms, activeWebUser);
        if (!res.ok && res.error) {
          return { ok: false, error: res.error };
        }
      }
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export interface CloudExamRecoveryScanResult {
  cloudExams: Exam[];
  tombstonedExamIds: string[];
  liveCloudTombstonedIds: string[];
  orphanReferencedExamIds: string[];
  error?: string;
}

export async function scanRecoverableCloudExams(
  activeWebUser?: UserAccount | null
): Promise<CloudExamRecoveryScanResult> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || fbUser.isAnonymous) {
    return {
      cloudExams: [],
      tombstonedExamIds: [],
      liveCloudTombstonedIds: [],
      orphanReferencedExamIds: [],
      error: 'Bạn cần đăng nhập tài khoản Giáo viên / Quản trị viên để quét đề thi trên Cloud Firestore.',
    };
  }

  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  const isAdmin = isMasterAdminFirebaseUser(fbUser) || primaryEmail === MASTER_ADMIN_EMAIL_LOWER;
  const isTeacher = isAdmin || activeWebUser?.role === 'teacher';

  try {
    const [tombSnap, clsSnap, bundleSnap] = await Promise.all([
      getDocFromServer(doc(db, 'siteConfig', 'tombstones')).catch(() =>
        getDoc(doc(db, 'siteConfig', 'tombstones')).catch(() => null)
      ),
      isAdmin
        ? getDocs(query(collection(db, 'classrooms'), limit(200))).catch(() => null)
        : isTeacher
        ? getDocs(query(collection(db, 'classrooms'), where('teacherUid', '==', fbUser.uid), limit(100))).catch(() => null)
        : Promise.resolve(null),
      isAdmin
        ? getDocs(query(collection(db, 'bundles'), limit(200))).catch(() => null)
        : isTeacher
        ? getDocs(query(collection(db, 'bundles'), where('creatorUid', '==', fbUser.uid), limit(100))).catch(() => null)
        : Promise.resolve(null),
    ]);

    const tombData = tombSnap?.exists() ? tombSnap.data() : null;
    const tombstonedExamIds: string[] = Array.isArray(tombData?.deletedExamIds)
      ? tombData.deletedExamIds.filter((x: unknown): x is string => typeof x === 'string')
      : [];

    let docs: any[] = [];
    if (isAdmin) {
      const snap = await getDocs(query(collection(db, 'exams'), limit(500))).catch(() => null);
      docs = snap ? snap.docs : [];
    } else {
      const queries = [
        getDocs(
          query(
            collection(db, 'exams'),
            where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
            limit(250)
          )
        ).catch(() => null),
        ...(primaryEmail
          ? [
              getDocs(
                query(collection(db, 'exams'), where('allowedEmails', 'array-contains', primaryEmail), limit(200))
              ).catch(() => null),
            ]
          : []),
        ...(isTeacher
          ? [
              getDocs(query(collection(db, 'exams'), where('creatorUid', '==', fbUser.uid), limit(250))).catch(
                () => null
              ),
              ...(primaryEmail
                ? [
                    getDocs(
                      query(collection(db, 'exams'), where('creatorEmail', '==', primaryEmail), limit(250))
                    ).catch(() => null),
                  ]
                : []),
            ]
          : []),
      ];
      docs = mergeQuerySnapDocs(await Promise.all(queries));
    }

    const foundById = new Map<string, Exam>();
    for (const d of docs) {
      markCloudDocKnown('exams', d.id);
      const parsed = fromFirestoreExamDoc(d.data());
      if (parsed?.id) foundById.set(parsed.id, parsed);
    }

    const referencedIds = new Set<string>(tombstonedExamIds);
    if (clsSnap && !clsSnap.empty) {
      clsSnap.docs.forEach((d) => {
        const assigned = d.data()?.assignedExamIds;
        if (Array.isArray(assigned)) {
          assigned.forEach((eid: unknown) => {
            if (typeof eid === 'string' && eid) referencedIds.add(eid);
          });
        }
      });
    }
    if (bundleSnap && !bundleSnap.empty) {
      bundleSnap.docs.forEach((d) => {
        const exIds = d.data()?.examIds;
        if (Array.isArray(exIds)) {
          exIds.forEach((eid: unknown) => {
            if (typeof eid === 'string' && eid) referencedIds.add(eid);
          });
        }
      });
    }

    const missingFromQuery = Array.from(referencedIds).filter((id) => !foundById.has(id));
    if (missingFromQuery.length > 0) {
      await Promise.all(
        missingFromQuery.slice(0, 40).map(async (eid) => {
          try {
            const snap = await getDocFromServer(doc(db, 'exams', sanitizeDocId(eid))).catch(() =>
              getDoc(doc(db, 'exams', sanitizeDocId(eid)))
            );
            if (snap && snap.exists()) {
              markCloudDocKnown('exams', snap.id);
              const parsed = fromFirestoreExamDoc(snap.data());
              if (parsed?.id) foundById.set(parsed.id, parsed);
            }
          } catch {}
        })
      );
    }

    const cloudExams = Array.from(foundById.values());
    const tombSet = new Set(tombstonedExamIds);
    const liveCloudTombstonedIds = cloudExams.filter((e) => tombSet.has(e.id)).map((e) => e.id);
    const orphanReferencedExamIds = Array.from(referencedIds).filter(
      (id) => !foundById.has(id) && !id.startsWith('exam_e2e_')
    );

    return {
      cloudExams,
      tombstonedExamIds,
      liveCloudTombstonedIds,
      orphanReferencedExamIds,
    };
  } catch (err: any) {
    return {
      cloudExams: [],
      tombstonedExamIds: [],
      liveCloudTombstonedIds: [],
      orphanReferencedExamIds: [],
      error: err?.message || String(err),
    };
  }
}

export async function clearExamsFromCloudTombstones(
  examIdsToUnblock: string[],
  examsToUpload: Exam[],
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null
): Promise<{ ok: boolean; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || fbUser.isAnonymous) {
    return { ok: false, error: 'Chưa đăng nhập Firebase.' };
  }
  const effectiveUid = fbUser.uid;
  const unblockSet = new Set(examIdsToUnblock);

  try {
    const tombRef = doc(db, 'siteConfig', 'tombstones');
    const tombSnap = await getDocFromServer(tombRef).catch(() => getDoc(tombRef).catch(() => null));
    if (tombSnap && tombSnap.exists()) {
      const existing = tombSnap.data() || {};
      const nextDeletedExams = (Array.isArray(existing.deletedExamIds) ? existing.deletedExamIds : []).filter(
        (id: string) => !unblockSet.has(id)
      );
      await setDoc(
        tombRef,
        stripUndefined({
          ...existing,
          id: 'tombstones',
          deletedExamIds: nextDeletedExams,
          updatedById: effectiveUid,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
      markCloudDocKnown('siteConfig', 'tombstones');
      invalidateSiteConfigCache('tombstones');
    }

    for (const ex of examsToUpload) {
      const ok = await syncSingleExamToFirestoreNow(ex, classrooms, activeWebUser);
      if (!ok) {
        return { ok: false, error: `Không thể đồng bộ lại đề "${ex.title}" lên Cloud.` };
      }
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// =========================================================================
// CLASSROOM CODES & JOIN REQUESTS
// =========================================================================

export async function lookupClassroomCodeInFirestore(rawCode: string): Promise<{
  code: string;
  classroomId: string;
  className: string;
  teacherUid?: string;
  teacherEmail: string;
  teacherName?: string;
} | null> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) return null;

  const cleanCode = sanitizeDocId(rawCode.trim().toUpperCase());
  try {
    const snap = await getDocFromServer(doc(db, 'classroomCodes', cleanCode)).catch(() =>
      getDoc(doc(db, 'classroomCodes', cleanCode))
    );
    if (!snap.exists()) return null;
    markCloudDocKnown('classroomCodes', cleanCode);
    const d = snap.data();
    return {
      code: String(d.code || cleanCode),
      classroomId: String(d.classroomId || ''),
      className: String(d.className || ''),
      teacherUid: d.teacherUid ? String(d.teacherUid) : undefined,
      teacherEmail: String(d.teacherEmail || ''),
      teacherName: d.teacherName ? String(d.teacherName) : undefined,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `classroomCodes/${cleanCode}`);
  }
}

export async function submitJoinRequestToFirestore(
  classroomId: string,
  req: ClassJoinRequest,
  activeWebUser?: UserAccount | null
): Promise<{ alreadyPending?: boolean; alreadyApproved?: boolean; requestId: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    throw new Error('Cần đăng nhập Firebase để gửi yêu cầu vào lớp.');
  }

  const uid = fbUser.uid;
  const email = (fbUser.email || req.studentEmail || activeWebUser?.email || '')
    .trim()
    .toLowerCase();
  const cleanClassId = sanitizeDocId(classroomId);
  // Deterministic ID guarantees strictly 1 join request document per (classroom, student)
  const cleanReqId = sanitizeDocId(req.id || `req_${cleanClassId}_${uid}`);
  const docRef = doc(db, 'classrooms', cleanClassId, 'joinRequests', cleanReqId);
  const docKey = `classrooms/${cleanClassId}/joinRequests/${cleanReqId}`;

  // Check on server whether a pending or approved request already exists
  let isKnown = knownCloudDocIds.has(docKey);
  try {
    const existingSnap = await getDocFromServer(docRef).catch(() => getDoc(docRef));
    if (existingSnap.exists()) {
      isKnown = true;
      knownCloudDocIds.add(docKey);
      const st = existingSnap.data()?.status;
      if (st === 'approved') {
        return { alreadyApproved: true, requestId: cleanReqId };
      }
      if (st === 'pending') {
        return { alreadyPending: true, requestId: cleanReqId };
      }
    }
  } catch {}

  try {
    await setDoc(
      docRef,
      stripUndefined({
        id: cleanReqId,
        classId: cleanClassId,
        className: String(req.className || '').slice(0, 200),
        classCode: String(req.classCode || '').slice(0, 64),
        teacherEmail: req.teacherEmail
          ? String(req.teacherEmail).trim().toLowerCase().slice(0, 180)
          : undefined,
        studentUid: uid,
        studentId: sanitizeDocId(req.studentId || uid),
        studentName: String(req.studentName || 'Học sinh').slice(0, 150),
        studentEmail: email.slice(0, 180),
        studentCode: req.studentCode ? String(req.studentCode).slice(0, 60) : undefined,
        note: req.note ? String(req.note).slice(0, 1000) : undefined,
        status: 'pending',
        createdAtStr: (req.createdAt || new Date().toISOString()).slice(0, 64),
        ...(isKnown ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    knownCloudDocIds.add(docKey);
    return { alreadyPending: false, requestId: cleanReqId };
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `classrooms/${cleanClassId}/joinRequests/${cleanReqId}`
    );
  }
}

export async function syncJoinRequestDecisionToFirestore(
  classroomId: string,
  requestId: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) return;
  const cleanClassId = sanitizeDocId(classroomId);
  const cleanReqId = sanitizeDocId(requestId);
  const docRef = doc(db, 'classrooms', cleanClassId, 'joinRequests', cleanReqId);

  try {
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'not-found' || String(err?.message || '').includes('No document to update')) {
      return;
    }
    console.warn('[syncJoinRequestDecisionToFirestore] warning:', err);
  }
}

// =========================================================================
// AUTHORIZED WRITEBATCH CLOUD PUSH (< 0.3s)
// =========================================================================

export interface DirtyPushScope {
  entities?: string[];
  siteConfig?: string[];
  userProfile?: boolean;
}

export async function pushAuthorizedDataToFirestore(
  payload: any,
  currentUser: UserAccount | null,
  options?: {
    lastLocalMutationMs?: number;
    dirtyKeys?: DirtyPushScope;
    forceFull?: boolean;
    onCourseMediaOffloaded?: (cleanCourse: MicroCourse) => void;
  }
): Promise<{ ok: boolean; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    return { ok: false, error: 'Chưa xác thực phiên Firebase Authentication.' };
  }

  const effectiveUid = fbUser.uid;
  const userEmails = resolveUserAccessEmails(currentUser);
  const primaryEmail = (fbUser.email || userEmails[0] || '').trim().toLowerCase();
  const isAdmin = primaryEmail === MASTER_ADMIN_EMAIL_LOWER;
  const isTeacher = isAdmin || currentUser?.role === 'teacher';
  const minTsMs = options?.lastLocalMutationMs ? options.lastLocalMutationMs - 60000 : 0;

  const hasDirtyFilter = Boolean(!options?.forceFull && options?.dirtyKeys);
  const dirtyEntitySet = new Set<string>(options?.dirtyKeys?.entities || []);
  const dirtySiteConfigSet = new Set<string>(options?.dirtyKeys?.siteConfig || []);
  const pushUserProfile = hasDirtyFilter ? Boolean(options?.dirtyKeys?.userProfile) : true;

  const ownerIdsSet = new Set<string>(
    [effectiveUid, currentUser?.id, currentUser?.uid, ...(currentUser?.legacyUserIds || [])].filter(
      (x): x is string => Boolean(x)
    )
  );

  const isOwnedOrCreator = (creatorEmail?: string, creatorId?: string) => {
    if (isAdmin) return true;
    const ce = (creatorEmail || '').trim().toLowerCase();
    if (ce && userEmails.includes(ce)) return true;
    if (creatorId && ownerIdsSet.has(creatorId)) return true;
    return false;
  };

  const deletedExamSet = new Set<string>(filterStrings(payload.deletedExamIds, 500));
  const deletedBundleSet = new Set<string>(filterStrings(payload.deletedBundleIds, 500));
  const deletedClassroomSet = new Set<string>(filterStrings(payload.deletedClassroomIds, 500));
  const deletedCourseSet = new Set<string>(filterStrings(payload.deletedCourseIds, 500));
  const deletedResultSet = new Set<string>(filterStrings(payload.deletedResultIds, 500));
  const deletedHomeworkSet = new Set<string>(filterStrings(payload.deletedHomeworkIds, 500));
  const deletedClassroomHwSet = new Set<string>(
    filterStrings(payload.deletedClassroomHomeworkIds, 500)
  );
  const deletedScoreboardSet = new Set<string>(filterStrings(payload.deletedScoreboardIds, 500));

  const allClassrooms: Classroom[] = payload.classrooms || [];
  const allExams: Exam[] = payload.customExams || [];
  const allCourses: MicroCourse[] = payload.courses || [];

  const ops: BatchWriteOp[] = [];

  try {
    // 1. Tombstones & Site Config — write ONLY when explicitly modified by user action (never from background/forceFull sync)
    const shouldPushTombstones = dirtySiteConfigSet.has('tombstones');

    if (shouldPushTombstones) {
      let tombPayload: Record<string, any>;
      if (isTeacher) {
        tombPayload = stripUndefined({
          id: 'tombstones',
          deletedExamIds: filterStrings(payload.deletedExamIds, 500).slice(-500),
          deletedBundleIds: filterStrings(payload.deletedBundleIds, 500).slice(-500),
          deletedClassroomIds: filterStrings(payload.deletedClassroomIds, 500).slice(-500),
          deletedCourseIds: filterStrings(payload.deletedCourseIds, 500).slice(-500),
          deletedUserIds: filterStrings(payload.deletedUserIds, 500).slice(-500),
          deletedResultIds: filterStrings(payload.deletedResultIds, 500).slice(-500),
          deletedHomeworkIds: filterStrings(payload.deletedHomeworkIds, 500).slice(-500),
          deletedClassroomHomeworkIds: filterStrings(
            payload.deletedClassroomHomeworkIds,
            500
          ).slice(-500),
          deletedSubjectIds: filterStrings(payload.deletedSubjectIds, 500).slice(-500),
          deletedScoreboardIds: filterStrings(payload.deletedScoreboardIds, 500).slice(-500),
          updatedById: effectiveUid,
          ...(knownCloudDocIds.has('siteConfig/tombstones')
            ? {}
            : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        });
      } else {
        // Students may only merge their own result/homework tombstones — never overwrite teacher course/exam tombstones
        const existingTomb = await getCachedSiteConfigDoc('tombstones', true).catch(() => null);
        tombPayload = stripUndefined({
          ...(existingTomb || {}),
          id: 'tombstones',
          deletedResultIds: Array.from(
            new Set([
              ...filterStrings(existingTomb?.deletedResultIds, 500),
              ...filterStrings(payload.deletedResultIds, 500),
            ])
          ).slice(-500),
          deletedHomeworkIds: Array.from(
            new Set([
              ...filterStrings(existingTomb?.deletedHomeworkIds, 500),
              ...filterStrings(payload.deletedHomeworkIds, 500),
            ])
          ).slice(-500),
          updatedById: effectiveUid,
          ...(knownCloudDocIds.has('siteConfig/tombstones') || existingTomb
            ? {}
            : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        });
      }
      ops.push({
        ref: doc(db, 'siteConfig', 'tombstones'),
        data: tombPayload,
        docKey: 'siteConfig/tombstones',
      });
      invalidateSiteConfigCache('tombstones');
    }

    if (
      Array.isArray(payload.subjects) &&
      isTeacher &&
      (!hasDirtyFilter || dirtySiteConfigSet.has('subjects'))
    ) {
      ops.push({
        ref: doc(db, 'siteConfig', 'subjects'),
        data: stripUndefined({
          id: 'subjects',
          items: filterObjects(payload.subjects, 100),
          updatedById: effectiveUid,
          ...(knownCloudDocIds.has('siteConfig/subjects')
            ? {}
            : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        }),
        docKey: 'siteConfig/subjects',
      });
      invalidateSiteConfigCache('subjects');
    }

    if (
      isAdmin &&
      Array.isArray(payload.navTabs) &&
      (!hasDirtyFilter || dirtySiteConfigSet.has('navTabs'))
    ) {
      ops.push({
        ref: doc(db, 'siteConfig', 'navTabs'),
        data: stripUndefined({
          id: 'navTabs',
          items: filterObjects(payload.navTabs, 50),
          updatedById: effectiveUid,
          ...(knownCloudDocIds.has('siteConfig/navTabs')
            ? {}
            : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        }),
        docKey: 'siteConfig/navTabs',
      });
      invalidateSiteConfigCache('navTabs');
    }

    if (
      isAdmin &&
      payload.liveTextOverrides &&
      isPlainObject(payload.liveTextOverrides) &&
      (!hasDirtyFilter || dirtySiteConfigSet.has('liveText'))
    ) {
      ops.push({
        ref: doc(db, 'siteConfig', 'liveText'),
        data: stripUndefined({
          id: 'liveText',
          overrides: payload.liveTextOverrides,
          updatedById: effectiveUid,
          ...(knownCloudDocIds.has('siteConfig/liveText')
            ? {}
            : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        }),
        docKey: 'siteConfig/liveText',
      });
      invalidateSiteConfigCache('liveText');
    }

    // 2. Own user profile — push ONLY if dirty or missing on cloud
    if (
      currentUser &&
      (pushUserProfile ||
        !knownCloudDocIds.has(`users/${effectiveUid}`) ||
        !knownCloudDocIds.has(`userCredentials/${effectiveUid}`))
    ) {
      const myProfile = { ...currentUser, id: effectiveUid, uid: effectiveUid };
      const isKnownSelf = knownCloudDocIds.has(`users/${effectiveUid}`);
      if (pushUserProfile || !isKnownSelf) {
        ops.push({
          ref: doc(db, 'users', effectiveUid),
          data: toSafeUserDoc(myProfile, effectiveUid, isKnownSelf),
          docKey: `users/${effectiveUid}`,
        });
      }
      const myTeachers = computeStudentTeacherEmails(myProfile, allClassrooms);
      const credKey = `userCredentials/${effectiveUid}`;
      if (!knownCloudDocIds.has(credKey) || (pushUserProfile && myTeachers.length > 0)) {
        const cleanEmailSelf = (fbUser.email || myProfile.email || '').trim().toLowerCase();
        if (cleanEmailSelf) {
          ops.push({
            ref: doc(db, 'userCredentials', effectiveUid),
            data: stripUndefined({
              id: effectiveUid,
              uid: effectiveUid,
              email: cleanEmailSelf.slice(0, 180),
              username: (
                String(myProfile.username || cleanEmailSelf.split('@')[0] || '')
                  .trim()
                  .toLowerCase() || `user_${effectiveUid.slice(0, 8)}`
              ).slice(0, 100),
              fullName: (
                String(myProfile.fullName || myProfile.name || cleanEmailSelf.split('@')[0] || '')
                  .trim() || 'Thành viên'
              ).slice(0, 150),
              role: isAdmin || myProfile.role === 'teacher' ? 'teacher' : 'student',
              isMasterAdmin: isAdmin,
              school: myProfile.school ? String(myProfile.school).slice(0, 200) : undefined,
              studentCode: myProfile.studentCode
                ? String(myProfile.studentCode).slice(0, 60)
                : undefined,
              teacherEmails: myTeachers,
              isGoogleAuth: Boolean(myProfile.isGoogleAuth),
              ...(knownCloudDocIds.has(credKey)
                ? {}
                : {
                    createdAt: serverTimestamp(),
                    createdAtStr: new Date().toISOString().split('T')[0],
                  }),
              updatedAt: serverTimestamp(),
            }),
            docKey: credKey,
          });
        }
      }
    }

    // Helper deciding whether an owned item should be included in this batch
    const shouldSyncItem = (docKey: string, rawId: string, updatedAt?: string): boolean => {
      if (hasDirtyFilter) {
        if (dirtyEntitySet.has(docKey)) return true;
        const col = docKey.split('/')[0];
        if (dirtyEntitySet.has(`${col}/${rawId}`) || dirtyEntitySet.has(`${col}/*`)) return true;
        return !knownCloudDocIds.has(docKey);
      }
      if (!knownCloudDocIds.has(docKey)) return true;
      if (minTsMs <= 0) return true;
      const ms = toTimestampMs(updatedAt);
      return ms === 0 || ms >= minTsMs;
    };

    // 3. Exams (offload embedded base64 / local image URLs to persistent Firestore mediaAssets)
    if (isTeacher) {
      for (const ex of allExams) {
        if (!ex.id || deletedExamSet.has(ex.id)) continue;
        if (!isOwnedOrCreator(ex.creatorEmail, ex.creatorId)) continue;
        const cleanId = sanitizeDocId(ex.id);
        const key = `exams/${cleanId}`;
        if (!shouldSyncItem(key, ex.id, ex.updatedAt)) continue;
        const { exam: preparedExam } = await offloadExamBase64MediaToUrls(ex).catch(() => ({
          exam: ex,
        }));
        ops.push({
          ref: doc(db, 'exams', cleanId),
          data: toSafeExamDoc(
            preparedExam,
            effectiveUid,
            primaryEmail,
            allClassrooms,
            knownCloudDocIds.has(key)
          ),
          docKey: key,
        });
      }
      // NOTE: Never auto-delete Firestore documents from background sync tombstones.
    }

    // 4. Bundles
    if (isTeacher) {
      for (const b of (payload.customBundles || []) as ExamBundle[]) {
        if (!b.id || deletedBundleSet.has(b.id)) continue;
        if (!isOwnedOrCreator(b.creatorEmail, b.creatorId)) continue;
        const cleanId = sanitizeDocId(b.id);
        const key = `bundles/${cleanId}`;
        if (!shouldSyncItem(key, b.id, b.updatedAt)) continue;
        ops.push({
          ref: doc(db, 'bundles', cleanId),
          data: toSafeBundleDoc(
            b,
            effectiveUid,
            primaryEmail,
            allClassrooms,
            knownCloudDocIds.has(key)
          ),
          docKey: key,
        });
      }
    }

    // 5. Courses (subcollection-based sync + Base64->URL offloading + legacy root cleanup)
    const courseSyncPromises: Promise<void>[] = [];
    if (isTeacher) {
      for (const c of allCourses) {
        if (!c.id || deletedCourseSet.has(c.id)) continue;
        if (!isOwnedOrCreator(c.creatorEmail, c.creatorId)) continue;
        const cleanId = sanitizeDocId(c.id);
        const key = `courses/${cleanId}`;
        if (!shouldSyncItem(key, c.id, c.updatedAt)) continue;
        courseSyncPromises.push(
          syncCourseSubcollectionsToFirestore(c, allClassrooms, currentUser, {
            pruneRemovedChildren: false,
            onMediaOffloaded: options?.onCourseMediaOffloaded,
          }).then((res) => {
            if (!res.ok && res.error) {
              throw new Error(`courses/${cleanId}: ${res.error}`);
            }
          })
        );
      }
    }

    // 6. Classrooms + classroomCodes/{code} atomically in the same WriteBatch
    if (isTeacher) {
      for (const cls of allClassrooms) {
        if (!cls.id || deletedClassroomSet.has(cls.id)) continue;
        if (!isOwnedOrCreator(cls.teacherEmail, cls.teacherId)) continue;
        const cleanId = sanitizeDocId(cls.id);
        const key = `classrooms/${cleanId}`;
        const cleanCode = sanitizeDocId(String(cls.code || 'CLASS').trim().toUpperCase()).slice(0, 64);
        const codeKey = `classroomCodes/${cleanCode}`;
        if (!shouldSyncItem(key, cls.id, cls.updatedAt) && knownCloudDocIds.has(codeKey)) continue;

        ops.push({
          ref: doc(db, 'classrooms', cleanId),
          data: toSafeClassroomDoc(cls, effectiveUid, primaryEmail, knownCloudDocIds.has(key)),
          docKey: key,
        });

        if (cleanCode) {
          ops.push({
            ref: doc(db, 'classroomCodes', cleanCode),
            data: stripUndefined({
              code: cleanCode,
              classroomId: cleanId,
              className: (String(cls.name || '').trim() || 'Lớp học').slice(0, 200),
              teacherUid: effectiveUid,
              teacherEmail: safeNonEmptyEmail(
                cls.teacherEmail || primaryEmail,
                'teacher@edutest.local'
              ),
              teacherName: String(cls.teacherName || 'Giáo viên').slice(0, 150),
              ...(knownCloudDocIds.has(codeKey) ? {} : { createdAt: serverTimestamp() }),
              updatedAt: serverTimestamp(),
            }),
            docKey: codeKey,
          });
        }
      }
    }

    // 7. Results
    for (const r of (payload.results || []) as ExamResult[]) {
      if (!r.id || deletedResultSet.has(r.id)) continue;
      const re = (r.userEmail || '').trim().toLowerCase();
      const isMineByOwner =
        (Boolean(re) && userEmails.includes(re)) ||
        Boolean(r.userId && ownerIdsSet.has(r.userId));
      if (!isMineByOwner && !isAdmin) continue;
      const cleanId = sanitizeDocId(r.id);
      const key = `results/${cleanId}`;
      if (!shouldSyncItem(key, r.id, r.updatedAt || r.completedAt)) continue;
      ops.push({
        ref: doc(db, 'results', cleanId),
        data: toSafeResultDoc(
          r,
          effectiveUid,
          primaryEmail,
          allExams,
          allClassrooms,
          knownCloudDocIds.has(key),
          isMineByOwner
        ),
        docKey: key,
      });
    }

    // 8. Course progress
    const progressEntries = Object.entries<StudentCourseProgress>(payload.courseProgress || {});
    for (const [key, prog] of progressEntries) {
      if (!prog || !prog.courseId) continue;
      if (!ownerIdsSet.has(prog.studentId) && !isAdmin) continue;
      const cleanId = sanitizeDocId(key);
      const docKey = `courseProgress/${cleanId}`;
      if (!shouldSyncItem(docKey, key, prog.lastStudiedAt)) continue;
      ops.push({
        ref: doc(db, 'courseProgress', cleanId),
        data: toSafeCourseProgressDoc(
          prog,
          key,
          effectiveUid,
          primaryEmail,
          allCourses,
          knownCloudDocIds.has(docKey)
        ),
        docKey,
      });
    }

    // 9. Classroom Homeworks
    if (isTeacher) {
      for (const hw of (payload.classroomHomeworks || []) as ClassroomHomework[]) {
        if (!hw.id || deletedClassroomHwSet.has(hw.id)) continue;
        const parentCls = allClassrooms.find((c) => c.id === hw.classId);
        if (!isOwnedOrCreator(parentCls?.teacherEmail, parentCls?.teacherId)) continue;
        const cleanId = sanitizeDocId(hw.id);
        const key = `classroomHomeworks/${cleanId}`;
        if (!shouldSyncItem(key, hw.id, hw.updatedAt)) continue;
        const { homework: preparedHw } = await offloadClassroomHomeworkMediaToUrls(hw).catch(() => ({
          homework: hw,
        }));
        ops.push({
          ref: doc(db, 'classroomHomeworks', cleanId),
          data: toSafeClassroomHomeworkDoc(
            preparedHw,
            effectiveUid,
            primaryEmail,
            allClassrooms,
            knownCloudDocIds.has(key)
          ),
          docKey: key,
        });
      }
    }

    // 10. Homework Submissions
    for (const sub of (payload.homeworkSubmissions || []) as HomeworkSubmission[]) {
      if (!sub.id || deletedHomeworkSet.has(sub.id)) continue;
      const se = (sub.studentEmail || '').trim().toLowerCase();
      const parentCls = sub.classId ? allClassrooms.find((c) => c.id === sub.classId) : undefined;
      const isStudentOwner =
        (Boolean(se) && userEmails.includes(se)) || ownerIdsSet.has(sub.studentId);
      const isClassTeacher = Boolean(
        parentCls && isOwnedOrCreator(parentCls.teacherEmail, parentCls.teacherId)
      );
      if (!isStudentOwner && !isClassTeacher && !isAdmin) continue;
      const cleanId = sanitizeDocId(sub.id);
      const key = `homeworkSubmissions/${cleanId}`;
      if (!shouldSyncItem(key, sub.id, sub.updatedAt || sub.gradedAt || sub.submittedAt)) continue;
      const { submission: preparedSub } = await offloadHomeworkSubmissionMediaToUrls(sub).catch(() => ({
        submission: sub,
      }));
      ops.push({
        ref: doc(db, 'homeworkSubmissions', cleanId),
        data: toSafeHomeworkSubmissionDoc(
          preparedSub,
          effectiveUid,
          primaryEmail,
          allClassrooms,
          allCourses,
          knownCloudDocIds.has(key),
          isStudentOwner
        ),
        docKey: key,
      });
    }

    // 11. Teacher Role Requests
    for (const req of (payload.teacherRequests || []) as TeacherRoleRequest[]) {
      if (!req.id) continue;
      const re = (req.userEmail || '').trim().toLowerCase();
      const isMine = (Boolean(re) && userEmails.includes(re)) || ownerIdsSet.has(req.userId);
      if (!isMine && !isAdmin) continue;
      const status = pickEnum(req.status, ['pending', 'approved', 'rejected'] as const, 'pending');
      if (!isAdmin && status !== 'pending') continue;
      const cleanId = sanitizeDocId(req.id);
      const key = `teacherRequests/${cleanId}`;
      if (!shouldSyncItem(key, req.id, req.updatedAt || req.reviewedAt)) continue;
      ops.push({
        ref: doc(db, 'teacherRequests', cleanId),
        data: stripUndefined({
          id: cleanId,
          userUid: isAdmin
            ? ownerIdsSet.has(req.userId)
              ? effectiveUid
              : sanitizeDocId(req.userId)
            : effectiveUid,
          userId: sanitizeDocId(req.userId || effectiveUid),
          userEmail: safeNonEmptyEmail(req.userEmail || primaryEmail, 'user@edutest.local'),
          userName: (String(req.userName || '').trim() || 'Người dùng').slice(0, 150),
          schoolName: req.schoolName ? String(req.schoolName).slice(0, 200) : undefined,
          subject: req.subject ? String(req.subject).slice(0, 100) : undefined,
          reason: req.reason ? String(req.reason).slice(0, 2000) : undefined,
          status,
          createdAtStr: (req.createdAt || new Date().toISOString()).slice(0, 64),
          reviewedAt: req.reviewedAt ? String(req.reviewedAt).slice(0, 64) : undefined,
          reviewedBy: req.reviewedBy ? String(req.reviewedBy).slice(0, 180) : undefined,
          ...(knownCloudDocIds.has(key) ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        }),
        docKey: key,
      });
    }

    // 12. Feedbacks
    for (const fb of (payload.feedbacks || []) as FeedbackItem[]) {
      if (!fb.id) continue;
      const fe = (fb.email || '').trim().toLowerCase();
      const isMyFeedback =
        (Boolean(fe) && userEmails.includes(fe)) ||
        (fb as any).authorUid === effectiveUid;
      if (!isMyFeedback && !isAdmin) continue;
      const cleanId = sanitizeDocId(fb.id);
      const key = `feedbacks/${cleanId}`;
      if (!isAdmin && knownCloudDocIds.has(key)) continue;
      if (!shouldSyncItem(key, fb.id, fb.updatedAt || fb.createdAt)) continue;
      const safeRating = Math.min(5, Math.max(1, safeFiniteNumber(fb.rating) ?? 5));
      ops.push({
        ref: doc(db, 'feedbacks', cleanId),
        data: stripUndefined({
          id: cleanId,
          authorUid:
            isAdmin && (fb as any).authorUid
              ? String((fb as any).authorUid).slice(0, 128)
              : effectiveUid,
          rating: safeRating,
          category: pickEnum(
            fb.category,
            ['ui', 'exams', 'feature', 'bug', 'general'] as const,
            'general'
          ),
          comments: (String(fb.comments || '').trim() || 'Góp ý').slice(0, 4000),
          userName: fb.userName ? String(fb.userName).slice(0, 150) : undefined,
          userRole:
            fb.userRole === 'student' || fb.userRole === 'teacher' ? fb.userRole : undefined,
          email: fb.email ? String(fb.email).trim().toLowerCase().slice(0, 180) : undefined,
          createdAtStr: (fb.createdAt || new Date().toISOString()).slice(0, 64),
          ...(knownCloudDocIds.has(key) ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        }),
        docKey: key,
      });
    }

    // 13. Teacher Scoreboards
    if (isTeacher) {
      for (const sb of (payload.scoreboards || []) as Scoreboard[]) {
        if (!sb.id || deletedScoreboardSet.has(sb.id)) continue;
        if (!isOwnedOrCreator(sb.creatorEmail, sb.creatorId)) continue;
        const cleanId = sanitizeDocId(sb.id);
        const key = `scoreboards/${cleanId}`;
        if (!shouldSyncItem(key, sb.id, sb.updatedAt || sb.createdAt)) continue;
        ops.push({
          ref: doc(db, 'scoreboards', cleanId),
          data: toSafeScoreboardDoc(sb, effectiveUid, primaryEmail, knownCloudDocIds.has(key)),
          docKey: key,
        });
      }
    }

    if (ops.length === 0 && courseSyncPromises.length === 0) {
      return { ok: true };
    }

    // Execute atomic batch commits + parallel subcollection syncs (ZERO automatic deletions)
    await Promise.all([commitBatchOperations(ops), ...courseSyncPromises]);

    return { ok: true };
  } catch (err: any) {
    console.error('[pushAuthorizedDataToFirestore] Error:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Targeted field-level updates via updateDoc (tránh ghi đè cả document)
 */
export async function patchExamFieldsInFirestore(
  examId: string,
  fields: Partial<Pick<Exam, 'teacherMode' | 'isCreatorOnlyMode' | 'visibility' | 'status'>>
): Promise<boolean> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !examId) return false;
  const cleanId = sanitizeDocId(examId);
  if (!knownCloudDocIds.has(`exams/${cleanId}`)) return false;
  try {
    await updateDoc(
      doc(db, 'exams', cleanId),
      stripUndefined({
        ...fields,
        updatedAt: serverTimestamp(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function patchScoreboardFieldsInFirestore(
  scoreboardId: string,
  fields: Partial<Pick<Scoreboard, 'specialMode' | 'participants' | 'rounds' | 'title' | 'description'>>
): Promise<boolean> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !scoreboardId) return false;
  const cleanId = sanitizeDocId(scoreboardId);
  if (!knownCloudDocIds.has(`scoreboards/${cleanId}`)) return false;
  try {
    const payload: Record<string, any> = { updatedAt: serverTimestamp() };
    if (fields.specialMode !== undefined) payload.specialMode = fields.specialMode;
    if (fields.participants !== undefined) payload.participants = filterObjects(fields.participants, 500);
    if (fields.rounds !== undefined) payload.rounds = filterObjects(fields.rounds, 50);
    if (fields.title !== undefined) payload.title = String(fields.title).slice(0, 300);
    if (fields.description !== undefined) payload.description = String(fields.description).slice(0, 2000);
    await updateDoc(doc(db, 'scoreboards', cleanId), stripUndefined(payload));
    return true;
  } catch {
    return false;
  }
}

export async function patchHomeworkSubmissionGradeInFirestore(
  submissionId: string,
  fields: { score?: number; teacherFeedback?: string; gradedAt: string; gradedBy: string }
): Promise<boolean> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !submissionId) return false;
  const cleanId = sanitizeDocId(submissionId);
  if (!knownCloudDocIds.has(`homeworkSubmissions/${cleanId}`)) return false;
  try {
    await updateDoc(
      doc(db, 'homeworkSubmissions', cleanId),
      stripUndefined({
        score: safeFiniteNumber(fields.score),
        teacherFeedback: fields.teacherFeedback ? String(fields.teacherFeedback).slice(0, 4000) : undefined,
        gradedAt: String(fields.gradedAt).slice(0, 64),
        gradedBy: String(fields.gradedBy).slice(0, 180),
        updatedAt: serverTimestamp(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Đồng bộ tức thì 1 đề thi cụ thể lên Firestore (< 100ms, không qua hàng chờ batch/debounce)
 * Dùng khi Giáo viên bật/tắt chế độ "Người ra đề", lưu đề, hoặc thay đổi trạng thái phòng thi.
 */
export async function syncSingleExamToFirestoreDetailed(
  exam: Exam,
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null
): Promise<{ ok: boolean; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !exam?.id) {
    return { ok: false, error: 'Chưa đăng nhập Firebase.' };
  }
  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  if (!primaryEmail) {
    return { ok: false, error: 'Không xác định được email tài khoản.' };
  }
  const cleanId = sanitizeDocId(exam.id);
  const key = `exams/${cleanId}`;
  try {
    const { exam: preparedExam } = await offloadExamBase64MediaToUrls(exam).catch(() => ({
      exam,
    }));
    const safeDoc = toSafeExamDoc(
      preparedExam,
      fbUser.uid,
      primaryEmail,
      classrooms,
      knownCloudDocIds.has(key)
    );
    await setDoc(doc(db, 'exams', cleanId), safeDoc, { merge: true });
    markCloudDocKnown('exams', cleanId);
    return { ok: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn('[syncSingleExamToFirestoreNow] warning:', err);
    return { ok: false, error: msg };
  }
}

export async function syncSingleExamToFirestoreNow(
  exam: Exam,
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null
): Promise<boolean> {
  const res = await syncSingleExamToFirestoreDetailed(exam, classrooms, activeWebUser);
  return res.ok;
}

export async function syncSingleCourseToFirestoreNow(
  course: MicroCourse,
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null,
  options?: { onMediaOffloaded?: (cleanCourse: MicroCourse) => void }
): Promise<{ ok: boolean; course?: MicroCourse; error?: string }> {
  const res = await syncCourseSubcollectionsToFirestore(course, classrooms, activeWebUser, {
    pruneRemovedChildren: false,
    onMediaOffloaded: options?.onMediaOffloaded,
  });
  return { ok: res.ok, course: res.course, error: res.error };
}

/**
 * Đồng bộ tức thì 1 lớp học (+ classroomCodes) lên Firestore (< 100ms, không qua hàng chờ debounce)
 */
export async function syncSingleClassroomToFirestoreNow(
  cls: Classroom,
  activeWebUser?: UserAccount | null
): Promise<boolean> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !cls?.id) return false;
  const primaryEmail = (fbUser.email || activeWebUser?.email || cls.teacherEmail || '')
    .trim()
    .toLowerCase();
  if (!primaryEmail) return false;
  const cleanId = sanitizeDocId(cls.id);
  const key = `classrooms/${cleanId}`;
  const cleanCode = sanitizeDocId(String(cls.code || 'CLASS').trim().toUpperCase()).slice(0, 64);
  const codeKey = `classroomCodes/${cleanCode}`;
  try {
    const safeDoc = toSafeClassroomDoc(
      cls,
      fbUser.uid,
      primaryEmail,
      knownCloudDocIds.has(key)
    );
    const writes: Promise<void>[] = [
      setDoc(doc(db, 'classrooms', cleanId), safeDoc, { merge: true }).then(() => {
        markCloudDocKnown('classrooms', cleanId);
      }),
    ];
    if (cleanCode) {
      writes.push(
        setDoc(
          doc(db, 'classroomCodes', cleanCode),
          stripUndefined({
            code: cleanCode,
            classroomId: cleanId,
            className: (String(cls.name || '').trim() || 'Lớp học').slice(0, 200),
            teacherUid: fbUser.uid,
            teacherEmail: safeNonEmptyEmail(cls.teacherEmail || primaryEmail, 'teacher@edutest.local'),
            teacherName: String(cls.teacherName || 'Giáo viên').slice(0, 150),
            ...(knownCloudDocIds.has(codeKey) ? {} : { createdAt: serverTimestamp() }),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ).then(() => {
          markCloudDocKnown('classroomCodes', cleanCode);
        })
      );
    }
    await Promise.all(writes);
    return true;
  } catch (err) {
    console.warn('[syncSingleClassroomToFirestoreNow] warning:', err);
    return false;
  }
}

export interface RealtimeListenerScope {
  view: string;
  homeTab?: 'single' | 'bundle';
  activeClassId?: string;
  activeCourseId?: string;
}

export function attachPublicRealtimeFirestoreListeners(
  onCloudChanged: () => void,
  scope?: RealtimeListenerScope
): () => void {
  const view = scope?.view || 'home';
  if (view === 'games' || view === 'history' || view === 'analytics') {
    return () => {};
  }

  const unsubs: Unsubscribe[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const firedInitial = new Set<string>();

  const triggerChanged = (listenerKey: string) => {
    if (!firedInitial.has(listenerKey)) {
      firedInitial.add(listenerKey);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onCloudChanged(), 50);
  };

  try {
    if (view === 'home' && scope?.homeTab === 'bundle') {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'bundles'),
            where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
            limit(150)
          ),
          () => triggerChanged('pub_bundles'),
          () => {}
        )
      );
    } else if (view === 'courses') {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'courses'), where('visibility', '==', 'public'), limit(150)),
          () => triggerChanged('pub_courses'),
          () => {}
        )
      );
    } else if (view === 'home') {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'exams'),
            where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
            limit(200)
          ),
          () => triggerChanged('pub_exams'),
          () => {}
        )
      );
    }
  } catch {}

  return () => {
    if (timer) clearTimeout(timer);
    unsubs.forEach((u) => {
      try {
        u();
      } catch {}
    });
  };
}

export type RealtimeCloudDeltaHandler = (
  delta: FirestoreSyncSnapshot,
  removedByCollection: Record<string, string[]>
) => void;

export function attachRealtimeFirestoreListeners(
  activeWebUser: UserAccount | null,
  onCloudChanged: () => void,
  onCloudDelta?: RealtimeCloudDeltaHandler,
  onAccountsChanged?: () => void,
  scope?: RealtimeListenerScope
): () => void {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    return attachPublicRealtimeFirestoreListeners(onCloudChanged, scope);
  }

  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  const isAdmin = isMasterAdminFirebaseUser(fbUser) || primaryEmail === MASTER_ADMIN_EMAIL_LOWER;
  const isTeacherUser = isAdmin || activeWebUser?.role === 'teacher';
  const activeView = scope?.view || 'home';

  const unsubs: Unsubscribe[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let acctTimer: ReturnType<typeof setTimeout> | null = null;
  const firedInitial = new Set<string>();

  const pendingDelta: FirestoreSyncSnapshot = {};
  const pendingRemoved: Record<string, Set<string>> = {};

  const scheduleFlushDelta = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (onCloudDelta) {
        const snapshotCopy: FirestoreSyncSnapshot = {
          ...pendingDelta,
          isDeltaSync: true,
          pulledAtMs: Date.now(),
        };
        const removedCopy: Record<string, string[]> = {};
        for (const [k, set] of Object.entries(pendingRemoved)) {
          if (set.size > 0) removedCopy[k] = Array.from(set);
        }
        for (const key of Object.keys(pendingDelta)) {
          delete (pendingDelta as any)[key];
        }
        for (const key of Object.keys(pendingRemoved)) {
          delete pendingRemoved[key];
        }
        onCloudDelta(snapshotCopy, removedCopy);
      } else {
        onCloudChanged();
      }
    }, 30);
  };

  const triggerAccountRefresh = (key: string, immediate: boolean = false) => {
    if (!firedInitial.has(key)) {
      firedInitial.add(key);
      if (immediate) {
        onAccountsChanged?.();
        emitAccountsUpdatedNow();
      }
      return;
    }
    if (acctTimer) clearTimeout(acctTimer);
    acctTimer = setTimeout(() => {
      acctTimer = null;
      onAccountsChanged?.();
      emitAccountsUpdatedNow();
    }, 50);
  };

  const pushDocIntoPendingDelta = (colName: string, raw: any) => {
    if (colName === 'exams') {
      pendingDelta.customExams = [...(pendingDelta.customExams || []), fromFirestoreExamDoc(raw)];
    } else if (colName === 'bundles') {
      pendingDelta.customBundles = [
        ...(pendingDelta.customBundles || []),
        fromFirestoreBundleDoc(raw),
      ];
    } else if (colName === 'courses') {
      pendingDelta.courses = [...(pendingDelta.courses || []), fromFirestoreCourseDoc(raw)];
    } else if (colName === 'classrooms') {
      pendingDelta.classrooms = [
        ...(pendingDelta.classrooms || []),
        fromFirestoreClassroomDoc(raw),
      ];
    } else if (colName === 'results') {
      pendingDelta.results = [...(pendingDelta.results || []), fromFirestoreResultDoc(raw)];
    } else if (colName === 'courseProgress') {
      const pMap = pendingDelta.courseProgress || {};
      const key = `${raw.courseId}::${raw.studentId}`;
      pMap[key] = {
        courseId: raw.courseId,
        studentId: raw.studentId,
        completedLessonIds: raw.completedLessonIds || [],
        completedBlockIds: raw.completedBlockIds || [],
        currentChapterId: raw.currentChapterId,
        currentLessonId: raw.currentLessonId,
        currentBlockIdsByLesson: raw.currentBlockIdsByLesson || {},
        interactiveAnswers: raw.interactiveAnswers || {},
        completedExamIds: raw.completedExamIds || [],
        scormData: raw.scormData,
        lastStudiedAt: raw.lastStudiedAt || toIsoString(raw.updatedAt),
      };
      pendingDelta.courseProgress = pMap;
    } else if (colName === 'classroomHomeworks') {
      pendingDelta.classroomHomeworks = [
        ...(pendingDelta.classroomHomeworks || []),
        {
          ...raw,
          id: raw.id,
          createdAt: raw.createdAtStr || toIsoString(raw.createdAt),
          updatedAt: toIsoString(raw.updatedAt, ''),
        } as ClassroomHomework,
      ];
    } else if (colName === 'homeworkSubmissions') {
      pendingDelta.homeworkSubmissions = [
        ...(pendingDelta.homeworkSubmissions || []),
        {
          ...raw,
          id: raw.id,
          updatedAt: toIsoString(raw.updatedAt, ''),
        } as HomeworkSubmission,
      ];
    } else if (colName === 'scoreboards') {
      pendingDelta.scoreboards = [
        ...(pendingDelta.scoreboards || []),
        fromFirestoreScoreboardDoc(raw),
      ];
    }
  };

  const attachScopedQueryListener = (
    colName:
      | 'exams'
      | 'bundles'
      | 'courses'
      | 'classrooms'
      | 'results'
      | 'courseProgress'
      | 'classroomHomeworks'
      | 'homeworkSubmissions'
      | 'scoreboards',
    listenerKey: string,
    q: Query
  ) => {
    try {
      const u = onSnapshot(
        q,
        (snapshot) => {
          if (!firedInitial.has(listenerKey)) {
            firedInitial.add(listenerKey);
            snapshot.docs.forEach((d) => markCloudDocKnown(colName, d.id));
            // Merge already-received library docs on initial snapshot so throttled pulls never hide them
            if (
              onCloudDelta &&
              snapshot.docs.length > 0 &&
              (colName === 'courses' ||
                colName === 'exams' ||
                colName === 'bundles' ||
                colName === 'classrooms')
            ) {
              snapshot.docs.forEach((d) => pushDocIntoPendingDelta(colName, d.data()));
              scheduleFlushDelta();
            }
            return;
          }
          const changes = snapshot.docChanges();
          if (changes.length === 0) return;
          if (!onCloudDelta) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => onCloudChanged(), 30);
            return;
          }
          let hasImmediateChange = false;
          for (const change of changes) {
            const d = change.doc;
            if (change.type === 'removed') {
              // NEVER delete local data on listener `removed` events (only refresh if doc still exists on server)
              const removedId = d.id;
              void getDocFromServer(doc(db, colName, removedId))
                .then((checkSnap) => {
                  if (!checkSnap.exists()) {
                    knownCloudDocIds.delete(`${colName}/${removedId}`);
                  } else {
                    markCloudDocKnown(colName, removedId);
                    pushDocIntoPendingDelta(colName, checkSnap.data());
                    scheduleFlushDelta();
                  }
                })
                .catch(() => {});
              continue;
            }
            markCloudDocKnown(colName, d.id);
            pushDocIntoPendingDelta(colName, d.data());
            hasImmediateChange = true;
          }
          if (hasImmediateChange) {
            scheduleFlushDelta();
          }
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, colName);
          } catch {}
        }
      );
      unsubs.push(u);
    } catch {}
  };

  // 1. Keep lightweight document listeners for tombstones cache & own user role changes
  try {
    unsubs.push(
      onSnapshot(
        doc(db, 'siteConfig', 'tombstones'),
        (snap) => {
          if (!firedInitial.has('doc_tombstones')) {
            firedInitial.add('doc_tombstones');
            return;
          }
          if (!snap.exists()) return;
          const t = snap.data();
          siteConfigReadCache.set('tombstones', { data: t, fetchedAtMs: Date.now() });
          // NOTE: Do not automatically push tombstones to hide live items in open sessions without explicit user consent.
        },
        () => {}
      ),
      onSnapshot(
        doc(db, 'users', fbUser.uid),
        () => triggerAccountRefresh('doc_user_self'),
        () => {}
      )
    );
  } catch {}

  // 2. View-scoped real-time collection listeners ONLY where instant updates matter
  if (activeView === 'home') {
    if (scope?.homeTab === 'bundle') {
      if (isAdmin) {
        attachScopedQueryListener('bundles', 'bundles_admin', query(collection(db, 'bundles'), limit(250)));
      } else {
        attachScopedQueryListener(
          'bundles',
          'bundles_pub',
          query(
            collection(db, 'bundles'),
            where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
            limit(150)
          )
        );
        if (primaryEmail) {
          attachScopedQueryListener(
            'bundles',
            'bundles_allowed',
            query(
              collection(db, 'bundles'),
              where('allowedEmails', 'array-contains', primaryEmail),
              limit(150)
            )
          );
        }
        if (isTeacherUser) {
          attachScopedQueryListener(
            'bundles',
            'bundles_own',
            query(collection(db, 'bundles'), where('creatorUid', '==', fbUser.uid), limit(150))
          );
        }
      }
    } else {
      if (isAdmin) {
        attachScopedQueryListener('exams', 'exams_admin', query(collection(db, 'exams'), limit(350)));
      } else {
        attachScopedQueryListener(
          'exams',
          'exams_pub',
          query(
            collection(db, 'exams'),
            where('visibility', 'in', ['public', 'bundle_only', 'exam_only']),
            limit(200)
          )
        );
        if (primaryEmail) {
          attachScopedQueryListener(
            'exams',
            'exams_allowed',
            query(
              collection(db, 'exams'),
              where('allowedEmails', 'array-contains', primaryEmail),
              limit(200)
            )
          );
        }
        if (isTeacherUser) {
          attachScopedQueryListener(
            'exams',
            'exams_own',
            query(collection(db, 'exams'), where('creatorUid', '==', fbUser.uid), limit(250))
          );
        }
      }
    }
  } else if (activeView === 'courses') {
    if (isAdmin) {
      attachScopedQueryListener('courses', 'courses_admin', query(collection(db, 'courses'), limit(250)));
      attachScopedQueryListener(
        'courseProgress',
        'progress_admin',
        query(collection(db, 'courseProgress'), limit(350))
      );
      attachScopedQueryListener(
        'homeworkSubmissions',
        'hwsub_admin',
        query(collection(db, 'homeworkSubmissions'), limit(300))
      );
    } else {
      attachScopedQueryListener(
        'courses',
        'courses_pub',
        query(collection(db, 'courses'), where('visibility', '==', 'public'), limit(150))
      );
      if (primaryEmail) {
        attachScopedQueryListener(
          'courses',
          'courses_allowed',
          query(
            collection(db, 'courses'),
            where('allowedEmails', 'array-contains', primaryEmail),
            limit(150)
          )
        );
      }
      if (isTeacherUser) {
        attachScopedQueryListener(
          'courses',
          'courses_own',
          query(collection(db, 'courses'), where('creatorUid', '==', fbUser.uid), limit(150))
        );
        if (primaryEmail) {
          attachScopedQueryListener(
            'courseProgress',
            'progress_teacher',
            query(collection(db, 'courseProgress'), where('teacherEmail', '==', primaryEmail), limit(300))
          );
          attachScopedQueryListener(
            'homeworkSubmissions',
            'hwsub_teacher',
            query(
              collection(db, 'homeworkSubmissions'),
              where('teacherEmail', '==', primaryEmail),
              limit(300)
            )
          );
        }
      } else {
        attachScopedQueryListener(
          'courseProgress',
          'progress_student',
          query(collection(db, 'courseProgress'), where('studentUid', '==', fbUser.uid), limit(150))
        );
        attachScopedQueryListener(
          'homeworkSubmissions',
          'hwsub_student',
          query(
            collection(db, 'homeworkSubmissions'),
            where('studentUid', '==', fbUser.uid),
            limit(150)
          )
        );
      }
    }
  } else if (activeView === 'classrooms') {
    if (isAdmin) {
      attachScopedQueryListener(
        'classrooms',
        'classrooms_admin',
        query(collection(db, 'classrooms'), limit(200))
      );
    } else if (primaryEmail) {
      attachScopedQueryListener(
        'classrooms',
        'classrooms_member',
        query(
          collection(db, 'classrooms'),
          where('memberEmails', 'array-contains', primaryEmail),
          limit(100)
        )
      );
      if (isTeacherUser) {
        attachScopedQueryListener(
          'classrooms',
          'classrooms_teacher',
          query(collection(db, 'classrooms'), where('teacherUid', '==', fbUser.uid), limit(100))
        );
      }
    }

    const activeClsId = scope?.activeClassId ? sanitizeDocId(scope.activeClassId) : '';
    if (activeClsId) {
      attachScopedQueryListener(
        'classroomHomeworks',
        `hw_cls_${activeClsId}`,
        query(collection(db, 'classroomHomeworks'), where('classId', '==', activeClsId), limit(150))
      );
      if (isTeacherUser) {
        attachScopedQueryListener(
          'results',
          `results_cls_${activeClsId}`,
          query(collection(db, 'results'), where('classId', '==', activeClsId), limit(300))
        );
        attachScopedQueryListener(
          'homeworkSubmissions',
          `hwsub_cls_${activeClsId}`,
          query(
            collection(db, 'homeworkSubmissions'),
            where('classId', '==', activeClsId),
            limit(300)
          )
        );
        try {
          unsubs.push(
            onSnapshot(
              query(
                collection(db, 'classrooms', activeClsId, 'joinRequests'),
                where('status', '==', 'pending'),
                limit(100)
              ),
              (jrSnap) => {
                if (!firedInitial.has(`jr_${activeClsId}`)) {
                  firedInitial.add(`jr_${activeClsId}`);
                  jrSnap.docs.forEach((jr) =>
                    markCloudDocKnown(`classrooms/${activeClsId}/joinRequests`, jr.id)
                  );
                  return;
                }
                if (!onCloudDelta) return;
                const reqs = jrSnap.docs.map((jr) => {
                  markCloudDocKnown(`classrooms/${activeClsId}/joinRequests`, jr.id);
                  const jd = jr.data();
                  return {
                    ...jd,
                    id: jd.id || jr.id,
                    createdAt: jd.createdAtStr || toIsoString(jd.createdAt),
                    updatedAt: toIsoString(jd.updatedAt, ''),
                  } as ClassJoinRequest;
                });
                // Merge pending requests directly into cached classroom via delta callback
                const existingCls =
                  (pendingDelta.classrooms || []).find((c) => c.id === activeClsId) || null;
                if (existingCls) {
                  existingCls.pendingRequests = reqs;
                } else {
                  pendingDelta.joinRequestsByClassId = {
                    ...(pendingDelta.joinRequestsByClassId || {}),
                    [activeClsId]: reqs,
                  };
                }
                scheduleFlushDelta();
              },
              () => {}
            )
          );
        } catch {}
      } else {
        attachScopedQueryListener(
          'homeworkSubmissions',
          'hwsub_student_cls',
          query(
            collection(db, 'homeworkSubmissions'),
            where('studentUid', '==', fbUser.uid),
            limit(150)
          )
        );
      }
    }

    if (!isAdmin) {
      try {
        unsubs.push(
          onSnapshot(
            query(
              collectionGroup(db, 'joinRequests'),
              where('studentUid', '==', fbUser.uid),
              limit(50)
            ),
            (snap) => {
              if (!firedInitial.has('my_join_reqs')) {
                firedInitial.add('my_join_reqs');
                return;
              }
              if (!onCloudDelta) return;
              pendingDelta.myJoinRequests = snap.docs.map((d) => {
                const jd = d.data();
                return {
                  ...jd,
                  id: jd.id || d.id,
                  createdAt: jd.createdAtStr || toIsoString(jd.createdAt),
                  updatedAt: toIsoString(jd.updatedAt, ''),
                } as ClassJoinRequest;
              });
              scheduleFlushDelta();
            },
            () => {}
          )
        );
      } catch {}
    }
  } else if (activeView === 'history' || activeView === 'analytics') {
    attachScopedQueryListener(
      'results',
      'results_self',
      query(collection(db, 'results'), where('studentUid', '==', fbUser.uid), limit(200))
    );
  } else if (activeView === 'teacher-tools' && isTeacherUser) {
    attachScopedQueryListener(
      'scoreboards',
      'sb_teacher',
      isAdmin
        ? query(collection(db, 'scoreboards'), limit(200))
        : query(collection(db, 'scoreboards'), where('creatorUid', '==', fbUser.uid), limit(100))
    );
    attachScopedQueryListener(
      'exams',
      'exams_teacher_tools',
      isAdmin
        ? query(collection(db, 'exams'), limit(350))
        : query(collection(db, 'exams'), where('creatorUid', '==', fbUser.uid), limit(200))
    );
  }

  // 3. Student-password credentials stream ONLY when teacher/admin is inside 'classrooms'
  if (liveStreamOwnerUid && liveStreamOwnerUid !== fbUser.uid) {
    clearLiveAccountCaches();
  }
  liveStreamOwnerUid = fbUser.uid;

  const ingestCredSnapshot = (snap: any) => {
    snap.docs.forEach((d: any) => {
      markCloudDocKnown('userCredentials', d.id);
      const cd = d.data();
      const email = String(cd.email || '').trim().toLowerCase();
      if (!email) return;
      upsertLiveCredCache({
        uid: String(cd.uid || cd.id || d.id),
        email,
        username: String(cd.username || email.split('@')[0]),
        fullName: String(cd.fullName || email.split('@')[0]),
        role: cd.role === 'teacher' ? 'teacher' : 'student',
        isMasterAdmin: Boolean(cd.isMasterAdmin),
        school: cd.school || undefined,
        studentCode: cd.studentCode || undefined,
        classId: cd.classId || undefined,
        teacherEmails: Array.isArray(cd.teacherEmails) ? cd.teacherEmails : [],
        visiblePassword: cd.visiblePassword ? String(cd.visiblePassword) : undefined,
        isGoogleAuth: Boolean(cd.isGoogleAuth),
        createdAtStr: cd.createdAtStr || toIsoString(cd.createdAt).split('T')[0],
        updatedAtIso: toIsoString(cd.updatedAt, ''),
      });
    });
    liveCredsStreamWarmed = true;
    liveCredsLastFetchMs = Date.now();
  };

  if (activeView === 'classrooms' && isTeacherUser) {
    try {
      const credQuery = isAdmin
        ? query(collection(db, 'userCredentials'), limit(500))
        : query(
            collection(db, 'userCredentials'),
            where('teacherEmails', 'array-contains', primaryEmail),
            limit(300)
          );
      unsubs.push(
        onSnapshot(
          credQuery,
          (snap) => {
            ingestCredSnapshot(snap);
            triggerAccountRefresh('col_creds_scoped', true);
          },
          (err) => {
            try {
              handleFirestoreError(err, OperationType.LIST, 'userCredentials');
            } catch {}
          }
        )
      );
    } catch {}
  }

  return () => {
    if (timer) clearTimeout(timer);
    if (acctTimer) clearTimeout(acctTimer);
    unsubs.forEach((u) => {
      try {
        u();
      } catch {}
    });
  };
}

// =========================================================================
// UNIFIED CLOUD DATA RECOVERY & TOMBSTONE UNBLOCKING (ALL COLLECTIONS)
// =========================================================================

export interface CloudAllDataRecoveryScanResult {
  exams: Exam[];
  bundles: ExamBundle[];
  courses: MicroCourse[];
  classrooms: Classroom[];
  results: ExamResult[];
  classroomHomeworks: ClassroomHomework[];
  homeworkSubmissions: HomeworkSubmission[];
  scoreboards: Scoreboard[];
  subjects: CustomSubject[];
  tombstones: {
    deletedExamIds: string[];
    deletedBundleIds: string[];
    deletedCourseIds: string[];
    deletedClassroomIds: string[];
    deletedResultIds: string[];
    deletedClassroomHomeworkIds: string[];
    deletedHomeworkIds: string[];
    deletedScoreboardIds: string[];
    deletedSubjectIds: string[];
  };
  orphanReferencedIds: {
    exams: string[];
    courses: string[];
  };
  error?: string;
}

export async function scanAllCloudDataForRecovery(
  activeWebUser?: UserAccount | null
): Promise<CloudAllDataRecoveryScanResult> {
  const emptyTombstones = {
    deletedExamIds: [] as string[],
    deletedBundleIds: [] as string[],
    deletedCourseIds: [] as string[],
    deletedClassroomIds: [] as string[],
    deletedResultIds: [] as string[],
    deletedClassroomHomeworkIds: [] as string[],
    deletedHomeworkIds: [] as string[],
    deletedScoreboardIds: [] as string[],
    deletedSubjectIds: [] as string[],
  };
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || fbUser.isAnonymous) {
    return {
      exams: [],
      bundles: [],
      courses: [],
      classrooms: [],
      results: [],
      classroomHomeworks: [],
      homeworkSubmissions: [],
      scoreboards: [],
      subjects: [],
      tombstones: emptyTombstones,
      orphanReferencedIds: { exams: [], courses: [] },
      error: 'Bạn cần đăng nhập tài khoản Giáo viên / Quản trị viên để quét toàn bộ dữ liệu trên Cloud Firestore.',
    };
  }

  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  const isAdmin = isMasterAdminFirebaseUser(fbUser) || primaryEmail === MASTER_ADMIN_EMAIL_LOWER;
  const isTeacher = isAdmin || activeWebUser?.role === 'teacher';

  try {
    const [
      tombSnap,
      subjSnap,
      examDocs,
      bundleDocs,
      courseDocs,
      clsDocs,
      resultDocs,
      hwDocs,
      hwSubDocs,
      sbDocs,
    ] = await Promise.all([
      getDocFromServer(doc(db, 'siteConfig', 'tombstones')).catch(() =>
        getDoc(doc(db, 'siteConfig', 'tombstones')).catch(() => null)
      ),
      getDocFromServer(doc(db, 'siteConfig', 'subjects')).catch(() =>
        getDoc(doc(db, 'siteConfig', 'subjects')).catch(() => null)
      ),
      isAdmin
        ? getDocs(query(collection(db, 'exams'), limit(500))).then((s) => s.docs).catch(() => [])
        : Promise.all([
            getDocs(query(collection(db, 'exams'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only']), limit(250))).catch(() => null),
            ...(primaryEmail
              ? [getDocs(query(collection(db, 'exams'), where('allowedEmails', 'array-contains', primaryEmail), limit(200))).catch(() => null)]
              : []),
            ...(isTeacher
              ? [
                  getDocs(query(collection(db, 'exams'), where('creatorUid', '==', fbUser.uid), limit(250))).catch(() => null),
                  ...(primaryEmail
                    ? [getDocs(query(collection(db, 'exams'), where('creatorEmail', '==', primaryEmail), limit(250))).catch(() => null)]
                    : []),
                ]
              : []),
          ]).then(mergeQuerySnapDocs),
      isAdmin
        ? getDocs(query(collection(db, 'bundles'), limit(300))).then((s) => s.docs).catch(() => [])
        : Promise.all([
            getDocs(query(collection(db, 'bundles'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only']), limit(150))).catch(() => null),
            ...(primaryEmail
              ? [getDocs(query(collection(db, 'bundles'), where('allowedEmails', 'array-contains', primaryEmail), limit(150))).catch(() => null)]
              : []),
            ...(isTeacher
              ? [
                  getDocs(query(collection(db, 'bundles'), where('creatorUid', '==', fbUser.uid), limit(150))).catch(() => null),
                  ...(primaryEmail
                    ? [getDocs(query(collection(db, 'bundles'), where('creatorEmail', '==', primaryEmail), limit(150))).catch(() => null)]
                    : []),
                ]
              : []),
          ]).then(mergeQuerySnapDocs),
      isAdmin
        ? getDocs(query(collection(db, 'courses'), limit(400))).then((s) => s.docs).catch(() => [])
        : Promise.all([
            getDocs(query(collection(db, 'courses'), where('visibility', '==', 'public'), limit(150))).catch(() => null),
            ...(primaryEmail
              ? [getDocs(query(collection(db, 'courses'), where('allowedEmails', 'array-contains', primaryEmail), limit(150))).catch(() => null)]
              : []),
            ...(isTeacher
              ? [
                  getDocs(query(collection(db, 'courses'), where('creatorUid', '==', fbUser.uid), limit(200))).catch(() => null),
                  ...(primaryEmail
                    ? [getDocs(query(collection(db, 'courses'), where('creatorEmail', '==', primaryEmail), limit(200))).catch(() => null)]
                    : []),
                ]
              : []),
          ]).then(mergeQuerySnapDocs),
      isAdmin
        ? getDocs(query(collection(db, 'classrooms'), limit(300))).then((s) => s.docs).catch(() => [])
        : Promise.all([
            ...(primaryEmail
              ? [getDocs(query(collection(db, 'classrooms'), where('memberEmails', 'array-contains', primaryEmail), limit(100))).catch(() => null)]
              : []),
            ...(isTeacher
              ? [
                  getDocs(query(collection(db, 'classrooms'), where('teacherUid', '==', fbUser.uid), limit(100))).catch(() => null),
                  ...(primaryEmail
                    ? [getDocs(query(collection(db, 'classrooms'), where('teacherEmail', '==', primaryEmail), limit(100))).catch(() => null)]
                    : []),
                ]
              : []),
          ]).then(mergeQuerySnapDocs),
      isAdmin
        ? getDocs(query(collection(db, 'results'), limit(500))).then((s) => s.docs).catch(() => [])
        : Promise.all([
            getDocs(query(collection(db, 'results'), where('studentUid', '==', fbUser.uid), limit(250))).catch(() => null),
            ...(isTeacher && primaryEmail
              ? [getDocs(query(collection(db, 'results'), where('teacherEmail', '==', primaryEmail), limit(300))).catch(() => null)]
              : []),
          ]).then(mergeQuerySnapDocs),
      isAdmin
        ? getDocs(query(collection(db, 'classroomHomeworks'), limit(300))).then((s) => s.docs).catch(() => [])
        : Promise.all([
            ...(primaryEmail
              ? [getDocs(query(collection(db, 'classroomHomeworks'), where('allowedEmails', 'array-contains', primaryEmail), limit(150))).catch(() => null)]
              : []),
            ...(isTeacher
              ? [getDocs(query(collection(db, 'classroomHomeworks'), where('teacherUid', '==', fbUser.uid), limit(150))).catch(() => null)]
              : []),
          ]).then(mergeQuerySnapDocs),
      isAdmin
        ? getDocs(query(collection(db, 'homeworkSubmissions'), limit(400))).then((s) => s.docs).catch(() => [])
        : Promise.all([
            getDocs(query(collection(db, 'homeworkSubmissions'), where('studentUid', '==', fbUser.uid), limit(200))).catch(() => null),
            ...(isTeacher && primaryEmail
              ? [getDocs(query(collection(db, 'homeworkSubmissions'), where('teacherEmail', '==', primaryEmail), limit(300))).catch(() => null)]
              : []),
          ]).then(mergeQuerySnapDocs),
      isAdmin
        ? getDocs(query(collection(db, 'scoreboards'), limit(250))).then((s) => s.docs).catch(() => [])
        : isTeacher
        ? getDocs(query(collection(db, 'scoreboards'), where('creatorUid', '==', fbUser.uid), limit(150))).then((s) => s.docs).catch(() => [])
        : Promise.resolve([]),
    ]);

    const tombData = tombSnap?.exists() ? tombSnap.data() : {};
    const tombstones = {
      deletedExamIds: filterStrings(tombData?.deletedExamIds, 500),
      deletedBundleIds: filterStrings(tombData?.deletedBundleIds, 500),
      deletedCourseIds: filterStrings(tombData?.deletedCourseIds, 500),
      deletedClassroomIds: filterStrings(tombData?.deletedClassroomIds, 500),
      deletedResultIds: filterStrings(tombData?.deletedResultIds, 500),
      deletedClassroomHomeworkIds: filterStrings(tombData?.deletedClassroomHomeworkIds, 500),
      deletedHomeworkIds: filterStrings(tombData?.deletedHomeworkIds, 500),
      deletedScoreboardIds: filterStrings(tombData?.deletedScoreboardIds, 500),
      deletedSubjectIds: filterStrings(tombData?.deletedSubjectIds, 500),
    };

    const examsMap = new Map<string, Exam>();
    examDocs.forEach((d: any) => {
      markCloudDocKnown('exams', d.id);
      const parsed = fromFirestoreExamDoc(d.data());
      if (parsed?.id && !parsed.id.startsWith('exam_e2e_')) examsMap.set(parsed.id, parsed);
    });

    const bundlesMap = new Map<string, ExamBundle>();
    bundleDocs.forEach((d: any) => {
      markCloudDocKnown('bundles', d.id);
      const parsed = fromFirestoreBundleDoc(d.data());
      if (parsed?.id) bundlesMap.set(parsed.id, parsed);
    });

    const coursesMap = new Map<string, MicroCourse>();
    courseDocs.forEach((d: any) => {
      markCloudDocKnown('courses', d.id);
      const parsed = fromFirestoreCourseDoc(d.data());
      if (parsed?.id && !parsed.id.startsWith('course_e2e_')) coursesMap.set(parsed.id, parsed);
    });

    const classroomsMap = new Map<string, Classroom>();
    clsDocs.forEach((d: any) => {
      markCloudDocKnown('classrooms', d.id);
      const parsed = fromFirestoreClassroomDoc(d.data());
      if (parsed?.id) classroomsMap.set(parsed.id, parsed);
    });

    const resultsMap = new Map<string, ExamResult>();
    resultDocs.forEach((d: any) => {
      markCloudDocKnown('results', d.id);
      const parsed = fromFirestoreResultDoc(d.data());
      if (parsed?.id) resultsMap.set(parsed.id, parsed);
    });

    const hwMap = new Map<string, ClassroomHomework>();
    hwDocs.forEach((d: any) => {
      markCloudDocKnown('classroomHomeworks', d.id);
      const hd = d.data();
      if (hd?.id) {
        hwMap.set(hd.id, {
          ...hd,
          id: hd.id,
          createdAt: hd.createdAtStr || toIsoString(hd.createdAt),
          updatedAt: toIsoString(hd.updatedAt, ''),
        } as ClassroomHomework);
      }
    });

    const hwSubMap = new Map<string, HomeworkSubmission>();
    hwSubDocs.forEach((d: any) => {
      markCloudDocKnown('homeworkSubmissions', d.id);
      const sd = d.data();
      if (sd?.id) {
        hwSubMap.set(sd.id, {
          ...sd,
          id: sd.id,
          updatedAt: toIsoString(sd.updatedAt, ''),
        } as HomeworkSubmission);
      }
    });

    const sbMap = new Map<string, Scoreboard>();
    sbDocs.forEach((d: any) => {
      markCloudDocKnown('scoreboards', d.id);
      const parsed = fromFirestoreScoreboardDoc(d.data());
      if (parsed?.id) sbMap.set(parsed.id, parsed);
    });

    // Probe any tombstoned/referenced IDs missed by filtered queries via direct getDocFromServer
    const probeMissing = async <T>(
      colName: string,
      ids: string[],
      map: Map<string, T>,
      parser: (raw: any) => T | null
    ) => {
      const missing = ids.filter((id) => id && !map.has(id) && !id.startsWith('exam_e2e_') && !id.startsWith('course_e2e_'));
      if (missing.length === 0) return;
      await Promise.all(
        missing.slice(0, 40).map(async (id) => {
          try {
            const snap = await getDocFromServer(doc(db, colName, sanitizeDocId(id))).catch(() =>
              getDoc(doc(db, colName, sanitizeDocId(id)))
            );
            if (snap && snap.exists()) {
              markCloudDocKnown(colName, snap.id);
              const parsed = parser(snap.data());
              if (parsed) map.set((parsed as any).id || snap.id, parsed);
            }
          } catch {}
        })
      );
    };

    const refExamIds = new Set<string>(tombstones.deletedExamIds);
    const refCourseIds = new Set<string>(tombstones.deletedCourseIds);
    classroomsMap.forEach((cls) => {
      (cls.assignedExamIds || []).forEach((id) => refExamIds.add(id));
      (cls.assignedCourseIds || []).forEach((id) => refCourseIds.add(id));
    });
    bundlesMap.forEach((b) => {
      (b.examIds || []).forEach((id) => refExamIds.add(id));
    });

    await Promise.all([
      probeMissing('exams', Array.from(refExamIds), examsMap, fromFirestoreExamDoc),
      probeMissing('bundles', tombstones.deletedBundleIds, bundlesMap, fromFirestoreBundleDoc),
      probeMissing('courses', Array.from(refCourseIds), coursesMap, fromFirestoreCourseDoc),
      probeMissing('classrooms', tombstones.deletedClassroomIds, classroomsMap, (raw) => fromFirestoreClassroomDoc(raw)),
      probeMissing('results', tombstones.deletedResultIds, resultsMap, fromFirestoreResultDoc),
      probeMissing('classroomHomeworks', tombstones.deletedClassroomHomeworkIds, hwMap, (hd) =>
        hd?.id
          ? ({
              ...hd,
              id: hd.id,
              createdAt: hd.createdAtStr || toIsoString(hd.createdAt),
              updatedAt: toIsoString(hd.updatedAt, ''),
            } as ClassroomHomework)
          : null
      ),
      probeMissing('homeworkSubmissions', tombstones.deletedHomeworkIds, hwSubMap, (sd) =>
        sd?.id
          ? ({
              ...sd,
              id: sd.id,
              updatedAt: toIsoString(sd.updatedAt, ''),
            } as HomeworkSubmission)
          : null
      ),
      probeMissing('scoreboards', tombstones.deletedScoreboardIds, sbMap, fromFirestoreScoreboardDoc),
    ]);

    const subjectsData = subjSnap?.exists() ? subjSnap.data() : null;
    const subjects: CustomSubject[] = Array.isArray(subjectsData?.items) ? subjectsData.items : [];

    return {
      exams: Array.from(examsMap.values()),
      bundles: Array.from(bundlesMap.values()),
      courses: Array.from(coursesMap.values()),
      classrooms: Array.from(classroomsMap.values()),
      results: Array.from(resultsMap.values()),
      classroomHomeworks: Array.from(hwMap.values()),
      homeworkSubmissions: Array.from(hwSubMap.values()),
      scoreboards: Array.from(sbMap.values()),
      subjects,
      tombstones,
      orphanReferencedIds: {
        exams: Array.from(refExamIds).filter((id) => !examsMap.has(id) && !id.startsWith('exam_e2e_')),
        courses: Array.from(refCourseIds).filter((id) => !coursesMap.has(id) && !id.startsWith('course_e2e_')),
      },
    };
  } catch (err: any) {
    return {
      exams: [],
      bundles: [],
      courses: [],
      classrooms: [],
      results: [],
      classroomHomeworks: [],
      homeworkSubmissions: [],
      scoreboards: [],
      subjects: [],
      tombstones: emptyTombstones,
      orphanReferencedIds: { exams: [], courses: [] },
      error: err?.message || String(err),
    };
  }
}

export async function clearAllCloudTombstonesAndRestore(
  options: {
    clearAllTombstones?: boolean;
    unblockIds?: {
      exams?: string[];
      bundles?: string[];
      courses?: string[];
      classrooms?: string[];
      results?: string[];
      classroomHomeworks?: string[];
      homeworkSubmissions?: string[];
      scoreboards?: string[];
      subjects?: string[];
    };
  },
  _activeWebUser?: UserAccount | null
): Promise<{ ok: boolean; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || fbUser.isAnonymous) {
    return { ok: false, error: 'Chưa đăng nhập Firebase.' };
  }
  try {
    const tombRef = doc(db, 'siteConfig', 'tombstones');
    const tombSnap = await getDocFromServer(tombRef).catch(() => getDoc(tombRef).catch(() => null));
    const existing = tombSnap && tombSnap.exists() ? tombSnap.data() || {} : {};

    const filterField = (field: string, idsToUnblock?: string[]) => {
      if (options.clearAllTombstones) return [];
      const cur: string[] = Array.isArray(existing[field]) ? existing[field] : [];
      if (!idsToUnblock || idsToUnblock.length === 0) return cur;
      const set = new Set(idsToUnblock);
      return cur.filter((id) => !set.has(id));
    };

    const u = options.unblockIds || {};
    await setDoc(
      tombRef,
      stripUndefined({
        ...existing,
        id: 'tombstones',
        deletedExamIds: filterField('deletedExamIds', u.exams),
        deletedBundleIds: filterField('deletedBundleIds', u.bundles),
        deletedCourseIds: filterField('deletedCourseIds', u.courses),
        deletedClassroomIds: filterField('deletedClassroomIds', u.classrooms),
        deletedResultIds: filterField('deletedResultIds', u.results),
        deletedClassroomHomeworkIds: filterField('deletedClassroomHomeworkIds', u.classroomHomeworks),
        deletedHomeworkIds: filterField('deletedHomeworkIds', u.homeworkSubmissions),
        deletedScoreboardIds: filterField('deletedScoreboardIds', u.scoreboards),
        deletedSubjectIds: filterField('deletedSubjectIds', u.subjects),
        updatedById: fbUser.uid,
        ...(tombSnap?.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
    markCloudDocKnown('siteConfig', 'tombstones');
    invalidateSiteConfigCache('tombstones');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}
