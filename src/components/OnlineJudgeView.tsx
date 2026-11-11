import React, { useState, useMemo, useEffect } from 'react';
import { 
  Code2, 
  Terminal, 
  Play, 
  Send, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Cpu, 
  Search, 
  Filter, 
  ChevronRight, 
  ArrowLeft, 
  Copy, 
  Check, 
  RotateCcw, 
  Sparkles, 
  Trophy, 
  History, 
  BookOpen, 
  Plus, 
  Maximize2, 
  Minimize2, 
  AlertCircle, 
  Layers, 
  Flame, 
  FileCode,
  Tag,
  ExternalLink,
  Info
} from 'lucide-react';
import { 
  OJProblem, 
  OJSubmission, 
  OJLanguage, 
  OJVerdict, 
  OJTestResult, 
  UserRole, 
  UserAccount 
} from '../types/exam';
import { 
  getAllOJProblems, 
  saveCustomOJProblem, 
  getOJSubmissions, 
  saveOJSubmission, 
  getOJUserStats, 
  evaluateOJCode 
} from '../utils/ojStorage';
import { MASTER_ADMIN_EMAIL } from '../utils/storage';
import { RichContentRenderer } from './RichContentRenderer';

interface OnlineJudgeViewProps {
  userRole: UserRole;
  currentUser: UserAccount | null;
  onRequestAuth?: () => void;
}

export const OnlineJudgeView: React.FC<OnlineJudgeViewProps> = ({
  userRole,
  currentUser,
  onRequestAuth,
}) => {
  const isTeacher = userRole === 'teacher' && Boolean(currentUser && (currentUser.role === 'teacher' || currentUser.email === MASTER_ADMIN_EMAIL));
  const [problems, setProblems] = useState<OJProblem[]>(() => getAllOJProblems());
  const [submissions, setSubmissions] = useState<OJSubmission[]>(() => getOJSubmissions());
  const [activeTab, setActiveTab] = useState<'problems' | 'workspace' | 'submissions' | 'leaderboard'>('problems');
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Active problem workspace state
  const [currentProblem, setCurrentProblem] = useState<OJProblem | null>(() => {
    const list = getAllOJProblems();
    return list[0] || null;
  });

  const [selectedLanguage, setSelectedLanguage] = useState<OJLanguage>('cpp');
  const [sourceCode, setSourceCode] = useState<string>('');
  const [customInput, setCustomInput] = useState<string>('');
  const [editorFontSize, setEditorFontSize] = useState<number>(14);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState<boolean>(false);
  const [consoleTab, setConsoleTab] = useState<'sample' | 'custom' | 'result'>('sample');

  // Execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionType, setExecutionType] = useState<'run' | 'submit' | null>(null);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<{
    verdict: OJVerdict;
    score: number;
    passedTests: number;
    totalTests: number;
    maxExecutionTimeMs: number;
    maxMemoryMB: number;
    testResults: OJTestResult[];
    compileOutput?: string;
  } | null>(null);

  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showAddProblemModal, setShowAddProblemModal] = useState<boolean>(false);

  // New problem form for teachers
  const [newProblemCode, setNewProblemCode] = useState('');
  const [newProblemTitle, setNewProblemTitle] = useState('');
  const [newProblemDiff, setNewProblemDiff] = useState<'Dễ' | 'Trung bình' | 'Khó' | 'Chuyên gia'>('Trung bình');
  const [newProblemCategory, setNewProblemCategory] = useState<'Quy hoạch động' | 'Cấu trúc dữ liệu' | 'Đồ thị' | 'Toán học' | 'Tham lam' | 'Chuỗi ký tự' | 'Nhập môn'>('Quy hoạch động');
  const [newProblemTimeLimit, setNewProblemTimeLimit] = useState(1.0);
  const [newProblemMemLimit, setNewProblemMemLimit] = useState(256);
  const [newProblemStatement, setNewProblemStatement] = useState('');
  const [newProblemInputSpec, setNewProblemInputSpec] = useState('');
  const [newProblemOutputSpec, setNewProblemOutputSpec] = useState('');
  const [newProblemSampleIn, setNewProblemSampleIn] = useState('');
  const [newProblemSampleOut, setNewProblemSampleOut] = useState('');
  const [newProblemHiddenIn, setNewProblemHiddenIn] = useState('');
  const [newProblemHiddenOut, setNewProblemHiddenOut] = useState('');

  // Update starter code when problem or language changes
  useEffect(() => {
    if (currentProblem) {
      const codeTemplate = currentProblem.starterCodes?.[selectedLanguage] || 
        (selectedLanguage === 'cpp' 
          ? `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    // Viet code giai thuat cua ban tai day\n    return 0;\n}`
          : selectedLanguage === 'python'
          ? `import sys\n\ndef solve():\n    # Doc du lieu tu stdin\n    data = sys.stdin.read().split()\n    if not data: return\n    pass\n\nif __name__ == '__main__':\n    solve()`
          : `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n    }\n}`);
      setSourceCode(codeTemplate);
      if (currentProblem.sampleTestCases.length > 0) {
        setCustomInput(currentProblem.sampleTestCases[0].input);
      }
    }
  }, [currentProblem?.id, selectedLanguage]);

  const stats = useMemo(() => getOJUserStats(), [submissions]);

  const filteredProblems = useMemo(() => {
    return problems.filter((p) => {
      if (selectedDifficulty !== 'all' && p.difficulty !== selectedDifficulty) return false;
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [problems, selectedDifficulty, selectedCategory, searchQuery]);

  const handleSelectProblem = (prob: OJProblem) => {
    setCurrentProblem(prob);
    setActiveTab('workspace');
    setLastSubmissionResult(null);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Run with custom input
  const handleRunCode = async () => {
    if (!currentProblem || isExecuting) return;
    setIsExecuting(true);
    setExecutionType('run');
    setConsoleTab('result');

    try {
      const result = await evaluateOJCode(currentProblem, selectedLanguage, sourceCode, customInput);
      setLastSubmissionResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExecuting(false);
      setExecutionType(null);
    }
  };

  // Submit solution against all test cases
  const handleSubmitCode = async () => {
    if (!currentProblem || isExecuting) return;
    setIsExecuting(true);
    setExecutionType('submit');
    setConsoleTab('result');

    try {
      const result = await evaluateOJCode(currentProblem, selectedLanguage, sourceCode);
      setLastSubmissionResult(result);

      // Save submission record
      const newSub: OJSubmission = {
        id: 'sub_' + Date.now(),
        problemId: currentProblem.id,
        problemCode: currentProblem.code,
        problemTitle: currentProblem.title,
        userId: currentUser?.id,
        userName: currentUser?.fullName || 'Thí sinh tự do',
        language: selectedLanguage,
        code: sourceCode,
        verdict: result.verdict,
        score: result.score,
        passedTests: result.passedTests,
        totalTests: result.totalTests,
        maxExecutionTimeMs: result.maxExecutionTimeMs,
        maxMemoryMB: result.maxMemoryMB,
        submittedAt: new Date().toISOString(),
        testResults: result.testResults,
        compileOutput: result.compileOutput,
      };

      saveOJSubmission(newSub);
      setSubmissions(getOJSubmissions());
    } catch (e) {
      console.error(e);
    } finally {
      setIsExecuting(false);
      setExecutionType(null);
    }
  };

  const handleCreateProblem = () => {
    if (!newProblemTitle.trim() || !newProblemCode.trim()) return;

    const newProb: OJProblem = {
      id: 'oj_custom_' + Date.now(),
      code: newProblemCode.trim().toUpperCase(),
      title: newProblemTitle.trim(),
      difficulty: newProblemDiff,
      category: newProblemCategory,
      timeLimitSeconds: Number(newProblemTimeLimit) || 1.0,
      memoryLimitMB: Number(newProblemMemLimit) || 256,
      statement: newProblemStatement.trim() || 'Mô tả bài toán lập trình thi đấu.',
      inputSpec: newProblemInputSpec.trim() || 'Nhập từ bàn phím chuẩn stdin.',
      outputSpec: newProblemOutputSpec.trim() || 'In ra màn hình chuẩn stdout.',
      constraints: 'Theo quy chuẩn thi đấu VNOI / SPOJ.',
      sampleTestCases: [
        {
          id: 'sample_1',
          isSample: true,
          input: newProblemSampleIn.trim() || '1 2',
          expectedOutput: newProblemSampleOut.trim() || '3',
          explanation: 'Ví dụ mẫu 1.',
        },
      ],
      hiddenTestCases: [
        {
          id: 'hidden_1',
          input: newProblemHiddenIn.trim() || newProblemSampleIn.trim() || '10 20',
          expectedOutput: newProblemHiddenOut.trim() || newProblemSampleOut.trim() || '30',
          points: 100,
        },
      ],
      tags: [newProblemCategory, 'Giáo viên biên soạn'],
      source: 'Đề thi tự biên soạn',
      solvedCount: 0,
      totalSubmissions: 0,
      author: currentUser?.fullName || 'Thầy Trần Quang Nhật',
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    saveCustomOJProblem(newProb);
    setProblems(getAllOJProblems());
    setShowAddProblemModal(false);
    setCurrentProblem(newProb);
    setActiveTab('workspace');
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-8 py-6 font-sans">
      {/* Top Banner: VNOI / SPOJ Online Judge Branding & CP Rating */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-3 py-1 text-xs font-bold rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Hệ thống Chấm bài Trực tuyến · VNOI / SPOJ Standard</span>
              </span>
              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30">
                Lập trình thi đấu (Competitive Programming)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              EduTest Online Judge (OJ)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Kho bài tập thuật toán chuẩn thi HSG Quốc Gia (VOI), Olympic Tin học, ICPC và kỳ thi tuyển sinh chuyên Tin. 
              Hỗ trợ viết mã C++ (GCC), Python 3, Java với trình chấm tự động tính thời gian (Runtime), bộ nhớ (Memory) và trả kết quả AC/WA/TLE tức thì.
            </p>
          </div>

          {/* User CP Rating Badge */}
          <div className="bg-slate-800/60 backdrop-blur-md border border-slate-700/60 p-4 rounded-2xl flex items-center gap-5 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Rating Lập trình viên
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold font-mono text-white">
                  {stats.rating}
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${stats.tierColor}`}>
                  {stats.tier}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3">
                <span>Đã AC: <strong className="text-emerald-400">{stats.solvedCount}</strong> bài</span>
                <span>·</span>
                <span>Tỷ lệ AC: <strong className="text-blue-300">{stats.acRate}%</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Spacious Main Navigation Tabs */}
        <div className="flex items-center gap-2 pt-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('problems')}
            className={`py-3 px-6 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'problems'
                ? 'bg-white text-slate-900 shadow-md scale-102'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span>Kho bài tập thuật toán ({problems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('workspace')}
            className={`py-3 px-6 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'workspace'
                ? 'bg-white text-slate-900 shadow-md scale-102'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Terminal className="w-4 h-4 text-emerald-600" />
            <span>Phòng làm bài & Trình chấm IDE</span>
            {currentProblem && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold ml-1">
                {currentProblem.code}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('submissions')}
            className={`py-3 px-6 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'submissions'
                ? 'bg-white text-slate-900 shadow-md scale-102'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4 text-purple-600" />
            <span>Lịch sử nộp bài ({submissions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`py-3 px-6 text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'leaderboard'
                ? 'bg-white text-slate-900 shadow-md scale-102'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Bảng vàng Xếp hạng Top Coders</span>
          </button>

          {isTeacher && (
            <button
              onClick={() => setShowAddProblemModal(true)}
              className="ml-auto py-2.5 px-5 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo bài tập OJ mới</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* VIEW 1: PROBLEM LIST (Kho bài tập) */}
      {/* ============================================================== */}
      {activeTab === 'problems' && (
        <div className="space-y-6">
          {/* Spacious Search and Category Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã bài (VNOI_LIS), tên bài toán, thuật toán..."
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-1">
              {/* Difficulty Filter */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0">
                {['all', 'Dễ', 'Trung bình', 'Khó', 'Chuyên gia'].map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setSelectedDifficulty(diff)}
                    className={`py-1.5 px-4 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      selectedDifficulty === diff
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {diff === 'all' ? 'Mọi độ khó' : diff}
                  </button>
                ))}
              </div>

              {/* Category Dropdown */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Lọc theo thể loại thuật toán"
                className="py-2 px-4 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 shrink-0 cursor-pointer"
              >
                <option value="all">Tất cả chủ đề thuật toán</option>
                <option value="Quy hoạch động">Quy hoạch động (DP)</option>
                <option value="Cấu trúc dữ liệu">Cấu trúc dữ liệu</option>
                <option value="Đồ thị">Đồ thị (Graphs)</option>
                <option value="Toán học">Toán học (Math & Sieve)</option>
                <option value="Tham lam">Tham lam (Greedy)</option>
                <option value="Chuỗi ký tự">Chuỗi ký tự (Strings)</option>
              </select>
            </div>
          </div>

          {/* Problem Table / Cards */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-xs border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-5">Mã bài</th>
                    <th className="py-3.5 px-5">Tên bài toán & Nguồn đề</th>
                    <th className="py-3.5 px-5">Chủ đề</th>
                    <th className="py-3.5 px-5 text-center">Độ khó</th>
                    <th className="py-3.5 px-5 text-center">Giới hạn</th>
                    <th className="py-3.5 px-5 text-center">Tỷ lệ AC</th>
                    <th className="py-3.5 px-5 text-right">Làm bài</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProblems.map((prob) => {
                    const isSolved = submissions.some((s) => s.problemId === prob.id && s.verdict === 'AC');
                    const diffBadge = 
                      prob.difficulty === 'Dễ' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      prob.difficulty === 'Trung bình' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      prob.difficulty === 'Khó' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      'bg-rose-50 text-rose-700 border-rose-200';

                    return (
                      <tr 
                        key={prob.id} 
                        onClick={() => handleSelectProblem(prob)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            {isSolved ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                            )}
                            <span className="font-mono font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                              {prob.code}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {prob.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>{prob.source || 'VNOI / SPOJ'}</span>
                            {prob.tags.slice(0, 3).map((tag, i) => (
                              <span key={i} className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[10px]">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                            {prob.category}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${diffBadge}`}>
                            {prob.difficulty}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-center font-mono text-xs text-slate-600">
                          <div>{prob.timeLimitSeconds}s</div>
                          <div className="text-[11px] text-slate-400">{prob.memoryLimitMB}MB</div>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <div className="font-mono font-bold text-slate-800">
                            {prob.totalSubmissions ? Math.round((prob.solvedCount! / prob.totalSubmissions) * 100) : 48}%
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {prob.solvedCount || 100} / {prob.totalSubmissions || 200}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectProblem(prob);
                            }}
                            className="py-1.5 px-4 bg-slate-900 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Giải bài</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW 2: PROBLEM WORKSPACE & CODE EDITOR (Phòng làm bài) */}
      {/* ============================================================== */}
      {activeTab === 'workspace' && currentProblem && (
        <div className={`space-y-6 ${isEditorFullscreen ? 'fixed inset-0 z-50 bg-slate-900 p-6 overflow-y-auto' : ''}`}>
          {/* Top Bar inside Workspace */}
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('problems')}
              className="py-2 px-3.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Quay lại danh sách bài tập</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-slate-500">
                Bài tập: <strong className="text-slate-900 font-bold">{currentProblem.code}</strong>
              </span>
              <button
                onClick={() => setIsEditorFullscreen(!isEditorFullscreen)}
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title={isEditorFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
              >
                {isEditorFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Problem Statement (Đề bài VNOI / SPOJ) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6 overflow-y-auto max-h-[850px]">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-mono font-bold text-xs px-2.5 py-1 rounded bg-slate-900 text-white">
                    {currentProblem.code}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {currentProblem.category}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {currentProblem.difficulty}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  {currentProblem.title}
                </h2>
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Thời gian: <strong>{currentProblem.timeLimitSeconds}s</strong></span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-slate-400" />
                    <span>Bộ nhớ: <strong>{currentProblem.memoryLimitMB}MB</strong></span>
                  </span>
                </div>
              </div>

              {/* Statement Body */}
              <div className="space-y-4 text-xs sm:text-sm text-slate-800 leading-relaxed pt-2 border-t border-slate-100">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>Đề bài</span>
                </div>
                <div className="prose prose-sm max-w-none">
                  <RichContentRenderer content={currentProblem.statement} />
                </div>
              </div>

              {/* Input Format */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wide">
                  Dữ liệu vào (Input Specification)
                </h4>
                <div className="text-xs sm:text-sm text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <RichContentRenderer content={currentProblem.inputSpec} />
                </div>
              </div>

              {/* Output Format */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wide">
                  Dữ liệu ra (Output Specification)
                </h4>
                <div className="text-xs sm:text-sm text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <RichContentRenderer content={currentProblem.outputSpec} />
                </div>
              </div>

              {/* Constraints */}
              {currentProblem.constraints && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wide">
                    Ràng buộc / Giới hạn
                  </h4>
                  <div className="text-xs text-slate-700 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
                    <RichContentRenderer content={currentProblem.constraints} />
                  </div>
                </div>
              )}

              {/* Sample Test Cases */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wide">
                  Ví dụ mẫu (Sample Tests)
                </h4>
                {currentProblem.sampleTestCases.map((tc, idx) => (
                  <div key={tc.id || idx} className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                    <div className="font-bold text-slate-900">Ví dụ #{idx + 1}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
                          <span>Input</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(tc.input, `in_${idx}`)}
                            className="hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {copiedText === `in_${idx}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedText === `in_${idx}` ? 'Đã sao chép' : 'Sao chép'}</span>
                          </button>
                        </div>
                        <pre className="p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-xs overflow-x-auto text-slate-900">
                          {tc.input}
                        </pre>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
                          <span>Output</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(tc.expectedOutput, `out_${idx}`)}
                            className="hover:text-blue-600 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {copiedText === `out_${idx}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedText === `out_${idx}` ? 'Đã sao chép' : 'Sao chép'}</span>
                          </button>
                        </div>
                        <pre className="p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-xs overflow-x-auto text-slate-900">
                          {tc.expectedOutput}
                        </pre>
                      </div>
                    </div>
                    {tc.explanation && (
                      <div className="text-[11px] text-slate-600 pt-1">
                        <strong>Giải thích:</strong> {tc.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN: Code Editor & Execution Console */}
            <div className="lg:col-span-7 space-y-4">
              {/* Editor Header Bar */}
              <div className="bg-slate-900 text-white rounded-t-2xl p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold">Mã nguồn giải thuật</span>
                  </div>

                  {/* Language Selector */}
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value as OJLanguage)}
                    aria-label="Chọn ngôn ngữ lập trình"
                    className="bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                  >
                    <option value="cpp">C++ (GCC C++17 / Fast I/O)</option>
                    <option value="python">Python 3 (CP Standard)</option>
                    <option value="java">Java 17 (Main.java)</option>
                    <option value="pascal">Pascal / FreePascal</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  {/* Font Size Selector */}
                  <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg text-xs">
                    {[12, 14, 16].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setEditorFontSize(sz)}
                        className={`px-2 py-0.5 rounded font-mono font-bold cursor-pointer ${
                          editorFontSize === sz ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const template = currentProblem.starterCodes?.[selectedLanguage] || '';
                      setSourceCode(template);
                    }}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Khôi phục mã mẫu ban đầu"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Code Area with line numbers & Tab indent support */}
              <div className="relative bg-slate-950 text-slate-100 font-mono rounded-b-2xl border border-slate-800 shadow-xl overflow-hidden">
                <textarea
                  value={sourceCode}
                  onChange={(e) => setSourceCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const target = e.target as HTMLTextAreaElement;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const newCode = sourceCode.substring(0, start) + '    ' + sourceCode.substring(end);
                      setSourceCode(newCode);
                      setTimeout(() => {
                        target.selectionStart = target.selectionEnd = start + 4;
                      }, 0);
                    }
                  }}
                  rows={20}
                  style={{ fontSize: `${editorFontSize}px` }}
                  spellCheck={false}
                  placeholder="// Viết mã nguồn thuật toán của bạn tại đây..."
                  className="w-full p-4 bg-transparent resize-y font-mono focus:outline-none focus:ring-0 leading-relaxed text-slate-200"
                />
              </div>

              {/* Action Buttons: Run Code & Submit Solution */}
              <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunCode}
                    disabled={isExecuting}
                    className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Play className={`w-4 h-4 text-emerald-600 ${executionType === 'run' ? 'animate-spin' : ''}`} />
                    <span>{executionType === 'run' ? 'Đang chạy thử...' : 'Chạy thử nghiệm (Run Code)'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSubmitCode}
                    disabled={isExecuting}
                    className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Send className={`w-4 h-4 ${executionType === 'submit' ? 'animate-bounce' : ''}`} />
                    <span>{executionType === 'submit' ? 'Đang chấm test cases...' : 'Nộp bài chấm điểm (Submit)'}</span>
                  </button>
                </div>
              </div>

              {/* Bottom Test Console Tabs */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="flex items-center gap-1 border-b border-slate-200 px-4 pt-3 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setConsoleTab('sample')}
                    className={`py-2 px-4 rounded-t-lg transition-colors cursor-pointer ${
                      consoleTab === 'sample' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Test ví dụ mẫu
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsoleTab('custom')}
                    className={`py-2 px-4 rounded-t-lg transition-colors cursor-pointer ${
                      consoleTab === 'custom' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tự nhập Custom Input
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsoleTab('result')}
                    className={`py-2 px-4 rounded-t-lg transition-colors cursor-pointer relative ${
                      consoleTab === 'result' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>Kết quả chấm (Verdict)</span>
                    {lastSubmissionResult && (
                      <span className={`ml-1.5 px-1.5 py-0.2 rounded text-[10px] ${
                        lastSubmissionResult.verdict === 'AC' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                      }`}>
                        {lastSubmissionResult.verdict}
                      </span>
                    )}
                  </button>
                </div>

                <div className="p-4">
                  {/* TAB A: SAMPLE INPUTS */}
                  {consoleTab === 'sample' && (
                    <div className="space-y-3 text-xs">
                      <p className="text-slate-500">
                        Chọn một test ví dụ mẫu dưới đây để nạp vào trình chạy thử:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {currentProblem.sampleTestCases.map((tc, idx) => (
                          <div 
                            key={idx}
                            onClick={() => {
                              setCustomInput(tc.input);
                              setConsoleTab('custom');
                            }}
                            className="p-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition-colors"
                          >
                            <div className="font-bold text-slate-800 mb-1">Ví dụ #{idx + 1} (Nhấp để nạp)</div>
                            <pre className="font-mono text-[11px] text-slate-600 truncate">{tc.input}</pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB B: CUSTOM INPUT */}
                  {consoleTab === 'custom' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Dữ liệu đầu vào stdin (Custom Input):
                      </label>
                      <textarea
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        rows={4}
                        placeholder="Nhập test case của bạn tại đây..."
                        className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-900"
                      />
                    </div>
                  )}

                  {/* TAB C: VERDICT & RESULTS */}
                  {consoleTab === 'result' && (
                    <div className="space-y-4">
                      {isExecuting ? (
                        <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                          <Terminal className="w-8 h-8 text-emerald-500 animate-spin mx-auto" />
                          <p className="font-bold text-slate-800">
                            {executionType === 'submit' ? 'Đang chấm trên toàn bộ Test Cases...' : 'Đang thực thi mã nguồn...'}
                          </p>
                        </div>
                      ) : lastSubmissionResult ? (
                        <div className="space-y-4">
                          {/* Main Verdict Card */}
                          <div className={`p-5 rounded-2xl border flex items-center justify-between ${
                            lastSubmissionResult.verdict === 'AC'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : lastSubmissionResult.verdict === 'TLE'
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-rose-50 border-rose-300 text-rose-900'
                          }`}>
                            <div className="flex items-center gap-3">
                              {lastSubmissionResult.verdict === 'AC' ? (
                                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                              ) : (
                                <XCircle className="w-8 h-8 text-rose-600" />
                              )}
                              <div>
                                <div className="text-xl font-extrabold font-mono">
                                  {lastSubmissionResult.verdict === 'AC' ? 'ACCEPTED (Chấp nhận bài làm)' :
                                   lastSubmissionResult.verdict === 'WA' ? 'WRONG ANSWER (Sai kết quả)' :
                                   lastSubmissionResult.verdict === 'TLE' ? 'TIME LIMIT EXCEEDED (Quá thời gian)' :
                                   lastSubmissionResult.verdict === 'CE' ? 'COMPILATION ERROR (Lỗi biên dịch)' : 'RUNTIME ERROR'}
                                </div>
                                <div className="text-xs font-semibold mt-0.5 opacity-90">
                                  Điểm: <strong>{lastSubmissionResult.score}/100</strong> · Đúng {lastSubmissionResult.passedTests}/{lastSubmissionResult.totalTests} tests
                                </div>
                              </div>
                            </div>

                            <div className="text-right font-mono text-xs opacity-90">
                              <div>Thời gian: <strong>{lastSubmissionResult.maxExecutionTimeMs} ms</strong></div>
                              <div>Bộ nhớ: <strong>{lastSubmissionResult.maxMemoryMB} MB</strong></div>
                            </div>
                          </div>

                          {/* Subtasks Test Cases Matrix */}
                          <div className="space-y-2">
                            <h5 className="font-bold text-xs text-slate-700">Chi tiết từng Test Case:</h5>
                            <div className="overflow-x-auto border rounded-xl">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                                  <tr>
                                    <th className="py-2 px-3">Test</th>
                                    <th className="py-2 px-3">Kết quả</th>
                                    <th className="py-2 px-3">Thời gian</th>
                                    <th className="py-2 px-3">Bộ nhớ</th>
                                    <th className="py-2 px-3">Chi tiết</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {lastSubmissionResult.testResults.map((tr) => (
                                    <tr key={tr.testIndex} className="hover:bg-slate-50">
                                      <td className="py-2 px-3 font-mono font-bold">#{tr.testIndex}</td>
                                      <td className="py-2 px-3">
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                          tr.verdict === 'AC' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                        }`}>
                                          {tr.verdict}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 font-mono text-slate-600">{tr.executionTimeMs} ms</td>
                                      <td className="py-2 px-3 font-mono text-slate-600">{tr.memoryUsedMB} MB</td>
                                      <td className="py-2 px-3 text-slate-500 font-mono text-[11px] truncate max-w-[200px]">
                                        {tr.errorMessage || (tr.verdict === 'AC' ? 'Output chính xác' : `Output: ${tr.actualOutput?.substring(0, 30)}`)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-400">
                          Chưa có kết quả. Nhấn <strong>"Chạy thử nghiệm"</strong> hoặc <strong>"Nộp bài"</strong> để bắt đầu chấm.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW 3: SUBMISSIONS HISTORY (Lịch sử nộp bài) */}
      {/* ============================================================== */}
      {activeTab === 'submissions' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-4 p-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                <span>Lịch sử các lần nộp bài lập trình thi đấu</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ghi nhận chi tiết điểm số, ngôn ngữ, thời gian thực thi (Runtime) và bộ nhớ (Memory)
              </p>
            </div>
          </div>

          {submissions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Bạn chưa nộp bài nào. Hãy chọn bài toán trong kho bài tập để nộp bài đầu tiên!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-xs border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Mã bài</th>
                    <th className="py-3 px-4">Tên bài toán</th>
                    <th className="py-3 px-4">Người nộp</th>
                    <th className="py-3 px-4">Ngôn ngữ</th>
                    <th className="py-3 px-4 text-center">Kết quả (Verdict)</th>
                    <th className="py-3 px-4 text-center">Điểm số</th>
                    <th className="py-3 px-4 text-center">Thời gian</th>
                    <th className="py-3 px-4 text-center">Bộ nhớ</th>
                    <th className="py-3 px-4 text-right">Thời điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">{sub.problemCode}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{sub.problemTitle}</td>
                      <td className="py-3 px-4 text-slate-700">{sub.userName}</td>
                      <td className="py-3 px-4 font-mono uppercase font-semibold text-slate-600">{sub.language}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          sub.verdict === 'AC' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          sub.verdict === 'TLE' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {sub.verdict}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-extrabold text-slate-900">
                        {sub.score}/100
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">{sub.maxExecutionTimeMs} ms</td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">{sub.maxMemoryMB} MB</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400 text-xs">
                        {new Date(sub.submittedAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* VIEW 4: LEADERBOARD (Bảng vàng Top Coders) */}
      {/* ============================================================== */}
      {activeTab === 'leaderboard' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <span>Bảng vàng Vinh danh Lập trình viên VNOI / SPOJ</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Xếp theo điểm số CP Rating và số lượng bài toán giải thành công (AC)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-xs border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Hạng</th>
                  <th className="py-3 px-4">Lập trình viên / Thí sinh</th>
                  <th className="py-3 px-4">Danh hiệu CP Rating</th>
                  <th className="py-3 px-4 text-center">Số bài AC</th>
                  <th className="py-3 px-4 text-center">Tổng điểm</th>
                  <th className="py-3 px-4 text-right">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { rank: 1, name: 'Thầy Trần Quang Nhật (Admin Tối Cao)', tier: 'Grandmaster ⭐⭐⭐', solved: 28, score: 2800, rating: 2800, color: 'text-rose-700 bg-rose-50 border-rose-300' },
                  { rank: 2, name: 'Lê Hoàng Yến (Chuyên Tin THPT)', tier: 'Master ⭐⭐', solved: 19, score: 1900, rating: 2150, color: 'text-amber-700 bg-amber-50 border-amber-300' },
                  { rank: 3, name: 'Trần Minh Quân (Đội tuyển HSG)', tier: 'Candidate Master ⭐', solved: 15, score: 1500, rating: 1920, color: 'text-purple-700 bg-purple-50 border-purple-300' },
                  { rank: 4, name: currentUser?.fullName || 'Bạn (Thí sinh)', tier: stats.tier, solved: stats.solvedCount, score: stats.solvedCount * 100, rating: stats.rating, color: stats.tierColor },
                  { rank: 5, name: 'Phạm Đức Anh', tier: 'Specialist', solved: 8, score: 800, rating: 1450, color: 'text-cyan-700 bg-cyan-50 border-cyan-300' },
                ].sort((a, b) => b.rating - a.rating).map((coder, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-mono font-bold">
                      {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {coder.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${coder.color}`}>
                        {coder.tier}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-700">
                      {coder.solved} bài
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800">
                      {coder.score}đ
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-blue-700 text-base">
                      {coder.rating}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD CUSTOM OJ PROBLEM (Dành cho Giáo viên) */}
      {/* ============================================================== */}
      {showAddProblemModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-4 my-8">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              <span>Biên soạn Bài tập Lập trình thi đấu mới</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mã bài (Code) *</label>
                <input
                  type="text"
                  value={newProblemCode}
                  onChange={(e) => setNewProblemCode(e.target.value)}
                  placeholder="VD: VOI_BAG, VNOI_PRIME"
                  className="w-full px-3 py-2 text-xs border rounded-lg font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tên bài toán *</label>
                <input
                  type="text"
                  value={newProblemTitle}
                  onChange={(e) => setNewProblemTitle(e.target.value)}
                  placeholder="VD: Bài toán Xếp ba lô nâng cao"
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Chủ đề thuật toán</label>
                <select
                  value={newProblemCategory}
                  onChange={(e) => setNewProblemCategory(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                >
                  <option value="Quy hoạch động">Quy hoạch động (DP)</option>
                  <option value="Cấu trúc dữ liệu">Cấu trúc dữ liệu</option>
                  <option value="Đồ thị">Đồ thị (Graphs)</option>
                  <option value="Toán học">Toán học</option>
                  <option value="Tham lam">Tham lam (Greedy)</option>
                  <option value="Chuỗi ký tự">Chuỗi ký tự (Strings)</option>
                  <option value="Nhập môn">Nhập môn</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Độ khó</label>
                <select
                  value={newProblemDiff}
                  onChange={(e) => setNewProblemDiff(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                >
                  <option value="Dễ">Dễ</option>
                  <option value="Trung bình">Trung bình</option>
                  <option value="Khó">Khó</option>
                  <option value="Chuyên gia">Chuyên gia</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giới hạn thời gian (giây)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newProblemTimeLimit}
                  onChange={(e) => setNewProblemTimeLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Giới hạn bộ nhớ (MB)</label>
                <input
                  type="number"
                  value={newProblemMemLimit}
                  onChange={(e) => setNewProblemMemLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nội dung đề bài</label>
              <textarea
                rows={3}
                value={newProblemStatement}
                onChange={(e) => setNewProblemStatement(e.target.value)}
                placeholder="Mô tả bài toán (hỗ trợ LaTeX $...$)..."
                className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sample Input</label>
                <textarea
                  rows={2}
                  value={newProblemSampleIn}
                  onChange={(e) => setNewProblemSampleIn(e.target.value)}
                  placeholder="Dữ liệu vào ví dụ"
                  className="w-full px-3 py-2 text-xs font-mono border rounded-lg focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sample Output</label>
                <textarea
                  rows={2}
                  value={newProblemSampleOut}
                  onChange={(e) => setNewProblemSampleOut(e.target.value)}
                  placeholder="Dữ liệu ra ví dụ"
                  className="w-full px-3 py-2 text-xs font-mono border rounded-lg focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowAddProblemModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateProblem}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer shadow-xs"
              >
                Tạo bài tập OJ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
