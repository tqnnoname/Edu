import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Swords, 
  Trophy, 
  Zap, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Shield, 
  Award, 
  RotateCcw, 
  ArrowRight, 
  UserCheck, 
  Layers, 
  FileText, 
  Shuffle, 
  Users, 
  Timer,
  Sparkles
} from 'lucide-react';
import { Exam, ExamBundle, Question } from '../types/exam';
import { RichContentRenderer } from './RichContentRenderer';

interface BattleArenaViewProps {
  onBackToHome: () => void;
  allExams?: Exam[];
  allBundles?: ExamBundle[];
}

interface BattleQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  sourceTitle?: string;
}

const FALLBACK_BATTLE_QUESTIONS: BattleQuestion[] = [
  {
    question: 'Hàm số $y = x^3 - 3x^2 + 2$ đạt cực tiểu tại điểm nào?',
    options: ['$x = 0$', '$x = 2$', '$x = -2$', '$x = 1$'],
    correctAnswer: 1,
    explanation: 'Ta có $y\' = 3x^2 - 6x = 3x(x - 2)$. $y\'\' = 6x - 6$. Tại $x = 2$, $y\'\'(2) = 6 > 0$ nên đạt cực tiểu tại $x = 2$.',
    sourceTitle: 'Toán học 12',
  },
  {
    question: 'Tìm nguyên hàm của hàm số $f(x) = e^{2x}$?',
    options: ['$\\frac{1}{2}e^{2x} + C$', '$2e^{2x} + C$', '$e^{2x} + C$', '$\\frac{1}{4}e^{2x} + C$'],
    correctAnswer: 0,
    explanation: '$\\int e^{2x} dx = \\frac{1}{2}e^{2x} + C$.',
    sourceTitle: 'Giải tích 12',
  },
  {
    question: 'Trong không gian $Oxyz$, mặt phẳng $(P): 2x - y + 3z - 5 = 0$ có một vectơ pháp tuyến là:',
    options: ['$\\vec{n} = (2; -1; 3)$', '$\\vec{n} = (2; 1; 3)$', '$\\vec{n} = (2; -1; -5)$', '$\\vec{n} = (-2; -1; 3)$'],
    correctAnswer: 0,
    explanation: 'Hệ số trước $x, y, z$ lần lượt là $2, -1, 3$ nên $\\vec{n} = (2; -1; 3)$.',
    sourceTitle: 'Hình học Oxyz',
  },
  {
    question: 'Số nghiệm nguyên của bất phương trình $\\log_2(x - 1) \\le 3$ là bao nhiêu?',
    options: ['7', '8', '9', 'Vô số'],
    correctAnswer: 1,
    explanation: 'ĐK: $x > 1$. BPT $\\iff x - 1 \\le 2^3 = 8 \\iff x \\le 9$. Kết hợp điều kiện: $1 < x \\le 9$. Các số nguyên là $2, 3, 4, 5, 6, 7, 8, 9$ (8 nghiệm).',
    sourceTitle: 'Toán học 12',
  },
  {
    question: 'Khối lăng trụ có diện tích đáy $B = 6a^2$ và chiều cao $h = 3a$ thì thể tích $V$ bằng:',
    options: ['$18a^3$', '$6a^3$', '$9a^3$', '$54a^3$'],
    correctAnswer: 0,
    explanation: 'Thể tích khối lăng trụ $V = B \\cdot h = 6a^2 \\cdot 3a = 18a^3$.',
    sourceTitle: 'Hình học không gian',
  },
];

const OPPONENTS = [
  { id: 'op1', name: 'Trần Minh Quân', school: '12A1 Chuyên Toán', rating: 1850, avatar: '👨‍🎓', winRate: '88%' },
  { id: 'op2', name: 'Lê Hoàng Yến', school: '12A1 Chuyên Toán', rating: 1790, avatar: '👩‍🎓', winRate: '82%' },
  { id: 'op3', name: 'Bot AI Thông Thái (Cực nhanh)', school: 'AI Studio Engine', rating: 1950, avatar: '🤖', winRate: '95%' },
  { id: 'op4', name: 'Nguyễn Hải Nam', school: 'THPT Chu Văn An', rating: 1650, avatar: '🧑‍💻', winRate: '75%' },
];

const AVAILABLE_ARENA_GROUPS = [
  { id: 'g_math', name: 'Toán học', icon: '📐' },
  { id: 'g_phys', name: 'Vật lý', icon: '⚡' },
  { id: 'g_chem', name: 'Hóa học', icon: '🧪' },
  { id: 'g_bio', name: 'Sinh học', icon: '🧬' },
  { id: 'g_eng', name: 'Tiếng Anh', icon: '🌐' },
  { id: 'g_lit', name: 'Ngữ văn', icon: '📖' },
  { id: 'g_hist', name: 'Lịch sử', icon: '🏛️' },
  { id: 'g_geo', name: 'Địa lý', icon: '🌍' },
];

export const BattleArenaView: React.FC<BattleArenaViewProps> = ({ 
  onBackToHome,
  allExams = [],
  allBundles = []
}) => {
  // Source configuration
  const [sourceType, setSourceType] = useState<'all' | 'exam' | 'bundle'>('all');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedBundleId, setSelectedBundleId] = useState<string>('');
  
  // Group selection constraint (Số nhóm phải chọn: tối đa và yêu cầu)
  const REQUIRED_GROUP_COUNT = 3;
  const [selectedGroups, setSelectedGroups] = useState<string[]>(['g_math', 'g_phys', 'g_chem']);
  const [groupSelectionTimer, setGroupSelectionTimer] = useState<number>(10);
  const [isGroupTimerActive, setIsGroupTimerActive] = useState<boolean>(false);

  const [selectedOpponent, setSelectedOpponent] = useState(OPPONENTS[0]);
  const [gameState, setGameState] = useState<'lobby' | 'countdown' | 'playing' | 'round_result' | 'game_over'>('lobby');
  const [matchCountdown, setMatchCountdown] = useState(3);
  
  // Real dynamic battle questions
  const [matchQuestions, setMatchQuestions] = useState<BattleQuestion[]>(FALLBACK_BATTLE_QUESTIONS);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [questionTimeRemaining, setQuestionTimeRemaining] = useState(15);
  
  // Scores
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [playerStreak, setPlayerStreak] = useState(0);
  const [opponentStreak, setOpponentStreak] = useState(0);
  
  // Current round answers
  const [playerAnswer, setPlayerAnswer] = useState<number | null>(null);
  const [opponentAnswer, setOpponentAnswer] = useState<number | null>(null);
  const [opponentThinking, setOpponentThinking] = useState(true);

  const timerRef = useRef<number | null>(null);

  // Group selection timer effect: If timer hits 0 and selected groups < REQUIRED_GROUP_COUNT, pick randomly!
  useEffect(() => {
    let t: number | undefined;
    if (isGroupTimerActive && groupSelectionTimer > 0) {
      t = window.setInterval(() => {
        setGroupSelectionTimer((prev) => {
          if (prev <= 1) {
            // Auto complete groups randomly
            autoFillGroupsRandomly();
            setIsGroupTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (t) clearInterval(t);
    };
  }, [isGroupTimerActive, groupSelectionTimer, selectedGroups]);

  const autoFillGroupsRandomly = () => {
    setSelectedGroups((prev) => {
      const current = [...prev];
      const available = AVAILABLE_ARENA_GROUPS.filter((g) => !current.includes(g.id));
      while (current.length < REQUIRED_GROUP_COUNT && available.length > 0) {
        const randIdx = Math.floor(Math.random() * available.length);
        const [picked] = available.splice(randIdx, 1);
        current.push(picked.id);
      }
      return current;
    });
  };

  const handleToggleGroup = (groupId: string) => {
    setSelectedGroups((prev) => {
      if (prev.includes(groupId)) {
        return prev.filter((id) => id !== groupId);
      } else {
        if (prev.length >= REQUIRED_GROUP_COUNT) {
          // Replace last one or reject
          return [...prev.slice(1), groupId];
        }
        return [...prev, groupId];
      }
    });
  };

  // Build match questions dynamically from chosen Exam or Bundle or All Exams
  const generateMatchQuestions = (): BattleQuestion[] => {
    const pool: BattleQuestion[] = [];

    const extractFromQuestions = (questions: Question[], sourceTitle: string) => {
      for (const q of questions) {
        if (q.type === 'single_choice' && q.options && q.options.length >= 2 && q.correctAnswer !== undefined) {
          pool.push({
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || 'Đáp án chính xác theo ngân hàng đề thi đã duyệt.',
            sourceTitle,
          });
        } else if (q.type === 'grouped' && q.subQuestions) {
          for (const sub of q.subQuestions) {
            if (sub.type === 'single_choice' && sub.options && sub.correctAnswer !== undefined) {
              pool.push({
                question: `${q.question} \n\n* ${sub.question}`,
                options: sub.options,
                correctAnswer: sub.correctAnswer,
                explanation: sub.explanation || q.explanation || 'Đáp án theo câu hỏi chùm.',
                sourceTitle,
              });
            }
          }
        }
      }
    };

    if (sourceType === 'exam' && selectedExamId) {
      const ex = allExams.find((e) => e.id === selectedExamId);
      if (ex) extractFromQuestions(ex.questions, ex.title);
    } else if (sourceType === 'bundle' && selectedBundleId) {
      const b = allBundles.find((item) => item.id === selectedBundleId);
      if (b && b.sections) {
        for (const s of b.sections) {
          extractFromQuestions(s.questions, `${b.title} - ${s.subjectName}`);
        }
      }
    } else {
      // All exams & bundles
      for (const ex of allExams) {
        extractFromQuestions(ex.questions, ex.title);
      }
      for (const b of allBundles) {
        if (b.sections) {
          for (const s of b.sections) {
            extractFromQuestions(s.questions, `${b.title} - ${s.subjectName}`);
          }
        }
      }
    }

    // If pool has fewer than 5, supplement with fallback questions
    if (pool.length < 5) {
      pool.push(...FALLBACK_BATTLE_QUESTIONS);
    }

    // Shuffle pool and select 5 questions
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  };

  // Start match
  const handleStartMatch = (opponent = selectedOpponent) => {
    // If groups lack count, fill randomly
    if (selectedGroups.length < REQUIRED_GROUP_COUNT) {
      autoFillGroupsRandomly();
    }

    const questions = generateMatchQuestions();
    setMatchQuestions(questions);
    setSelectedOpponent(opponent);
    setGameState('countdown');
    setMatchCountdown(3);
    setPlayerScore(0);
    setOpponentScore(0);
    setPlayerStreak(0);
    setOpponentStreak(0);
    setCurrentQIndex(0);
  };

  // Countdown 3, 2, 1 -> Start
  useEffect(() => {
    if (gameState === 'countdown') {
      const timer = setInterval(() => {
        setMatchCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setGameState('playing');
            startQuestionRound(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState]);

  const startQuestionRound = (qIndex: number) => {
    setCurrentQIndex(qIndex);
    setPlayerAnswer(null);
    setOpponentAnswer(null);
    setOpponentThinking(true);
    setQuestionTimeRemaining(15);

    // Simulate opponent answering after 3.5 - 7 seconds
    const opponentDelay = 3500 + Math.random() * 4000;
    setTimeout(() => {
      const curQ = matchQuestions[qIndex] || FALLBACK_BATTLE_QUESTIONS[0];
      const isCorrect = Math.random() < 0.75;
      const ans = isCorrect ? curQ.correctAnswer : (curQ.correctAnswer + 1) % (curQ.options.length || 4);
      setOpponentAnswer(ans);
      setOpponentThinking(false);
    }, opponentDelay);
  };

  // Round timer countdown
  useEffect(() => {
    if (gameState !== 'playing') return;

    timerRef.current = window.setInterval(() => {
      setQuestionTimeRemaining((prev) => {
        if (prev <= 1) {
          finishCurrentRound();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, currentQIndex]);

  const handlePlayerSelectAnswer = (ansIdx: number) => {
    if (playerAnswer !== null || gameState !== 'playing') return;
    setPlayerAnswer(ansIdx);

    setTimeout(() => {
      finishCurrentRound(ansIdx);
    }, 1200);
  };

  const finishCurrentRound = (chosenAns = playerAnswer) => {
    if (timerRef.current) clearInterval(timerRef.current);

    const curQ = matchQuestions[currentQIndex] || FALLBACK_BATTLE_QUESTIONS[0];
    const playerCorrect = chosenAns === curQ.correctAnswer;
    const oppAns = opponentAnswer !== null ? opponentAnswer : curQ.correctAnswer;
    const oppCorrect = oppAns === curQ.correctAnswer;

    // Calculate score with streak bonus
    if (playerCorrect) {
      const speedBonus = questionTimeRemaining * 10;
      const pPoints = 100 + speedBonus + playerStreak * 25;
      setPlayerScore((prev) => prev + pPoints);
      setPlayerStreak((prev) => prev + 1);
    } else {
      setPlayerStreak(0);
    }

    if (oppCorrect) {
      const oPoints = 100 + 40 + opponentStreak * 20;
      setOpponentScore((prev) => prev + oPoints);
      setOpponentStreak((prev) => prev + 1);
    } else {
      setOpponentStreak(0);
    }

    setGameState('round_result');

    setTimeout(() => {
      if (currentQIndex < matchQuestions.length - 1) {
        setGameState('playing');
        startQuestionRound(currentQIndex + 1);
      } else {
        setGameState('game_over');
      }
    }, 3200);
  };

  const currentQ = matchQuestions[currentQIndex] || FALLBACK_BATTLE_QUESTIONS[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 font-sans">
      {/* LOBBY SCREEN */}
      {gameState === 'lobby' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl text-center relative overflow-hidden border border-rose-900/40">
            <div className="absolute top-2 right-2 text-rose-500/10 text-9xl font-extrabold select-none pointer-events-none">
              VS
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider mb-3">
              <Swords className="w-3.5 h-3.5" />
              <span>Đấu trường Trắc nghiệm 1v1 Real-Time</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Thách Đấu Trực Tiếp & Thi Đối Kháng
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto mt-2 leading-relaxed">
              Câu hỏi thi được tích hợp từ các đề thi hoặc tổ hợp môn trong hệ thống! Thí sinh trả lời đúng và nhanh hơn sẽ giành điểm cao cùng hiệu ứng chuỗi Combo thắng trận.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleStartMatch()}
                className="py-3 px-8 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm rounded-xl transition-transform active:scale-95 shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current text-slate-950" />
                <span>Bắt đầu Trận Đấu ngay (5 Câu)</span>
              </button>
              <button
                type="button"
                onClick={onBackToHome}
                className="py-3 px-5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Về thư viện đề
              </button>
            </div>
          </div>

          {/* CARD 1: Cấu hình nguồn câu hỏi đấu trường (Đề riêng lẻ hoặc Tổ hợp môn) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Nguồn câu hỏi cho Đấu trường</span>
              </h3>
              <span className="text-xs text-slate-500">
                Tích hợp đề thi & tổ hợp môn thực tế
              </span>
            </div>

            {/* Source Type Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSourceType('all')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  sourceType === 'all'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <Shuffle className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-slate-900">Tất cả ngân hàng đề</div>
                  <div className="text-[11px] text-slate-500">Tổng hợp đa dạng môn</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType('exam');
                  if (!selectedExamId && allExams.length > 0) setSelectedExamId(allExams[0].id);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  sourceType === 'exam'
                    ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <FileText className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-slate-900">Từ một Đề thi cụ thể</div>
                  <div className="text-[11px] text-slate-500">{allExams.length} đề thi sẵn sàng</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceType('bundle');
                  if (!selectedBundleId && allBundles.length > 0) setSelectedBundleId(allBundles[0].id);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  sourceType === 'bundle'
                    ? 'border-purple-600 bg-purple-50/60 ring-2 ring-purple-500 shadow-2xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <Layers className="w-5 h-5 text-purple-600 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-slate-900">Từ Bài thi Tổ hợp môn</div>
                  <div className="text-[11px] text-slate-500">{allBundles.length} tổ hợp thi</div>
                </div>
              </button>
            </div>

            {/* Detailed selection based on chosen source */}
            {sourceType === 'exam' && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Chọn đề thi làm ngân hàng câu hỏi thách đấu:
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {allExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.subject} - {ex.questions.length} câu)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sourceType === 'bundle' && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Chọn tổ hợp môn làm ngân hàng câu hỏi thách đấu:
                </label>
                <select
                  value={selectedBundleId}
                  onChange={(e) => setSelectedBundleId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {allBundles.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.sections?.length || 0} phân môn)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* CARD 2: Chọn nhóm / môn thách đấu với giới hạn và tự động chọn nếu hết giờ */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Chọn nhóm môn thi đấu ({selectedGroups.length}/{REQUIRED_GROUP_COUNT} nhóm)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Số nhóm phải chọn: <strong>{REQUIRED_GROUP_COUNT} nhóm</strong>. Nếu thiếu khi vào thi, máy sẽ tự động chọn ngẫu nhiên thêm cho đủ.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={autoFillGroupsRandomly}
                  className="px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Chọn ngẫu nhiên cho đủ</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {AVAILABLE_ARENA_GROUPS.map((g) => {
                const isChecked = selectedGroups.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleToggleGroup(g.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                      isChecked
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold ring-1 ring-amber-400 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl">{g.icon}</span>
                    <span className="text-xs">{g.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CARD 3: Choose Opponent */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center justify-between">
              <span>Chọn Đối thủ Thách đấu</span>
              <span className="text-xs text-slate-500 font-normal">Học sinh trong lớp hoặc Bot AI</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {OPPONENTS.map((op) => {
                const isSelected = selectedOpponent.id === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedOpponent(op)}
                    className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{op.avatar}</div>
                      <div>
                        <div className="font-bold text-sm text-slate-900">{op.name}</div>
                        <div className="text-xs text-slate-500">{op.school}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-indigo-700">
                        {op.rating} RP
                      </div>
                      <div className="text-[11px] text-emerald-600 font-semibold">
                        Thắng: {op.winRate}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* COUNTDOWN 3, 2, 1 */}
      {gameState === 'countdown' && (
        <div className="bg-slate-900 text-white rounded-3xl p-16 text-center shadow-2xl space-y-4 animate-in fade-in zoom-in border border-slate-800">
          <div className="text-xs uppercase font-bold text-amber-400 tracking-widest">
            Trận đấu chuẩn bị bắt đầu
          </div>
          <div className="text-7xl font-extrabold font-mono text-white animate-bounce">
            {matchCountdown}
          </div>
          <div className="flex items-center justify-center gap-8 pt-4">
            <div className="text-center">
              <div className="text-3xl">👨‍🎓</div>
              <div className="font-bold text-sm mt-1">Nguyễn Văn An (Bạn)</div>
            </div>
            <div className="text-rose-500 font-extrabold text-2xl">VS</div>
            <div className="text-center">
              <div className="text-3xl">{selectedOpponent.avatar}</div>
              <div className="font-bold text-sm mt-1">{selectedOpponent.name}</div>
            </div>
          </div>
        </div>
      )}

      {/* PLAYING & ROUND RESULT */}
      {(gameState === 'playing' || gameState === 'round_result') && currentQ && (
        <div className="space-y-4">
          {/* Header Scoreboard Duel */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md flex items-center justify-between gap-4">
            {/* Player Info */}
            <div className="flex items-center gap-3 flex-1">
              <div className="text-2xl">👨‍🎓</div>
              <div>
                <div className="text-xs font-bold text-slate-200">Bạn</div>
                <div className="text-xl font-mono font-extrabold text-blue-400">
                  {playerScore} <span className="text-xs text-slate-400">pts</span>
                </div>
                {playerStreak > 1 && (
                  <div className="text-[10px] text-amber-400 font-bold">
                    🔥 Combo x{playerStreak}
                  </div>
                )}
              </div>
            </div>

            {/* Timer Center */}
            <div className="flex flex-col items-center shrink-0">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Câu {currentQIndex + 1}/{matchQuestions.length}
              </div>
              <div className={`text-2xl font-extrabold font-mono tabular-nums ${
                questionTimeRemaining <= 5 ? 'text-rose-400 animate-pulse' : 'text-amber-400'
              }`}>
                {questionTimeRemaining}s
              </div>
            </div>

            {/* Opponent Info */}
            <div className="flex items-center gap-3 flex-1 justify-end text-right">
              <div>
                <div className="text-xs font-bold text-slate-200">{selectedOpponent.name}</div>
                <div className="text-xl font-mono font-extrabold text-rose-400">
                  {opponentScore} <span className="text-xs text-slate-400">pts</span>
                </div>
                {opponentStreak > 1 && (
                  <div className="text-[10px] text-amber-400 font-bold">
                    🔥 Combo x{opponentStreak}
                  </div>
                )}
              </div>
              <div className="text-2xl">{selectedOpponent.avatar}</div>
            </div>
          </div>

          {/* Opponent Status Indicator */}
          <div className="flex items-center justify-between text-xs px-2 text-slate-500">
            <span>Đối thủ: {opponentThinking ? 'Đang suy nghĩ lựa chọn...' : 'Đã bấm chọn đáp án!'}</span>
            {currentQ.sourceTitle && (
              <span className="text-slate-400 italic">Nguồn: {currentQ.sourceTitle}</span>
            )}
          </div>

          {/* Question Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
              <RichContentRenderer content={currentQ.question} />
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQ.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelectedByPlayer = playerAnswer === idx;
                const isCorrect = idx === currentQ.correctAnswer;
                const isRoundOver = gameState === 'round_result';

                let btnStyle = 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900';
                if (isRoundOver) {
                  if (isCorrect) {
                    btnStyle = 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-400';
                  } else if (isSelectedByPlayer) {
                    btnStyle = 'border-rose-500 bg-rose-50 text-rose-950 ring-2 ring-rose-400';
                  } else {
                    btnStyle = 'border-slate-200 bg-slate-50 opacity-40 text-slate-400';
                  }
                } else if (isSelectedByPlayer) {
                  btnStyle = 'border-blue-600 bg-blue-50 text-blue-950 font-bold ring-2 ring-blue-500';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={playerAnswer !== null || isRoundOver}
                    onClick={() => handlePlayerSelectAnswer(idx)}
                    className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${btnStyle}`}
                  >
                    <span className="w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 border border-current">
                      {letter}
                    </span>
                    <div className="text-sm">
                      <RichContentRenderer content={opt} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Round result banner */}
            {gameState === 'round_result' && (
              <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between font-bold">
                  <span className={playerAnswer === currentQ.correctAnswer ? 'text-emerald-700' : 'text-rose-700'}>
                    {playerAnswer === currentQ.correctAnswer ? '✅ Bạn đã trả lời CHÍNH XÁC!' : '❌ Bạn đã trả lời SAI!'}
                  </span>
                  <span className="text-slate-600">
                    Đối thủ: {opponentAnswer === currentQ.correctAnswer ? 'Đúng (+120đ)' : 'Sai (0đ)'}
                  </span>
                </div>
                <div className="text-slate-600">
                  <strong>Giải thích:</strong> {currentQ.explanation}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GAME OVER PODIUM */}
      {gameState === 'game_over' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-3xl shadow-xs">
            {playerScore > opponentScore ? '🏆' : playerScore === opponentScore ? '🤝' : '🥈'}
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Kết thúc Trận Đấu
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 mt-1">
              {playerScore > opponentScore
                ? 'VICTORY! BẠN ĐÃ CHIẾN THẮNG!'
                : playerScore === opponentScore
                ? 'HÒA NHAU! TRẬN ĐẤU CÂN SỨC!'
                : 'DEFEAT! ĐỐI THỦ ĐÃ CHIẾN THẮNG!'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-2">
              Tỉ số chung cuộc: <strong>{playerScore} điểm</strong> (Bạn) VS <strong>{opponentScore} điểm</strong> ({selectedOpponent.name})
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => handleStartMatch(selectedOpponent)}
              className="py-3 px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Tái đấu ngay</span>
            </button>
            <button
              type="button"
              onClick={() => setGameState('lobby')}
              className="py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cấu hình nguồn & Đối thủ khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
