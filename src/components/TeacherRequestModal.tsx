import React, { useState } from 'react';
import { 
  X, 
  Send, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  School, 
  BookOpen, 
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { UserAccount, TeacherRoleRequest } from '../types/exam';
import { submitTeacherRoleRequest, getAllTeacherRequests, MASTER_ADMIN_EMAIL } from '../utils/storage';

interface TeacherRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onSubmitted?: () => void;
}

export const TeacherRequestModal: React.FC<TeacherRequestModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSubmitted,
}) => {
  const [schoolName, setSchoolName] = useState(currentUser.school || '');
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Check if current user already has a pending or reviewed request
  const allRequests = getAllTeacherRequests();
  const existingRequest = allRequests.find((r) => r.userId === currentUser.id || r.userEmail.toLowerCase() === currentUser.email.toLowerCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!schoolName.trim() || !reason.trim()) {
      setErrorMsg('Vui lòng nhập tên trường và lý do xin nâng quyền!');
      return;
    }

    setIsLoading(true);
    const res = await submitTeacherRoleRequest({
      userId: currentUser.id,
      userEmail: currentUser.email,
      userName: currentUser.fullName,
      schoolName: schoolName.trim(),
      subject: subject.trim(),
      reason: reason.trim(),
    });
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Đã gửi yêu cầu thành công! Quản trị viên (Thầy Trần Quang Nhật) sẽ xem xét và phê duyệt.');
      if (onSubmitted) onSubmitted();
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setErrorMsg(res.error || 'Không thể gửi yêu cầu lúc này!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs font-sans">
      <div 
        className="relative w-full max-w-lg max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 sm:p-6 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Nâng cấp vai trò</span>
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-white">
            Yêu cầu cấp quyền Giáo viên
          </h2>
          <p className="text-xs text-purple-200 mt-1 leading-relaxed">
            Quyền Giáo viên cho phép bạn tạo đề thi, tổ chức thi trắc nghiệm, tạo lớp học riêng và quản trị học sinh.
          </p>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 flex-1 min-h-0 overflow-y-auto scroll-lane">
          {existingRequest && existingRequest.status === 'pending' ? (
            <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Yêu cầu của bạn đang chờ phê duyệt
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                Hệ thống đã ghi nhận đơn yêu cầu nâng quyền của bạn gửi ngày <strong>{new Date(existingRequest.createdAt).toLocaleDateString('vi-VN')}</strong>. 
                Quản trị viên (Thầy Trần Quang Nhật - {MASTER_ADMIN_EMAIL}) sẽ duyệt thủ công trong trang quản trị.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Đã hiểu, quay lại
                </button>
              </div>
            </div>
          ) : existingRequest && existingRequest.status === 'approved' ? (
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-emerald-950">
                Yêu cầu của bạn đã được phê duyệt!
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tài khoản của bạn đã được cấp quyền Giáo viên tổ chức trên hệ thống EduTest.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                Tiếp tục sử dụng
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Quy trình phê duyệt:</strong> Toàn bộ tài khoản mới đăng ký đều bắt đầu từ Học sinh. Khi bạn gửi form này, tài khoản Quản trị viên tối cao của <strong>Thầy Trần Quang Nhật</strong> sẽ nhận thông báo để duyệt thủ công.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Trường THPT / Cơ sở đào tạo <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <School className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="Nhập tên trường THPT / Cơ sở đào tạo..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Môn học giảng dạy chính
                </label>
                <div className="relative">
                  <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Nhập môn học giảng dạy chính..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do xin nâng quyền & Mục đích sử dụng <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nhập lý do xin nâng quyền và mục đích sử dụng..."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isLoading ? 'Đang gửi...' : 'Gửi yêu cầu phê duyệt'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
