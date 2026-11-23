import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Classroom, Exam, ExamResult } from '../types/exam';
import { OdometerDecimalMode, OdometerScore } from './OdometerScore';
import {
  RevealMusicStyle,
  playRevealFanfare,
  startRevealRollMusic,
  stopRevealAudio,
} from '../utils/revealAudio';
import {
  Clock,
  Crown,
  Maximize2,
  Minimize2,
  Music,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface ExamScorePresentationViewProps {
  exams: Exam[];
  results: ExamResult[];
  classrooms: Classroom[];
  initialExamId?: string | null;
  isFullscreenModal?: boolean;
  onClose?: () => void;
}

interface ExamContestantEntry {
  key: string;
  studentName: string;
  studentCode: string;
  scoreTen: number;
  scoreRaw: number;
  totalPoints: number;
  timeSpentSeconds: number;
  completedAt: string;
}

type DedupeMode = 'best' | 'latest' | 'all';
type ScoreScaleMode = 'ten' | 'raw';

export const ExamScorePresentationView: React.FC<ExamScorePresentationViewProps> = ({
  exams,
  results,
  classrooms,
  initialExamId,
  isFullscreenModal = false,
  onClose,
}) => {
  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);

  // Pick initial exam (either requested, or one with submissions, or first exam)
  const [selectedExamId, setSelectedExamId] = useState<string>(() => {
    if (initialExamId && exams.some((e) => e.id === initialExamId)) {
      return initialExamId;
    }
    const examWithResults = exams.find((e) => results.some((r) => r.examId === e.id));
    return examWithResults?.id || exams[0]?.id || '';
  });

  useEffect(() => {
    if (initialExamId && exams.some((e) => e.id === initialExamId)) {
      setSelectedExamId(initialExamId);
    }
  }, [initialExamId, exams]);

  // Presenter settings
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>('best');
  const [scaleMode, setScaleMode] = useState<ScoreScaleMode>('ten');
  const [decimalMode, setDecimalMode] = useState<OdometerDecimalMode>('2');
  const [durationSeconds, setDurationSeconds] = useState<number>(4);
  const [musicStyle, setMusicStyle] = useState<RevealMusicStyle>('dramatic');

  // Reveal & Rolling State
  // Note: Unrevealed contestants NEVER reveal scores beforehand and NEVER appear in leaderboard until roll finishes.
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(() => new Set());
  const [spotlightEntryKey, setSpotlightEntryKey] = useState<string | null>(null);
  const [spotlightDisplayScore, setSpotlightDisplayScore] = useState<number>(0);
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [rollTriggerSeq, setRollTriggerSeq] = useState<number>(0);

  // FLIP Animation Refs for Right Leaderboard
  const rowRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const prevTopRectsRef = useRef<{ [key: string]: number }>({});
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopMusicRef = useRef<(() => void) | null>(null);

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) || null,
    [exams, selectedExamId]
  );

  // Cleanup timers & audio on unmount
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (stopMusicRef.current) stopMusicRef.current();
      stopRevealAudio();
    };
  }, []);

  // Track browser fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleBrowserFullscreen = useCallback(async () => {
    const el = stageRootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback handled seamlessly by container layout
    }
  }, []);

  // Build roster lookup for SBD fallback
  const rosterLookup = useMemo(() => {
    const byEmail = new Map<string, string>();
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();
    classrooms.forEach((cls) => {
      (cls.students || []).forEach((st) => {
        if (!st.studentCode) return;
        if (st.email) byEmail.set(st.email.trim().toLowerCase(), st.studentCode);
        if (st.id) byId.set(st.id, st.studentCode);
        if (st.name) byName.set(st.name.trim().toLowerCase(), st.studentCode);
      });
    });
    return { byEmail, byId, byName };
  }, [classrooms]);

  // Auto-collect contestants (Tên, SBD, Điểm) from the selected exam's submissions
  const contestants = useMemo<ExamContestantEntry[]>(() => {
    if (!selectedExamId) return [];
    const examResults = results.filter((r) => r.examId === selectedExamId);

    const normalized: ExamContestantEntry[] = examResults.map((r) => {
      const emailKey = (r.userEmail || '').trim().toLowerCase();
      const nameClean = (r.studentName || r.userEmail || 'Thí sinh tự do').trim();
      const sbd =
        (r.studentCode || '').trim() ||
        (r.userId ? rosterLookup.byId.get(r.userId) : undefined) ||
        (emailKey ? rosterLookup.byEmail.get(emailKey) : undefined) ||
        rosterLookup.byName.get(nameClean.toLowerCase()) ||
        '';

      const totalPts = r.totalPoints || selectedExam?.totalPoints || 10;
      const earnedPts =
        r.earnedPoints !== undefined ? r.earnedPoints : ((r.score ?? 0) * totalPts) / 10;
      const scoreTen =
        r.scoreOnTenScale !== undefined
          ? r.scoreOnTenScale
          : totalPts > 0
          ? (earnedPts / totalPts) * 10
          : r.score ?? 0;

      const identityKey =
        dedupeMode === 'all'
          ? r.id
          : emailKey || r.userId || (sbd ? `sbd:${sbd.toUpperCase()}` : `name:${nameClean.toLowerCase()}`);

      return {
        key: identityKey,
        studentName: nameClean,
        studentCode: sbd,
        scoreTen: Number(scoreTen.toFixed(2)),
        scoreRaw: Number(earnedPts.toFixed(2)),
        totalPoints: totalPts,
        timeSpentSeconds: r.timeSpentSeconds || 0,
        completedAt: r.completedAt || '',
      };
    });

    if (dedupeMode === 'all') {
      return normalized.sort((a, b) =>
        (a.studentCode || a.studentName).localeCompare(b.studentCode || b.studentName, 'vi')
      );
    }

    const grouped = new Map<string, ExamContestantEntry>();
    normalized.forEach((item) => {
      const existing = grouped.get(item.key);
      if (!existing) {
        grouped.set(item.key, item);
        return;
      }
      if (dedupeMode === 'best') {
        const curVal = scaleMode === 'ten' ? existing.scoreTen : existing.scoreRaw;
        const nextVal = scaleMode === 'ten' ? item.scoreTen : item.scoreRaw;
        if (
          nextVal > curVal ||
          (nextVal === curVal && item.timeSpentSeconds < existing.timeSpentSeconds)
        ) {
          grouped.set(item.key, item);
        }
      } else {
        // latest
        if (new Date(item.completedAt).getTime() >= new Date(existing.completedAt).getTime()) {
          grouped.set(item.key, item);
        }
      }
    });

    return Array.from(grouped.values()).sort((a, b) =>
      (a.studentCode || a.studentName).localeCompare(b.studentCode || b.studentName, 'vi')
    );
  }, [selectedExamId, results, dedupeMode, scaleMode, rosterLookup, selectedExam]);

  // Reset reveal state cleanly when exam changes
  const resetPresentationState = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (stopMusicRef.current) {
      stopMusicRef.current();
      stopMusicRef.current = null;
    }
    stopRevealAudio();
    prevTopRectsRef.current = {};
    setRevealedKeys(new Set());
    setSpotlightEntryKey(null);
    setSpotlightDisplayScore(0);
    setIsRolling(false);
  }, []);

  useEffect(() => {
    resetPresentationState();
  }, [selectedExamId, resetPresentationState]);

  const activeDecimalPlaces: 0 | 1 | 2 = useMemo(() => {
    if (decimalMode === '0') return 0;
    if (decimalMode === '1') return 1;
    if (decimalMode === '2') return 2;
    const hasHundredths = contestants.some((c) => {
      const v = scaleMode === 'ten' ? c.scoreTen : c.scoreRaw;
      return Math.round(v * 100) % 10 !== 0;
    });
    return hasHundredths ? 2 : 1;
  }, [decimalMode, contestants, scaleMode]);

  const getContestantDisplayScore = useCallback(
    (entry: ExamContestantEntry) => (scaleMode === 'ten' ? entry.scoreTen : entry.scoreRaw),
    [scaleMode]
  );

  // Ranked Leaderboard: ONLY contains contestants whose score roll has COMPLETED!
  const revealedLeaderboard = useMemo(() => {
    return contestants
      .filter((c) => revealedKeys.has(c.key))
      .sort((a, b) => {
        const diff = getContestantDisplayScore(b) - getContestantDisplayScore(a);
        if (diff !== 0) return diff;
        if (a.timeSpentSeconds !== b.timeSpentSeconds) {
          return a.timeSpentSeconds - b.timeSpentSeconds;
        }
        return a.studentName.localeCompare(b.studentName, 'vi');
      });
  }, [contestants, revealedKeys, getContestantDisplayScore]);

  const pendingContestants = useMemo(
    () => contestants.filter((c) => !revealedKeys.has(c.key)),
    [contestants, revealedKeys]
  );

  const spotlightContestant = useMemo(
    () => contestants.find((c) => c.key === spotlightEntryKey) || null,
    [contestants, spotlightEntryKey]
  );

  // Capture DOM positions before Leaderboard updates for smooth FLIP glide
  const captureLeaderboardPositions = useCallback(() => {
    const rects: { [key: string]: number } = {};
    revealedLeaderboard.forEach((entry) => {
      const el = rowRefs.current[entry.key];
      if (el) {
        rects[entry.key] = el.getBoundingClientRect().top;
      }
    });
    prevTopRectsRef.current = rects;
  }, [revealedLeaderboard]);

  useLayoutEffect(() => {
    const prevTops = prevTopRectsRef.current;
    if (Object.keys(prevTops).length === 0) return;

    revealedLeaderboard.forEach((entry) => {
      const el = rowRefs.current[entry.key];
      const oldTop = prevTops[entry.key];
      if (!el || oldTop === undefined) return;
      const newTop = el.getBoundingClientRect().top;
      const deltaY = oldTop - newTop;
      if (Math.abs(deltaY) < 1) return;

      el.style.transition = 'none';
      el.style.transform = `translateY(${deltaY}px)`;
      el.getBoundingClientRect();

      requestAnimationFrame(() => {
        el.style.transition = 'transform 620ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = 'translateY(0)';
      });
    });

    prevTopRectsRef.current = {};
  }, [revealedLeaderboard]);

  // Trigger single-contestant reveal roll -> wait exact duration -> lock score & update right leaderboard
  const handleAnnounceContestant = (entry: ExamContestantEntry) => {
    if (isRolling) return;

    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (stopMusicRef.current) stopMusicRef.current();

    const safeSec = Math.max(1, Math.min(30, Number(durationSeconds) || 4));
    const rollDurationMs = safeSec * 1000;
    const targetValue = getContestantDisplayScore(entry);

    // Mount at 0 first, then trigger roll on next animation frames
    setSpotlightEntryKey(entry.key);
    setSpotlightDisplayScore(0);
    setIsRolling(true);

    // Start Web Audio reveal roll music immediately inside user gesture
    stopMusicRef.current = startRevealRollMusic(musicStyle, rollDurationMs);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRollTriggerSeq((n) => n + 1);
        setSpotlightDisplayScore(targetValue);
      });
    });

    revealTimerRef.current = setTimeout(() => {
      if (stopMusicRef.current) {
        stopMusicRef.current();
        stopMusicRef.current = null;
      }
      stopRevealAudio();
      playRevealFanfare(musicStyle);

      captureLeaderboardPositions();
      setRevealedKeys((prev) => {
        const next = new Set(prev);
        next.add(entry.key);
        return next;
      });
      setIsRolling(false);
      revealTimerRef.current = null;
    }, rollDurationMs + 80);
  };

  const minIntDigits = scaleMode === 'ten' ? 2 : 3;

  return (
    <div
      ref={stageRootRef}
      className={`${
        isFullscreenModal || isBrowserFullscreen
          ? 'fixed inset-0 z-[120] p-4 sm:p-6 overflow-y-auto'
          : 'rounded-2xl p-4 sm:p-6 min-h-[78vh]'
      } bg-slate-950 text-white flex flex-col gap-5 font-sans border border-slate-800 shadow-2xl`}
    >
      {/* Top Presenter Control Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
              Trình chiếu công bố điểm phòng thi
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                disabled={isRolling}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs sm:text-sm font-bold text-white max-w-[320px] sm:max-w-md focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {exams.length === 0 ? (
                  <option value="">Chưa có đề thi</option>
                ) : (
                  exams.map((ex) => {
                    const subCount = results.filter((r) => r.examId === ex.id).length;
                    return (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} ({subCount} lượt nộp)
                      </option>
                    );
                  })
                )}
              </select>
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                {contestants.length} thí sinh
              </span>
            </div>
          </div>
        </div>

        {/* Configuration Controls: Scale, Decimals, Duration, Music, Fullscreen */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Scale */}
          <select
            value={scaleMode}
            onChange={(e) => setScaleMode(e.target.value as ScoreScaleMode)}
            disabled={isRolling}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold text-slate-200 focus:outline-none"
            title="Chọn thang điểm công bố"
          >
            <option value="ten">Thang điểm 10</option>
            <option value="raw">Điểm gốc bài thi</option>
          </select>

          {/* Dedupe */}
          <select
            value={dedupeMode}
            onChange={(e) => {
              setDedupeMode(e.target.value as DedupeMode);
              resetPresentationState();
            }}
            disabled={isRolling}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold text-slate-200 focus:outline-none"
            title="Cách lấy điểm khi thí sinh thi nhiều lượt"
          >
            <option value="best">Lấy điểm cao nhất / HS</option>
            <option value="latest">Lấy lượt mới nhất / HS</option>
            <option value="all">Tất cả lượt nộp</option>
          </select>

          {/* Decimal */}
          <select
            value={decimalMode}
            onChange={(e) => setDecimalMode(e.target.value as OdometerDecimalMode)}
            disabled={isRolling}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold text-amber-200 focus:outline-none"
          >
            <option value="2">2 số lẻ (.00)</option>
            <option value="1">1 số lẻ (.0)</option>
            <option value="0">Số nguyên</option>
            <option value="auto_decimal">Tự động lẻ</option>
          </select>

          {/* Roll Duration Control */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="text-slate-400 whitespace-nowrap">Chạy số:</span>
            <input
              type="number"
              min={1}
              max={30}
              value={durationSeconds}
              disabled={isRolling}
              onChange={(e) =>
                setDurationSeconds(Math.max(1, Math.min(30, Number(e.target.value) || 4)))
              }
              className="w-12 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-center font-mono font-bold text-amber-300 focus:outline-none"
            />
            <span className="text-slate-400">giây</span>
          </div>

          {/* Music Selector */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs">
            {musicStyle === 'mute' ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <select
              value={musicStyle}
              onChange={(e) => setMusicStyle(e.target.value as RevealMusicStyle)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
              title="Nhạc nền khi chạy chữ số & chốt điểm"
            >
              <option value="dramatic" className="bg-slate-900">Nhạc Kịch tính</option>
              <option value="ceremonial" className="bg-slate-900">Nhạc Trang trọng</option>
              <option value="mute" className="bg-slate-900">Tắt nhạc</option>
            </select>
          </div>

          {/* Reset */}
          <button
            type="button"
            onClick={resetPresentationState}
            disabled={isRolling}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            title="Đặt lại sân khấu về trạng thái chưa công bố"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại</span>
          </button>

          {/* Browser Fullscreen */}
          <button
            type="button"
            onClick={toggleBrowserFullscreen}
            className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="Phóng to toàn màn hình trình chiếu"
          >
            {isBrowserFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Thu gọn</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Toàn màn hình</span>
              </>
            )}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={() => {
                stopRevealAudio();
                if (document.fullscreenElement) {
                  void document.exitFullscreen().catch(() => {});
                }
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              <span>Đóng</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 50/50 Split-Screen Stage */}
      {contestants.length === 0 ? (
        <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <Users className="w-12 h-12 text-slate-600 mb-3" />
          <h3 className="text-lg font-bold text-white">
            Phòng thi chưa có dữ liệu bài nộp
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mt-1">
            Khi học sinh hoàn thành và nộp bài ở đề thi đang chọn, hệ thống sẽ tự động thu thập Tên gọi, SBD và Điểm số để bạn trình chiếu công bố tại đây.
          </p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          {/* LEFT 50%: ĐIỂM THI & ĐIỀU KHIỂN CÔNG BỐ */}
          <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-5 sm:p-7 flex flex-col justify-between gap-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-300">
                  Điểm thi thí sinh
                </h2>
              </div>
              {isRolling && musicStyle !== 'mute' && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                  <span>Đang phát nhạc</span>
                </span>
              )}
            </div>

            {/* Active Odometer Spotlight Stage (Empty until teacher clicks Công bố!) */}
            <div className="flex-1 flex flex-col items-center justify-center py-6 px-4 rounded-2xl bg-gradient-to-b from-slate-950 via-indigo-950/50 to-slate-950 border border-slate-800 text-center min-h-[260px]">
              {!spotlightContestant ? (
                <div className="space-y-3 max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
                    <Play className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                    {selectedExam?.title || 'Phòng thi EduTest'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Chọn thí sinh ở danh sách bên dưới và bấm <strong>Công bố</strong> để bắt đầu chạy điểm trên màn hình.
                  </p>
                  {pendingContestants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleAnnounceContestant(pendingContestants[0])}
                      className="mt-2 px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-black inline-flex items-center gap-2 shadow-lg cursor-pointer transition-transform active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Công bố thí sinh đầu tiên</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-5 w-full flex flex-col items-center">
                  <div className="space-y-1.5">
                    {spotlightContestant.studentCode && (
                      <div className="font-mono text-sm sm:text-base font-bold text-amber-300 tracking-widest uppercase">
                        SBD: {spotlightContestant.studentCode}
                      </div>
                    )}
                    <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                      {spotlightContestant.studentName}
                    </h3>
                  </div>

                  <div className="px-6 py-5 sm:px-10 sm:py-6 rounded-3xl bg-white text-slate-950 border-4 border-amber-400 shadow-2xl inline-flex items-center justify-center">
                    <OdometerScore
                      value={spotlightDisplayScore}
                      decimalPlaces={activeDecimalPlaces}
                      minIntDigits={minIntDigits}
                      totalDurationMs={durationSeconds * 1000}
                      rollTrigger={rollTriggerSeq}
                      isRolling={isRolling}
                      size="2xl"
                    />
                  </div>

                  {!isRolling && pendingContestants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleAnnounceContestant(pendingContestants[0])}
                      className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-md cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Công bố tiếp: {pendingContestants[0].studentName}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Trigger Roster (Strictly ONLY Name + SBD + Công bố button — zero scores or pending text!) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                <span>Danh sách thí sinh phòng thi ({pendingContestants.length} chưa công bố)</span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {pendingContestants.map((entry) => (
                  <div
                    key={entry.key}
                    className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-white truncate">
                        {entry.studentName}
                      </div>
                      {entry.studentCode && (
                        <div className="font-mono text-[11px] text-slate-400">
                          SBD: {entry.studentCode}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isRolling}
                      onClick={() => handleAnnounceContestant(entry)}
                      className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-40"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Công bố</span>
                    </button>
                  </div>
                ))}

                {pendingContestants.length === 0 && (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                    Tất cả thí sinh trong phòng thi đã được công bố điểm.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT 50%: BẢNG XẾP HẠNG (Chỉ hiện Thứ hạng, Tên, Điểm; cập nhật sau khi chạy xong) */}
          <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-5 sm:p-7 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-300">
                  Bảng xếp hạng
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {revealedLeaderboard.length} / {contestants.length}
              </span>
            </div>

            {revealedLeaderboard.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 min-h-[320px]">
                <Trophy className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-300">
                  Chưa có thí sinh nào trên bảng xếp hạng
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Thứ hạng sẽ tự động hiển thị và sắp xếp ngay sau khi điểm của từng thí sinh chạy xong.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {revealedLeaderboard.map((entry, idx) => {
                  const rank = idx + 1;
                  const scoreVal = getContestantDisplayScore(entry);
                  return (
                    <div
                      key={entry.key}
                      ref={(el) => {
                        rowRefs.current[entry.key] = el;
                      }}
                      className={`px-4 py-3.5 rounded-xl border flex items-center justify-between gap-4 ${
                        rank === 1
                          ? 'bg-amber-500/15 border-amber-400/70'
                          : rank === 2
                          ? 'bg-slate-800/95 border-slate-500/70'
                          : rank === 3
                          ? 'bg-amber-900/20 border-amber-700/60'
                          : 'bg-slate-950/85 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center shrink-0 tabular-nums ${
                            rank === 1
                              ? 'bg-amber-400 text-slate-950'
                              : rank === 2
                              ? 'bg-slate-300 text-slate-950'
                              : rank === 3
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          #{rank}
                        </div>

                        <div className="min-w-0">
                          <div className="font-bold text-base sm:text-lg text-white truncate">
                            {entry.studentName}
                          </div>
                          {entry.studentCode && (
                            <div className="font-mono text-xs text-slate-400">
                              SBD: {entry.studentCode}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-xl sm:text-2xl text-amber-300 tabular-nums">
                          {activeDecimalPlaces === 0
                            ? Math.round(scoreVal)
                            : scoreVal.toFixed(activeDecimalPlaces)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
