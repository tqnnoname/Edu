import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  ShieldCheck,
  Mail,
  Lock,
  User,
  AlertCircle,
  CheckCircle,
  Send,
} from 'lucide-react';
import { UserAccount } from '../types/exam';
import {
  registerUserAccount,
  loginUserAccount,
  loginWithGoogleAccount,
  resetPasswordDirectly,
  generateSecure8CharPassword,
} from '../utils/storage';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserAccount) => void;
  initialMode?: 'login' | 'register';
  onOpenChangePassword?: () => void;
  embedded?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
  embedded = false,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password'>(initialMode);

  // Login form
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSchool, setRegSchool] = useState('');

  // Forgot Password form (Firebase Password Reset Email)
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotSentTarget, setForgotSentTarget] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetAllFields = useCallback(() => {
    setMode(initialMode);
    setLoginIdentifier('');
    setLoginPassword('');
    setRegFullName('');
    setRegEmail('');
    setRegUsername('');
    setRegPassword('');
    setRegSchool('');
    setForgotIdentifier('');
    setForgotSuccess(false);
    setForgotSentTarget('');
    setIsLoading(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [initialMode]);

  useEffect(() => {
    resetAllFields();
  }, [isOpen, initialMode, resetAllFields]);

  const handleClose = () => {
    resetAllFields();
    onClose();
  };

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      setErrorMsg('Vui lòng nhập email/tên đăng nhập và mật khẩu!');
      return;
    }

    setIsLoading(true);
    try {
      const res = await loginUserAccount(loginIdentifier, loginPassword);
      if (res.success && res.user) {
        const loggedInUser = res.user;
        resetAllFields();
        onSuccess(loggedInUser);
        onClose();
      } else {
        setErrorMsg(res.error || 'Đăng nhập không thành công, vui lòng kiểm tra lại!');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Đăng nhập thất bại, vui lòng thử lại!');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!regFullName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setErrorMsg('Vui lòng điền họ tên, email và mật khẩu!');
      return;
    }

    setIsLoading(true);
    try {
      const res = await registerUserAccount({
        fullName: regFullName,
        email: regEmail,
        username: regUsername || undefined,
        password: regPassword,
        school: regSchool || undefined,
      });

      if (res.success && res.user) {
        const createdUser = res.user;
        resetAllFields();
        onSuccess(createdUser);
        onClose();
      } else {
        setErrorMsg(res.error || 'Đăng ký không thành công!');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Đăng ký không thành công, vui lòng thử lại!');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!forgotIdentifier.trim()) {
      setErrorMsg('Vui lòng nhập email hoặc tên đăng nhập của bạn!');
      return;
    }

    setIsLoading(true);
    try {
      const res = await resetPasswordDirectly(forgotIdentifier.trim());
      if (res.success) {
        setForgotSuccess(true);
        setForgotSentTarget(res.username || forgotIdentifier.trim());
        setSuccessMsg(
          `✓ Đã gửi liên kết đặt lại mật khẩu tới "${res.username || forgotIdentifier.trim()}" qua Firebase Authentication. Vui lòng kiểm tra hộp thư đến (hoặc Spam/Quảng cáo).`
        );
      } else {
        setErrorMsg(res.error || 'Không tìm thấy tài khoản với thông tin này!');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể gửi email khôi phục mật khẩu!');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);
    try {
      const res = await loginWithGoogleAccount();
      if (res.success && res.user) {
        const loggedInUser = res.user;
        resetAllFields();
        onSuccess(loggedInUser);
        onClose();
      } else {
        setErrorMsg(res.error || 'Không thể đăng nhập bằng Google!');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể đăng nhập bằng Google!');
    } finally {
      setIsLoading(false);
    }
  };

  const cardContent = (
    <div
      className={`relative w-full ${
        embedded ? 'max-w-none' : 'max-w-md my-6'
      } bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden transition-all`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header decoration */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 relative">
        {!embedded && (
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>Firebase Authentication</span>
          </span>
        </div>

        <h2 className="text-xl font-extrabold text-white">
          {mode === 'login' && 'Đăng nhập EduTest'}
          {mode === 'register' && 'Tạo tài khoản mới'}
          {mode === 'forgot_password' && 'Khôi phục Mật khẩu'}
        </h2>
        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
          {mode === 'login' && 'Đăng nhập tài khoản để vào hệ thống và đồng bộ dữ liệu Cloud Firestore'}
          {mode === 'register' && 'Tài khoản đăng ký mới tự động phân quyền "Học sinh" (Student)'}
          {mode === 'forgot_password' && 'Gửi email chứa liên kết đặt lại mật khẩu chính thức từ Firebase Auth'}
        </p>

          {/* Mode Switch Tabs */}
          {(mode === 'login' || mode === 'register') && (
            <div className="flex p-1 bg-white/15 rounded-xl mt-4">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-200 hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Đăng nhập</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-200 hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Đăng ký</span>
              </button>
            </div>
          )}
        </div>

        {/* Form Body */}
        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="mb-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.08.72-2.45 1.16-4.22 1.16-3.25 0-6-2.19-6.98-5.14H1.01v3.14C3.03 21.15 7.21 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.02 14.01c-.25-.72-.39-1.49-.39-2.29s.14-1.57.39-2.29V6.29H1.01C.37 7.57 0 9.02 0 11.72c0 2.7.37 4.15 1.01 5.43l4.01-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.79 0 3.4.62 4.67 1.83l3.5-3.5C18.07 1.19 15.3 0 12 0 7.21 0 3.03 2.85 1.01 6.29l4.01 3.14C6 6.94 8.75 4.75 12 4.75Z"
                  />
                </svg>
                <span>Tiếp tục bằng Google (Gmail)</span>
              </button>
              <div className="relative flex items-center justify-center my-3.5">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-2.5 text-[11px] font-medium text-slate-400 whitespace-nowrap">
                  hoặc Email &amp; Mật khẩu
                </span>
                <div className="border-t border-slate-200 w-full" />
              </div>
            </div>
          )}

          {/* --- TAB 1: LOGIN FORM --- */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} autoComplete="on" className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email hoặc Tên đăng nhập
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    autoComplete="username"
                    placeholder="Nhập Email hoặc Tên đăng nhập..."
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Mật khẩu
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotIdentifier(loginIdentifier || '');
                      setMode('forgot_password');
                      setForgotSuccess(false);
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Học sinh chưa có tài khoản?</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  className="text-blue-600 hover:underline font-bold cursor-pointer"
                >
                  Đăng ký ngay
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập ngay'}</span>
              </button>
            </form>
          )}

          {/* --- TAB 2: REGISTER FORM --- */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} autoComplete="off" className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên của bạn <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    autoComplete="name"
                    placeholder="Nhập họ và tên của bạn..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email (Gmail) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="ten@gmail.com"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên đăng nhập
                  </label>
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    autoComplete="off"
                    placeholder="Tên đăng nhập..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Mật khẩu <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setRegPassword(generateSecure8CharPassword());
                        setErrorMsg(null);
                      }}
                      className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                    >
                      Gợi ý MK
                    </button>
                  </div>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Trường / Khối lớp
                  </label>
                  <input
                    type="text"
                    value={regSchool}
                    onChange={(e) => setRegSchool(e.target.value)}
                    autoComplete="organization"
                    placeholder="Tên trường hoặc lớp..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                <span className="font-bold">Đồng nhất tài khoản:</span> Email đăng ký trùng với Gmail sẽ tự động dùng chung một hồ sơ và toàn bộ dữ liệu trên Cloud. Tài khoản mới mặc định phân quyền <strong>Học sinh</strong>.
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isLoading ? 'Đang khởi tạo...' : 'Hoàn tất Đăng ký'}</span>
              </button>
            </form>
          )}

          {/* --- TAB 3: FORGOT PASSWORD (FIREBASE PASSWORD RESET EMAIL) --- */}
          {mode === 'forgot_password' && (
            <form onSubmit={handleForgotPassword} autoComplete="off" className="space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 leading-relaxed">
                Nhập Email hoặc Tên đăng nhập đã đăng ký. Hệ thống sẽ gửi email đặt lại mật khẩu chính thức qua Firebase Authentication để bạn thiết lập mật khẩu mới an toàn.
              </div>

              {!forgotSuccess ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email hoặc Tên đăng nhập tài khoản <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        autoComplete="email"
                        placeholder="Nhập Email hoặc Tên đăng nhập..."
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setErrorMsg(null);
                      }}
                      className="py-2 px-3 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer"
                    >
                      Quay lại Đăng nhập
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="py-2.5 px-4 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isLoading ? 'Đang gửi email...' : 'Gửi email đặt lại MK'}</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed">
                    Sau khi mở liên kết trong email <span className="font-mono font-bold text-slate-900">{forgotSentTarget}</span> và đặt mật khẩu mới xong, bạn có thể quay lại đăng nhập ngay lập tức.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setForgotSuccess(false);
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Quay lại Đăng nhập ngay</span>
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    );

  if (embedded) {
    return cardContent;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs font-sans overflow-y-auto"
      onClick={handleClose}
    >
      {cardContent}
    </div>
  );
};
