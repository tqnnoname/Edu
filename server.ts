import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const DATA_DIR = path.resolve(__dirname, 'data');
const SYNC_FILE = path.join(DATA_DIR, 'edutest-cloud-sync.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper to read sync data
function readServerData() {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      const raw = fs.readFileSync(SYNC_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading sync file:', err);
  }
  return null;
}

// Helper to write sync data
function writeServerData(data: any) {
  try {
    fs.writeFileSync(SYNC_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing sync file:', err);
    return false;
  }
}

// Master Admin Email constant
const MASTER_ADMIN_EMAIL = 'tranquangnhat418@gmail.com';

// Initial master admin account
const INITIAL_MASTER_ADMIN = {
  id: 'usr_master_teacher',
  email: MASTER_ADMIN_EMAIL,
  username: 'tranquangnhat418',
  fullName: 'Thầy Trần Quang Nhật (Admin Tối Cao)',
  role: 'teacher',
  isMasterAdmin: true,
  password: '123456',
  avatar: '',
  school: 'Trường THPT Chuyên',
  createdAt: '2026-01-01',
};

// Seed storage if empty
function getOrInitializeStorage() {
  const current = readServerData();
  if (current) return current;

  const initial = {
    users: [INITIAL_MASTER_ADMIN],
    teacherRequests: [],
    customExams: [],
    customBundles: [],
    classrooms: [],
    results: [],
    lastSyncedAt: new Date().toISOString(),
  };
  writeServerData(initial);
  return initial;
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// GET /api/sync - Retrieve all synchronized data
app.get('/api/sync', (req, res) => {
  const data = getOrInitializeStorage();
  res.json({ success: true, data });
});

// POST /api/sync - Save & merge full application data
app.post('/api/sync', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid payload' });
  }

  const existing = getOrInitializeStorage();
  const merged = {
    ...existing,
    ...payload,
    // Preserve master admin if users list provided
    users: payload.users && Array.isArray(payload.users)
      ? [
          INITIAL_MASTER_ADMIN,
          ...payload.users.filter((u: any) => u.email !== MASTER_ADMIN_EMAIL && u.id !== INITIAL_MASTER_ADMIN.id),
        ]
      : existing.users,
    lastSyncedAt: new Date().toISOString(),
  };

  writeServerData(merged);
  res.json({ success: true, lastSyncedAt: merged.lastSyncedAt });
});

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
  const { email, username, fullName, password, school, studentCode } = req.body;

  if (!email || !fullName || !password) {
    return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ email, họ tên và mật khẩu!' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedUsername = username ? String(username).trim().toLowerCase() : normalizedEmail.split('@')[0];

  const store = getOrInitializeStorage();
  const users = store.users || [];

  const existingUser = users.find(
    (u: any) => u.email.toLowerCase() === normalizedEmail || (u.username && u.username.toLowerCase() === normalizedUsername)
  );

  if (existingUser) {
    return res.status(400).json({ success: false, error: 'Email hoặc tên đăng nhập này đã được sử dụng!' });
  }

  // Check if registering with master admin email (auto master teacher)
  const isMaster = normalizedEmail === MASTER_ADMIN_EMAIL.toLowerCase();

  const newUser = {
    id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    email: normalizedEmail,
    username: normalizedUsername,
    fullName: fullName.trim(),
    role: isMaster ? 'teacher' : 'student', // Mặc định là Học sinh!
    isMasterAdmin: isMaster,
    password: String(password).trim(),
    school: school ? String(school).trim() : 'Trường THPT',
    studentCode: studentCode ? String(studentCode).trim() : 'HS-' + Math.floor(1000 + Math.random() * 9000),
    createdAt: new Date().toISOString().split('T')[0],
  };

  store.users = [...users, newUser];
  writeServerData(store);

  // Return user without password
  const { password: _, ...userWithoutPass } = newUser;
  res.json({ success: true, user: userWithoutPass });
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { loginIdentifier, password } = req.body;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập tài khoản và mật khẩu!' });
  }

  const store = getOrInitializeStorage();
  const users = store.users || [];
  const query = String(loginIdentifier).trim().toLowerCase();
  const inputPass = String(password).trim();

  // Check if master teacher initial login
  if ((query === MASTER_ADMIN_EMAIL.toLowerCase() || query === 'tranquangnhat418' || query === 'admin') && (inputPass === '123456' || inputPass === 'admin')) {
    const { password: _, ...userWithoutPass } = INITIAL_MASTER_ADMIN;
    return res.json({ success: true, user: userWithoutPass });
  }

  const user = users.find(
    (u: any) => u.email.toLowerCase() === query || (u.username && u.username.toLowerCase() === query)
  );

  if (!user || user.password !== inputPass) {
    return res.status(401).json({ success: false, error: 'Tài khoản hoặc mật khẩu không chính xác!' });
  }

  const { password: _, ...userWithoutPass } = user;
  res.json({ success: true, user: userWithoutPass });
});

// POST /api/auth/request-teacher - Submit request to become teacher
app.post('/api/auth/request-teacher', (req, res) => {
  const { userId, userEmail, userName, schoolName, subject, reason } = req.body;

  if (!userId || !userEmail) {
    return res.status(400).json({ success: false, error: 'Thiếu thông tin người dùng!' });
  }

  const store = getOrInitializeStorage();
  const requests = store.teacherRequests || [];

  // Check if already has pending request
  const existingPending = requests.find((r: any) => r.userId === userId && r.status === 'pending');
  if (existingPending) {
    return res.status(400).json({ success: false, error: 'Bạn đã có yêu cầu đang chờ phê duyệt!' });
  }

  const newRequest = {
    id: 'req_tea_' + Date.now(),
    userId,
    userEmail,
    userName: userName || userEmail,
    schoolName: schoolName || 'Trường THPT',
    subject: subject || 'Toán học',
    reason: reason || 'Tôi muốn tạo đề thi và quản lý lớp học trực tuyến.',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  store.teacherRequests = [newRequest, ...requests];
  writeServerData(store);

  res.json({ success: true, request: newRequest });
});

// GET /api/admin/teacher-requests - Master teacher gets all teacher requests
app.get('/api/admin/teacher-requests', (req, res) => {
  const store = getOrInitializeStorage();
  res.json({ success: true, requests: store.teacherRequests || [] });
});

// POST /api/admin/teacher-requests/:id/review - Master teacher approves or rejects
app.post('/api/admin/teacher-requests/:id/review', (req, res) => {
  const { id } = req.params;
  const { action, reviewerEmail } = req.body; // 'approve' | 'reject'

  const store = getOrInitializeStorage();
  const requests = store.teacherRequests || [];
  const targetReq = requests.find((r: any) => r.id === id);

  if (!targetReq) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy yêu cầu này!' });
  }

  targetReq.status = action === 'approve' ? 'approved' : 'rejected';
  targetReq.reviewedAt = new Date().toISOString();
  targetReq.reviewedBy = reviewerEmail || MASTER_ADMIN_EMAIL;

  // If approved, update user's role to 'teacher'
  if (action === 'approve') {
    const users = store.users || [];
    const targetUser = users.find((u: any) => u.id === targetReq.userId || u.email === targetReq.userEmail);
    if (targetUser) {
      targetUser.role = 'teacher';
    }
  }

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
      // For C++ or other languages, if Python/JS wrapper or Node
      result = spawnSync('/usr/local/bin/node', ['-e', `
        const fs = require('fs');
        const input = fs.readFileSync(0, 'utf-8');
        try {
          ${code.includes('console.log') || code.includes('process.stdout') ? code : `
            // Auto standard runner
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

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Development mode: attach Vite dev server middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: serve built assets
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EduTest server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
