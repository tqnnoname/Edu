import React, { useState, useEffect } from 'react';
import { Star, MessageSquarePlus, X, Send, CheckCircle2, User, Mail, MessageSquare } from 'lucide-react';
import { FeedbackItem, UserRole } from '../types/exam';
import { getAllFeedbacks, saveFeedback, formatVietnameseDateTime } from '../utils/storage';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: UserRole;
  defaultUserName?: string;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  userRole = 'student',
  defaultUserName = '',
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<'general' | 'ui' | 'exams' | 'bug' | 'feature'>('general');
  const [comments, setComments] = useState('');
  const [userName, setUserName] = useState(defaultUserName);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [recentFeedbacks, setRecentFeedbacks] = useState<FeedbackItem[]>([]);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');

  useEffect(() => {
    if (isOpen) {
      setSubmitted(false);
      setComments('');
      setRecentFeedbacks(getAllFeedbacks());
      if (defaultUserName && !userName) {
        setUserName(defaultUserName);
      }
    }
  }, [isOpen, defaultUserName]);

  if (!isOpen) return null;

  const ratingLabels: { [key: number]: string } = {
    1: 'Chưa hài lòng - Cần khắc phục nhiều',
    2: 'Tạm được - Cần cải thiện thêm',
    3: 'Hài lòng - Khá đầy đủ',
    4: 'Rất tốt - Trải nghiệm mượt mà',
    5: 'Tuyệt vời - Rất hài lòng với trang web!',
  };

  const categories = [
    { id: 'general', label: 'Góp ý chung' },
    { id: 'ui', label: 'Giao diện & Tiện ích' },
    { id: 'exams', label: 'Đề thi & Đấu trường' },
    { id: 'feature', label: 'Đề xuất tính năng' },
    { id: 'bug', label: 'Báo lỗi phát sinh' },
  ] as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comments.trim()) return;

    const newFeedback: FeedbackItem = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      rating,
      category,
      comments: comments.trim(),
      userName: userName.trim() || (userRole === 'teacher' ? 'Giáo viên' : 'Học sinh'),
      userRole,
      email: email.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    saveFeedback(newFeedback);
    setRecentFeedbacks(getAllFeedbacks());
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/15 backdrop-blur-xs">
              <MessageSquarePlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">Góp ý & Đánh giá Trang Web</h2>
              <p className="text-xs text-blue-100">
                Ý kiến của bạn giúp hệ thống thi và học tập ngày một hoàn thiện hơn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('form')}
            className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'form'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Gửi góp ý mới
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-4 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Phản hồi gần đây</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-mono">
              {recentFeedbacks.length}
            </span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'form' ? (
            submitted ? (
              <div className="py-10 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Cảm ơn bạn đã gửi đóng góp!</h3>
                  <p className="text-sm text-slate-600 max-w-sm mx-auto mt-1">
                    Hệ thống đã ghi nhận ý kiến phản hồi và đánh giá của bạn để liên tục nâng cấp trải nghiệm thi.
                  </p>
                </div>
                <div className="pt-4 flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setSubmitted(false);
                      setComments('');
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Gửi phản hồi khác
                  </button>
                  <button
                    onClick={onClose}
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                  >
                    Hoàn tất & Đóng
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Star rating */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Mức độ hài lòng chung của bạn:
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isActive = (hoverRating || rating) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                          className="p-1 rounded-md text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                        >
                          <Star
                            className={`w-7 h-7 ${
                              isActive ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                    <span className="ml-2 text-xs font-semibold text-slate-700">
                      {ratingLabels[hoverRating || rating]}
                    </span>
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Chủ đề đóng góp:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategory(c.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border ${
                          category === c.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Họ và tên của bạn:
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        placeholder="VD: Thầy Nam / Em Lan"
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email (không bắt buộc):
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Để nhận phản hồi khi có update"
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Comment input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nội dung nhận xét, góp ý chi tiết: <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Hãy chia sẻ cảm nhận, chức năng bạn muốn cải thiện hoặc tính năng bạn muốn có thêm..."
                    className="w-full p-3 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none leading-relaxed"
                    required
                  />
                </div>

                {/* Submit button */}
                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    disabled={!comments.trim()}
                    className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Gửi góp ý</span>
                  </button>
                </div>
              </form>
            )
          ) : (
            /* History of feedbacks */
            <div className="space-y-3">
              {recentFeedbacks.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <MessageSquare className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-[1.5]" />
                  <p className="text-xs">Chưa có góp ý nào được lưu trên thiết bị này.</p>
                </div>
              ) : (
                recentFeedbacks.map((fb) => (
                  <div
                    key={fb.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{fb.userName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">
                          {fb.userRole === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {formatVietnameseDateTime(fb.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            fb.rating >= s ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                          }`}
                        />
                      ))}
                    </div>

                    <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {fb.comments}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
