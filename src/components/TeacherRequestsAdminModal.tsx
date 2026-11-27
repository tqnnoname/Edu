import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Check, 
  XCircle, 
  Clock, 
  School, 
  BookOpen, 
  User, 
  Mail, 
  Calendar,
  Sparkles,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { TeacherRoleRequest, UserAccount } from '../types/exam';
import { fetchTeacherRequestsFromBackend, getAllTeacherRequests, reviewTeacherRoleRequest } from '../utils/storage';

interface TeacherRequestsAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  onUpdated?: () => void;
}

export const TeacherRequestsAdminModal: React.FC<TeacherRequestsAdminModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdated,
}) => {
  const [requests, setRequests] = useState<TeacherRoleRequest[]>(() => getAllTeacherRequests());
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [actionToast, setActionToast] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      void fetchTeacherRequestsFromBackend().then(setRequests);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleReview = async (requestId: string, action: 'approve' | 'reject') => {
    const res = await reviewTeacherRoleRequest(requestId, action, currentUser.email);
    if (res.success) {
      setRequests(getAllTeacherRequests());
      setActionToast(action === 'approve' ? '✓ Đã phê duyệt cấp quyền Giáo viên thành công!' : '✓ Đã từ chối yêu cầu.');
      if (onUpdated) onUpdated();
      setTimeout(() => setActionToast(null), 3000);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs font-sans">
      <div 
        className="relative w-full max-w-3xl max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>Quản trị viên tối cao</span>
            </span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500 text-white animate-pulse">
                {pendingCount} đơn chờ duyệt
              </span>
            )}
          </div>

          <h2 className="text-xl font-extrabold text-white">
            Phê duyệt Yêu cầu Cấp quyền Giáo viên
          </h2>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Danh sách học sinh trên nền tảng gửi yêu cầu nâng cấp tài khoản lên Giáo viên tổ chức. Chỉ bạn mới có thẩm quyền phê duyệt.
          </p>

          {/* Filter Pills */}
          <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'pending' ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              Chờ duyệt ({pendingCount})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'approved' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              Đã duyệt ({requests.filter((r) => r.status === 'approved').length})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'rejected' ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              Đã từ chối ({requests.filter((r) => r.status === 'rejected').length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'all' ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              Tất cả ({requests.length})
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto scroll-lane space-y-4">
          {actionToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionToast}</span>
            </div>
          )}

          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <p className="text-xs font-medium">Không có yêu cầu nào trong mục này.</p>
            </div>
          ) : (
            filteredRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-300 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">
                      {req.userName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{req.userName}</h4>
                      <p className="text-[11px] text-slate-500 font-mono">{req.userEmail}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        req.status === 'pending'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : req.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {req.status === 'pending'
                        ? 'Chờ duyệt'
                        : req.status === 'approved'
                        ? 'Đã duyệt'
                        : 'Đã từ chối'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(req.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Trường: <strong>{req.schoolName}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Môn: <strong>{req.subject}</strong></span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-150 text-xs text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-900">Lý do xin cấp quyền:</span> {req.reason}
                </div>

                {req.status === 'pending' && (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleReview(req.id, 'reject')}
                      className="px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Từ chối</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(req.id, 'approve')}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Phê duyệt Giáo viên</span>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Quyền quản trị tối cao của Thầy Trần Quang Nhật</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-bold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
