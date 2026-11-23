import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mountainGameEngine } from './gameRoomsEngine';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDocFromServer,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import {
  initializeApp as initAdminApp,
  getApps as getAdminApps,
  getApp as getAdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Cloud Firestore (Client SDK for public reads) & Firebase Admin Auth (ID Token verification only - zero IAM required)
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
const fbApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const firestoreDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

const adminApp =
  getAdminApps().length > 0
    ? getAdminApp()
    : initAdminApp({ projectId: firebaseConfig.projectId });
const adminAuth = getAdminAuth(adminApp);

const DATA_DIR = path.resolve(__dirname, 'data');
const SYNC_FILE = path.join(DATA_DIR, 'edutest-cloud-sync.json');
const PRIVATE_ACCOUNTS_FILE = path.join(DATA_DIR, 'edutest-accounts-private.json');
const VAULT_KEY_FILE = path.join(DATA_DIR, '.vault.key');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MASTER_ADMIN_EMAIL = 'tranquangnhat418@gmail.com';
const MASTER_ADMIN_LEGACY_ID = 'usr_master_teacher';

interface BackendAccountRecord {
  id: string;
  uid?: string;
  legacyUserIds?: string[];
  email: string;
  username: string;
  fullName: string;
  name?: string;
  studentCode?: string;
  role: 'teacher' | 'student';
  isMasterAdmin?: boolean;
  avatar?: string;
  school?: string;
  schoolOrOrg?: string;
  isGoogleAuth?: boolean;
  passwordHash?: string;
  encryptedPassword?: string;
  pendingFirebaseActivation?: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface PrivateAccountsStore {
  accounts: BackendAccountRecord[];
  deletedUserIds: string[];
  updatedAt: string;
}

let cachedVaultKey: Buffer | null = null;
function getCredentialVaultKey(): Buffer {
  if (cachedVaultKey) return cachedVaultKey;
  const envSecret = (process.env.CREDENTIAL_VAULT_SECRET || '').trim();
  if (envSecret) {
    cachedVaultKey = crypto.scryptSync(envSecret, 'edutest-credential-vault-v1', 32);
    return cachedVaultKey;
  }
  try {
    if (fs.existsSync(VAULT_KEY_FILE)) {
      const hex = fs.readFileSync(VAULT_KEY_FILE, 'utf-8').trim();
      if (/^[0-9a-fA-F]{64}$/.test(hex)) {
        cachedVaultKey = Buffer.from(hex, 'hex');
        return cachedVaultKey;
      }
    }
  } catch {}
  const newKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(VAULT_KEY_FILE, newKey.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.warn('Could not persist vault key file:', err);
  }
  cachedVaultKey = newKey;
  return cachedVaultKey;
}

function encryptVaultPassword(rawPassword: string): string | undefined {
  if (!rawPassword || typeof rawPassword !== 'string') return undefined;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getCredentialVaultKey(), iv);
    const encrypted = Buffer.concat([cipher.update(rawPassword, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch {
    return undefined;
  }
}

function decryptVaultPassword(payload?: string): string | undefined {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('v1:')) return undefined;
  try {
    const parts = payload.split(':');
    if (parts.length !== 4) return undefined;
    const [, ivHex, tagHex, cipherHex] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getCredentialVaultKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return undefined;
  }
}

function hashPassword(rawPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(rawPassword, salt, 64).toString('hex');
  return `${salt}:${key}`;
}

function verifyPassword(rawPassword: string, storedHash: string): boolean {
  try {
    const parts = String(storedHash || '').split(':');
    if (parts.length !== 2) return false;
    const [salt, expectedHex] = parts;
    const derived = crypto.scryptSync(rawPassword, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function generateSecure8CharPassword(): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%^&*';
  const pool = uppers + lowers + digits + specials;

  const chars = [
    uppers[crypto.randomInt(uppers.length)],
    lowers[crypto.randomInt(lowers.length)],
    digits[crypto.randomInt(digits.length)],
    specials[crypto.randomInt(specials.length)],
  ];
  while (chars.length < 8) {
    chars.push(pool[crypto.randomInt(pool.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function sanitizePublicUserForClient(
  u: BackendAccountRecord,
  options?: { includeVisiblePassword?: boolean }
) {
  const decryptedPassword = options?.includeVisiblePassword
    ? decryptVaultPassword(u.encryptedPassword)
    : undefined;
  return {
    id: u.id,
    uid: u.uid,
    legacyUserIds: u.legacyUserIds,
    email: u.email,
    username: u.username,
    fullName: u.fullName,
    name: u.name || u.fullName,
    studentCode: u.studentCode,
    role: u.role,
    isMasterAdmin: Boolean(u.isMasterAdmin || u.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()),
    hasBackendPassword: Boolean(u.passwordHash || u.encryptedPassword),
    ...(options?.includeVisiblePassword && decryptedPassword ? { visiblePassword: decryptedPassword } : {}),
    avatar: u.avatar,
    school: u.school,
    schoolOrOrg: u.schoolOrOrg || u.school,
    isGoogleAuth: Boolean(u.isGoogleAuth),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function sanitizeClassroomObject(cls: any) {
  if (!cls || typeof cls !== 'object') return cls;
  const students = Array.isArray(cls.students)
    ? cls.students.map((s: any) => {
        if (!s || typeof s !== 'object') return s;
        const copy = { ...s };
        delete copy.password;
        delete copy.username;
        delete copy.passwordHash;
        return copy;
      })
    : [];
  return { ...cls, students };
}

function stripSensitiveSyncFields(data: any) {
  if (!data || typeof data !== 'object') return data;
  const clone = { ...data };
  delete clone.users;
  delete clone.deletedUserIds;
  if (Array.isArray(clone.classrooms)) {
    clone.classrooms = clone.classrooms.map(sanitizeClassroomObject);
  }
  return clone;
}

function readServerDataRaw() {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading sync file:', err);
  }
  return null;
}

function writeServerData(data: any) {
  try {
    const clean = stripSensitiveSyncFields(data);
    const tmpFile = SYNC_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(clean, null, 2), 'utf-8');
    fs.renameSync(tmpFile, SYNC_FILE);
    return true;
  } catch (err) {
    console.error('Error writing sync file:', err);
    return false;
  }
}

function readPrivateAccountsRaw(): PrivateAccountsStore | null {
  try {
    if (fs.existsSync(PRIVATE_ACCOUNTS_FILE)) {
      return JSON.parse(fs.readFileSync(PRIVATE_ACCOUNTS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading private accounts file:', err);
  }
  return null;
}

function writePrivateAccounts(store: PrivateAccountsStore): boolean {
  try {
    const tmpFile = PRIVATE_ACCOUNTS_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmpFile, PRIVATE_ACCOUNTS_FILE);
    return true;
  } catch (err) {
    console.error('Error writing private accounts file:', err);
    return false;
  }
}

function createDefaultMasterAdminRecord(): BackendAccountRecord {
  const initialMasterPwd = (process.env.MASTER_ADMIN_INITIAL_PASSWORD || '').trim();
  return {
    id: MASTER_ADMIN_LEGACY_ID,
    legacyUserIds: [MASTER_ADMIN_LEGACY_ID],
    email: MASTER_ADMIN_EMAIL,
    username: 'tranquangnhat418',
    fullName: 'Thầy Trần Quang Nhật (Admin Tối Cao)',
    name: 'Thầy Trần Quang Nhật (Admin Tối Cao)',
    role: 'teacher',
    isMasterAdmin: true,
    avatar: '',
    school: 'Trường THPT Chuyên',
    ...(initialMasterPwd
      ? {
          passwordHash: hashPassword(initialMasterPwd),
          encryptedPassword: encryptVaultPassword(initialMasterPwd),
          pendingFirebaseActivation: true,
        }
      : {}),
    createdAt: '2026-01-01',
    updatedAt: new Date().toISOString(),
  };
}

function getOrInitializePrivateAccounts(): PrivateAccountsStore {
  const existing = readPrivateAccountsRaw();
  if (existing && Array.isArray(existing.accounts)) {
    const hasMaster = existing.accounts.some(
      (a) => a.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()
    );
    if (!hasMaster) {
      existing.accounts.unshift(createDefaultMasterAdminRecord());
      writePrivateAccounts(existing);
    }
    return existing;
  }

  const initial: PrivateAccountsStore = {
    accounts: [createDefaultMasterAdminRecord()],
    deletedUserIds: [],
    updatedAt: new Date().toISOString(),
  };
  writePrivateAccounts(initial);
  return initial;
}

function getOrInitializeStorage() {
  const current = readServerDataRaw();
  if (current) {
    // One-time scrub & migration if legacy credentials are still present
    let needsResave = false;
    if (Array.isArray(current.users) && current.users.length > 0) {
      const priv = getOrInitializePrivateAccounts();
      const map = new Map<string, BackendAccountRecord>();
      for (const a of priv.accounts) {
        map.set(a.email.toLowerCase(), a);
      }
      for (const legacy of current.users) {
        if (!legacy || !legacy.email) continue;
        const lowerEmail = String(legacy.email).trim().toLowerCase();
        const isMaster = lowerEmail === MASTER_ADMIN_EMAIL.toLowerCase();
        const prev = map.get(lowerEmail);
        const migratedHash =
          typeof legacy.password === 'string' && legacy.password.trim()
            ? hashPassword(legacy.password.trim())
            : prev?.passwordHash;
        map.set(lowerEmail, {
          id: prev?.id || legacy.id || `usr_${Date.now()}`,
          uid: prev?.uid || legacy.uid,
          legacyUserIds: Array.from(
            new Set([
              ...(prev?.legacyUserIds || []),
              ...(legacy.legacyUserIds || []),
              ...(legacy.id ? [legacy.id] : []),
            ])
          ),
          email: lowerEmail,
          username: String(legacy.username || prev?.username || lowerEmail.split('@')[0])
            .trim()
            .toLowerCase(),
          fullName: String(legacy.fullName || prev?.fullName || lowerEmail.split('@')[0]),
          name: String(legacy.name || legacy.fullName || prev?.fullName || lowerEmail.split('@')[0]),
          studentCode: legacy.studentCode || prev?.studentCode,
          role: isMaster ? 'teacher' : legacy.role === 'teacher' || prev?.role === 'teacher' ? 'teacher' : 'student',
          isMasterAdmin: isMaster,
          avatar: legacy.avatar || prev?.avatar,
          school: legacy.school || prev?.school || 'Trường THPT',
          isGoogleAuth: Boolean(legacy.isGoogleAuth || prev?.isGoogleAuth),
          passwordHash: migratedHash,
          pendingFirebaseActivation: Boolean(prev?.pendingFirebaseActivation || migratedHash),
          createdAt: legacy.createdAt || prev?.createdAt || new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString(),
        });
      }
      priv.accounts = Array.from(map.values());
      if (Array.isArray(current.deletedUserIds)) {
        priv.deletedUserIds = Array.from(new Set([...priv.deletedUserIds, ...current.deletedUserIds]));
      }
      priv.updatedAt = new Date().toISOString();
      writePrivateAccounts(priv);
      needsResave = true;
    }

    if (
      current.users !== undefined ||
      current.deletedUserIds !== undefined ||
      (Array.isArray(current.classrooms) &&
        current.classrooms.some((c: any) =>
          Array.isArray(c?.students) && c.students.some((s: any) => s?.password !== undefined || s?.username !== undefined)
        ))
    ) {
      needsResave = true;
    }

    const cleaned = stripSensitiveSyncFields(current);
    if (needsResave) {
      writeServerData(cleaned);
    }
    return cleaned;
  }

  getOrInitializePrivateAccounts();
  const initial = {
    teacherRequests: [],
    customExams: [],
    customBundles: [],
    courses: [],
    classrooms: [],
    results: [],
    courseProgress: {},
    classroomHomeworks: [],
    homeworkSubmissions: [],
    scoreboards: [],
    subjects: [],
    navTabs: [],
    navTabsUpdatedAt: '',
    feedbacks: [],
    liveTextOverrides: {},
    liveTextUpdatedAt: '',
    deletedExamIds: [],
    deletedBundleIds: [],
    deletedClassroomIds: [],
    deletedCourseIds: [],
    deletedResultIds: [],
    deletedHomeworkIds: [],
    deletedClassroomHomeworkIds: [],
    deletedSubjectIds: [],
    deletedScoreboardIds: [],
    lastSyncedAt: new Date().toISOString(),
  };
  writeServerData(initial);
  return initial;
}

// Run startup initialization & scrubbing right away
getOrInitializeStorage();
getOrInitializePrivateAccounts();

// --- Auth & RBAC Helpers ---
interface VerifiedCaller {
  uid: string;
  email: string;
  name?: string;
  role: 'teacher' | 'student';
  isMasterAdmin: boolean;
  account: BackendAccountRecord | null;
}

interface AuthenticatedRequest extends Request {
  caller?: VerifiedCaller;
}

async function verifyBearerCaller(req: Request): Promise<VerifiedCaller | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    const uid = String(decoded.uid || '').trim();
    if (!uid) return null;

    const priv = getOrInitializePrivateAccounts();
    const matched =
      priv.accounts.find(
        (a) =>
          a.uid === uid ||
          a.id === uid ||
          (email && a.email.toLowerCase() === email)
      ) || null;

    const isMasterAdmin =
      email === MASTER_ADMIN_EMAIL.toLowerCase() || Boolean(matched?.isMasterAdmin);
    const role: 'teacher' | 'student' =
      isMasterAdmin || matched?.role === 'teacher' ? 'teacher' : 'student';

    return {
      uid,
      email,
      name: typeof decoded.name === 'string' ? decoded.name : matched?.fullName,
      role,
      isMasterAdmin,
      account: matched,
    };
  } catch {
    return null;
  }
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const caller = await verifyBearerCaller(req);
  if (!caller) {
    return res.status(401).json({ success: false, error: 'Chưa xác thực danh tính người dùng.' });
  }
  req.caller = caller;
  next();
}

async function requireMasterAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const caller = await verifyBearerCaller(req);
  if (!caller) {
    return res.status(401).json({ success: false, error: 'Chưa xác thực danh tính người dùng.' });
  }
  if (!caller.isMasterAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Chỉ Quản trị viên tối cao mới có quyền thực hiện thao tác này.',
    });
  }
  req.caller = caller;
  next();
}

// Rate limiter for unauthenticated identifier / login lookup endpoints
const authRateLimiterMap = new Map<string, number[]>();
function checkAuthRateLimit(req: Request, maxPerMinute = 25): boolean {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  const now = Date.now();
  const windowStart = now - 60_000;
  const timestamps = (authRateLimiterMap.get(ip) || []).filter((ts) => ts > windowStart);
  if (timestamps.length >= maxPerMinute) {
    return false;
  }
  timestamps.push(now);
  authRateLimiterMap.set(ip, timestamps);
  return true;
}

function getCallerIdentitySets(caller: VerifiedCaller | null) {
  const ids = new Set<string>();
  const emails = new Set<string>();
  let studentCode = '';
  if (caller) {
    ids.add(caller.uid);
    if (caller.account?.id) ids.add(caller.account.id);
    if (caller.account?.uid) ids.add(caller.account.uid);
    (caller.account?.legacyUserIds || []).forEach((x) => x && ids.add(x));
    if (caller.isMasterAdmin) ids.add(MASTER_ADMIN_LEGACY_ID);
    if (caller.email) emails.add(caller.email.toLowerCase());
    if (caller.account?.email) emails.add(caller.account.email.toLowerCase());
    studentCode = (caller.account?.studentCode || '').trim().toUpperCase();
  }
  return { ids, emails, studentCode };
}

function isCreatorOfItemServer(item: any, caller: VerifiedCaller | null): boolean {
  if (!item || !caller) return false;
  if (caller.isMasterAdmin) return true;
  const { ids, emails } = getCallerIdentitySets(caller);
  if (item.creatorId && ids.has(item.creatorId)) return true;
  if (item.creatorUid && ids.has(item.creatorUid)) return true;
  if (item.creatorEmail && emails.has(String(item.creatorEmail).trim().toLowerCase())) {
    return true;
  }
  return false;
}

function isCreatorRestrictedServer(item: any): boolean {
  if (!item) return false;
  return (
    item.teacherMode === 'creator' ||
    Boolean(item.isCreatorOnlyMode) ||
    item.visibility === 'private' ||
    item.status === 'draft'
  );
}

function isTeacherOfClassServer(cls: any, caller: VerifiedCaller | null): boolean {
  if (!cls || !caller) return false;
  if (caller.isMasterAdmin) return true;
  const { ids, emails } = getCallerIdentitySets(caller);
  if (cls.teacherUid && ids.has(cls.teacherUid)) return true;
  if (cls.teacherId && ids.has(cls.teacherId)) return true;
  if (cls.teacherEmail && emails.has(String(cls.teacherEmail).trim().toLowerCase())) {
    return true;
  }
  return false;
}

function isApprovedStudentInClassServer(cls: any, caller: VerifiedCaller | null): boolean {
  if (!cls || !caller) return false;
  const { ids, emails, studentCode } = getCallerIdentitySets(caller);
  const students = Array.isArray(cls.students) ? cls.students : [];
  return students.some(
    (s: any) =>
      (s?.id && ids.has(s.id)) ||
      (s?.email && emails.has(String(s.email).trim().toLowerCase())) ||
      (studentCode && s?.studentCode && String(s.studentCode).trim().toUpperCase() === studentCode)
  );
}

function canCallerViewItemServer(
  item: any,
  caller: VerifiedCaller | null,
  allClassrooms: any[]
): boolean {
  if (!item) return false;
  if (caller?.isMasterAdmin) return true;
  if (isCreatorOfItemServer(item, caller)) return true;

  // Creator / Private / Draft items are strictly hidden from everyone else
  if (isCreatorRestrictedServer(item)) return false;

  const vis = item.visibility || 'public';
  if (vis === 'class' || item.assignedClassId) {
    if (!caller) return false;
    const targetCls = allClassrooms.find((c) => c?.id === item.assignedClassId);
    if (!targetCls) return false;
    return (
      isTeacherOfClassServer(targetCls, caller) ||
      isApprovedStudentInClassServer(targetCls, caller)
    );
  }

  return vis === 'public' || vis === 'exam_only' || vis === 'bundle_only';
}

function sanitizeItemForCaller(item: any, caller: VerifiedCaller | null) {
  if (!item || typeof item !== 'object') return item;
  const copy: any = { ...item };
  delete copy.creatorUid;
  delete copy.allowedEmails;
  if (!caller || (!caller.isMasterAdmin && !isCreatorOfItemServer(item, caller))) {
    delete copy.accessSecurityCode;
  }
  return copy;
}

function filterSyncDataForCaller(store: any, caller: VerifiedCaller | null) {
  const allClassrooms = Array.isArray(store.classrooms)
    ? store.classrooms.map(sanitizeClassroomObject)
    : [];
  const { ids, emails, studentCode } = getCallerIdentitySets(caller);

  const visibleClassrooms = !caller
    ? []
    : caller.isMasterAdmin
    ? allClassrooms
    : allClassrooms.filter(
        (c: any) =>
          isTeacherOfClassServer(c, caller) || isApprovedStudentInClassServer(c, caller)
      );

  const visibleClassIdSet = new Set(visibleClassrooms.map((c: any) => c.id));
  const teacherClassIdSet = new Set(
    allClassrooms
      .filter((c: any) => isTeacherOfClassServer(c, caller))
      .map((c: any) => c.id)
  );

  const filterProtectedItems = (arr: any[]) =>
    (Array.isArray(arr) ? arr : [])
      .filter((item) => canCallerViewItemServer(item, caller, allClassrooms))
      .map((item) => sanitizeItemForCaller(item, caller));

  const isOwnResult = (r: any) => {
    if (!caller || !r) return false;
    if (r.userId && ids.has(r.userId)) return true;
    if (r.userEmail && emails.has(String(r.userEmail).trim().toLowerCase())) return true;
    if (studentCode && r.studentCode && String(r.studentCode).trim().toUpperCase() === studentCode) {
      return true;
    }
    return false;
  };

  const results = !caller
    ? []
    : caller.isMasterAdmin
    ? store.results || []
    : (Array.isArray(store.results) ? store.results : []).filter(
        (r: any) =>
          isOwnResult(r) ||
          (r.classId && teacherClassIdSet.has(r.classId))
      );

  const classroomHomeworks = !caller
    ? []
    : caller.isMasterAdmin
    ? store.classroomHomeworks || []
    : (Array.isArray(store.classroomHomeworks) ? store.classroomHomeworks : []).filter((hw: any) =>
        visibleClassIdSet.has(hw?.classId)
      );

  const homeworkSubmissions = !caller
    ? []
    : caller.isMasterAdmin
    ? store.homeworkSubmissions || []
    : (Array.isArray(store.homeworkSubmissions) ? store.homeworkSubmissions : []).filter((sub: any) => {
        if (sub.studentId && ids.has(sub.studentId)) return true;
        if (sub.studentEmail && emails.has(String(sub.studentEmail).trim().toLowerCase())) {
          return true;
        }
        if (sub.classId && teacherClassIdSet.has(sub.classId)) return true;
        return false;
      });

  const scoreboards =
    !caller || (!caller.isMasterAdmin && caller.role !== 'teacher')
      ? []
      : (Array.isArray(store.scoreboards) ? store.scoreboards : []).filter((sb: any) =>
          caller.isMasterAdmin ? true : isCreatorOfItemServer(sb, caller)
        );

  const teacherRequests = !caller
    ? []
    : caller.isMasterAdmin
    ? store.teacherRequests || []
    : (Array.isArray(store.teacherRequests) ? store.teacherRequests : []).filter(
        (r: any) =>
          (r.userId && ids.has(r.userId)) ||
          (r.userEmail && emails.has(String(r.userEmail).trim().toLowerCase()))
      );

  const courseProgress: Record<string, any> = {};
  if (caller && store.courseProgress && typeof store.courseProgress === 'object') {
    for (const [k, v] of Object.entries<any>(store.courseProgress)) {
      if (caller.isMasterAdmin || (v?.studentId && ids.has(v.studentId))) {
        courseProgress[k] = v;
      }
    }
  }

  const feedbacks = !caller
    ? []
    : caller.isMasterAdmin
    ? store.feedbacks || []
    : (Array.isArray(store.feedbacks) ? store.feedbacks : []).filter(
        (fb: any) => fb?.email && emails.has(String(fb.email).trim().toLowerCase())
      );

  return {
    teacherRequests,
    customExams: filterProtectedItems(store.customExams),
    customBundles: filterProtectedItems(store.customBundles),
    courses: filterProtectedItems(store.courses),
    classrooms: visibleClassrooms.map((c: any) => {
      if (caller?.isMasterAdmin || isTeacherOfClassServer(c, caller)) {
        return c;
      }
      // Hide pending join requests of other students from fellow students
      return {
        ...c,
        pendingRequests: (c.pendingRequests || []).filter(
          (r: any) =>
            (r.studentId && ids.has(r.studentId)) ||
            (r.studentEmail && emails.has(String(r.studentEmail).trim().toLowerCase()))
        ),
      };
    }),
    results,
    courseProgress,
    classroomHomeworks,
    homeworkSubmissions,
    scoreboards,
    subjects: store.subjects || [],
    navTabs: store.navTabs || [],
    navTabsUpdatedAt: store.navTabsUpdatedAt || '',
    feedbacks,
    liveTextOverrides: store.liveTextOverrides || {},
    liveTextUpdatedAt: store.liveTextUpdatedAt || '',
    deletedExamIds: store.deletedExamIds || [],
    deletedBundleIds: store.deletedBundleIds || [],
    deletedClassroomIds: store.deletedClassroomIds || [],
    deletedCourseIds: store.deletedCourseIds || [],
    deletedResultIds: store.deletedResultIds || [],
    deletedHomeworkIds: store.deletedHomeworkIds || [],
    deletedClassroomHomeworkIds: store.deletedClassroomHomeworkIds || [],
    deletedSubjectIds: store.deletedSubjectIds || [],
    deletedScoreboardIds: store.deletedScoreboardIds || [],
    lastSyncedAt: store.lastSyncedAt || new Date().toISOString(),
  };
}

function fsToIso(val: any, fallback = new Date().toISOString()): string {
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  return fallback;
}

async function fsPullPublicSnapshot(): Promise<any> {
  const out: any = {};
  const [examSnap, bundleSnap, courseSnap, subjSnap, navSnap, liveSnap, tombSnap] = await Promise.all([
    getDocs(query(collection(firestoreDb, 'exams'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only']))).catch(() => null),
    getDocs(query(collection(firestoreDb, 'bundles'), where('visibility', 'in', ['public', 'bundle_only', 'exam_only']))).catch(() => null),
    getDocs(query(collection(firestoreDb, 'courses'), where('visibility', '==', 'public'))).catch(() => null),
    getDocFromServer(doc(firestoreDb, 'siteConfig', 'subjects')).catch(() => null),
    getDocFromServer(doc(firestoreDb, 'siteConfig', 'navTabs')).catch(() => null),
    getDocFromServer(doc(firestoreDb, 'siteConfig', 'liveText')).catch(() => null),
    getDocFromServer(doc(firestoreDb, 'siteConfig', 'tombstones')).catch(() => null),
  ]);

  if (examSnap && !examSnap.empty) {
    out.customExams = examSnap.docs.map((d) => {
      const c: any = { ...d.data() };
      delete c.creatorUid;
      delete c.allowedEmails;
      c.updatedAt = fsToIso(c.updatedAt, '');
      c.createdAt = c.createdAtStr || fsToIso(c.createdAt);
      delete c.createdAtStr;
      return c;
    });
  }
  if (bundleSnap && !bundleSnap.empty) {
    out.customBundles = bundleSnap.docs.map((d) => {
      const c: any = { ...d.data() };
      delete c.creatorUid;
      delete c.allowedEmails;
      c.updatedAt = fsToIso(c.updatedAt, '');
      c.createdAt = c.createdAtStr || fsToIso(c.createdAt);
      delete c.createdAtStr;
      return c;
    });
  }
  if (courseSnap && !courseSnap.empty) {
    out.courses = courseSnap.docs.map((d) => {
      const c: any = { ...d.data() };
      delete c.creatorUid;
      delete c.allowedEmails;
      c.updatedAt = fsToIso(c.updatedAt, '');
      c.createdAt = c.createdAtStr || fsToIso(c.createdAt);
      delete c.createdAtStr;
      return c;
    });
  }
  if (subjSnap?.exists() && Array.isArray(subjSnap.data().items)) out.subjects = subjSnap.data().items;
  if (navSnap?.exists() && Array.isArray(navSnap.data().items)) {
    out.navTabs = navSnap.data().items;
    if (navSnap.data().updatedAt) out.navTabsUpdatedAt = fsToIso(navSnap.data().updatedAt, '');
  }
  if (liveSnap?.exists() && liveSnap.data().overrides) {
    out.liveTextOverrides = liveSnap.data().overrides;
    if (liveSnap.data().updatedAt) out.liveTextUpdatedAt = fsToIso(liveSnap.data().updatedAt, '');
  }
  if (tombSnap?.exists()) {
    const t = tombSnap.data();
    out.deletedExamIds = t.deletedExamIds || [];
    out.deletedBundleIds = t.deletedBundleIds || [];
    out.deletedClassroomIds = t.deletedClassroomIds || [];
    out.deletedCourseIds = t.deletedCourseIds || [];
    out.deletedResultIds = t.deletedResultIds || [];
    out.deletedHomeworkIds = t.deletedHomeworkIds || [];
    out.deletedClassroomHomeworkIds = t.deletedClassroomHomeworkIds || [];
    out.deletedSubjectIds = t.deletedSubjectIds || [];
    out.deletedScoreboardIds = t.deletedScoreboardIds || [];
  }
  return out;
}

function mergeDeletedIdLists(a: any, b: any): string[] {
  const set = new Set<string>();
  if (Array.isArray(a)) a.forEach((x) => { if (typeof x === 'string' && x) set.add(x); });
  if (Array.isArray(b)) b.forEach((x) => { if (typeof x === 'string' && x) set.add(x); });
  return Array.from(set);
}

function getItemTs(item: any): number {
  if (!item || typeof item !== 'object') return 0;
  const raw = item.gradedAt || item.updatedAt || item.reviewedAt || item.submittedAt || item.completedAt || item.createdAt || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function mergeArrayById(existingArr: any, incomingArr: any, deletedSet: Set<string>): any[] {
  const map = new Map<string, any>();
  if (Array.isArray(existingArr)) {
    for (const item of existingArr) {
      if (item && item.id && !deletedSet.has(item.id)) {
        map.set(item.id, item);
      }
    }
  }
  if (Array.isArray(incomingArr)) {
    for (const item of incomingArr) {
      if (!item || !item.id || deletedSet.has(item.id)) continue;
      const prev = map.get(item.id);
      if (!prev || getItemTs(item) >= getItemTs(prev)) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergeCourseProgressMaps(existingMap: any, incomingMap: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (existingMap && typeof existingMap === 'object') {
    for (const [k, v] of Object.entries(existingMap)) {
      if (v && typeof v === 'object') out[k] = v;
    }
  }
  if (incomingMap && typeof incomingMap === 'object') {
    for (const [k, v] of Object.entries<any>(incomingMap)) {
      if (!v || typeof v !== 'object') continue;
      const prev = out[k];
      if (!prev) {
        out[k] = v;
      } else {
        const prevTs = new Date(prev.lastStudiedAt || 0).getTime() || 0;
        const nextTs = new Date(v.lastStudiedAt || 0).getTime() || 0;
        if (nextTs >= prevTs) {
          out[k] = v;
        }
      }
    }
  }
  return out;
}

function sanitizeIncomingPayloadForCaller(existing: any, payload: any, caller: VerifiedCaller) {
  if (caller.isMasterAdmin) {
    return stripSensitiveSyncFields(payload);
  }
  const { ids, emails, studentCode } = getCallerIdentitySets(caller);
  const existingExamsMap = new Map<string, any>((existing.customExams || []).map((x: any) => [x.id, x]));
  const existingBundlesMap = new Map<string, any>((existing.customBundles || []).map((x: any) => [x.id, x]));
  const existingCoursesMap = new Map<string, any>((existing.courses || []).map((x: any) => [x.id, x]));
  const existingClassesMap = new Map<string, any>((existing.classrooms || []).map((x: any) => [x.id, x]));
  const existingScoreboardsMap = new Map<string, any>((existing.scoreboards || []).map((x: any) => [x.id, x]));

  const canWriteTeacherOwned = (existingItem: any, incomingItem: any) => {
    if (caller.role !== 'teacher') return false;
    if (existingItem) {
      return isCreatorOfItemServer(existingItem, caller);
    }
    if (incomingItem?.creatorEmail && !emails.has(String(incomingItem.creatorEmail).trim().toLowerCase())) {
      return false;
    }
    if (incomingItem?.creatorId && !ids.has(incomingItem.creatorId)) {
      return false;
    }
    return true;
  };

  const filterOwnedDeletes = (delIds: any, existingMap: Map<string, any>, ownershipFn: (ex: any) => boolean) =>
    Array.isArray(delIds)
      ? delIds.filter((id) => {
          const ex = existingMap.get(id);
          return !ex || ownershipFn(ex);
        })
      : [];

  const filteredClassrooms = Array.isArray(payload.classrooms)
    ? payload.classrooms
        .map(sanitizeClassroomObject)
        .filter((cls: any) => {
          if (!cls?.id) return false;
          const ex = existingClassesMap.get(cls.id);
          if (caller.role === 'teacher') {
            return ex ? isTeacherOfClassServer(ex, caller) : true;
          }
          return false;
        })
    : [];

  const teacherOwnedClassIds = new Set(
    (existing.classrooms || [])
      .concat(filteredClassrooms)
      .filter((c: any) => isTeacherOfClassServer(c, caller))
      .map((c: any) => c.id)
  );

  const filteredResults = Array.isArray(payload.results)
    ? payload.results.filter(
        (r: any) =>
          (r?.userId && ids.has(r.userId)) ||
          (r?.userEmail && emails.has(String(r.userEmail).trim().toLowerCase())) ||
          (studentCode && r?.studentCode && String(r.studentCode).trim().toUpperCase() === studentCode)
      )
    : [];

  const filteredProgress: Record<string, any> = {};
  if (payload.courseProgress && typeof payload.courseProgress === 'object') {
    for (const [k, v] of Object.entries<any>(payload.courseProgress)) {
      if (v?.studentId && ids.has(v.studentId)) {
        filteredProgress[k] = v;
      }
    }
  }

  return {
    teacherRequests: [],
    customExams: Array.isArray(payload.customExams)
      ? payload.customExams.filter((x: any) => canWriteTeacherOwned(existingExamsMap.get(x?.id), x))
      : [],
    customBundles: Array.isArray(payload.customBundles)
      ? payload.customBundles.filter((x: any) => canWriteTeacherOwned(existingBundlesMap.get(x?.id), x))
      : [],
    courses: Array.isArray(payload.courses)
      ? payload.courses.filter((x: any) => canWriteTeacherOwned(existingCoursesMap.get(x?.id), x))
      : [],
    classrooms: filteredClassrooms,
    results: filteredResults,
    courseProgress: filteredProgress,
    classroomHomeworks:
      caller.role === 'teacher' && Array.isArray(payload.classroomHomeworks)
        ? payload.classroomHomeworks.filter((hw: any) => teacherOwnedClassIds.has(hw?.classId))
        : [],
    homeworkSubmissions: Array.isArray(payload.homeworkSubmissions)
      ? payload.homeworkSubmissions.filter(
          (sub: any) =>
            (sub?.studentId && ids.has(sub.studentId)) ||
            (sub?.studentEmail && emails.has(String(sub.studentEmail).trim().toLowerCase())) ||
            (caller.role === 'teacher' && sub?.classId && teacherOwnedClassIds.has(sub.classId))
        )
      : [],
    scoreboards:
      caller.role === 'teacher' && Array.isArray(payload.scoreboards)
        ? payload.scoreboards.filter((sb: any) =>
            canWriteTeacherOwned(existingScoreboardsMap.get(sb?.id), sb)
          )
        : [],
    subjects: caller.role === 'teacher' ? payload.subjects : [],
    navTabs: [],
    feedbacks: Array.isArray(payload.feedbacks)
      ? payload.feedbacks.filter(
          (fb: any) => !fb?.email || emails.has(String(fb.email).trim().toLowerCase())
        )
      : [],
    liveTextOverrides: undefined,
    deletedExamIds: caller.role === 'teacher'
      ? filterOwnedDeletes(payload.deletedExamIds, existingExamsMap, (ex) => isCreatorOfItemServer(ex, caller))
      : [],
    deletedBundleIds: caller.role === 'teacher'
      ? filterOwnedDeletes(payload.deletedBundleIds, existingBundlesMap, (ex) => isCreatorOfItemServer(ex, caller))
      : [],
    deletedCourseIds: caller.role === 'teacher'
      ? filterOwnedDeletes(payload.deletedCourseIds, existingCoursesMap, (ex) => isCreatorOfItemServer(ex, caller))
      : [],
    deletedClassroomIds: caller.role === 'teacher'
      ? filterOwnedDeletes(payload.deletedClassroomIds, existingClassesMap, (ex) => isTeacherOfClassServer(ex, caller))
      : [],
    deletedScoreboardIds: caller.role === 'teacher'
      ? filterOwnedDeletes(payload.deletedScoreboardIds, existingScoreboardsMap, (ex) => isCreatorOfItemServer(ex, caller))
      : [],
    deletedSubjectIds: caller.role === 'teacher' ? payload.deletedSubjectIds : [],
    deletedResultIds: [],
    deletedHomeworkIds: [],
    deletedClassroomHomeworkIds: [],
  };
}

function mergeStorageSnapshots(existing: any, payload: any) {
  const deletedExamIds = mergeDeletedIdLists(existing.deletedExamIds, payload.deletedExamIds);
  const deletedBundleIds = mergeDeletedIdLists(existing.deletedBundleIds, payload.deletedBundleIds);
  const deletedClassroomIds = mergeDeletedIdLists(existing.deletedClassroomIds, payload.deletedClassroomIds);
  const deletedCourseIds = mergeDeletedIdLists(existing.deletedCourseIds, payload.deletedCourseIds);
  const deletedResultIds = mergeDeletedIdLists(existing.deletedResultIds, payload.deletedResultIds);
  const deletedHomeworkIds = mergeDeletedIdLists(existing.deletedHomeworkIds, payload.deletedHomeworkIds);
  const deletedClassroomHomeworkIds = mergeDeletedIdLists(
    existing.deletedClassroomHomeworkIds,
    payload.deletedClassroomHomeworkIds
  );
  const deletedSubjectIds = mergeDeletedIdLists(existing.deletedSubjectIds, payload.deletedSubjectIds);
  const deletedScoreboardIds = mergeDeletedIdLists(existing.deletedScoreboardIds, payload.deletedScoreboardIds);

  const existingSubjects = Array.isArray(existing.subjects) ? existing.subjects : [];
  const incomingSubjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  const mergedSubjects = mergeArrayById(existingSubjects, incomingSubjects, new Set(deletedSubjectIds));

  const existingNavTabs = Array.isArray(existing.navTabs) ? existing.navTabs : [];
  const incomingNavTabs = Array.isArray(payload.navTabs) ? payload.navTabs : [];
  const existingNavTs = existing.navTabsUpdatedAt ? new Date(existing.navTabsUpdatedAt).getTime() || 0 : 0;
  const incomingNavTs = payload.navTabsUpdatedAt ? new Date(payload.navTabsUpdatedAt).getTime() || 0 : 0;
  const shouldUseIncomingNavTabs =
    incomingNavTabs.length > 0 &&
    (existingNavTabs.length === 0 || (incomingNavTs > 0 && incomingNavTs >= existingNavTs));

  const existingLiveTs = existing.liveTextUpdatedAt ? new Date(existing.liveTextUpdatedAt).getTime() || 0 : 0;
  const incomingLiveTs = payload.liveTextUpdatedAt ? new Date(payload.liveTextUpdatedAt).getTime() || 0 : 0;
  const mergedLiveText =
    incomingLiveTs > existingLiveTs && payload.liveTextOverrides && typeof payload.liveTextOverrides === 'object'
      ? payload.liveTextOverrides
      : {
          ...(existing.liveTextOverrides && typeof existing.liveTextOverrides === 'object' ? existing.liveTextOverrides : {}),
          ...(payload.liveTextOverrides && typeof payload.liveTextOverrides === 'object' ? payload.liveTextOverrides : {}),
        };

  const incomingClassrooms = Array.isArray(payload.classrooms)
    ? payload.classrooms.map(sanitizeClassroomObject)
    : [];

  return stripSensitiveSyncFields({
    teacherRequests: mergeArrayById(existing.teacherRequests, payload.teacherRequests, new Set()),
    customExams: mergeArrayById(existing.customExams, payload.customExams, new Set(deletedExamIds)),
    customBundles: mergeArrayById(existing.customBundles, payload.customBundles, new Set(deletedBundleIds)),
    courses: mergeArrayById(existing.courses, payload.courses, new Set(deletedCourseIds)),
    classrooms: mergeArrayById(existing.classrooms, incomingClassrooms, new Set(deletedClassroomIds)),
    results: mergeArrayById(existing.results, payload.results, new Set(deletedResultIds)),
    courseProgress: mergeCourseProgressMaps(existing.courseProgress, payload.courseProgress),
    classroomHomeworks: mergeArrayById(
      existing.classroomHomeworks,
      payload.classroomHomeworks,
      new Set(deletedClassroomHomeworkIds)
    ),
    homeworkSubmissions: mergeArrayById(
      existing.homeworkSubmissions,
      payload.homeworkSubmissions,
      new Set(deletedHomeworkIds)
    ),
    scoreboards: mergeArrayById(existing.scoreboards, payload.scoreboards, new Set(deletedScoreboardIds)),
    subjects: mergedSubjects,
    navTabs: shouldUseIncomingNavTabs ? incomingNavTabs : existingNavTabs,
    navTabsUpdatedAt: shouldUseIncomingNavTabs
      ? (payload.navTabsUpdatedAt || existing.navTabsUpdatedAt || new Date().toISOString())
      : (existing.navTabsUpdatedAt || ''),
    feedbacks: mergeArrayById(existing.feedbacks, payload.feedbacks, new Set()),
    liveTextOverrides: mergedLiveText,
    liveTextUpdatedAt: Math.max(existingLiveTs, incomingLiveTs) > 0
      ? new Date(Math.max(existingLiveTs, incomingLiveTs)).toISOString()
      : (existing.liveTextUpdatedAt || ''),
    deletedExamIds,
    deletedBundleIds,
    deletedClassroomIds,
    deletedCourseIds,
    deletedResultIds,
    deletedHomeworkIds,
    deletedClassroomHomeworkIds,
    deletedSubjectIds,
    deletedScoreboardIds,
    lastSyncedAt: new Date().toISOString(),
  });
}

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), projectId: firebaseConfig.projectId });
});

const SAFE_UPLOAD_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

// POST /api/upload-file - Store larger course/homework/exam documents securely on disk
app.post('/api/upload-file', (req, res) => {
  try {
    const { name, mimeType, base64Data } = req.body || {};
    if (!name || !base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu tệp tải lên!' });
    }
    const rawExt = path.extname(String(name)).toLowerCase();
    const safeExt = SAFE_UPLOAD_MIME_MAP[rawExt] ? rawExt : '.bin';
    if (['.html', '.htm', '.svg', '.xhtml', '.js', '.mjs', '.php', '.exe', '.sh'].includes(rawExt)) {
      return res.status(400).json({ success: false, error: 'Định dạng tệp không được phép tải lên!' });
    }

    const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Clean, 'base64');
    if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Dung lượng tệp vượt quá giới hạn 25MB!' });
    }

    const fileId = `f_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const safeDiskName = `${fileId}${safeExt}`;
    const targetPath = path.resolve(UPLOADS_DIR, safeDiskName);
    if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
      return res.status(400).json({ success: false, error: 'Đường dẫn tệp không hợp lệ!' });
    }

    fs.writeFileSync(targetPath, buffer);
    const resolvedMime =
      SAFE_UPLOAD_MIME_MAP[safeExt] ||
      (typeof mimeType === 'string' && !mimeType.includes('html') && !mimeType.includes('svg')
        ? mimeType
        : 'application/octet-stream');

    res.json({
      success: true,
      file: {
        id: fileId,
        name: String(name).slice(0, 220),
        mimeType: resolvedMime,
        sizeBytes: buffer.length,
        url: `/api/files/${safeDiskName}`,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/upload-file] error:', err);
    res.status(500).json({ success: false, error: 'Không thể lưu tệp lên máy chủ.' });
  }
});

// GET /api/files/:fileName - Serve uploaded documents inline safely
app.get('/api/files/:fileName', (req, res) => {
  const fileName = String(req.params.fileName || '');
  if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(fileName)) {
    return res.status(400).send('Invalid file name');
  }
  const targetPath = path.resolve(UPLOADS_DIR, fileName);
  if (!targetPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(targetPath)) {
    return res.status(404).send('File not found');
  }
  const ext = path.extname(fileName).toLowerCase();
  const contentType = SAFE_UPLOAD_MIME_MAP[ext] || 'application/octet-stream';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(targetPath);
});

// GET /api/sync - Hydrate from Cloud Firestore public config & return caller-scoped snapshot (NO users/credentials)
app.get('/api/sync', async (req, res) => {
  const caller = await verifyBearerCaller(req);
  let store = getOrInitializeStorage();
  let cloudSynced = false;
  try {
    const cloudPublic = await fsPullPublicSnapshot();
    if (cloudPublic && Object.keys(cloudPublic).length > 0) {
      store = mergeStorageSnapshots(store, cloudPublic);
      writeServerData(store);
      cloudSynced = true;
    }
  } catch (err) {
    console.warn('[GET /api/sync] Cloud pull warning:', err);
  }
  res.json({
    success: true,
    cloudSynced,
    data: filterSyncDataForCaller(store, caller),
  });
});

// POST /api/sync - Requires verified Firebase ID token, strips credentials, and enforces ownership
app.post('/api/sync', requireAuth, (req: AuthenticatedRequest, res) => {
  const payload = req.body;
  const caller = req.caller!;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  }

  const existing = getOrInitializeStorage();
  const sanitizedIncoming = sanitizeIncomingPayloadForCaller(existing, payload, caller);
  const merged = mergeStorageSnapshots(existing, sanitizedIncoming);
  writeServerData(merged);

  res.json({
    success: true,
    lastSyncedAt: merged.lastSyncedAt,
    data: filterSyncDataForCaller(merged, caller),
  });
});

// Backend credential & username lookup routes (no secrets ever shipped to frontend)
app.post('/api/auth/login-lookup', (req, res) => {
  if (!checkAuthRateLimit(req, 25)) {
    return res.status(429).json({
      success: false,
      error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau 1 phút.',
    });
  }

  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const password = String(req.body?.password || '').trim();
  if (!identifier) {
    return res.status(400).json({ success: false, error: 'Thiếu email hoặc tên đăng nhập!' });
  }

  const priv = getOrInitializePrivateAccounts();
  const matched = priv.accounts.find(
    (a) =>
      a.email.toLowerCase() === identifier ||
      (a.username && a.username.toLowerCase() === identifier)
  );

  if (!matched) {
    if (identifier.includes('@')) {
      return res.json({
        success: true,
        email: identifier,
        needsFirebaseProvision: false,
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Tên đăng nhập hoặc mật khẩu không chính xác!',
    });
  }

  if (matched.pendingFirebaseActivation) {
    if (password && matched.passwordHash && verifyPassword(password, matched.passwordHash)) {
      return res.json({
        success: true,
        email: matched.email,
        needsFirebaseProvision: true,
        fullName: matched.fullName,
      });
    }
    // Fall through to Firebase Auth verification in case the user already activated/changed
    // their password via Google Sign-In, ChangePasswordModal, or Firebase Password Reset email.
  }

  return res.json({
    success: true,
    email: matched.email,
    needsFirebaseProvision: false,
  });
});

app.post('/api/auth/resolve-identifier', (req, res) => {
  if (!checkAuthRateLimit(req, 20)) {
    return res.status(429).json({
      success: false,
      error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau 1 phút.',
    });
  }

  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  if (!identifier) {
    return res.status(400).json({ success: false, found: false, error: 'Thiếu thông tin tài khoản.' });
  }
  if (identifier.includes('@')) {
    return res.json({ success: true, found: true, email: identifier });
  }

  const priv = getOrInitializePrivateAccounts();
  const matched = priv.accounts.find((a) => a.username && a.username.toLowerCase() === identifier);
  if (!matched) {
    return res.json({ success: true, found: false });
  }
  return res.json({ success: true, found: true, email: matched.email });
});

app.post('/api/auth/session-profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const caller = req.caller!;
  const body = req.body || {};
  const priv = getOrInitializePrivateAccounts();
  const nowIso = new Date().toISOString();
  const lowerEmail = (caller.email || String(body.email || '')).trim().toLowerCase();
  const isMaster =
    caller.isMasterAdmin || lowerEmail === MASTER_ADMIN_EMAIL.toLowerCase();

  const existingIdx = priv.accounts.findIndex(
    (a) =>
      a.uid === caller.uid ||
      a.id === caller.uid ||
      (lowerEmail && a.email.toLowerCase() === lowerEmail)
  );
  const existing = existingIdx >= 0 ? priv.accounts[existingIdx] : undefined;

  const mergedLegacyIds = Array.from(
    new Set([
      ...(existing?.legacyUserIds || []),
      ...(Array.isArray(body.legacyUserIds) ? body.legacyUserIds : []),
      ...(existing?.id && existing.id !== caller.uid ? [existing.id] : []),
      ...(isMaster ? [MASTER_ADMIN_LEGACY_ID] : []),
    ])
  ).filter((x): x is string => typeof x === 'string' && Boolean(x));

  const providedPassword =
    typeof body.password === 'string' && body.password.trim().length > 0
      ? body.password.trim()
      : '';
  const nextEncryptedPassword = providedPassword
    ? encryptVaultPassword(providedPassword)
    : existing?.encryptedPassword;

  const nextRecord: BackendAccountRecord = {
    id: caller.uid,
    uid: caller.uid,
    legacyUserIds: mergedLegacyIds,
    email: lowerEmail || existing?.email || '',
    username: String(
      existing?.username ||
        body.username ||
        (lowerEmail ? lowerEmail.split('@')[0] : caller.uid.slice(0, 12))
    )
      .trim()
      .toLowerCase()
      .slice(0, 100),
    fullName: String(
      existing?.fullName ||
        body.fullName ||
        caller.name ||
        (lowerEmail ? lowerEmail.split('@')[0] : 'Thành viên EduTest')
    )
      .trim()
      .slice(0, 150),
    studentCode: body.studentCode || existing?.studentCode,
    role: isMaster
      ? 'teacher'
      : existing?.role === 'teacher'
      ? 'teacher'
      : 'student',
    isMasterAdmin: isMaster,
    avatar: body.avatar || existing?.avatar,
    school: String(body.school || existing?.school || 'Trường THPT').slice(0, 200),
    isGoogleAuth: Boolean(body.isGoogleAuth || existing?.isGoogleAuth),
    passwordHash: body.markActivated ? undefined : existing?.passwordHash,
    encryptedPassword: nextEncryptedPassword,
    pendingFirebaseActivation: body.markActivated ? false : Boolean(existing?.pendingFirebaseActivation),
    createdAt: existing?.createdAt || nowIso.split('T')[0],
    updatedAt: nowIso,
  };
  nextRecord.name = nextRecord.fullName;
  nextRecord.schoolOrOrg = nextRecord.school;

  if (existingIdx >= 0) {
    priv.accounts[existingIdx] = nextRecord;
  } else {
    priv.accounts.unshift(nextRecord);
  }
  priv.deletedUserIds = (priv.deletedUserIds || []).filter((id) => id !== nextRecord.id);
  priv.updatedAt = nowIso;
  writePrivateAccounts(priv);

  res.json({ success: true, user: sanitizePublicUserForClient(nextRecord) });
});

// Master Admin Account Directory Routes
app.get('/api/admin/users', requireMasterAdmin, (_req, res) => {
  const priv = getOrInitializePrivateAccounts();
  res.json({
    success: true,
    users: priv.accounts.map((u) => sanitizePublicUserForClient(u, { includeVisiblePassword: true })),
  });
});

app.post('/api/admin/users/:userId/role', requireMasterAdmin, (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const newRole = req.body?.newRole === 'teacher' ? 'teacher' : 'student';
  const priv = getOrInitializePrivateAccounts();
  const target = priv.accounts.find((u) => u.id === userId || u.uid === userId);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản!' });
  }
  if (target.isMasterAdmin || target.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
    return res.status(400).json({ success: false, error: 'Không thể thay đổi quyền Quản trị viên tối cao!' });
  }
  target.role = newRole;
  target.updatedAt = new Date().toISOString();
  priv.updatedAt = target.updatedAt;
  writePrivateAccounts(priv);
  res.json({ success: true, user: sanitizePublicUserForClient(target) });
});

app.post('/api/admin/users/:userId/reset-password', requireMasterAdmin, (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const priv = getOrInitializePrivateAccounts();
  const target = priv.accounts.find((u) => u.id === userId || u.uid === userId);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản!' });
  }

  const requestedPwd = String(req.body?.customPassword || '').trim();
  const oneTimePassword = requestedPwd.length >= 6 ? requestedPwd : generateSecure8CharPassword();
  target.passwordHash = hashPassword(oneTimePassword);
  target.encryptedPassword = encryptVaultPassword(oneTimePassword);
  target.pendingFirebaseActivation = true;
  target.updatedAt = new Date().toISOString();
  priv.updatedAt = target.updatedAt;
  writePrivateAccounts(priv);

  res.json({
    success: true,
    oneTimePassword,
    email: target.email,
    username: target.username,
    user: sanitizePublicUserForClient(target, { includeVisiblePassword: true }),
  });
});

app.delete('/api/admin/users/:userId', requireMasterAdmin, (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const priv = getOrInitializePrivateAccounts();
  const target = priv.accounts.find((u) => u.id === userId || u.uid === userId);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản!' });
  }
  if (target.isMasterAdmin || target.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
    return res.status(400).json({ success: false, error: 'Không thể xóa tài khoản Quản trị viên tối cao!' });
  }

  priv.accounts = priv.accounts.filter((u) => u.id !== target.id && u.uid !== userId);
  priv.deletedUserIds = Array.from(new Set([...(priv.deletedUserIds || []), target.id]));
  priv.updatedAt = new Date().toISOString();
  writePrivateAccounts(priv);

  // Also strip deleted student from classrooms on backend sync store
  const store = getOrInitializeStorage();
  if (Array.isArray(store.classrooms)) {
    const nowIso = priv.updatedAt;
    let changed = false;
    store.classrooms = store.classrooms.map((c: any) => {
      const prevLen = (c.students || []).length;
      const nextStudents = (c.students || []).filter(
        (s: any) =>
          s.id !== target.id &&
          (!target.email || !s.email || String(s.email).toLowerCase() !== target.email.toLowerCase())
      );
      if (nextStudents.length !== prevLen) {
        changed = true;
        return { ...c, students: nextStudents, updatedAt: nowIso };
      }
      return c;
    });
    if (changed) writeServerData(store);
  }

  res.json({ success: true });
});

// Classroom Student Account Provisioning & Roster Lookup Routes (Classroom Teacher or Master Admin only)
function findClassroomIfAuthorized(classId: string, caller: VerifiedCaller, store: any) {
  const cls = (store.classrooms || []).find((c: any) => c.id === classId);
  if (!cls) return { cls: null, allowed: caller.isMasterAdmin || caller.role === 'teacher' };
  const allowed = caller.isMasterAdmin || isTeacherOfClassServer(cls, caller);
  return { cls, allowed };
}

app.get('/api/classrooms/:classId/roster-accounts', requireAuth, (req: AuthenticatedRequest, res) => {
  const caller = req.caller!;
  const classId = String(req.params.classId || '').trim();
  const store = getOrInitializeStorage();
  const { cls, allowed } = findClassroomIfAuthorized(classId, caller, store);

  if (cls && !allowed) {
    return res.status(403).json({
      success: false,
      error: 'Bạn không phải giáo viên phụ trách lớp học này.',
    });
  }
  if (!cls && caller.role !== 'teacher' && !caller.isMasterAdmin) {
    return res.status(403).json({ success: false, error: 'Không có quyền truy cập.' });
  }

  const priv = getOrInitializePrivateAccounts();
  const teacherIds = priv.accounts
    .filter((u) => u.role === 'teacher' || u.isMasterAdmin)
    .map((u) => u.id);
  const teacherEmails = priv.accounts
    .filter((u) => u.role === 'teacher' || u.isMasterAdmin)
    .map((u) => u.email.toLowerCase());

  const accountsByStudentId: Record<
    string,
    { username: string; email: string; visiblePassword?: string; isGoogleOnly?: boolean }
  > = {};
  const students = Array.isArray(cls?.students) ? cls.students : [];
  for (const s of students) {
    const matched = priv.accounts.find(
      (u) =>
        u.id === s.id ||
        u.uid === s.id ||
        (s.email && u.email.toLowerCase() === String(s.email).toLowerCase()) ||
        (s.studentCode && u.studentCode && u.studentCode.toUpperCase() === String(s.studentCode).toUpperCase())
    );
    if (matched) {
      const canViewThisStudentPwd =
        caller.isMasterAdmin ||
        (!matched.isMasterAdmin &&
          matched.email.toLowerCase() !== MASTER_ADMIN_EMAIL.toLowerCase() &&
          matched.role !== 'teacher');
      const decrypted = canViewThisStudentPwd
        ? decryptVaultPassword(matched.encryptedPassword)
        : undefined;
      accountsByStudentId[s.id] = {
        username: matched.username,
        email: matched.email,
        ...(decrypted ? { visiblePassword: decrypted } : {}),
        ...(matched.isGoogleAuth && !decrypted ? { isGoogleOnly: true } : {}),
      };
    }
  }

  res.json({
    success: true,
    accountsByStudentId,
    teacherIds,
    teacherEmails,
  });
});

app.post('/api/classrooms/:classId/students', requireAuth, (req: AuthenticatedRequest, res) => {
  const caller = req.caller!;
  const classId = String(req.params.classId || '').trim();
  const store = getOrInitializeStorage();
  const { cls, allowed } = findClassroomIfAuthorized(classId, caller, store);

  if (!allowed || (!cls && caller.role !== 'teacher' && !caller.isMasterAdmin)) {
    return res.status(403).json({
      success: false,
      error: 'Chỉ giáo viên phụ trách lớp hoặc Quản trị viên tối cao mới được thêm học sinh!',
    });
  }

  const name = String(req.body?.name || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, error: 'Thiếu họ và tên học sinh!' });
  }

  const studentCode =
    String(req.body?.studentCode || '').trim() ||
    `SBD-${crypto.randomInt(1000, 9999)}`;
  const rawUname = `hs_${studentCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const rawEmail = String(req.body?.email || '').trim().toLowerCase() || `${rawUname}@edutest.vn`;
  const oneTimePassword = generateSecure8CharPassword();
  const nowIso = new Date().toISOString();
  const studentId = `hs_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;

  const priv = getOrInitializePrivateAccounts();
  let existingAcc = priv.accounts.find(
    (u) => u.email.toLowerCase() === rawEmail || u.username.toLowerCase() === rawUname
  );

  const accountUsername = existingAcc ? existingAcc.username : rawUname;
  if (!existingAcc) {
    existingAcc = {
      id: studentId,
      email: rawEmail,
      username: accountUsername,
      fullName: name,
      name,
      studentCode,
      role: 'student',
      isMasterAdmin: false,
      school: cls?.name || String(req.body?.className || 'Lớp học EduTest'),
      schoolOrOrg: cls?.name || String(req.body?.className || 'Lớp học EduTest'),
      passwordHash: hashPassword(oneTimePassword),
      encryptedPassword: encryptVaultPassword(oneTimePassword),
      pendingFirebaseActivation: true,
      createdAt: nowIso.split('T')[0],
      updatedAt: nowIso,
    };
    priv.accounts.unshift(existingAcc);
  } else {
    existingAcc.fullName = existingAcc.fullName || name;
    existingAcc.studentCode = existingAcc.studentCode || studentCode;
    existingAcc.passwordHash = hashPassword(oneTimePassword);
    existingAcc.encryptedPassword = encryptVaultPassword(oneTimePassword);
    existingAcc.pendingFirebaseActivation = true;
    existingAcc.updatedAt = nowIso;
  }
  priv.updatedAt = nowIso;
  writePrivateAccounts(priv);

  const studentMember = {
    id: existingAcc.id || studentId,
    name,
    studentCode,
    email: existingAcc.email,
    joinedAt: nowIso.split('T')[0],
  };

  if (cls) {
    cls.students = [...(cls.students || []).filter((s: any) => s.id !== studentMember.id), studentMember];
    cls.updatedAt = nowIso;
    writeServerData(store);
  }

  res.json({
    success: true,
    studentMember,
    accountUsername,
    email: existingAcc.email,
    oneTimePassword,
  });
});

app.post('/api/classrooms/:classId/students/:studentId/reset-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const caller = req.caller!;
  const classId = String(req.params.classId || '').trim();
  const studentId = String(req.params.studentId || '').trim();
  const store = getOrInitializeStorage();
  const { cls, allowed } = findClassroomIfAuthorized(classId, caller, store);

  if (!allowed || (!cls && caller.role !== 'teacher' && !caller.isMasterAdmin)) {
    return res.status(403).json({
      success: false,
      error: 'Bạn không có quyền cấp lại mật khẩu cho học sinh của lớp này!',
    });
  }

  const studentInClass = cls?.students?.find((s: any) => s.id === studentId);
  const bodyEmail = String(req.body?.studentEmail || '').trim().toLowerCase();
  const bodyCode = String(req.body?.studentCode || '').trim().toUpperCase();
  const bodyName = String(req.body?.studentName || '').trim();

  if (cls && !studentInClass) {
    return res.status(404).json({ success: false, error: 'Học sinh không thuộc lớp học này!' });
  }

  const priv = getOrInitializePrivateAccounts();
  const targetEmail = (studentInClass?.email || bodyEmail || '').toLowerCase();
  const targetCode = (studentInClass?.studentCode || bodyCode || '').toUpperCase();

  let acc = priv.accounts.find(
    (u) =>
      u.id === studentId ||
      u.uid === studentId ||
      (targetEmail && u.email.toLowerCase() === targetEmail) ||
      (targetCode && u.studentCode && u.studentCode.toUpperCase() === targetCode)
  );

  const oneTimePassword = generateSecure8CharPassword();
  const nowIso = new Date().toISOString();

  if (!acc) {
    const fallbackCode = targetCode || `SBD-${crypto.randomInt(1000, 9999)}`;
    const uname = `hs_${fallbackCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const resolvedEmail = targetEmail || `${uname}@edutest.vn`;
    acc = {
      id: studentId,
      email: resolvedEmail,
      username: uname,
      fullName: studentInClass?.name || bodyName || 'Học sinh',
      name: studentInClass?.name || bodyName || 'Học sinh',
      studentCode: fallbackCode,
      role: 'student',
      isMasterAdmin: false,
      school: cls?.name || 'Lớp học EduTest',
      passwordHash: hashPassword(oneTimePassword),
      encryptedPassword: encryptVaultPassword(oneTimePassword),
      pendingFirebaseActivation: true,
      createdAt: nowIso.split('T')[0],
      updatedAt: nowIso,
    };
    priv.accounts.unshift(acc);
  } else {
    acc.passwordHash = hashPassword(oneTimePassword);
    acc.encryptedPassword = encryptVaultPassword(oneTimePassword);
    acc.pendingFirebaseActivation = true;
    acc.updatedAt = nowIso;
  }
  priv.updatedAt = nowIso;
  writePrivateAccounts(priv);

  res.json({
    success: true,
    accountUsername: acc.username,
    email: acc.email,
    oneTimePassword,
  });
});

// Legacy password routes retired — client authenticates directly with Firebase Auth SDK
app.post('/api/auth/register', (_req, res) => {
  res.status(410).json({ success: false, error: 'Authentication handled directly by Firebase Auth SDK.' });
});

app.post('/api/auth/login', (_req, res) => {
  res.status(410).json({ success: false, error: 'Authentication handled directly by Firebase Auth SDK.' });
});

app.post('/api/auth/reset-password', (_req, res) => {
  res.status(410).json({ success: false, error: 'Use Firebase Auth sendPasswordResetEmail directly on client.' });
});

app.post('/api/auth/change-password', (_req, res) => {
  res.status(410).json({ success: false, error: 'Use Firebase Auth updatePassword / linkWithCredential on client.' });
});

// POST /api/auth/admin-user-update (Master Admin only; operates on private backend store)
app.post('/api/auth/admin-user-update', requireMasterAdmin, (req, res) => {
  const { action, userId, newRole } = req.body || {};
  const priv = getOrInitializePrivateAccounts();
  const target = priv.accounts.find((u) => u.id === userId || u.uid === userId);

  if (!target) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản!' });
  }

  const nowIso = new Date().toISOString();

  if (action === 'change_role') {
    if (target.isMasterAdmin || target.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Không thể thay đổi quyền Quản trị viên tối cao!' });
    }
    target.role = newRole === 'teacher' ? 'teacher' : 'student';
    target.updatedAt = nowIso;
  } else if (action === 'delete') {
    if (target.isMasterAdmin || target.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Không thể xóa tài khoản Quản trị viên tối cao!' });
    }
    priv.accounts = priv.accounts.filter((u) => u.id !== target.id);
    priv.deletedUserIds = Array.from(new Set([...(priv.deletedUserIds || []), target.id]));
  } else {
    return res.status(400).json({ success: false, error: 'Hành động không hợp lệ!' });
  }

  priv.updatedAt = nowIso;
  writePrivateAccounts(priv);
  res.json({ success: true });
});

// POST /api/auth/request-teacher - Submit request to become teacher (requires auth)
app.post('/api/auth/request-teacher', requireAuth, (req: AuthenticatedRequest, res) => {
  const caller = req.caller!;
  const { userName, schoolName, subject, reason } = req.body || {};
  const userId = caller.uid;
  const userEmail = caller.email || String(req.body?.userEmail || '').trim().toLowerCase();

  if (!userId || !userEmail) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin người dùng!' });
  }

  const store = getOrInitializeStorage();
  const requests = store.teacherRequests || [];

  const existingPending = requests.find(
    (r: any) =>
      (r.userId === userId || (r.userEmail && r.userEmail.toLowerCase() === userEmail)) &&
      r.status === 'pending'
  );
  if (existingPending) {
    return res.status(400).json({ success: false, error: 'Bạn đã có yêu cầu đang chờ phê duyệt!' });
  }

  const nowIso = new Date().toISOString();
  const newRequest = {
    id: 'req_tea_' + Date.now(),
    userId,
    userEmail,
    userName: userName || caller.name || userEmail,
    schoolName: schoolName || 'Trường THPT',
    subject: subject || 'Toán học',
    reason: reason || 'Tôi muốn tạo đề thi và quản lý lớp học trực tuyến.',
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.teacherRequests = [newRequest, ...requests];
  store.lastSyncedAt = nowIso;
  writeServerData(store);

  res.json({ success: true, request: newRequest });
});

// GET /api/admin/teacher-requests (Master Admin only)
app.get('/api/admin/teacher-requests', requireMasterAdmin, (_req, res) => {
  const store = getOrInitializeStorage();
  res.json({ success: true, requests: store.teacherRequests || [] });
});

// POST /api/admin/teacher-requests/:id/review (Master Admin only)
app.post('/api/admin/teacher-requests/:id/review', requireMasterAdmin, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { action } = req.body || {};

  const store = getOrInitializeStorage();
  const requests = store.teacherRequests || [];
  const targetReq = requests.find((r: any) => r.id === id);

  if (!targetReq) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy yêu cầu này!' });
  }

  const nowIso = new Date().toISOString();
  targetReq.status = action === 'approve' ? 'approved' : 'rejected';
  targetReq.reviewedAt = nowIso;
  targetReq.updatedAt = nowIso;
  targetReq.reviewedBy = req.caller?.email || MASTER_ADMIN_EMAIL;

  if (action === 'approve') {
    const priv = getOrInitializePrivateAccounts();
    const targetUser = priv.accounts.find(
      (u) =>
        u.id === targetReq.userId ||
        u.uid === targetReq.userId ||
        u.email.toLowerCase() === String(targetReq.userEmail || '').toLowerCase()
    );
    if (targetUser) {
      targetUser.role = 'teacher';
      targetUser.updatedAt = nowIso;
      priv.updatedAt = nowIso;
      writePrivateAccounts(priv);
    }
  }

  store.lastSyncedAt = nowIso;
  writeServerData(store);
  res.json({ success: true, request: targetReq });
});

// POST /api/oj/run - Execute user code with custom input
app.post('/api/oj/run', async (req, res) => {
  const { language, code, input, timeLimitSeconds } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Mã nguồn không được để trống' });
  }

  const { spawnSync } = await import('child_process');
  const timeoutMs = Math.min(5000, Math.max(1000, Math.round((timeLimitSeconds || 1.0) * 1000)));
  const startTime = Date.now();

  try {
    let result: any;
    if (language === 'python') {
      result = spawnSync('/usr/bin/python3', ['-c', code], {
        input: input || '',
        timeout: timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
    } else {
      result = spawnSync('/usr/local/bin/node', ['-e', `
        const fs = require('fs');
        const input = fs.readFileSync(0, 'utf-8');
        try {
          ${code.includes('console.log') || code.includes('process.stdout') ? code : `
            ${code}
          `}
        } catch(e) {
          console.error(e.message);
          process.exit(1);
        }
      `], {
        input: input || '',
        timeout: timeoutMs,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    const duration = Date.now() - startTime;

    if (result.error) {
      if ((result.error as any).code === 'ETIMEDOUT') {
        return res.json({
          verdict: 'TLE',
          output: '',
          error: `Thời gian chạy vượt quá giới hạn (${timeoutMs / 1000}s)`,
          executionTimeMs: timeoutMs,
          memoryUsedMB: 16.2,
        });
      }
      return res.json({
        verdict: 'RTE',
        output: '',
        error: result.error.message || 'Lỗi thực thi',
        executionTimeMs: duration,
        memoryUsedMB: 14.5,
      });
    }

    if (result.status !== 0) {
      return res.json({
        verdict: 'RTE',
        output: result.stdout || '',
        error: result.stderr || 'Runtime Error (non-zero exit code)',
        executionTimeMs: duration,
        memoryUsedMB: 14.8,
      });
    }

    res.json({
      verdict: 'AC',
      output: result.stdout || '',
      error: result.stderr || '',
      executionTimeMs: duration,
      memoryUsedMB: 15.0,
    });
  } catch (err: any) {
    res.json({
      verdict: 'RTE',
      output: '',
      error: err.message,
      executionTimeMs: 10,
      memoryUsedMB: 14.0,
    });
  }
});

// --- Mountain Climb Quiz Game REST Endpoints ---
app.post('/api/games/rooms', (req, res) => {
  const { customCode, hostId, hostName, petId, config, questions } = req.body || {};
  const result = mountainGameEngine.createRoom({
    customCode,
    hostId,
    hostName,
    petId,
    config,
    questions,
  });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ room: result.room, playerId: result.playerId });
});

app.get('/api/games/rooms/:code', (req, res) => {
  const room = mountainGameEngine.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Không tìm thấy phòng chơi này.' });
  }
  return res.json({ room });
});

app.post('/api/games/rooms/:code/join', (req, res) => {
  const { playerId, playerName, petId } = req.body || {};
  const result = mountainGameEngine.joinRoom(req.params.code, {
    playerId,
    playerName,
    petId,
  });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ room: result.room, playerId: result.playerId });
});

app.post('/api/games/rooms/:code/leave', (req, res) => {
  const { playerId } = req.body || {};
  mountainGameEngine.leaveRoom(req.params.code, String(playerId || ''));
  return res.json({ success: true });
});

app.put('/api/games/rooms/:code/config', (req, res) => {
  const { hostId, config, questions } = req.body || {};
  const result = mountainGameEngine.updateLobbyConfig(req.params.code, {
    hostId: String(hostId || ''),
    config,
    questions,
  });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ room: result.room });
});

app.post('/api/games/rooms/:code/start', (req, res) => {
  const { hostId } = req.body || {};
  const result = mountainGameEngine.startGame(req.params.code, String(hostId || ''));
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ room: result.room });
});

app.post('/api/games/rooms/:code/restart', (req, res) => {
  const { hostId } = req.body || {};
  const result = mountainGameEngine.restartToLobby(req.params.code, String(hostId || ''));
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ room: result.room });
});

app.post('/api/games/rooms/:code/answer', (req, res) => {
  const { playerId, questionId, selectedIndex } = req.body || {};
  const result = mountainGameEngine.submitAnswer(req.params.code, {
    playerId: String(playerId || ''),
    questionId: String(questionId || ''),
    selectedIndex: Number(selectedIndex),
  });
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ room: result.room });
});

app.post('/api/games/rooms/:code/advance', (req, res) => {
  const { hostId } = req.body || {};
  const result = mountainGameEngine.forceAdvanceRound(req.params.code, String(hostId || ''));
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  return res.json({ room: result.room });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  httpServer.on('upgrade', (req, socket, head) => {
    mountainGameEngine.handleUpgrade(req, socket, head);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EduTest server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
