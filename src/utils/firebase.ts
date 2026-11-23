import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
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
  deleteDoc,
  writeBatch,
  query,
  where,
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
}

// Connection probe on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
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
}): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> {
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

  void withTimeout(
    setDoc(uidRef, firestoreProfile, { merge: true }).then(() => {
      markCloudDocKnown('users', uid);
    }),
    3500,
    undefined
  ).catch((err) => {
    console.warn('[resolveOrCreateUnifiedUserProfile] background write skipped:', err);
  });

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

  void syncUsernameLookupInFirestore(finalAccount);
  return finalAccount;
}

// Lightweight payload converter (< 1KB per users/{uid} document)
function toSafeUserDoc(user: UserAccount, ownerUid: string, isKnownUpdate: boolean) {
  const email = (user.email || '').trim().toLowerCase();
  const isMaster = email === MASTER_ADMIN_EMAIL_LOWER;
  const cleanId = sanitizeDocId(user.uid || user.id || ownerUid);
  const fullName = String(user.fullName || user.name || email.split('@')[0] || 'Thành viên').slice(
    0,
    150
  );
  const compactAvatar =
    user.avatar && user.avatar.length <= 512 ? user.avatar : undefined;

  return stripUndefined({
    id: cleanId,
    uid: user.uid || ownerUid,
    email: email.slice(0, 180),
    username: String(user.username || email.split('@')[0] || 'user')
      .trim()
      .toLowerCase()
      .slice(0, 100),
    fullName,
    displayName: fullName,
    role: isMaster ? 'teacher' : user.role === 'teacher' ? 'teacher' : 'student',
    isMasterAdmin: isMaster || Boolean(user.isMasterAdmin),
    school: user.school ? String(user.school).slice(0, 200) : undefined,
    studentCode: user.studentCode ? String(user.studentCode).slice(0, 60) : undefined,
    avatar: compactAvatar,
    isGoogleAuth: Boolean(user.isGoogleAuth),
    legacyUserIds: Array.isArray(user.legacyUserIds)
      ? user.legacyUserIds.slice(0, 20)
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
        sizeBytes:
          exam.attachedFile.sizeBytes !== undefined ? Number(exam.attachedFile.sizeBytes) : undefined,
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

  return stripUndefined({
    id: sanitizeDocId(exam.id),
    title: String(exam.title || 'Đề thi không tên').slice(0, 300),
    subject: String(exam.subject || 'general').slice(0, 64),
    grade: String(exam.grade || 'Tổng hợp').slice(0, 64),
    durationMinutes: Number(exam.durationMinutes) || 45,
    description: String(exam.description || '').slice(0, 4000),
    instructions: exam.instructions ? String(exam.instructions).slice(0, 4000) : undefined,
    settings: exam.settings || {},
    parts: Array.isArray(exam.parts) ? exam.parts.slice(0, 30) : undefined,
    attachedFile: safeAttachedFile,
    questions: Array.isArray(exam.questions) ? exam.questions.slice(0, 300) : [],
    totalQuestions: Number(exam.totalQuestions ?? exam.questions?.length ?? 0),
    totalPoints: Number(exam.totalPoints ?? 10),
    isCustom: Boolean(exam.isCustom ?? true),
    visibility: exam.visibility || 'public',
    assignedClassId: exam.assignedClassId ? String(exam.assignedClassId).slice(0, 128) : undefined,
    assignedClassName: exam.assignedClassName
      ? String(exam.assignedClassName).slice(0, 200)
      : undefined,
    allowedEmails,
    status: exam.status || 'open',
    openTime: exam.openTime ? String(exam.openTime).slice(0, 64) : undefined,
    closeTime: exam.closeTime ? String(exam.closeTime).slice(0, 64) : undefined,
    modeType: exam.modeType || 'both',
    maxAttempts: exam.maxAttempts !== undefined ? Number(exam.maxAttempts) : undefined,
    maxTabSwitches: exam.maxTabSwitches !== undefined ? Number(exam.maxTabSwitches) : undefined,
    allowCopy: exam.allowCopy ?? true,
    showAnswersAfterExam: exam.showAnswersAfterExam ?? true,
    showOnlyStudentAnswersAfterExam: exam.showOnlyStudentAnswersAfterExam ?? false,
    showLiveScoreDuringExam: exam.showLiveScoreDuringExam ?? true,
    showScoreAfterExam: exam.showScoreAfterExam ?? true,
    examCode: exam.examCode ? String(exam.examCode).slice(0, 32) : undefined,
    randomQuestionCount:
      exam.randomQuestionCount !== undefined ? Number(exam.randomQuestionCount) : undefined,
    lockExitUntilTimeout: exam.lockExitUntilTimeout ?? false,
    minSubmitMinutes:
      exam.minSubmitMinutes !== undefined ? Number(exam.minSubmitMinutes) : undefined,
    requireAccessCode: exam.requireAccessCode ?? false,
    accessSecurityCode: exam.accessSecurityCode
      ? String(exam.accessSecurityCode).slice(0, 64)
      : undefined,
    accessMode: exam.accessMode || 'direct_and_code',
    teacherMode: exam.teacherMode || (exam.isCreatorOnlyMode ? 'creator' : 'normal'),
    isCreatorOnlyMode: Boolean(exam.isCreatorOnlyMode || exam.teacherMode === 'creator'),
    isOfficialClassExam: Boolean(exam.isOfficialClassExam),
    preExamLockMinutes:
      exam.preExamLockMinutes !== undefined ? Number(exam.preExamLockMinutes) : undefined,
    allowExitAfterSubmit: Boolean(exam.allowExitAfterSubmit),
    creatorId: sanitizeDocId(exam.creatorId || ownerUid),
    creatorUid: ownerUid,
    creatorEmail: (exam.creatorEmail || ownerEmail).trim().toLowerCase().slice(0, 180),
    creatorName: exam.creatorName ? String(exam.creatorName).slice(0, 150) : undefined,
    createdAtStr: (exam.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
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
    title: String(bundle.title || 'Tổ hợp thi').slice(0, 300),
    description: String(bundle.description || '').slice(0, 4000),
    bundleCode: bundle.bundleCode ? String(bundle.bundleCode).slice(0, 32) : undefined,
    breakMinutes: Number(bundle.breakMinutes ?? 5),
    intermissionMinutes:
      bundle.intermissionMinutes !== undefined ? Number(bundle.intermissionMinutes) : undefined,
    examIds: Array.isArray(bundle.examIds) ? bundle.examIds.slice(0, 50) : [],
    selectionMode: bundle.selectionMode || 'all_compulsory',
    timingMode: bundle.timingMode || 'compulsory_seq_elective_cluster_max',
    compulsoryExamIds: Array.isArray(bundle.compulsoryExamIds)
      ? bundle.compulsoryExamIds.slice(0, 30)
      : undefined,
    electiveGroups: Array.isArray(bundle.electiveGroups)
      ? bundle.electiveGroups.slice(0, 20)
      : undefined,
    minGroupsToSelect:
      bundle.minGroupsToSelect !== undefined ? Number(bundle.minGroupsToSelect) : undefined,
    maxGroupsToSelect:
      bundle.maxGroupsToSelect !== undefined ? Number(bundle.maxGroupsToSelect) : undefined,
    selectionTimeLimitSeconds:
      bundle.selectionTimeLimitSeconds !== undefined
        ? Number(bundle.selectionTimeLimitSeconds)
        : undefined,
    randomQuestionCountPerExam: bundle.randomQuestionCountPerExam || undefined,
    openTime: bundle.openTime ? String(bundle.openTime).slice(0, 64) : undefined,
    closeTime: bundle.closeTime ? String(bundle.closeTime).slice(0, 64) : undefined,
    status: bundle.status || 'open',
    maxAttempts: bundle.maxAttempts !== undefined ? Number(bundle.maxAttempts) : undefined,
    visibility: bundle.visibility || 'public',
    assignedClassId: bundle.assignedClassId
      ? String(bundle.assignedClassId).slice(0, 128)
      : undefined,
    assignedClassName: bundle.assignedClassName
      ? String(bundle.assignedClassName).slice(0, 200)
      : undefined,
    allowedEmails,
    accessMode: bundle.accessMode || 'direct_and_code',
    lockExitUntilTimeout: bundle.lockExitUntilTimeout ?? false,
    showScoreAfterExam: bundle.showScoreAfterExam ?? true,
    showAnswersAfterExam: bundle.showAnswersAfterExam ?? true,
    showOnlyStudentAnswersAfterExam: bundle.showOnlyStudentAnswersAfterExam ?? false,
    minSubmitMinutes:
      bundle.minSubmitMinutes !== undefined ? Number(bundle.minSubmitMinutes) : undefined,
    requireAccessCode: bundle.requireAccessCode ?? false,
    accessSecurityCode: bundle.accessSecurityCode
      ? String(bundle.accessSecurityCode).slice(0, 64)
      : undefined,
    allowCopy: bundle.allowCopy ?? true,
    maxTabSwitches:
      bundle.maxTabSwitches !== undefined ? Number(bundle.maxTabSwitches) : undefined,
    sections: Array.isArray(bundle.sections) ? bundle.sections.slice(0, 30) : undefined,
    isCustom: Boolean(bundle.isCustom ?? true),
    creatorId: sanitizeDocId(bundle.creatorId || ownerUid),
    creatorUid: ownerUid,
    creatorEmail: (bundle.creatorEmail || ownerEmail).trim().toLowerCase().slice(0, 180),
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

function toSafeCourseDoc(
  course: MicroCourse,
  ownerUid: string,
  ownerEmail: string,
  classrooms: Classroom[],
  isKnownUpdate: boolean
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

  return stripUndefined({
    id: sanitizeDocId(course.id),
    title: String(course.title || 'Khóa học').slice(0, 300),
    subject: String(course.subject || 'general').slice(0, 64),
    grade: String(course.grade || 'Lớp 12').slice(0, 64),
    description: String(course.description || '').slice(0, 4000),
    instructor: String(course.instructor || 'Giáo viên').slice(0, 150),
    chapters: Array.isArray(course.chapters) ? course.chapters.slice(0, 50) : [],
    lessons: Array.isArray(course.lessons) ? course.lessons.slice(0, 100) : [],
    finalExamId: course.finalExamId ? String(course.finalExamId).slice(0, 128) : undefined,
    finalExamTitle: course.finalExamTitle ? String(course.finalExamTitle).slice(0, 300) : undefined,
    status: course.status || 'open',
    openTime: course.openTime ? String(course.openTime).slice(0, 64) : undefined,
    closeTime: course.closeTime ? String(course.closeTime).slice(0, 64) : undefined,
    visibility: course.visibility || 'public',
    assignedClassId: course.assignedClassId
      ? String(course.assignedClassId).slice(0, 128)
      : undefined,
    assignedClassName: course.assignedClassName
      ? String(course.assignedClassName).slice(0, 200)
      : undefined,
    allowedEmails,
    creatorId: sanitizeDocId(course.creatorId || ownerUid),
    creatorUid: ownerUid,
    creatorEmail: (course.creatorEmail || ownerEmail).trim().toLowerCase().slice(0, 180),
    creatorName: course.creatorName ? String(course.creatorName).slice(0, 150) : undefined,
    isScormEnabled: course.isScormEnabled ?? true,
    scormVersion: course.scormVersion || '1.2',
    createdAtStr: (course.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreCourseDoc(d: any): MicroCourse {
  return {
    ...d,
    id: d.id,
    createdAt: d.createdAtStr || toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt, ''),
  } as MicroCourse;
}

function toSafeClassroomDoc(
  cls: Classroom,
  ownerUid: string,
  ownerEmail: string,
  isKnownUpdate: boolean
) {
  const teacherEmail = (cls.teacherEmail || ownerEmail).trim().toLowerCase();
  const safeStudents = (cls.students || []).slice(0, 300).map((s) => {
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
    name: String(cls.name || 'Lớp học').slice(0, 200),
    grade: String(cls.grade || '').slice(0, 64),
    code: sanitizeDocId(cls.code || 'CLASS').slice(0, 64),
    teacherId: sanitizeDocId(cls.teacherId || ownerUid),
    teacherUid: ownerUid,
    teacherName: String(cls.teacherName || 'Giáo viên').slice(0, 150),
    teacherEmail: teacherEmail.slice(0, 180),
    description: cls.description ? String(cls.description).slice(0, 2000) : undefined,
    students: safeStudents,
    memberEmails,
    pendingRequests: Array.isArray(cls.pendingRequests) ? cls.pendingRequests.slice(0, 200) : [],
    assignedExamIds: Array.isArray(cls.assignedExamIds) ? cls.assignedExamIds.slice(0, 200) : [],
    assignedCourseIds: Array.isArray(cls.assignedCourseIds)
      ? cls.assignedCourseIds.slice(0, 200)
      : [],
    createdAtStr: (cls.createdAt || new Date().toISOString().split('T')[0]).slice(0, 64),
    ...(isKnownUpdate ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  });
}

function fromFirestoreClassroomDoc(d: any, subRequests?: ClassJoinRequest[]): Classroom {
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
  const cleanStudents = Array.isArray(d.students)
    ? d.students.map((s: any) => {
        if (!s || typeof s !== 'object') return s;
        const copy = { ...s };
        delete copy.password;
        delete copy.username;
        return copy;
      })
    : [];
  return {
    ...d,
    id: d.id,
    students: cleanStudents,
    pendingRequests: Array.from(pendingMap.values()),
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
  isKnownUpdate: boolean
) {
  const exam = exams.find((e) => e.id === r.examId);
  const cls = r.classId ? classrooms.find((c) => c.id === r.classId) : undefined;
  const teacherEmail = (cls?.teacherEmail || exam?.creatorEmail || '').trim().toLowerCase();

  return stripUndefined({
    ...r,
    id: sanitizeDocId(r.id),
    examId: sanitizeDocId(r.examId),
    examTitle: String(r.examTitle || 'Bài thi').slice(0, 300),
    studentUid: ownerUid,
    userId: r.userId || ownerUid,
    userEmail: (r.userEmail || ownerEmail).trim().toLowerCase().slice(0, 180),
    teacherEmail: teacherEmail ? teacherEmail.slice(0, 180) : undefined,
    completedAt: String(r.completedAt || new Date().toISOString()).slice(0, 64),
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
    studentId: sanitizeDocId(p.studentId),
    studentUid: ownerUid,
    studentEmail: ownerEmail.slice(0, 180),
    teacherEmail: course?.creatorEmail
      ? course.creatorEmail.trim().toLowerCase().slice(0, 180)
      : undefined,
    completedLessonIds: Array.isArray(p.completedLessonIds)
      ? p.completedLessonIds.slice(0, 300)
      : [],
    completedBlockIds: Array.isArray(p.completedBlockIds)
      ? p.completedBlockIds.slice(0, 1000)
      : [],
    currentChapterId: p.currentChapterId || undefined,
    currentLessonId: p.currentLessonId || undefined,
    currentBlockIdsByLesson: p.currentBlockIdsByLesson || {},
    interactiveAnswers: p.interactiveAnswers || {},
    completedExamIds: Array.isArray(p.completedExamIds) ? p.completedExamIds.slice(0, 100) : [],
    scormData: p.scormData || undefined,
    lastStudiedAt: String(p.lastStudiedAt || new Date().toISOString()).slice(0, 64),
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
  const teacherEmail = (cls?.teacherEmail || ownerEmail).trim().toLowerCase();
  const allowedEmails = normalizeEmailList([
    ownerEmail,
    teacherEmail,
    ...(cls?.students || []).map((s) => s.email),
  ]);

  return stripUndefined({
    id: sanitizeDocId(hw.id),
    classId: sanitizeDocId(hw.classId),
    title: String(hw.title || 'Bài tập về nhà').slice(0, 300),
    instructions: hw.instructions ? String(hw.instructions).slice(0, 20000) : undefined,
    attachments: Array.isArray(hw.attachments) ? hw.attachments.slice(0, 15) : undefined,
    openTime: hw.openTime ? String(hw.openTime).slice(0, 64) : undefined,
    closeTime: hw.closeTime ? String(hw.closeTime).slice(0, 64) : undefined,
    maxScore: hw.maxScore !== undefined ? Number(hw.maxScore) : 10,
    createdBy: hw.createdBy ? String(hw.createdBy).slice(0, 150) : undefined,
    teacherUid: ownerUid,
    teacherEmail: teacherEmail.slice(0, 180),
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
  isKnownUpdate: boolean
) {
  const cls = sub.classId ? classrooms.find((c) => c.id === sub.classId) : undefined;
  const course = sub.courseId ? courses.find((c) => c.id === sub.courseId) : undefined;
  const teacherEmail = (cls?.teacherEmail || course?.creatorEmail || '').trim().toLowerCase();

  return stripUndefined({
    id: sanitizeDocId(sub.id),
    classId: sub.classId ? sanitizeDocId(sub.classId) : undefined,
    homeworkId: sub.homeworkId ? sanitizeDocId(sub.homeworkId) : undefined,
    homeworkTitle: sub.homeworkTitle ? String(sub.homeworkTitle).slice(0, 300) : undefined,
    courseId: sub.courseId ? sanitizeDocId(sub.courseId) : undefined,
    courseTitle: sub.courseTitle ? String(sub.courseTitle).slice(0, 300) : undefined,
    lessonId: sub.lessonId ? sanitizeDocId(sub.lessonId) : undefined,
    lessonTitle: sub.lessonTitle ? String(sub.lessonTitle).slice(0, 300) : undefined,
    studentUid: ownerUid,
    studentId: sanitizeDocId(sub.studentId || ownerUid),
    studentName: String(sub.studentName || 'Học sinh').slice(0, 150),
    studentEmail: (sub.studentEmail || ownerEmail).trim().toLowerCase().slice(0, 180),
    studentCode: sub.studentCode ? String(sub.studentCode).slice(0, 60) : undefined,
    teacherEmail: teacherEmail ? teacherEmail.slice(0, 180) : undefined,
    imageUrls: Array.isArray(sub.imageUrls) ? sub.imageUrls.slice(0, 12) : [],
    attachments: Array.isArray(sub.attachments) ? sub.attachments.slice(0, 12) : undefined,
    textAnswer: sub.textAnswer ? String(sub.textAnswer).slice(0, 50000) : undefined,
    note: sub.note ? String(sub.note).slice(0, 2000) : undefined,
    submittedAt: String(sub.submittedAt || new Date().toISOString()).slice(0, 64),
    score: sub.score !== undefined ? Number(sub.score) : undefined,
    maxScore: sub.maxScore !== undefined ? Number(sub.maxScore) : undefined,
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
    title: String(sb.title || 'Bảng điểm vinh danh').slice(0, 300),
    description: sb.description ? String(sb.description).slice(0, 2000) : undefined,
    mode: sb.mode || 'group',
    topN: sb.topN !== undefined ? Number(sb.topN) : undefined,
    specialMode: sb.specialMode || 'normal',
    classId: sb.classId ? String(sb.classId).slice(0, 128) : undefined,
    className: sb.className ? String(sb.className).slice(0, 200) : undefined,
    rounds: Array.isArray(sb.rounds) ? sb.rounds.slice(0, 50) : [],
    participants: Array.isArray(sb.participants) ? sb.participants.slice(0, 500) : [],
    creatorId: sanitizeDocId(sb.creatorId || ownerUid),
    creatorUid: ownerUid,
    creatorEmail: (sb.creatorEmail || ownerEmail).trim().toLowerCase().slice(0, 180),
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
// BATCHED FIRESTORE WRITES (< 0.3s atomic batch commits)
// =========================================================================

interface BatchWriteOp {
  ref: DocumentReference;
  data: Record<string, any>;
  docKey: string;
}

async function commitBatchOperations(ops: BatchWriteOp[]): Promise<void> {
  if (ops.length === 0) return;
  const CHUNK_SIZE = 400; // Safe margin under Firestore's 500 write limit per batch
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
    for (const op of chunk) {
      const [col, id] = op.docKey.split('/');
      markCloudDocKnown(col, id);
    }
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
  isDeltaSync?: boolean;
  pulledAtMs?: number;
}

export async function safeDeleteFirestoreDoc(col: string, id: string): Promise<void> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) return;
  const cleanId = sanitizeDocId(id);
  try {
    await deleteDoc(doc(db, col, cleanId));
    knownCloudDocIds.delete(`${col}/${cleanId}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${col}/${cleanId}`);
  }
}

export async function pullPublicDataFromFirestore(): Promise<FirestoreSyncSnapshot> {
  const out: FirestoreSyncSnapshot = {};

  const [examSnap, bundleSnap, courseSnap, subjSnap, navSnap, liveSnap, tombSnap] =
    await Promise.all([
      getDocs(
        query(collection(db, 'exams'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only']))
      ).catch(() => null),
      getDocs(
        query(collection(db, 'bundles'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only']))
      ).catch(() => null),
      getDocs(query(collection(db, 'courses'), where('visibility', '==', 'public'))).catch(
        () => null
      ),
      getDocFromServer(doc(db, 'siteConfig', 'subjects')).catch(() => null),
      getDocFromServer(doc(db, 'siteConfig', 'navTabs')).catch(() => null),
      getDocFromServer(doc(db, 'siteConfig', 'liveText')).catch(() => null),
      getDocFromServer(doc(db, 'siteConfig', 'tombstones')).catch(() => null),
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

  if (subjSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'subjects');
    if (Array.isArray(subjSnap.data().items)) out.subjects = subjSnap.data().items;
  }
  if (navSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'navTabs');
    if (Array.isArray(navSnap.data().items)) {
      out.navTabs = navSnap.data().items;
      if (navSnap.data().updatedAt) {
        out.navTabsUpdatedAt = toIsoString(navSnap.data().updatedAt, '');
      }
    }
  }
  if (liveSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'liveText');
    if (liveSnap.data().overrides) {
      out.liveTextOverrides = liveSnap.data().overrides;
      if (liveSnap.data().updatedAt) {
        out.liveTextUpdatedAt = toIsoString(liveSnap.data().updatedAt, '');
      }
    }
  }
  if (tombSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'tombstones');
    const t = tombSnap.data();
    out.deletedExamIds = t.deletedExamIds || [];
    out.deletedBundleIds = t.deletedBundleIds || [];
    out.deletedClassroomIds = t.deletedClassroomIds || [];
    out.deletedCourseIds = t.deletedCourseIds || [];
    out.deletedUserIds = t.deletedUserIds || [];
    out.deletedResultIds = t.deletedResultIds || [];
    out.deletedHomeworkIds = t.deletedHomeworkIds || [];
    out.deletedClassroomHomeworkIds = t.deletedClassroomHomeworkIds || [];
    out.deletedSubjectIds = t.deletedSubjectIds || [];
    out.deletedScoreboardIds = t.deletedScoreboardIds || [];
  }

  return out;
}

/**
 * Pull collections with single-field Delta Sync (`where('updatedAt', '>', sinceTs)`)
 * whenever `sinceMs > 0` and `!forceFull`. Falls back safely if needed.
 */
async function queryCollectionDeltaSafe(
  colName: string,
  sinceTs: Timestamp | null
) {
  const baseRef = collection(db, colName);
  if (sinceTs) {
    try {
      const q: Query = query(baseRef, where('updatedAt', '>', sinceTs));
      return await getDocs(q);
    } catch {
      return await getDocs(baseRef).catch(() => null);
    }
  }
  return await getDocs(baseRef).catch(() => null);
}

export async function pullAuthenticatedDataFromFirestore(
  activeWebUser?: UserAccount | null,
  options?: { forceFull?: boolean; sinceMs?: number }
): Promise<FirestoreSyncSnapshot> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    return await pullPublicDataFromFirestore();
  }

  const nowMs = Date.now();
  const effectiveSinceMs = options?.forceFull
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

  // Always check lightweight siteConfig tombstones/settings directly
  const [subjSnap, navSnap, liveSnap, tombSnap] = await Promise.all([
    getDoc(doc(db, 'siteConfig', 'subjects')).catch(() => null),
    getDoc(doc(db, 'siteConfig', 'navTabs')).catch(() => null),
    getDoc(doc(db, 'siteConfig', 'liveText')).catch(() => null),
    getDoc(doc(db, 'siteConfig', 'tombstones')).catch(() => null),
  ]);

  if (subjSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'subjects');
    if (Array.isArray(subjSnap.data().items)) out.subjects = subjSnap.data().items;
  }
  if (navSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'navTabs');
    if (Array.isArray(navSnap.data().items)) {
      out.navTabs = navSnap.data().items;
      if (navSnap.data().updatedAt) out.navTabsUpdatedAt = toIsoString(navSnap.data().updatedAt, '');
    }
  }
  if (liveSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'liveText');
    if (liveSnap.data().overrides) {
      out.liveTextOverrides = liveSnap.data().overrides;
      if (liveSnap.data().updatedAt) {
        out.liveTextUpdatedAt = toIsoString(liveSnap.data().updatedAt, '');
      }
    }
  }
  if (tombSnap?.exists()) {
    markCloudDocKnown('siteConfig', 'tombstones');
    const t = tombSnap.data();
    out.deletedExamIds = t.deletedExamIds || [];
    out.deletedBundleIds = t.deletedBundleIds || [];
    out.deletedClassroomIds = t.deletedClassroomIds || [];
    out.deletedCourseIds = t.deletedCourseIds || [];
    out.deletedUserIds = t.deletedUserIds || [];
    out.deletedResultIds = t.deletedResultIds || [];
    out.deletedHomeworkIds = t.deletedHomeworkIds || [];
    out.deletedClassroomHomeworkIds = t.deletedClassroomHomeworkIds || [];
    out.deletedSubjectIds = t.deletedSubjectIds || [];
    out.deletedScoreboardIds = t.deletedScoreboardIds || [];
  }

  // Parallel delta/full queries across all domain collections
  const [
    examsSnap,
    bundlesSnap,
    coursesSnap,
    classroomsSnap,
    resultsSnap,
    progressSnap,
    hwSnap,
    hwSubSnap,
    reqSnap,
    fbSnap,
    sbSnap,
    myJrSnap,
  ] = await Promise.all([
    queryCollectionDeltaSafe('exams', sinceTs),
    queryCollectionDeltaSafe('bundles', sinceTs),
    queryCollectionDeltaSafe('courses', sinceTs),
    queryCollectionDeltaSafe('classrooms', sinceTs),
    queryCollectionDeltaSafe('results', sinceTs),
    queryCollectionDeltaSafe('courseProgress', sinceTs),
    queryCollectionDeltaSafe('classroomHomeworks', sinceTs),
    queryCollectionDeltaSafe('homeworkSubmissions', sinceTs),
    queryCollectionDeltaSafe('teacherRequests', sinceTs),
    queryCollectionDeltaSafe('feedbacks', sinceTs),
    queryCollectionDeltaSafe('scoreboards', sinceTs),
    getDocs(query(collectionGroup(db, 'joinRequests'), where('studentUid', '==', fbUser.uid))).catch(
      () => null
    ),
  ]);

  if (!sinceTs) {
    await resolveOrCreateUnifiedUserProfile(fbUser, activeWebUser || undefined).catch(() => null);
  }

  if (examsSnap && !examsSnap.empty) {
    out.customExams = examsSnap.docs.map((d) => {
      markCloudDocKnown('exams', d.id);
      return fromFirestoreExamDoc(d.data());
    });
  }

  if (bundlesSnap && !bundlesSnap.empty) {
    out.customBundles = bundlesSnap.docs.map((d) => {
      markCloudDocKnown('bundles', d.id);
      return fromFirestoreBundleDoc(d.data());
    });
  }

  if (coursesSnap && !coursesSnap.empty) {
    out.courses = coursesSnap.docs.map((d) => {
      markCloudDocKnown('courses', d.id);
      return fromFirestoreCourseDoc(d.data());
    });
  }

  if (classroomsSnap && !classroomsSnap.empty) {
    const clsList: Classroom[] = [];
    await Promise.all(
      classroomsSnap.docs.map(async (d) => {
        markCloudDocKnown('classrooms', d.id);
        let subRequests: ClassJoinRequest[] = [];
        try {
          const jrSnap = await getDocs(collection(db, 'classrooms', d.id, 'joinRequests'));
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
        clsList.push(fromFirestoreClassroomDoc(d.data(), subRequests));
      })
    );
    out.classrooms = clsList;
  }

  if (resultsSnap && !resultsSnap.empty) {
    out.results = resultsSnap.docs.map((d) => {
      markCloudDocKnown('results', d.id);
      return fromFirestoreResultDoc(d.data());
    });
  }

  if (progressSnap && !progressSnap.empty) {
    const progressMap: { [key: string]: StudentCourseProgress } = {};
    progressSnap.docs.forEach((d) => {
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

  if (hwSnap && !hwSnap.empty) {
    out.classroomHomeworks = hwSnap.docs.map((d) => {
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

  if (hwSubSnap && !hwSubSnap.empty) {
    out.homeworkSubmissions = hwSubSnap.docs.map((d) => {
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
): Promise<{ alreadyPending?: boolean; requestId: string }> {
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

  // Check on server whether a pending request already exists to block duplicate spam
  let isKnown = knownCloudDocIds.has(docKey);
  try {
    const existingSnap = await getDocFromServer(docRef).catch(() => getDoc(docRef));
    if (existingSnap.exists()) {
      isKnown = true;
      knownCloudDocIds.add(docKey);
      if (existingSnap.data()?.status === 'pending') {
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
    await setDoc(
      docRef,
      {
        status,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `classrooms/${cleanClassId}/joinRequests/${cleanReqId}`
    );
  }
}

// =========================================================================
// AUTHORIZED WRITEBATCH CLOUD PUSH (< 0.3s)
// =========================================================================

export async function pushAuthorizedDataToFirestore(
  payload: any,
  currentUser: UserAccount | null,
  options?: { lastLocalMutationMs?: number }
): Promise<{ ok: boolean; error?: string }> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    return { ok: false, error: 'Chưa xác thực phiên Firebase Authentication.' };
  }

  const effectiveUid = fbUser.uid;
  const userEmails = resolveUserAccessEmails(currentUser);
  const primaryEmail = userEmails[0] || '';
  const isAdmin =
    primaryEmail === MASTER_ADMIN_EMAIL_LOWER ||
    Boolean(currentUser?.isMasterAdmin);
  const isTeacher = isAdmin || currentUser?.role === 'teacher';
  const minTsMs = options?.lastLocalMutationMs ? options.lastLocalMutationMs - 60000 : 0;

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

  const deletedExamSet = new Set<string>(payload.deletedExamIds || []);
  const deletedBundleSet = new Set<string>(payload.deletedBundleIds || []);
  const deletedClassroomSet = new Set<string>(payload.deletedClassroomIds || []);
  const deletedCourseSet = new Set<string>(payload.deletedCourseIds || []);
  const deletedResultSet = new Set<string>(payload.deletedResultIds || []);
  const deletedHomeworkSet = new Set<string>(payload.deletedHomeworkIds || []);
  const deletedClassroomHwSet = new Set<string>(payload.deletedClassroomHomeworkIds || []);
  const deletedScoreboardSet = new Set<string>(payload.deletedScoreboardIds || []);

  const allClassrooms: Classroom[] = payload.classrooms || [];
  const allExams: Exam[] = payload.customExams || [];
  const allCourses: MicroCourse[] = payload.courses || [];

  const ops: BatchWriteOp[] = [];
  const deletePromises: Promise<void>[] = [];

  try {
    // 1. Tombstones & Site Config (write lightweight settings & tombstones)
    const tombPayload = stripUndefined({
      id: 'tombstones',
      deletedExamIds: (payload.deletedExamIds || []).slice(-500),
      deletedBundleIds: (payload.deletedBundleIds || []).slice(-500),
      deletedClassroomIds: (payload.deletedClassroomIds || []).slice(-500),
      deletedCourseIds: (payload.deletedCourseIds || []).slice(-500),
      deletedUserIds: (payload.deletedUserIds || []).slice(-500),
      deletedResultIds: (payload.deletedResultIds || []).slice(-500),
      deletedHomeworkIds: (payload.deletedHomeworkIds || []).slice(-500),
      deletedClassroomHomeworkIds: (payload.deletedClassroomHomeworkIds || []).slice(-500),
      deletedSubjectIds: (payload.deletedSubjectIds || []).slice(-500),
      deletedScoreboardIds: (payload.deletedScoreboardIds || []).slice(-500),
      updatedById: effectiveUid,
      ...(knownCloudDocIds.has('siteConfig/tombstones')
        ? {}
        : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });
    ops.push({
      ref: doc(db, 'siteConfig', 'tombstones'),
      data: tombPayload,
      docKey: 'siteConfig/tombstones',
    });

    if (Array.isArray(payload.subjects) && isTeacher) {
      ops.push({
        ref: doc(db, 'siteConfig', 'subjects'),
        data: stripUndefined({
          id: 'subjects',
          items: payload.subjects.slice(0, 100),
          updatedById: effectiveUid,
          ...(knownCloudDocIds.has('siteConfig/subjects')
            ? {}
            : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        }),
        docKey: 'siteConfig/subjects',
      });
    }

    if (isAdmin && Array.isArray(payload.navTabs)) {
      ops.push({
        ref: doc(db, 'siteConfig', 'navTabs'),
        data: stripUndefined({
          id: 'navTabs',
          items: payload.navTabs.slice(0, 50),
          updatedById: effectiveUid,
          ...(knownCloudDocIds.has('siteConfig/navTabs')
            ? {}
            : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        }),
        docKey: 'siteConfig/navTabs',
      });
    }

    if (
      isAdmin &&
      payload.liveTextOverrides &&
      typeof payload.liveTextOverrides === 'object'
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
    }

    // 2. Own user profile only (lightweight <1KB under users/{uid}; account directory stays on backend)
    if (currentUser) {
      const myProfile = { ...currentUser, id: effectiveUid, uid: effectiveUid };
      const isKnownSelf = knownCloudDocIds.has(`users/${effectiveUid}`);
      ops.push({
        ref: doc(db, 'users', effectiveUid),
        data: toSafeUserDoc(myProfile, effectiveUid, isKnownSelf),
        docKey: `users/${effectiveUid}`,
      });
    }

    // Helper deciding whether an owned item should be included in this batch
    const shouldSyncItem = (docKey: string, updatedAt?: string): boolean => {
      if (!knownCloudDocIds.has(docKey)) return true; // Local data not yet on cloud -> ALWAYS push!
      if (minTsMs <= 0) return true;
      const ms = toTimestampMs(updatedAt);
      return ms === 0 || ms >= minTsMs;
    };

    // 3. Exams
    if (isTeacher) {
      for (const ex of allExams) {
        if (!ex.id || deletedExamSet.has(ex.id)) continue;
        if (!isOwnedOrCreator(ex.creatorEmail, ex.creatorId)) continue;
        const cleanId = sanitizeDocId(ex.id);
        const key = `exams/${cleanId}`;
        if (!shouldSyncItem(key, ex.updatedAt)) continue;
        ops.push({
          ref: doc(db, 'exams', cleanId),
          data: toSafeExamDoc(ex, effectiveUid, primaryEmail, allClassrooms, knownCloudDocIds.has(key)),
          docKey: key,
        });
      }
      for (const delId of deletedExamSet) {
        if (knownCloudDocIds.has(`exams/${sanitizeDocId(delId)}`)) {
          deletePromises.push(safeDeleteFirestoreDoc('exams', delId));
        }
      }
    }

    // 4. Bundles
    if (isTeacher) {
      for (const b of (payload.customBundles || []) as ExamBundle[]) {
        if (!b.id || deletedBundleSet.has(b.id)) continue;
        if (!isOwnedOrCreator(b.creatorEmail, b.creatorId)) continue;
        const cleanId = sanitizeDocId(b.id);
        const key = `bundles/${cleanId}`;
        if (!shouldSyncItem(key, b.updatedAt)) continue;
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
      for (const delId of deletedBundleSet) {
        if (knownCloudDocIds.has(`bundles/${sanitizeDocId(delId)}`)) {
          deletePromises.push(safeDeleteFirestoreDoc('bundles', delId));
        }
      }
    }

    // 5. Courses
    if (isTeacher) {
      for (const c of allCourses) {
        if (!c.id || deletedCourseSet.has(c.id)) continue;
        if (!isOwnedOrCreator(c.creatorEmail, c.creatorId)) continue;
        const cleanId = sanitizeDocId(c.id);
        const key = `courses/${cleanId}`;
        if (!shouldSyncItem(key, c.updatedAt)) continue;
        ops.push({
          ref: doc(db, 'courses', cleanId),
          data: toSafeCourseDoc(
            c,
            effectiveUid,
            primaryEmail,
            allClassrooms,
            knownCloudDocIds.has(key)
          ),
          docKey: key,
        });
      }
      for (const delId of deletedCourseSet) {
        if (knownCloudDocIds.has(`courses/${sanitizeDocId(delId)}`)) {
          deletePromises.push(safeDeleteFirestoreDoc('courses', delId));
        }
      }
    }

    // 6. Classrooms + classroomCodes/{code} atomically in the same WriteBatch
    if (isTeacher) {
      for (const cls of allClassrooms) {
        if (!cls.id || deletedClassroomSet.has(cls.id)) continue;
        if (!isOwnedOrCreator(cls.teacherEmail, cls.teacherId)) continue;
        const cleanId = sanitizeDocId(cls.id);
        const key = `classrooms/${cleanId}`;
        const cleanCode = sanitizeDocId(String(cls.code || '').trim().toUpperCase());
        const codeKey = `classroomCodes/${cleanCode}`;
        if (!shouldSyncItem(key, cls.updatedAt) && knownCloudDocIds.has(codeKey)) continue;

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
              className: String(cls.name || 'Lớp học').slice(0, 200),
              teacherUid: effectiveUid,
              teacherEmail: (cls.teacherEmail || primaryEmail).trim().toLowerCase().slice(0, 180),
              teacherName: String(cls.teacherName || 'Giáo viên').slice(0, 150),
              ...(knownCloudDocIds.has(codeKey) ? {} : { createdAt: serverTimestamp() }),
              updatedAt: serverTimestamp(),
            }),
            docKey: codeKey,
          });
        }
      }
      for (const delId of deletedClassroomSet) {
        if (knownCloudDocIds.has(`classrooms/${sanitizeDocId(delId)}`)) {
          deletePromises.push(safeDeleteFirestoreDoc('classrooms', delId));
        }
      }
    }

    // 7. Results
    for (const r of (payload.results || []) as ExamResult[]) {
      if (!r.id || deletedResultSet.has(r.id)) continue;
      const re = (r.userEmail || '').trim().toLowerCase();
      const isMine =
        (re && userEmails.includes(re)) || (r.userId && ownerIdsSet.has(r.userId)) || isAdmin;
      if (!isMine) continue;
      const cleanId = sanitizeDocId(r.id);
      const key = `results/${cleanId}`;
      if (!shouldSyncItem(key, r.updatedAt || r.completedAt)) continue;
      ops.push({
        ref: doc(db, 'results', cleanId),
        data: toSafeResultDoc(
          r,
          effectiveUid,
          primaryEmail,
          allExams,
          allClassrooms,
          knownCloudDocIds.has(key)
        ),
        docKey: key,
      });
    }
    for (const delId of deletedResultSet) {
      if (knownCloudDocIds.has(`results/${sanitizeDocId(delId)}`)) {
        deletePromises.push(safeDeleteFirestoreDoc('results', delId));
      }
    }

    // 8. Course progress
    const progressEntries = Object.entries<StudentCourseProgress>(payload.courseProgress || {});
    for (const [key, prog] of progressEntries) {
      if (!prog || !prog.courseId) continue;
      if (!ownerIdsSet.has(prog.studentId) && !isAdmin) continue;
      const cleanId = sanitizeDocId(key);
      const docKey = `courseProgress/${cleanId}`;
      if (!shouldSyncItem(docKey, prog.lastStudiedAt)) continue;
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
        if (!shouldSyncItem(key, hw.updatedAt)) continue;
        ops.push({
          ref: doc(db, 'classroomHomeworks', cleanId),
          data: toSafeClassroomHomeworkDoc(
            hw,
            effectiveUid,
            primaryEmail,
            allClassrooms,
            knownCloudDocIds.has(key)
          ),
          docKey: key,
        });
      }
      for (const delId of deletedClassroomHwSet) {
        if (knownCloudDocIds.has(`classroomHomeworks/${sanitizeDocId(delId)}`)) {
          deletePromises.push(safeDeleteFirestoreDoc('classroomHomeworks', delId));
        }
      }
    }

    // 10. Homework Submissions
    for (const sub of (payload.homeworkSubmissions || []) as HomeworkSubmission[]) {
      if (!sub.id || deletedHomeworkSet.has(sub.id)) continue;
      const se = (sub.studentEmail || '').trim().toLowerCase();
      const parentCls = sub.classId ? allClassrooms.find((c) => c.id === sub.classId) : undefined;
      const isStudentOwner =
        (se && userEmails.includes(se)) || ownerIdsSet.has(sub.studentId);
      const isClassTeacher = Boolean(
        parentCls && isOwnedOrCreator(parentCls.teacherEmail, parentCls.teacherId)
      );
      if (!isStudentOwner && !isClassTeacher && !isAdmin) continue;
      const cleanId = sanitizeDocId(sub.id);
      const key = `homeworkSubmissions/${cleanId}`;
      if (!shouldSyncItem(key, sub.updatedAt || sub.gradedAt || sub.submittedAt)) continue;
      ops.push({
        ref: doc(db, 'homeworkSubmissions', cleanId),
        data: toSafeHomeworkSubmissionDoc(
          sub,
          effectiveUid,
          primaryEmail,
          allClassrooms,
          allCourses,
          knownCloudDocIds.has(key)
        ),
        docKey: key,
      });
    }
    for (const delId of deletedHomeworkSet) {
      if (knownCloudDocIds.has(`homeworkSubmissions/${sanitizeDocId(delId)}`)) {
        deletePromises.push(safeDeleteFirestoreDoc('homeworkSubmissions', delId));
      }
    }

    // 11. Teacher Role Requests
    for (const req of (payload.teacherRequests || []) as TeacherRoleRequest[]) {
      if (!req.id) continue;
      const re = (req.userEmail || '').trim().toLowerCase();
      const isMine = (re && userEmails.includes(re)) || ownerIdsSet.has(req.userId);
      if (!isMine && !isAdmin) continue;
      const cleanId = sanitizeDocId(req.id);
      const key = `teacherRequests/${cleanId}`;
      if (!shouldSyncItem(key, req.updatedAt || req.reviewedAt)) continue;
      ops.push({
        ref: doc(db, 'teacherRequests', cleanId),
        data: stripUndefined({
          id: cleanId,
          userUid: ownerIdsSet.has(req.userId) ? effectiveUid : sanitizeDocId(req.userId),
          userId: sanitizeDocId(req.userId),
          userEmail: (req.userEmail || primaryEmail).trim().toLowerCase().slice(0, 180),
          userName: String(req.userName || 'Người dùng').slice(0, 150),
          schoolName: req.schoolName ? String(req.schoolName).slice(0, 200) : undefined,
          subject: req.subject ? String(req.subject).slice(0, 100) : undefined,
          reason: req.reason ? String(req.reason).slice(0, 2000) : undefined,
          status: req.status || 'pending',
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
      if (!((fe && userEmails.includes(fe)) || isAdmin || !fb.email)) continue;
      const cleanId = sanitizeDocId(fb.id);
      const key = `feedbacks/${cleanId}`;
      if (!shouldSyncItem(key, fb.updatedAt || fb.createdAt)) continue;
      ops.push({
        ref: doc(db, 'feedbacks', cleanId),
        data: stripUndefined({
          id: cleanId,
          authorUid: effectiveUid,
          rating: Number(fb.rating || 5),
          category: fb.category || 'general',
          comments: String(fb.comments || '').slice(0, 4000),
          userName: fb.userName ? String(fb.userName).slice(0, 150) : undefined,
          userRole: fb.userRole || undefined,
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
        if (!shouldSyncItem(key, sb.updatedAt || sb.createdAt)) continue;
        ops.push({
          ref: doc(db, 'scoreboards', cleanId),
          data: toSafeScoreboardDoc(sb, effectiveUid, primaryEmail, knownCloudDocIds.has(key)),
          docKey: key,
        });
      }
      for (const delId of deletedScoreboardSet) {
        if (knownCloudDocIds.has(`scoreboards/${sanitizeDocId(delId)}`)) {
          deletePromises.push(safeDeleteFirestoreDoc('scoreboards', delId));
        }
      }
    }

    // Execute atomic batch commits (< 0.3s) + parallel deletions
    await Promise.all([commitBatchOperations(ops), ...deletePromises]);

    return { ok: true };
  } catch (err: any) {
    console.error('[pushAuthorizedDataToFirestore] Error:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Đồng bộ tức thì 1 đề thi cụ thể lên Firestore (< 100ms, không qua hàng chờ batch/debounce)
 * Dùng khi Giáo viên bật/tắt chế độ "Người ra đề", lưu đề, hoặc thay đổi trạng thái phòng thi.
 */
export async function syncSingleExamToFirestoreNow(
  exam: Exam,
  classrooms: Classroom[],
  activeWebUser?: UserAccount | null
): Promise<void> {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser || !exam?.id) return;
  const primaryEmail = (fbUser.email || activeWebUser?.email || '').trim().toLowerCase();
  if (!primaryEmail) return;
  const cleanId = sanitizeDocId(exam.id);
  const key = `exams/${cleanId}`;
  try {
    const safeDoc = toSafeExamDoc(
      exam,
      fbUser.uid,
      primaryEmail,
      classrooms,
      knownCloudDocIds.has(key)
    );
    await setDoc(doc(db, 'exams', cleanId), safeDoc, { merge: true });
    markCloudDocKnown('exams', cleanId);
  } catch (err) {
    console.warn('[syncSingleExamToFirestoreNow] warning:', err);
  }
}

// =========================================================================
// REALTIME LISTENERS
// =========================================================================

export function attachPublicRealtimeFirestoreListeners(onCloudChanged: () => void): () => void {
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
    unsubs.push(
      onSnapshot(
        query(collection(db, 'exams'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only'])),
        () => triggerChanged('pub_exams'),
        () => {}
      ),
      onSnapshot(
        query(collection(db, 'bundles'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only'])),
        () => triggerChanged('pub_bundles'),
        () => {}
      ),
      onSnapshot(
        query(collection(db, 'courses'), where('visibility', '==', 'public')),
        () => triggerChanged('pub_courses'),
        () => {}
      ),
      onSnapshot(doc(db, 'siteConfig', 'tombstones'), () => triggerChanged('pub_tombstones'), () => {})
    );
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

export function attachRealtimeFirestoreListeners(
  activeWebUser: UserAccount | null,
  onCloudChanged: () => void
): () => void {
  const fbUser = getFirebaseAuthUser();
  if (!fbUser) {
    return attachPublicRealtimeFirestoreListeners(onCloudChanged);
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
    timer = setTimeout(() => {
      onCloudChanged();
    }, 50);
  };

  const watchCollections = [
    'exams',
    'bundles',
    'courses',
    'classrooms',
    'results',
    'classroomHomeworks',
    'homeworkSubmissions',
    'teacherRequests',
    'scoreboards',
  ];

  watchCollections.forEach((colName) => {
    try {
      const u = onSnapshot(
        collection(db, colName),
        () => triggerChanged(`col_${colName}`),
        () => {}
      );
      unsubs.push(u);
    } catch {}
  });

  try {
    unsubs.push(
      onSnapshot(doc(db, 'users', fbUser.uid), () => triggerChanged('doc_user'), () => {}),
      onSnapshot(doc(db, 'siteConfig', 'tombstones'), () => triggerChanged('doc_tombstones'), () => {}),
      onSnapshot(doc(db, 'siteConfig', 'navTabs'), () => triggerChanged('doc_navTabs'), () => {}),
      onSnapshot(doc(db, 'siteConfig', 'liveText'), () => triggerChanged('doc_liveText'), () => {})
    );
  } catch {}

  void activeWebUser;

  return () => {
    if (timer) clearTimeout(timer);
    unsubs.forEach((u) => {
      try {
        u();
      } catch {}
    });
  };
}
