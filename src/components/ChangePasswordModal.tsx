import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Eye,
  EyeOff,
  Link2,
} from 'lucide-react';
import { UserAccount } from '../types/exam';
import {
  changePasswordDirectly,
  generateSecure8CharPassword,
  getActiveAuthProviders,
  linkCurrentAccountWithGoogle,
} from '../utils/storage';

interface ChangePasswordModalProps {
  isOpen: boolean;
  currentUser?: UserAccount | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const [identifier, setIdentifier] = useState(currentUser?.email || currentUser?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [providers, setProviders] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIdentifier(currentUser?.email || currentUser?.username || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMessage(null);
      setSuccessMessage(null);
      setProviders(getActiveAuthProviders());
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const hasPasswordProvider = providers.includes('password');
  const hasGoogleProvider = providers.includes('google.com');

  const handleGenerate8CharPass = () => {
    const p = generateSecure8CharPassword();
    setNewPassword(p);
    setConfirmPassword(p);
    setShowNewPassword(true);
  };

  const handleLinkGoogle = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLinkingGoogle(true);
    const res = await linkCurrentAccountWithGoogle();
    setIsLinkingGoogle(false);
    if (res.success) {
      setProviders(getActiveAuthProviders());
      setSuccessMessage('✓ Đã liên kết thành công tài khoản Google vào cùng hồ sơ này!');
      if (onSuccess) onSuccess();
    } else {
      setErrorMessage(res.error || 'Không thể liên kết tài khoản Google!');
    }
  };

  const handleSubmitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetId = identifier.trim();
    if (!targetId) {
      setErrorMessage('Vui lòng nhập Email hoặc Tên đăng nhập tài khoản!');
      return;
    }

    if (hasPasswordProvider && !currentPassword.trim()) {
      setErrorMessage('Vui lòng nhập mật khẩu hiện tại để xác nhận!');
      return;
    }

    if (!newPassword.trim()) {
      setErrorMessage('Vui lòng nhập mật khẩu mới!');
      return;
    }

    if (newPassword.trim().length < 6) {
      setErrorMessage('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Xác nhận mật khẩu mới không trùng khớp!');
      return;
    }

    setIsSubmitting(true);
    const res = await changePasswordDirectly(
      targetId,
      hasPasswordProvider ? currentPassword : '',
      newPassword
    );
    setIsSubmitting(false);

    if (res.success) {
      setProviders(getActiveAuthProviders());
      setSuccessMessage(
        res.linkedNewPassword
          ? '✓ Đã thiết lập mật khẩu thành công! Bạn có thể đăng nhập bằng cả Google lẫn Email/Mật khẩu.'
          : '✓ Đổi mật khẩu thành công trên Firebase Authentication!'
      );
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 900);
    } else {
      setErrorMessage(res.error || 'Đổi mật khẩu thất bại, vui lòng kiểm tra lại mật khẩu hiện tại!');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-900 text-white p-5 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 rounded-md bg-purple-500 text-white">
              <KeyRound className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
              Bảo mật Tài khoản
            </span>
          </div>
          <h2 className="text-lg font-extrabold text-white">
            {hasPasswordProvider ? 'Đổi Mật Khẩu Tài Khoản' : 'Tạo Mật Khẩu Đăng Nhập'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            {hasPasswordProvider
              ? 'Xác nhận mật khẩu hiện tại và thiết lập mật khẩu mới qua Firebase Authentication.'
              : 'Tài khoản đang đăng nhập qua Google. Bạn có thể tạo thêm mật khẩu để đăng nhập bằng Email/Mật khẩu dùng chung cùng dữ liệu.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmitChange} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="font-semibold leading-relaxed">{successMessage}</span>
            </div>
          )}

          {/* Account Email / Username */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Tài khoản <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                readOnly={Boolean(currentUser?.email)}
                placeholder="Nhập Email..."
                className={`w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-purple-600 focus:outline-none ${
                  currentUser?.email ? 'bg-slate-100 text-slate-600' : 'bg-white'
                }`}
                required
              />
            </div>
          </div>

          {/* Current Password (only needed when user already has 'password' provider) */}
          {hasPasswordProvider && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Mật khẩu hiện tại <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại..."
                  className="w-full pl-9 pr-10 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-purple-600 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* New Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">
                Mật khẩu mới <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerate8CharPass}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                title="Tự động tạo mật khẩu 8 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt"
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Tạo MK mạnh 8 ký tự</span>
              </button>
            </div>

            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự..."
                className="w-full pl-9 pr-10 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-purple-600 focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Xác nhận lại mật khẩu mới <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-purple-600 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Link Google option if not already linked */}
          {!hasGoogleProvider && currentUser && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-600 leading-snug">
                Liên kết thêm Google để đăng nhập nhanh bằng cả 2 cách:
              </span>
              <button
                type="button"
                onClick={handleLinkGoogle}
                disabled={isLinkingGoogle}
                className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{isLinkingGoogle ? 'Đang liên kết...' : 'Liên kết Google'}</span>
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2.5 px-5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Đang cập nhật...'
                  : hasPasswordProvider
                  ? 'Lưu Mật Khẩu Mới'
                  : 'Tạo Mật Khẩu'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
