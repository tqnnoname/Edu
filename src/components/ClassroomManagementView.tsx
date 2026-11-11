import React, { useState, useMemo } from 'react';
import { Classroom, Exam, ExamResult, StudentMember, UserRole, UserAccount, ClassJoinRequest } from '../types/exam';
import { 
  Users, 
  Plus, 
  Award, 
  BarChart3, 
  CheckCircle, 
  Trophy, 
  Calendar, 
  BookOpen, 
  Clock, 
  UserPlus, 
  Trash2, 
  Copy, 
  Check, 
  ChevronRight, 
  GraduationCap, 
  Star,
  Search,
  KeyRound,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Save,
  Lock,
  Send,
  Inbox,
  UserCheck,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { 
  saveClassroom, 
  deleteClassroom, 
  setActiveClassId,
  getCurrentUser,
  getVisibleClassrooms,
  isStudentMemberOfClass,
  submitClassJoinRequest,
  reviewClassJoinRequest,
  addStudentDirectlyToClass,
  MASTER_ADMIN_EMAIL
} from '../utils/storage';

interface ClassroomManagementViewProps {
  classrooms: Classroom[];
  allExams: Exam[];
  results: ExamResult[];
  userRole: UserRole;
  currentUser?: UserAccount | null;
  activeClassId: string;
  onSelectClass: (classId: string) => void;
  onRefreshData: () => void;
  onStartExam: (exam: Exam, mode: 'exam' | 'practice') => void;
  onRequestAuth?: () => void;
}

export const ClassroomManagementView: React.FC<ClassroomManagementViewProps> = ({
  classrooms,
  allExams,
  results,
  userRole,
  currentUser,
  activeClassId,
  onSelectClass,
  onRefreshData,
  onStartExam,
  onRequestAuth,
}) => {
  const user = currentUser || getCurrentUser();
  const isTeacher = userRole === 'teacher' && Boolean(user && (user.role === 'teacher' || user.email === MASTER_ADMIN_EMAIL));

  // Học sinh chỉ thấy các lớp mình đã được duyệt tham gia (ẩn toàn bộ các lớp khác khỏi danh sách)
  const visibleClassrooms = useMemo(() => {
    return getVisibleClassrooms(classrooms, user);
  }, [classrooms, user]);

  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (activeClassId && visibleClassrooms.some((c) => c.id === activeClassId)) {
      return activeClassId;
    }
    return visibleClassrooms[0]?.id || classrooms[0]?.id || '';
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'exams' | 'students' | 'analytics' | 'ranking' | 'requests'>('overview');
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinMessage, setJoinMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [joinNoteInput, setJoinNoteInput] = useState('');

  // Modal create class state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState('Lớp 12');
  const [newClassTeacher, setNewClassTeacher] = useState('Thầy/Cô Giáo');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [selectedExamIdsForNewClass, setSelectedExamIdsForNewClass] = useState<string[]>([]);

  // Modal add student state
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const handleSaveClassroomData = () => {
    if (currentClass) {
      saveClassroom(currentClass);
      onRefreshData();
      const timeStr = new Date().toLocaleTimeString('vi-VN');
      setSaveToast(`✓ Đã lưu và đồng bộ dữ liệu lớp học "${currentClass.name}" thành công lúc ${timeStr}!`);
      setTimeout(() => setSaveToast(null), 3000);
    }
  };

  const currentClass = useMemo(() => {
    return classrooms.find((c) => c.id === selectedClassId) || visibleClassrooms[0] || classrooms[0];
  }, [classrooms, visibleClassrooms, selectedClassId]);

  const isMemberOfCurrentClass = useMemo(() => {
    if (!currentClass) return false;
    return isStudentMemberOfClass(currentClass, user);
  }, [currentClass, user]);

  const assignedExams = useMemo(() => {
    if (!currentClass) return [];
    return allExams.filter((e) => currentClass.assignedExamIds?.includes(e.id));
  }, [allExams, currentClass]);

  // Compute student results for this class
  const classResults = useMemo(() => {
    if (!currentClass) return [];
    // Match by classId or by assignedExamIds
    return results.filter(
      (r) => r.classId === currentClass.id || currentClass.assignedExamIds?.includes(r.examId)
    );
  }, [results, currentClass]);

  // Statistics
  const stats = useMemo(() => {
    if (classResults.length === 0) {
      return {
        avgScore: 0,
        highestScore: 0,
        lowestScore: 0,
        totalSubmissions: 0,
        passRate: 0,
        tiers: { excellent: 0, good: 0, fair: 0, average: 0, poor: 0 },
      };
    }

    const scores = classResults.map((r) => r.scoreOnTenScale || (r.earnedPoints / (r.totalPoints || 10)) * 10);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const passCount = scores.filter((s) => s >= 5.0).length;

    const tiers = {
      excellent: scores.filter((s) => s >= 9.0).length,
      good: scores.filter((s) => s >= 8.0 && s < 9.0).length,
      fair: scores.filter((s) => s >= 6.5 && s < 8.0).length,
      average: scores.filter((s) => s >= 5.0 && s < 6.5).length,
      poor: scores.filter((s) => s < 5.0).length,
    };

    return {
      avgScore: Number(avg.toFixed(2)),
      highestScore: Number(highest.toFixed(2)),
      lowestScore: Number(lowest.toFixed(2)),
      totalSubmissions: classResults.length,
      passRate: Math.round((passCount / scores.length) * 100),
      tiers,
    };
  }, [classResults]);

  // Leaderboard ranking list (sorted by score desc, then time spent asc)
  const leaderboard = useMemo(() => {
    const list = [...classResults].sort((a, b) => {
      const sA = a.scoreOnTenScale ?? (a.earnedPoints / (a.totalPoints || 10)) * 10;
      const sB = b.scoreOnTenScale ?? (b.earnedPoints / (b.totalPoints || 10)) * 10;
      if (sB !== sA) return sB - sA;
      return a.timeSpentSeconds - b.timeSpentSeconds;
    });

    return list.slice(0, 15);
  }, [classResults]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleJoinClass = () => {
    if (!joinCodeInput.trim()) return;
    if (!user) {
      if (onRequestAuth) onRequestAuth();
      return;
    }
    const res = submitClassJoinRequest(joinCodeInput.trim(), user, joinNoteInput);
    if (res.success) {
      onRefreshData();
      setJoinMessage({ text: res.message });
      setJoinCodeInput('');
      setJoinNoteInput('');
      if (res.classroom) {
        setSelectedClassId(res.classroom.id);
        setActiveClassId(res.classroom.id);
        onSelectClass(res.classroom.id);
      }
    } else {
      setJoinMessage({ text: res.message, isError: true });
    }
    setTimeout(() => setJoinMessage(null), 5000);
  };

  const handleReviewJoin = (requestId: string, action: 'approve' | 'reject') => {
    if (!currentClass) return;
    const res = reviewClassJoinRequest(currentClass.id, requestId, action);
    onRefreshData();
    setJoinMessage({ text: res.message });
    setTimeout(() => setJoinMessage(null), 4000);
  };

  const handleCreateClass = () => {
    if (!newClassName.trim()) return;
    const newClass: Classroom = {
      id: 'class_' + Date.now(),
      name: newClassName.trim(),
      grade: newClassGrade.trim(),
      code: 'ED' + Math.floor(1000 + Math.random() * 9000),
      teacherName: newClassTeacher.trim(),
      description: newClassDesc.trim(),
      students: [
        {
          id: 'hs_' + Date.now(),
          name: 'Nguyễn Văn An (Bạn)',
          studentCode: 'SBD-' + Math.floor(100 + Math.random() * 900),
          email: 'student@edutest.vn',
          joinedAt: new Date().toISOString().split('T')[0],
        },
      ],
      assignedExamIds: selectedExamIdsForNewClass,
      createdAt: new Date().toISOString().split('T')[0],
    };

    saveClassroom(newClass);
    onRefreshData();
    setSelectedClassId(newClass.id);
    setIsCreateModalOpen(false);
    setNewClassName('');
    setNewClassDesc('');
    setSelectedExamIdsForNewClass([]);
  };

  const handleAddStudent = () => {
    if (!currentClass || !newStudentName.trim()) return;
    const newStudent: StudentMember = {
      id: 'hs_' + Date.now(),
      name: newStudentName.trim(),
      studentCode: newStudentCode.trim() || `SBD-${Math.floor(1000 + Math.random() * 9000)}`,
      email: newStudentEmail.trim() || undefined,
      joinedAt: new Date().toISOString().split('T')[0],
    };

    const updatedClass: Classroom = {
      ...currentClass,
      students: [...currentClass.students, newStudent],
    };

    saveClassroom(updatedClass);
    onRefreshData();
    setIsAddStudentOpen(false);
    setNewStudentName('');
    setNewStudentCode('');
    setNewStudentEmail('');
  };

  const handleDeleteStudent = (studentId: string) => {
    if (!currentClass) return;
    const updatedClass: Classroom = {
      ...currentClass,
      students: currentClass.students.filter((s) => s.id !== studentId),
    };
    saveClassroom(updatedClass);
    onRefreshData();
  };

  const handleDeleteClass = () => {
    if (!currentClass) return;
    if (confirm(`Bạn có chắc muốn xóa lớp học "${currentClass.name}"?`)) {
      deleteClassroom(currentClass.id);
      onRefreshData();
      if (classrooms.length > 1) {
        const remaining = classrooms.filter((c) => c.id !== currentClass.id);
        setSelectedClassId(remaining[0].id);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 font-sans">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Hệ thống Lớp học & Đánh giá Xếp hạng</span>
              </span>
              <span className="text-xs text-slate-500">
                {classrooms.length} Lớp đang hoạt động
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Quản lý Lớp học & Thống kê Học lực
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Tạo lớp học, cấp mã tham gia, phân công đề thi trắc nghiệm riêng cho từng lớp và theo dõi phổ điểm, học lực (Xuất sắc, Giỏi, Khá, Trung bình, Yếu) cùng bảng vàng xếp hạng thành tích.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Join class input for students */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <KeyRound className="w-4 h-4 text-slate-400 ml-2 shrink-0" />
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Nhập mã lớp..."
                className="w-28 sm:w-36 text-xs bg-transparent px-2 py-1 uppercase font-mono font-bold text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleJoinClass}
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer"
              >
                Vào lớp
              </button>
            </div>

            {isTeacher && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo lớp mới</span>
              </button>
            )}
          </div>
        </div>

        {joinMessage && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              joinMessage.isError
                ? 'bg-rose-50 border border-rose-200 text-rose-800'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            }`}
          >
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{joinMessage.text}</span>
          </div>
        )}

        {/* Class Selection Pills - Ẩn đối với học sinh không phải thành viên */}
        <div className="pt-5 flex items-center gap-2 overflow-x-auto pb-1">
          {visibleClassrooms.length === 0 ? (
            <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2 w-full">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Các lớp học do giáo viên tạo ra được ẩn và bảo mật. Nhập <strong>Mã lớp</strong> giáo viên cấp vào ô phía trên để gửi yêu cầu gia nhập lớp!
              </span>
            </div>
          ) : (
            visibleClassrooms.map((c) => {
              const isSelected = c.id === currentClass?.id;
              const pendingReqCount = c.pendingRequests?.length || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedClassId(c.id);
                    setActiveClassId(c.id);
                    onSelectClass(c.id);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border relative ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <GraduationCap className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-blue-600'}`} />
                  <span>{c.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {c.students?.length || 0} HS
                  </span>
                  {isTeacher && pendingReqCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute -top-0.5 -right-0.5" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {currentClass && !isMemberOfCurrentClass ? (
        /* MÀN HÌNH BẢO MẬT: HỌC SINH CHƯA LÀ THÀNH VIÊN CỦA LỚP */
        <div className="bg-white rounded-2xl border border-rose-200 p-8 sm:p-12 shadow-sm text-center max-w-xl mx-auto space-y-5 my-8">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Lớp học đang được bảo mật
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Bạn không có quyền truy cập lớp học này. Các lớp học do giáo viên phụ trách được ẩn và bảo mật nghiêm ngặt đối với học sinh bên ngoài. 
              Chỉ học sinh đã gửi yêu cầu và được giáo viên chủ quản duyệt vào danh sách thành viên mới có thể xem nội dung và làm bài thi.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tên lớp:</span>
              <strong className="text-slate-900">{currentClass.name}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Giáo viên phụ trách:</span>
              <strong className="text-slate-900">{currentClass.teacherName}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Khối lớp:</span>
              <span className="font-bold text-slate-700">{currentClass.grade}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!user) {
                if (onRequestAuth) onRequestAuth();
                return;
              }
              const res = submitClassJoinRequest(currentClass.code, user, 'Xin tham gia lớp học để làm bài thi');
              setJoinMessage({ text: res.message, isError: !res.success });
              onRefreshData();
              setTimeout(() => setJoinMessage(null), 5000);
            }}
            className="w-full py-3 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Gửi yêu cầu xin tham gia lớp học này</span>
          </button>
        </div>
      ) : currentClass ? (
        <div className="space-y-6">
          {/* Active Class Hero Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 sm:p-8 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wide">
                    {currentClass.grade}
                  </span>
                  <span className="text-xs text-slate-300">
                    Phụ trách: <strong>{currentClass.teacherName}</strong>
                  </span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-300">
                    Sĩ số: <strong>{currentClass.students?.length || 0} học sinh</strong>
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                  {currentClass.name}
                </h2>
                {currentClass.description && (
                  <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    {currentClass.description}
                  </p>
                )}
              </div>

              {/* Class Code Box */}
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shrink-0">
                <div>
                  <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">
                    Mã mời tham gia lớp
                  </div>
                  <div className="text-2xl font-extrabold font-mono text-white tracking-widest mt-0.5">
                    {currentClass.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyCode(currentClass.code)}
                  className="p-2.5 bg-white text-slate-900 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                  title="Sao chép mã lớp"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Sub Navigation Tabs (Dài ra, hiển thị rõ ràng nội dung) */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3 text-sm font-bold overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[170px] ${
                activeTab === 'overview'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-blue-500" />
              <span>Tổng quan & Học lực</span>
            </button>
            <button
              onClick={() => setActiveTab('ranking')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[180px] ${
                activeTab === 'ranking'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Bảng vàng Xếp hạng ({leaderboard.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('exams')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[180px] ${
                activeTab === 'exams'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span>Đề thi được giao ({assignedExams.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer min-w-[180px] ${
                activeTab === 'students'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-500" />
              <span>Danh sách Học sinh ({currentClass.students?.length || 0})</span>
            </button>

            {isTeacher && (
              <button
                onClick={() => setActiveTab('requests')}
                className={`py-2.5 px-6 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer relative min-w-[190px] ${
                  activeTab === 'requests'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Inbox className="w-4 h-4 text-amber-500" />
                <span>Yêu cầu vào lớp ({currentClass.pendingRequests?.length || 0})</span>
                {(currentClass.pendingRequests?.length || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-500 text-white font-extrabold ml-1 animate-pulse">
                    {currentClass.pendingRequests?.length}
                  </span>
                )}
              </button>
            )}

            {isTeacher && (
              <button
                onClick={handleDeleteClass}
                className="ml-auto py-1.5 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa lớp học này</span>
              </button>
            )}
          </div>

          {/* TAB 1: OVERVIEW & ACADEMIC STATISTICS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* 4 Quantitative Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Điểm trung bình (GPA)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-blue-700">
                      {stats.avgScore.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">/ 10</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Dựa trên {stats.totalSubmissions} bài làm đã nộp
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Điểm cao nhất (Max)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-emerald-700">
                      {stats.highestScore.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">/ 10</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 font-medium mt-1">
                    Thủ khoa lớp đạt thành tích cao
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Tỷ lệ Đạt yêu cầu (≥ 5.0)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-purple-700">
                      {stats.passRate}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Mức sàn tốt nghiệp & đại học
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Điểm thấp nhất (Min)
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-extrabold font-mono text-slate-800">
                      {stats.lowestScore.toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">/ 10</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Cần phụ đạo thêm kiến thức
                  </div>
                </div>
              </div>

              {/* Academic Performance Distribution (Phân loại học lực) */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Award className="w-4 h-4 text-blue-600" />
                      <span>Đánh giá & Phân loại Học lực theo Thang điểm 10</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tiêu chuẩn: Xuất sắc (≥ 9.0), Giỏi (8.0 - 8.9), Khá (6.5 - 7.9), Trung bình (5.0 - 6.4), Yếu (&lt; 5.0)
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-slate-600">
                    Tổng: {stats.totalSubmissions} lượt đánh giá
                  </span>
                </div>

                {/* Bars */}
                <div className="space-y-3 pt-2">
                  {[
                    { label: 'Xuất sắc (9.0 - 10.0)', count: stats.tiers.excellent, color: 'bg-emerald-600', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    { label: 'Giỏi (8.0 - 8.9)', count: stats.tiers.good, color: 'bg-blue-600', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
                    { label: 'Khá (6.5 - 7.9)', count: stats.tiers.fair, color: 'bg-indigo-600', badge: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
                    { label: 'Trung bình (5.0 - 6.4)', count: stats.tiers.average, color: 'bg-amber-500', badge: 'text-amber-800 bg-amber-50 border-amber-200' },
                    { label: 'Yếu / Cần cố gắng (< 5.0)', count: stats.tiers.poor, color: 'bg-rose-500', badge: 'text-rose-800 bg-rose-50 border-rose-200' },
                  ].map((tier, idx) => {
                    const percent = stats.totalSubmissions > 0 ? Math.round((tier.count / stats.totalSubmissions) * 100) : 0;
                    return (
                      <div key={idx} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{tier.label}</span>
                          <span className="font-mono text-slate-600 font-bold">
                            {tier.count} bài ({percent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full ${tier.color} transition-all duration-500`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RANKING / LEADERBOARD */}
          {activeTab === 'ranking' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span>Bảng vàng Vinh danh & Xếp hạng Học sinh</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Xếp theo thứ tự điểm cao nhất và thời gian làm bài nhanh nhất
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">Top 15 Thí sinh xuất sắc</span>
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs">
                  Chưa có kết quả làm bài nào được ghi nhận cho lớp này. Hãy giao đề thi để học sinh làm bài!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Thứ hạng</th>
                        <th className="py-3 px-4">Học sinh / Thí sinh</th>
                        <th className="py-3 px-4">Đề thi</th>
                        <th className="py-3 px-4 text-center">Điểm số (Thang 10)</th>
                        <th className="py-3 px-4 text-center">Thời gian</th>
                        <th className="py-3 px-4">Học lực</th>
                        <th className="py-3 px-4 text-right">Ngày thi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboard.map((item, idx) => {
                        const score = item.scoreOnTenScale ?? (item.earnedPoints / (item.totalPoints || 10)) * 10;
                        let tierBadge = 'text-slate-700 bg-slate-50 border-slate-200';
                        let tierText = 'Trung bình';
                        if (score >= 9.0) {
                          tierBadge = 'text-emerald-700 bg-emerald-50 border-emerald-200 font-bold';
                          tierText = 'Xuất sắc 🌟';
                        } else if (score >= 8.0) {
                          tierBadge = 'text-blue-700 bg-blue-50 border-blue-200 font-semibold';
                          tierText = 'Giỏi 🥇';
                        } else if (score >= 6.5) {
                          tierBadge = 'text-indigo-700 bg-indigo-50 border-indigo-200';
                          tierText = 'Khá';
                        } else if (score < 5.0) {
                          tierBadge = 'text-rose-700 bg-rose-50 border-rose-200';
                          tierText = 'Yếu';
                        }

                        return (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 font-bold font-mono">
                              {idx === 0 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 text-xs shadow-2xs font-extrabold">
                                  🥇 1
                                </span>
                              ) : idx === 1 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-900 text-xs shadow-2xs font-extrabold">
                                  🥈 2
                                </span>
                              ) : idx === 2 ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs shadow-2xs font-extrabold">
                                  🥉 3
                                </span>
                              ) : (
                                <span className="text-slate-500 ml-2">#{idx + 1}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {item.studentName || 'Nguyễn Văn An (Bạn)'}
                              {item.studentCode && (
                                <span className="block font-normal text-[11px] text-slate-500 font-mono">
                                  {item.studentCode}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-700 max-w-[220px] truncate">
                              {item.examTitle}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-extrabold text-blue-700 text-sm">
                              {score.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-600">
                              {Math.floor(item.timeSpentSeconds / 60)}p {item.timeSpentSeconds % 60}s
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 rounded text-[11px] border ${tierBadge}`}>
                                {tierText}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-500 text-[11px]">
                              {new Date(item.completedAt).toLocaleDateString('vi-VN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ASSIGNED EXAMS */}
          {activeTab === 'exams' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Danh sách đề thi giao cho lớp {currentClass.name}
                </h3>
              </div>

              {assignedExams.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                  Chưa có đề thi nào được gán cho lớp này.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignedExams.map((exam) => (
                    <div
                      key={exam.id}
                      className="bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                          <span className="font-semibold uppercase text-blue-700">{exam.subject}</span>
                          <span className="font-mono">{exam.durationMinutes} phút</span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mb-2 line-clamp-2">
                          {exam.title}
                        </h4>
                        <div className="text-xs text-slate-500 mb-3 flex items-center gap-2">
                          <span>{exam.questions.length} câu</span>
                          <span>·</span>
                          <span className="font-mono font-bold text-blue-700">{exam.totalPoints || 10}đ</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onStartExam(exam, 'exam')}
                          className="flex-1 py-1.5 px-3 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer text-center"
                        >
                          Làm đề thi
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartExam(exam, 'practice')}
                          className="py-1.5 px-2.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                        >
                          Luyện tập
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: STUDENTS LIST */}
          {activeTab === 'students' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Danh sách học sinh trong lớp ({currentClass.students?.length || 0})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Học sinh có thể tự gia nhập bằng mã lớp <strong>{currentClass.code}</strong>
                  </p>
                </div>
                {isTeacher && (
                  <button
                    type="button"
                    onClick={() => setIsAddStudentOpen(true)}
                    className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Thêm học sinh</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">STT</th>
                      <th className="py-2.5 px-4">Họ và tên</th>
                      <th className="py-2.5 px-4 font-mono">Số báo danh / Mã HS</th>
                      <th className="py-2.5 px-4">Email</th>
                      <th className="py-2.5 px-4">Ngày tham gia</th>
                      {isTeacher && <th className="py-2.5 px-4 text-right">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentClass.students?.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{s.name}</td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-blue-700">{s.studentCode}</td>
                        <td className="py-2.5 px-4 text-slate-500">{s.email || '—'}</td>
                        <td className="py-2.5 px-4 text-slate-500 font-mono">{s.joinedAt}</td>
                        {isTeacher && (
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteStudent(s.id)}
                              className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                              title="Xóa học sinh này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PENDING JOIN REQUESTS */}
          {activeTab === 'requests' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Inbox className="w-4 h-4 text-amber-500" />
                    <span>Danh sách Yêu cầu tham gia Lớp học ({currentClass.pendingRequests?.length || 0})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Học sinh cần được bạn phê duyệt thì mới có quyền nhìn thấy và truy cập vào nội dung lớp này.
                  </p>
                </div>
              </div>

              {(!currentClass.pendingRequests || currentClass.pendingRequests.length === 0) ? (
                <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">Hiện không có yêu cầu nào đang chờ duyệt</p>
                  <p className="text-slate-400 mt-1">
                    Cung cấp mã lớp <span className="font-mono font-bold text-slate-800">{currentClass.code}</span> cho học sinh để họ gửi yêu cầu xin vào lớp.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">STT</th>
                        <th className="py-2.5 px-4">Học sinh</th>
                        <th className="py-2.5 px-4">Email</th>
                        <th className="py-2.5 px-4">Thời gian gửi</th>
                        <th className="py-2.5 px-4">Ghi chú từ học sinh</th>
                        <th className="py-2.5 px-4">Trạng thái</th>
                        <th className="py-2.5 px-4 text-right">Phê duyệt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentClass.pendingRequests.map((req, idx) => (
                        <tr key={req.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">{req.studentName}</span>
                            <span className="text-[11px] font-mono text-blue-700">{req.studentCode || 'Chưa có SBD'}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{req.studentEmail}</td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {new Date(req.createdAt).toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate">
                            {req.note || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              Chờ duyệt
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleReviewJoin(req.id, 'approve')}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Duyệt</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewJoin(req.id, 'reject')}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                              >
                                Từ chối
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* MODAL: CREATE CLASSROOM */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Tạo Lớp học mới
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên lớp học <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="VD: 12A1 Chuyên Toán"
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Khối lớp</label>
                <input
                  type="text"
                  value={newClassGrade}
                  onChange={(e) => setNewClassGrade(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giáo viên phụ trách</label>
                <input
                  type="text"
                  value={newClassTeacher}
                  onChange={(e) => setNewClassTeacher(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả lớp</label>
              <textarea
                rows={2}
                value={newClassDesc}
                onChange={(e) => setNewClassDesc(e.target.value)}
                placeholder="Mục tiêu ôn tập, đối tượng..."
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giao sẵn các đề thi cho lớp này:
              </label>
              <div className="max-h-36 overflow-y-auto border rounded-lg p-2 space-y-1.5 text-xs">
                {allExams.map((ex) => (
                  <label key={ex.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-50 rounded">
                    <input
                      type="checkbox"
                      checked={selectedExamIdsForNewClass.includes(ex.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedExamIdsForNewClass([...selectedExamIdsForNewClass, ex.id]);
                        } else {
                          setSelectedExamIdsForNewClass(selectedExamIdsForNewClass.filter((id) => id !== ex.id));
                        }
                      }}
                      className="rounded text-blue-600"
                    />
                    <span className="truncate">{ex.title}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateClass}
                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Tạo lớp ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD STUDENT */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Thêm học sinh vào lớp
            </h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và tên học sinh <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="VD: Hoàng Gia Bảo"
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số báo danh / Mã học sinh
              </label>
              <input
                type="text"
                value={newStudentCode}
                onChange={(e) => setNewStudentCode(e.target.value)}
                placeholder="VD: SBD-1209"
                className="w-full px-3 py-2 text-xs border rounded-lg font-mono focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email (Tùy chọn)
              </label>
              <input
                type="email"
                value={newStudentEmail}
                onChange={(e) => setNewStudentEmail(e.target.value)}
                placeholder="student@edutest.vn"
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddStudentOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAddStudent}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                Thêm vào lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Bar with In-Place Save */}
      <div className="sticky bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 px-4 sm:px-6 shadow-lg flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {saveToast ? (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in duration-150">
              {saveToast}
            </span>
          ) : (
            <span className="text-xs text-slate-500 hidden sm:inline">
              Mọi thay đổi danh sách học sinh và phân công đề sẽ được cập nhật đồng bộ.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isTeacher && (
            <button
              onClick={handleSaveClassroomData}
              className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Lưu dữ liệu lớp học tại đây</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
