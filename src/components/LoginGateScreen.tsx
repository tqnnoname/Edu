import React from 'react';
import { BookOpen, ShieldCheck, Layers, Users, Sparkles } from 'lucide-react';
import type { UserAccount } from '../types/exam';
import { AuthModal } from './AuthModal';

interface LoginGateScreenProps {
  initialMode?: 'login' | 'register';
  onSuccess: (user: UserAccount) => void;
}

export const LoginGateScreen: React.FC<LoginGateScreenProps> = ({
  initialMode = 'login',
  onSuccess,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-10 font-sans relative overflow-hidden">
      {/* Subtle architectural background accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left column: Brand & System Overview */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-base shadow-sm shrink-0">
              ET
            </div>
            <div className="text-left">
              <div className="font-extrabold text-lg text-white leading-tight">EduTest</div>
              <div className="text-[11px] text-blue-200 font-medium">
                Hệ thống Thi trắc nghiệm &amp; Khóa học trực tuyến
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              Đăng nhập để bắt đầu học tập &amp; thi trực tuyến
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Vì bảo mật dữ liệu lớp học và tài khoản cá nhân, bạn vui lòng đăng nhập mỗi khi truy cập hệ thống. Toàn bộ bài làm, tiến độ khóa học và đề thi đều được đồng bộ tức thì với Cloud Firestore.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <BookOpen className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-white">Ngân hàng Đề thi &amp; Tổ hợp</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Luyện đề theo môn, thi thử bấm giờ, chống gian lận &amp; xuất Word/Excel.
                </div>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <Users className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-white">Lớp học &amp; Khóa học</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tham gia lớp bằng mã, nộp bài tập &amp; học lý thuyết tương tác.
                </div>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <Layers className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-white">Phân quyền Rõ ràng</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Tách biệt Học sinh, Giáo viên và Quản trị viên tối cao an toàn.
                </div>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-white">Đồng nhất Google &amp; Email</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Đăng nhập bằng Google hoặc Email/Mật khẩu đều vào chung một hồ sơ.
                </div>
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Mỗi phiên mở web mới sẽ yêu cầu đăng nhập lại để bảo vệ tài khoản của bạn.</span>
          </div>
        </div>

        {/* Right column: Embedded Firebase Auth Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto text-slate-900">
          <AuthModal
            isOpen={true}
            embedded={true}
            initialMode={initialMode}
            onClose={() => {}}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    </div>
  );
};
