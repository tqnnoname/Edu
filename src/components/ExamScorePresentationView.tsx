import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Classroom, Exam, ExamBundle, ExamResult } from '../types/exam';
import { OdometerDecimalMode, OdometerScore } from './OdometerScore';
import {
  RevealMusicStyle,
  playRevealFanfare,
  startRevealRollMusic,
  stopRevealAudio,
} from '../utils/revealAudio';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  Clock,
  Crown,
  Filter,
  Layers,
  ListChecks,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Sparkles,
  Square,
  Trophy,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  computeExamPartBreakdowns,
  resolveExamPartDefinitions,
} from '../utils/scoring';
import { getAllBundles, getAllSubjects } from '../utils/storage';

interface ExamScorePresentationViewProps {
  exams: Exam[];
  bundles?: ExamBundle[];
  results: ExamResult[];
  classrooms: Classroom[];
  initialExamId?: string | null;
  initialBundleId?: string | null;
  isFullscreenModal?: boolean;
  onClose?: () => void;
}

type ClusterDimension = 'part' | 'subject' | 'person';
type PresentationFlowOrder = 'cluster_then_student' | 'student_then_cluster';
type DedupeMode = 'best' | 'latest' | 'all';
type ScoreScaleMode = 'ten' | 'raw';

interface ClusterDefinition {
  id: string;
  title: string;
  shortLabel: string;
  maxRaw: number;
  maxTen: number;
  questionCount?: number;
  examId?: string;
}

interface ClusterScoreEntry {
  clusterId: string;
  title: string;
  shortLabel: string;
  earnedRaw: number;
  maxRaw: number;
  earnedTen: number;
  maxTen: number;
  hasSubmission: boolean;
}

interface ExamContestantEntry {
  key: string;
  studentName: string;
  studentCode: string;
  classId: string;
  className: string;
  scoreTen: number;
  scoreRaw: number;
  totalPoints: number;
  timeSpentSeconds: number;
  completedAt: string;
  clusterScores: ClusterScoreEntry[];
}

interface WaitingState {
  justCompletedName: string;
  nextStudentKey: string;
  nextStudentName: string;
  nextClusterId: string;
  nextClusterLabel: string;
  remainingMs: number;
  totalMs: number;
  isPaused: boolean;
  reason: 'next_student' | 'next_cluster';
}

function makeShortLabel(rawTitle: string): string {
  const clean = (rawTitle || '').trim();
  const colonIdx = clean.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 14) {
    return clean.slice(0, colonIdx).trim();
  }
  const dashIdx = clean.indexOf('—');
  if (dashIdx > 0 && dashIdx <= 16) {
    return clean.slice(0, dashIdx).trim();
  }
  return clean.length <= 22 ? clean : `${clean.slice(0, 20)}…`;
}

function getBundleExamIds(bundle: ExamBundle): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const pushId = (id: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  (bundle.compulsoryExamIds || []).forEach(pushId);
  (bundle.electiveGroups || []).forEach((g) => (g.examIds || []).forEach(pushId));
  (bundle.examIds || []).forEach(pushId);
  return ordered;
}

function moveItemInArray<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return list;
  }
  const next = [...list];
  const [removed] = next.splice(index, 1);
  next.splice(target, 0, removed);
  return next;
}

export const ExamScorePresentationView: React.FC<ExamScorePresentationViewProps> = ({
  exams,
  bundles: propBundles,
  results,
  classrooms,
  initialExamId,
  initialBundleId,
  isFullscreenModal = false,
  onClose,
}) => {
  const stageRootRef = useRef<HTMLDivElement | null>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);

  const effectiveBundles = useMemo(
    () => (propBundles && propBundles.length > 0 ? propBundles : getAllBundles()),
    [propBundles]
  );

  const subjectLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    getAllSubjects().forEach((s) => {
      map.set(s.id, s.name);
    });
    return map;
  }, []);

  const getSubjectName = useCallback(
    (subjectId?: string) => {
      if (!subjectId) return 'Tổng hợp';
      return subjectLabelMap.get(subjectId) || subjectId;
    },
    [subjectLabelMap]
  );

  // Source identifier: either an Exam ID or `bundle:<bundleId>`
  const [selectedSourceId, setSelectedSourceId] = useState<string>(() => {
    if (initialBundleId && effectiveBundles.some((b) => b.id === initialBundleId)) {
      return `bundle:${initialBundleId}`;
    }
    if (initialExamId && exams.some((e) => e.id === initialExamId)) {
      return initialExamId;
    }
    const examWithResults = exams.find((e) => results.some((r) => r.examId === e.id));
    if (examWithResults) return examWithResults.id;
    const bundleWithResults = effectiveBundles.find((b) => {
      const ids = new Set(getBundleExamIds(b));
      return results.some((r) => ids.has(r.examId));
    });
    if (bundleWithResults) return `bundle:${bundleWithResults.id}`;
    return exams[0]?.id || (effectiveBundles[0] ? `bundle:${effectiveBundles[0].id}` : '');
  });

  useEffect(() => {
    if (initialBundleId && effectiveBundles.some((b) => b.id === initialBundleId)) {
      setSelectedSourceId(`bundle:${initialBundleId}`);
      return;
    }
    if (initialExamId && exams.some((e) => e.id === initialExamId)) {
      setSelectedSourceId(initialExamId);
    }
  }, [initialExamId, initialBundleId, exams, effectiveBundles]);

  const isBundleSource = selectedSourceId.startsWith('bundle:');
  const selectedBundle = useMemo(() => {
    if (!isBundleSource) return null;
    const bundleId = selectedSourceId.slice('bundle:'.length);
    return effectiveBundles.find((b) => b.id === bundleId) || null;
  }, [isBundleSource, selectedSourceId, effectiveBundles]);

  const selectedExam = useMemo(() => {
    if (isBundleSource) return null;
    return exams.find((e) => e.id === selectedSourceId) || null;
  }, [isBundleSource, selectedSourceId, exams]);

  const bundleExams = useMemo(() => {
    if (!selectedBundle) return [];
    const examMap = new Map<string, Exam>(exams.map((ex) => [ex.id, ex]));
    return getBundleExamIds(selectedBundle)
      .map((id) => examMap.get(id))
      .filter((ex): ex is Exam => Boolean(ex));
  }, [selectedBundle, exams]);

  // Presenter settings
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>('best');
  const [scaleMode, setScaleMode] = useState<ScoreScaleMode>('ten');
  const [decimalMode, setDecimalMode] = useState<OdometerDecimalMode>('2');
  const [durationSeconds, setDurationSeconds] = useState<number>(3);
  const [waitSeconds, setWaitSeconds] = useState<number>(3);
  const [autoAdvanceNextStudent, setAutoAdvanceNextStudent] = useState<boolean>(true);
  const [musicStyle, setMusicStyle] = useState<RevealMusicStyle>('dramatic');

  // Cluster Dimension & Flow Order
  const [clusterDimension, setClusterDimension] = useState<ClusterDimension>('part');
  const [flowOrder, setFlowOrder] = useState<PresentationFlowOrder>('cluster_then_student');
  const [leftPanelTab, setLeftPanelTab] = useState<'queue' | 'setup'>('queue');

  // Custom Selection & Ordering State (Cụm & Người)
  const [clusterOrderIds, setClusterOrderIds] = useState<string[]>([]);
  const [disabledClusterIds, setDisabledClusterIds] = useState<Set<string>>(() => new Set());
  const [activeClusterId, setActiveClusterId] = useState<string>('');

  const [studentOrderKeys, setStudentOrderKeys] = useState<string[]>([]);
  const [disabledStudentKeys, setDisabledStudentKeys] = useState<Set<string>>(() => new Set());

  // Revealed state: maps studentKey -> array of revealed clusterIds (ONLY revealed scores appear!)
  const [revealedClustersByStudent, setRevealedClustersByStudent] = useState<
    Record<string, string[]>
  >({});
  const [lastRankedKey, setLastRankedKey] = useState<string | null>(null);

  // Spotlight Odometer State
  const [spotlightEntryKey, setSpotlightEntryKey] = useState<string | null>(null);
  const [spotlightMode, setSpotlightMode] = useState<'single_cluster' | 'multi_cluster'>(
    'single_cluster'
  );
  const [spotlightTargetClusterId, setSpotlightTargetClusterId] = useState<string | null>(null);
  const [spotlightActiveClusterValue, setSpotlightActiveClusterValue] = useState<number>(0);
  const [spotlightClusterRollTrigger, setSpotlightClusterRollTrigger] = useState<number>(0);
  const [spotlightTotalDisplayScore, setSpotlightTotalDisplayScore] = useState<number>(0);
  const [spotlightTotalRollTrigger, setSpotlightTotalRollTrigger] = useState<number>(0);

  // Multi-cluster sequential spotlight state (for student_then_cluster mode)
  const [spotlightMultiValues, setSpotlightMultiValues] = useState<Record<string, number>>({});
  const [spotlightMultiTriggers, setSpotlightMultiTriggers] = useState<Record<string, number>>({});
  const [activeMultiClusterId, setActiveMultiClusterId] = useState<string | null>(null);
  const [lockedMultiClusterIds, setLockedMultiClusterIds] = useState<Set<string>>(() => new Set());
  const [perStepRollMs, setPerStepRollMs] = useState<number>(1400);

  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [waitingState, setWaitingState] = useState<WaitingState | null>(null);

  // Refs for timers, audio & FLIP animation
  const rowRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const prevTopRectsRef = useRef<{ [key: string]: number }>({});
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clusterTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const waitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopMusicRef = useRef<(() => void) | null>(null);

  // Clean up all timers and audio
  const clearAllTimersAndAudio = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    clusterTimersRef.current.forEach((t) => clearTimeout(t));
    clusterTimersRef.current = [];
    if (waitIntervalRef.current) {
      clearInterval(waitIntervalRef.current);
      waitIntervalRef.current = null;
    }
    if (stopMusicRef.current) {
      stopMusicRef.current();
      stopMusicRef.current = null;
    }
    stopRevealAudio();
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimersAndAudio();
    };
  }, [clearAllTimersAndAudio]);

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
      // Fallback handled by container styling
    }
  }, []);

  // Build classroom & student roster lookup
  const rosterLookup = useMemo(() => {
    const byEmail = new Map<string, { code: string; classId: string; className: string }>();
    const byId = new Map<string, { code: string; classId: string; className: string }>();
    const byName = new Map<string, { code: string; classId: string; className: string }>();
    classrooms.forEach((cls) => {
      (cls.students || []).forEach((st) => {
        const info = {
          code: st.studentCode || '',
          classId: cls.id,
          className: cls.name,
        };
        if (st.email) byEmail.set(st.email.trim().toLowerCase(), info);
        if (st.id) byId.set(st.id, info);
        if (st.name) byName.set(st.name.trim().toLowerCase(), info);
      });
    });
    return { byEmail, byId, byName };
  }, [classrooms]);

  // Auto-switch default clusterDimension when picking a Bundle vs Single Exam
  useEffect(() => {
    if (isBundleSource) {
      setClusterDimension('subject');
      setFlowOrder('cluster_then_student');
    } else if (selectedExam) {
      const parts = resolveExamPartDefinitions(selectedExam);
      const hasMultiParts =
        (Boolean(selectedExam.settings?.groupByQuestionType) && parts.length >= 1) ||
        parts.length > 1;
      const distinctTopics = new Set(
        (selectedExam.questions || []).map((q) => (q.topic || '').trim()).filter(Boolean)
      );
      if (hasMultiParts) {
        setClusterDimension('part');
        setFlowOrder('cluster_then_student');
      } else if (distinctTopics.size > 1) {
        setClusterDimension('subject');
        setFlowOrder('cluster_then_student');
      } else {
        setClusterDimension('person');
        setFlowOrder('student_then_cluster');
      }
    }
  }, [selectedSourceId, isBundleSource, selectedExam]);

  // Filter results relevant to the selected source
  const sourceResults = useMemo(() => {
    if (!selectedSourceId) return [];
    if (isBundleSource && selectedBundle) {
      const idSet = new Set(getBundleExamIds(selectedBundle));
      return results.filter((r) => idSet.has(r.examId));
    }
    return results.filter((r) => r.examId === selectedSourceId);
  }, [selectedSourceId, isBundleSource, selectedBundle, results]);

  // 1) Compute raw available ClusterDefinitions based on source + clusterDimension
  const rawClusterDefinitions = useMemo<ClusterDefinition[]>(() => {
    if (!selectedSourceId) return [];

    // BUNDLE SOURCE
    if (isBundleSource && selectedBundle) {
      if (clusterDimension === 'part') {
        const out: ClusterDefinition[] = [];
        bundleExams.forEach((ex) => {
          const parts = resolveExamPartDefinitions(ex);
          const subj = getSubjectName(ex.subject);
          if (parts.length > 1 || ex.settings?.groupByQuestionType) {
            parts.forEach((pDef) => {
              const maxRaw = pDef.questions.reduce((s, q) => s + (q.points || 1), 0);
              const totalPts = ex.totalPoints || 10;
              out.push({
                id: `bpart:${ex.id}:${pDef.part.id}`,
                title: `[${subj}] ${pDef.part.title}`,
                shortLabel: `${subj} · ${makeShortLabel(pDef.part.title)}`,
                maxRaw: Number(maxRaw.toFixed(2)),
                maxTen: totalPts > 0 ? Number(((maxRaw / totalPts) * 10).toFixed(2)) : 0,
                questionCount: pDef.questions.length,
                examId: ex.id,
              });
            });
          } else {
            const maxRaw = ex.totalPoints || 10;
            out.push({
              id: `bexam:${ex.id}`,
              title: `${subj} — ${ex.title}`,
              shortLabel: subj,
              maxRaw: Number(maxRaw.toFixed(2)),
              maxTen: 10,
              questionCount: ex.questions?.length || ex.totalQuestions,
              examId: ex.id,
            });
          }
        });
        return out;
      }

      // For 'subject' or 'person' on a Bundle: each exam in the bundle is a Phân môn cluster
      return bundleExams.map((ex) => {
        const subj = getSubjectName(ex.subject);
        const maxRaw = ex.totalPoints || 10;
        return {
          id: `bexam:${ex.id}`,
          title: `${subj} — ${ex.title}`,
          shortLabel: subj,
          maxRaw: Number(maxRaw.toFixed(2)),
          maxTen: 10,
          questionCount: ex.questions?.length || ex.totalQuestions,
          examId: ex.id,
        };
      });
    }

    // SINGLE EXAM SOURCE
    if (!selectedExam) return [];
    const examTotalPts = selectedExam.totalPoints || 10;

    if (clusterDimension === 'subject') {
      // Group questions by topic (Phân môn / Chuyên đề) if topics exist
      const topicBuckets = new Map<string, { maxRaw: number; count: number }>();
      let hasAnyTopic = false;
      (selectedExam.questions || []).forEach((q) => {
        const t = (q.topic || '').trim();
        if (t) hasAnyTopic = true;
        const key = t || 'Chung';
        const cur = topicBuckets.get(key) || { maxRaw: 0, count: 0 };
        cur.maxRaw += q.points || 1;
        cur.count += 1;
        topicBuckets.set(key, cur);
      });

      if (hasAnyTopic && topicBuckets.size >= 1) {
        return Array.from(topicBuckets.entries()).map(([topicName, info]) => ({
          id: `topic:${topicName}`,
          title: `Phân môn: ${topicName}`,
          shortLabel: makeShortLabel(topicName),
          maxRaw: Number(info.maxRaw.toFixed(2)),
          maxTen: examTotalPts > 0 ? Number(((info.maxRaw / examTotalPts) * 10).toFixed(2)) : 0,
          questionCount: info.count,
        }));
      }

      // Fallback to topicBreakdown from results if questions didn't retain topics
      const sampleTopicResult = sourceResults.find(
        (r) => r.topicBreakdown && Object.keys(r.topicBreakdown).length > 0
      );
      if (sampleTopicResult?.topicBreakdown) {
        return Object.entries(sampleTopicResult.topicBreakdown).map(([topicName, tb]) => ({
          id: `topic:${topicName}`,
          title: `Phân môn: ${topicName}`,
          shortLabel: makeShortLabel(topicName),
          maxRaw: Number((tb.maxPoints || 0).toFixed(2)),
          maxTen:
            examTotalPts > 0 ? Number((((tb.maxPoints || 0) / examTotalPts) * 10).toFixed(2)) : 0,
          questionCount: tb.total,
        }));
      }
    }

    // Default ('part' or 'person' or fallback for 'subject'): resolve exam parts
    const partDefs = resolveExamPartDefinitions(selectedExam);
    const isGrouped = Boolean(selectedExam.settings?.groupByQuestionType);
    if ((isGrouped && partDefs.length >= 1) || partDefs.length > 1) {
      return partDefs.map((def) => {
        const maxRaw = def.questions.reduce((sum, q) => sum + (q.points || 1), 0);
        const rawTitle = def.part.title || `Phần ${def.part.order}`;
        return {
          id: def.part.id,
          title: rawTitle,
          shortLabel: makeShortLabel(rawTitle),
          maxRaw: Number(maxRaw.toFixed(2)),
          maxTen: examTotalPts > 0 ? Number(((maxRaw / examTotalPts) * 10).toFixed(2)) : 0,
          questionCount: def.questions.length,
        };
      });
    }

    const sampleWithParts = sourceResults.find(
      (r) => Array.isArray(r.partBreakdowns) && r.partBreakdowns.length > 1
    );
    if (sampleWithParts?.partBreakdowns) {
      return sampleWithParts.partBreakdowns.map((p) => {
        const rawTitle = p.partTitle || p.partId;
        return {
          id: p.partId,
          title: rawTitle,
          shortLabel: makeShortLabel(rawTitle),
          maxRaw: Number((p.maxPoints || 0).toFixed(2)),
          maxTen:
            examTotalPts > 0 ? Number((((p.maxPoints || 0) / examTotalPts) * 10).toFixed(2)) : 0,
          questionCount: p.questionCount,
        };
      });
    }

    // Fallback single whole-exam cluster
    const subjTitle =
      clusterDimension === 'subject'
        ? `Phân môn: ${getSubjectName(selectedExam.subject)}`
        : selectedExam.title || 'Toàn bài thi';
    return [
      {
        id: 'whole_exam',
        title: subjTitle,
        shortLabel:
          clusterDimension === 'subject' ? getSubjectName(selectedExam.subject) : 'Toàn bài',
        maxRaw: Number(examTotalPts.toFixed(2)),
        maxTen: 10,
        questionCount: selectedExam.questions?.length || selectedExam.totalQuestions,
      },
    ];
  }, [
    selectedSourceId,
    isBundleSource,
    selectedBundle,
    bundleExams,
    selectedExam,
    clusterDimension,
    sourceResults,
    getSubjectName,
  ]);

  // Synchronize custom cluster order when rawClusterDefinitions changes
  useEffect(() => {
    const ids = rawClusterDefinitions.map((c) => c.id);
    setClusterOrderIds(ids);
    setDisabledClusterIds(new Set());
    setActiveClusterId(ids[0] || '');
  }, [rawClusterDefinitions]);

  const clusterDefMap = useMemo(
    () => new Map<string, ClusterDefinition>(rawClusterDefinitions.map((c) => [c.id, c])),
    [rawClusterDefinitions]
  );

  // Ordered full list (for setup tab) and enabled ordered list (for active presentation)
  const orderedAllClusters = useMemo(() => {
    const out: ClusterDefinition[] = [];
    const seen = new Set<string>();
    clusterOrderIds.forEach((id) => {
      const def = clusterDefMap.get(id);
      if (def) {
        seen.add(id);
        out.push(def);
      }
    });
    rawClusterDefinitions.forEach((def) => {
      if (!seen.has(def.id)) out.push(def);
    });
    return out;
  }, [clusterOrderIds, clusterDefMap, rawClusterDefinitions]);

  const orderedEnabledClusters = useMemo(
    () => orderedAllClusters.filter((c) => !disabledClusterIds.has(c.id)),
    [orderedAllClusters, disabledClusterIds]
  );

  // Keep activeClusterId valid among enabled clusters
  useEffect(() => {
    if (orderedEnabledClusters.length === 0) return;
    if (!orderedEnabledClusters.some((c) => c.id === activeClusterId)) {
      setActiveClusterId(orderedEnabledClusters[0].id);
    }
  }, [orderedEnabledClusters, activeClusterId]);

  const activeClusterDef = useMemo(
    () =>
      orderedEnabledClusters.find((c) => c.id === activeClusterId) ||
      orderedEnabledClusters[0] ||
      null,
    [orderedEnabledClusters, activeClusterId]
  );

  // Helper to compute one ExamResult's score breakdown for a cluster definition
  const computeResultClusterScore = useCallback(
    (r: ExamResult, examRef: Exam | null, def: ClusterDefinition): ClusterScoreEntry => {
      const totalPts = r.totalPoints || examRef?.totalPoints || 10;
      const earnedPts =
        r.earnedPoints !== undefined ? r.earnedPoints : ((r.score ?? 0) * totalPts) / 10;
      const scoreTen =
        r.scoreOnTenScale !== undefined
          ? r.scoreOnTenScale
          : totalPts > 0
          ? (earnedPts / totalPts) * 10
          : r.score ?? 0;

      if (def.id === 'whole_exam' || def.id.startsWith('bexam:')) {
        return {
          clusterId: def.id,
          title: def.title,
          shortLabel: def.shortLabel,
          earnedRaw: Number(earnedPts.toFixed(2)),
          maxRaw: Number(totalPts.toFixed(2)),
          earnedTen: Number(scoreTen.toFixed(2)),
          maxTen: 10,
          hasSubmission: true,
        };
      }

      if (def.id.startsWith('topic:')) {
        const targetTopic = def.id.slice('topic:'.length);
        let earnedRaw = 0;
        let maxRaw = def.maxRaw;
        if (examRef && r.scoreDetails && Object.keys(r.scoreDetails).length > 0) {
          let calcMax = 0;
          (examRef.questions || []).forEach((q) => {
            const qt = (q.topic || '').trim() || 'Chung';
            if (qt === targetTopic) {
              const det = r.scoreDetails[q.id];
              earnedRaw += det?.earnedPoints ?? 0;
              calcMax += det?.maxPoints ?? q.points ?? 1;
            }
          });
          if (calcMax > 0) maxRaw = calcMax;
        } else if (r.topicBreakdown && r.topicBreakdown[targetTopic]) {
          earnedRaw = r.topicBreakdown[targetTopic].earned || 0;
          maxRaw = r.topicBreakdown[targetTopic].maxPoints || maxRaw;
        }
        const earnedTen = totalPts > 0 ? (earnedRaw / totalPts) * 10 : 0;
        const maxTen = totalPts > 0 ? (maxRaw / totalPts) * 10 : 0;
        return {
          clusterId: def.id,
          title: def.title,
          shortLabel: def.shortLabel,
          earnedRaw: Number(earnedRaw.toFixed(2)),
          maxRaw: Number(maxRaw.toFixed(2)),
          earnedTen: Number(earnedTen.toFixed(2)),
          maxTen: Number(maxTen.toFixed(2)),
          hasSubmission: true,
        };
      }

      // Exam part (either single exam `def.id` or bundle part `bpart:<examId>:<partId>`)
      const targetPartId = def.id.startsWith('bpart:')
        ? def.id.split(':').slice(2).join(':')
        : def.id;

      const rawBreakdowns =
        Array.isArray(r.partBreakdowns) && r.partBreakdowns.length > 0
          ? r.partBreakdowns
          : examRef
          ? computeExamPartBreakdowns(examRef, r.scoreDetails || {})
          : [];

      const matched =
        rawBreakdowns.find((b) => b.partId === targetPartId) ||
        rawBreakdowns.find(
          (b) => b.partTitle?.trim().toLowerCase() === def.title.trim().toLowerCase()
        );

      const earnedRaw = Number((matched?.earnedPoints ?? 0).toFixed(2));
      const maxRaw = Number((matched?.maxPoints ?? def.maxRaw ?? 0).toFixed(2));
      const earnedTen = totalPts > 0 ? Number(((earnedRaw / totalPts) * 10).toFixed(2)) : 0;
      const maxTen = totalPts > 0 ? Number(((maxRaw / totalPts) * 10).toFixed(2)) : 0;

      return {
        clusterId: def.id,
        title: def.title,
        shortLabel: def.shortLabel,
        earnedRaw,
        maxRaw,
        earnedTen,
        maxTen,
        hasSubmission: true,
      };
    },
    []
  );

  // 2) Build Contestants list (for single exam OR bundle)
  const contestants = useMemo<ExamContestantEntry[]>(() => {
    if (!selectedSourceId) return [];

    const getIdentityMeta = (r: ExamResult) => {
      const emailKey = (r.userEmail || '').trim().toLowerCase();
      const nameClean = (r.studentName || r.userEmail || 'Thí sinh tự do').trim();
      const roster =
        (r.userId ? rosterLookup.byId.get(r.userId) : undefined) ||
        (emailKey ? rosterLookup.byEmail.get(emailKey) : undefined) ||
        rosterLookup.byName.get(nameClean.toLowerCase());

      const sbd = (r.studentCode || '').trim() || roster?.code || '';
      const classId = r.classId || roster?.classId || '';
      const className = r.className || roster?.className || '';
      const personKey =
        emailKey || r.userId || (sbd ? `sbd:${sbd.toUpperCase()}` : `name:${nameClean.toLowerCase()}`);

      return { nameClean, sbd, classId, className, personKey };
    };

    const pickBetterResult = (cur: ExamResult, next: ExamResult): ExamResult => {
      if (dedupeMode === 'latest') {
        return new Date(next.completedAt).getTime() >= new Date(cur.completedAt).getTime()
          ? next
          : cur;
      }
      const curTen = cur.scoreOnTenScale ?? cur.score ?? 0;
      const nextTen = next.scoreOnTenScale ?? next.score ?? 0;
      const curRaw = cur.earnedPoints ?? curTen;
      const nextRaw = next.earnedPoints ?? nextTen;
      const curVal = scaleMode === 'ten' ? curTen : curRaw;
      const nextVal = scaleMode === 'ten' ? nextTen : nextRaw;
      if (
        nextVal > curVal ||
        (nextVal === curVal && (next.timeSpentSeconds || 0) < (cur.timeSpentSeconds || 0))
      ) {
        return next;
      }
      return cur;
    };

    if (isBundleSource && selectedBundle) {
      // Group submissions by student identity across all exams in bundle
      const examMap = new Map<string, Exam>(bundleExams.map((e) => [e.id, e]));
      const byStudent = new Map<
        string,
        {
          meta: ReturnType<typeof getIdentityMeta>;
          perExamResult: Map<string, ExamResult>;
          allResults: ExamResult[];
        }
      >();

      sourceResults.forEach((r) => {
        const meta = getIdentityMeta(r);
        const bucket = byStudent.get(meta.personKey) || {
          meta,
          perExamResult: new Map<string, ExamResult>(),
          allResults: [],
        };
        if (!bucket.meta.sbd && meta.sbd) bucket.meta = { ...bucket.meta, sbd: meta.sbd };
        if (!bucket.meta.classId && meta.classId) {
          bucket.meta = { ...bucket.meta, classId: meta.classId, className: meta.className };
        }
        bucket.allResults.push(r);
        const existingForExam = bucket.perExamResult.get(r.examId);
        if (!existingForExam || dedupeMode === 'all') {
          bucket.perExamResult.set(r.examId, r);
        } else {
          bucket.perExamResult.set(r.examId, pickBetterResult(existingForExam, r));
        }
        byStudent.set(meta.personKey, bucket);
      });

      const list: ExamContestantEntry[] = [];
      byStudent.forEach((bucket, personKey) => {
        const clusterScores: ClusterScoreEntry[] = rawClusterDefinitions.map((def) => {
          const examId = def.examId || (def.id.startsWith('bexam:') ? def.id.slice(6) : '');
          const res = examId ? bucket.perExamResult.get(examId) : undefined;
          const exRef = examId ? examMap.get(examId) || null : null;
          if (!res) {
            return {
              clusterId: def.id,
              title: def.title,
              shortLabel: def.shortLabel,
              earnedRaw: 0,
              maxRaw: def.maxRaw,
              earnedTen: 0,
              maxTen: def.maxTen,
              hasSubmission: false,
            };
          }
          return computeResultClusterScore(res, exRef, def);
        });

        const totalTime = Array.from(bucket.perExamResult.values()).reduce(
          (sum, r) => sum + (r.timeSpentSeconds || 0),
          0
        );
        const latestAt = bucket.allResults.reduce(
          (acc, r) => (r.completedAt > acc ? r.completedAt : acc),
          ''
        );
        const totalPts = clusterScores.reduce((s, c) => s + c.maxRaw, 0);
        const sumRaw = clusterScores.reduce((s, c) => s + c.earnedRaw, 0);
        const sumTen = clusterScores.reduce((s, c) => s + c.earnedTen, 0);

        list.push({
          key: personKey,
          studentName: bucket.meta.nameClean,
          studentCode: bucket.meta.sbd,
          classId: bucket.meta.classId,
          className: bucket.meta.className,
          scoreTen: Number(sumTen.toFixed(2)),
          scoreRaw: Number(sumRaw.toFixed(2)),
          totalPoints: Number(totalPts.toFixed(2)),
          timeSpentSeconds: totalTime,
          completedAt: latestAt,
          clusterScores,
        });
      });

      return list
        .filter((c) => selectedClassId === 'all' || c.classId === selectedClassId)
        .sort((a, b) =>
          (a.studentCode || a.studentName).localeCompare(b.studentCode || b.studentName, 'vi')
        );
    }

    // SINGLE EXAM SOURCE
    const normalized: ExamContestantEntry[] = sourceResults.map((r) => {
      const meta = getIdentityMeta(r);
      const totalPts = r.totalPoints || selectedExam?.totalPoints || 10;
      const earnedPts =
        r.earnedPoints !== undefined ? r.earnedPoints : ((r.score ?? 0) * totalPts) / 10;
      const scoreTen =
        r.scoreOnTenScale !== undefined
          ? r.scoreOnTenScale
          : totalPts > 0
          ? (earnedPts / totalPts) * 10
          : r.score ?? 0;

      const clusterScores: ClusterScoreEntry[] = rawClusterDefinitions.map((def) =>
        computeResultClusterScore(r, selectedExam, def)
      );

      const identityKey = dedupeMode === 'all' ? r.id : meta.personKey;
      return {
        key: identityKey,
        studentName: meta.nameClean,
        studentCode: meta.sbd,
        classId: meta.classId,
        className: meta.className,
        scoreTen: Number(scoreTen.toFixed(2)),
        scoreRaw: Number(earnedPts.toFixed(2)),
        totalPoints: totalPts,
        timeSpentSeconds: r.timeSpentSeconds || 0,
        completedAt: r.completedAt || '',
        clusterScores,
      };
    });

    let deduped: ExamContestantEntry[];
    if (dedupeMode === 'all') {
      deduped = normalized;
    } else {
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
        } else if (
          new Date(item.completedAt).getTime() >= new Date(existing.completedAt).getTime()
        ) {
          grouped.set(item.key, item);
        }
      });
      deduped = Array.from(grouped.values());
    }

    return deduped
      .filter((c) => {
        if (selectedClassId === 'all') return true;
        if (selectedClassId === '__unassigned__') return !c.classId;
        return c.classId === selectedClassId;
      })
      .sort((a, b) =>
        (a.studentCode || a.studentName).localeCompare(b.studentCode || b.studentName, 'vi')
      );
  }, [
    selectedSourceId,
    isBundleSource,
    selectedBundle,
    bundleExams,
    selectedExam,
    sourceResults,
    rawClusterDefinitions,
    computeResultClusterScore,
    rosterLookup,
    dedupeMode,
    scaleMode,
    selectedClassId,
  ]);

  // Synchronize student order keys cleanly when contestant set changes (preserving manual order if keys still match)
  useEffect(() => {
    const validKeySet = new Set(contestants.map((c) => c.key));
    setStudentOrderKeys((prev) => {
      const kept = prev.filter((k) => validKeySet.has(k));
      const keptSet = new Set(kept);
      const added = contestants.filter((c) => !keptSet.has(c.key)).map((c) => c.key);
      return [...kept, ...added];
    });
  }, [contestants]);

  const contestantMap = useMemo(
    () => new Map<string, ExamContestantEntry>(contestants.map((c) => [c.key, c])),
    [contestants]
  );

  const orderedAllContestants = useMemo(() => {
    const out: ExamContestantEntry[] = [];
    const seen = new Set<string>();
    studentOrderKeys.forEach((k) => {
      const c = contestantMap.get(k);
      if (c) {
        seen.add(k);
        out.push(c);
      }
    });
    contestants.forEach((c) => {
      if (!seen.has(c.key)) out.push(c);
    });
    return out;
  }, [studentOrderKeys, contestantMap, contestants]);

  const orderedEnabledContestants = useMemo(
    () => orderedAllContestants.filter((c) => !disabledStudentKeys.has(c.key)),
    [orderedAllContestants, disabledStudentKeys]
  );

  // Reset reveal state cleanly
  const resetPresentationState = useCallback(() => {
    clearAllTimersAndAudio();
    prevTopRectsRef.current = {};
    setRevealedClustersByStudent({});
    setLastRankedKey(null);
    setSpotlightEntryKey(null);
    setSpotlightTargetClusterId(null);
    setSpotlightActiveClusterValue(0);
    setSpotlightTotalDisplayScore(0);
    setSpotlightMultiValues({});
    setSpotlightMultiTriggers({});
    setActiveMultiClusterId(null);
    setLockedMultiClusterIds(new Set());
    setWaitingState(null);
    setIsRolling(false);
  }, [clearAllTimersAndAudio]);

  useEffect(() => {
    resetPresentationState();
  }, [selectedSourceId, clusterDimension, resetPresentationState]);

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

  // Compute student's revealed score strictly from clusters revealed so far
  const getStudentRevealedScore = useCallback(
    (entry: ExamContestantEntry, overrideRevealedIds?: string[]) => {
      const ids = overrideRevealedIds ?? revealedClustersByStudent[entry.key] ?? [];
      if (ids.length === 0) return 0;
      const idSet = new Set(ids);
      const enabledSet = new Set(orderedEnabledClusters.map((c) => c.id));

      // If all clusters of the exam/bundle are revealed AND all are enabled, snap cleanly to total to avoid 0.01 rounding drift
      if (
        !isBundleSource &&
        rawClusterDefinitions.length > 0 &&
        rawClusterDefinitions.every((c) => idSet.has(c.id)) &&
        enabledSet.size === rawClusterDefinitions.length
      ) {
        return scaleMode === 'ten' ? entry.scoreTen : entry.scoreRaw;
      }

      const sum = entry.clusterScores
        .filter((cs) => idSet.has(cs.clusterId) && enabledSet.has(cs.clusterId))
        .reduce((acc, cs) => acc + (scaleMode === 'ten' ? cs.earnedTen : cs.earnedRaw), 0);
      return Number(sum.toFixed(2));
    },
    [
      revealedClustersByStudent,
      orderedEnabledClusters,
      isBundleSource,
      rawClusterDefinitions,
      scaleMode,
    ]
  );

  // Ranked Leaderboard: ONLY contains contestants who have at least 1 revealed cluster!
  const revealedLeaderboard = useMemo(() => {
    return orderedEnabledContestants
      .filter((c) => (revealedClustersByStudent[c.key]?.length || 0) > 0)
      .sort((a, b) => {
        const diff = getStudentRevealedScore(b) - getStudentRevealedScore(a);
        if (diff !== 0) return diff;
        const revCountDiff =
          (revealedClustersByStudent[b.key]?.length || 0) -
          (revealedClustersByStudent[a.key]?.length || 0);
        if (revCountDiff !== 0) return revCountDiff;
        if (a.timeSpentSeconds !== b.timeSpentSeconds) {
          return a.timeSpentSeconds - b.timeSpentSeconds;
        }
        return a.studentName.localeCompare(b.studentName, 'vi');
      });
  }, [orderedEnabledContestants, revealedClustersByStudent, getStudentRevealedScore]);

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

  // Helper: cancel active wait countdown
  const cancelWaitCountdown = useCallback(() => {
    if (waitIntervalRef.current) {
      clearInterval(waitIntervalRef.current);
      waitIntervalRef.current = null;
    }
    setWaitingState(null);
  }, []);

  // Ref for triggering next step from countdown interval safely
  const triggerNextStepRef = useRef<
    ((studentKey: string, clusterId: string) => void) | null
  >(null);

  // Start countdown wait state after a student finishes rolling & is ranked on leaderboard
  const beginWaitTimer = useCallback(
    (
      justCompletedName: string,
      nextStudent: ExamContestantEntry,
      nextCluster: ClusterDefinition,
      reason: 'next_student' | 'next_cluster'
    ) => {
      if (waitIntervalRef.current) {
        clearInterval(waitIntervalRef.current);
        waitIntervalRef.current = null;
      }
      const totalMs = Math.max(0, Math.round(waitSeconds * 1000));
      const initial: WaitingState = {
        justCompletedName,
        nextStudentKey: nextStudent.key,
        nextStudentName: nextStudent.studentName,
        nextClusterId: nextCluster.id,
        nextClusterLabel: nextCluster.shortLabel,
        remainingMs: totalMs,
        totalMs,
        isPaused: !autoAdvanceNextStudent || totalMs <= 0,
        reason,
      };
      setWaitingState(initial);

      if (!autoAdvanceNextStudent || totalMs <= 0) {
        return;
      }

      waitIntervalRef.current = setInterval(() => {
        setWaitingState((prev) => {
          if (!prev || prev.isPaused) return prev;
          const nextRem = Math.max(0, prev.remainingMs - 100);
          if (nextRem <= 0) {
            if (waitIntervalRef.current) {
              clearInterval(waitIntervalRef.current);
              waitIntervalRef.current = null;
            }
            const targetKey = prev.nextStudentKey;
            const targetCid = prev.nextClusterId;
            setTimeout(() => {
              triggerNextStepRef.current?.(targetKey, targetCid);
            }, 20);
            return null;
          }
          return { ...prev, remainingMs: nextRem };
        });
      }, 100);
    },
    [waitSeconds, autoAdvanceNextStudent]
  );

  // Toggle Pause/Resume on waiting timer
  const toggleWaitPause = useCallback(() => {
    setWaitingState((prev) => {
      if (!prev) return null;
      const nextPaused = !prev.isPaused;
      if (!nextPaused && !waitIntervalRef.current && prev.remainingMs > 0) {
        waitIntervalRef.current = setInterval(() => {
          setWaitingState((cur) => {
            if (!cur || cur.isPaused) return cur;
            const nextRem = Math.max(0, cur.remainingMs - 100);
            if (nextRem <= 0) {
              if (waitIntervalRef.current) {
                clearInterval(waitIntervalRef.current);
                waitIntervalRef.current = null;
              }
              const targetKey = cur.nextStudentKey;
              const targetCid = cur.nextClusterId;
              setTimeout(() => {
                triggerNextStepRef.current?.(targetKey, targetCid);
              }, 20);
              return null;
            }
            return { ...cur, remainingMs: nextRem };
          });
        }, 100);
      }
      return { ...prev, isPaused: nextPaused };
    });
  }, []);

  // Announce ONE (student, cluster) in `cluster_then_student` mode
  const handleAnnounceSingleClusterForStudent = useCallback(
    (entry: ExamContestantEntry, clusterDef: ClusterDefinition) => {
      if (isRolling) return;
      clearAllTimersAndAudio();
      cancelWaitCountdown();

      const existingRevealedIds = revealedClustersByStudent[entry.key] || [];
      const prevIdsWithoutTarget = existingRevealedIds.filter((id) => id !== clusterDef.id);
      const prevAccumScore = getStudentRevealedScore(entry, prevIdsWithoutTarget);

      const csEntry = entry.clusterScores.find((c) => c.clusterId === clusterDef.id);
      const clusterTargetScore = csEntry
        ? scaleMode === 'ten'
          ? csEntry.earnedTen
          : csEntry.earnedRaw
        : 0;

      const nextIdsWithTarget = Array.from(new Set([...existingRevealedIds, clusterDef.id]));
      const nextAccumScore = getStudentRevealedScore(entry, nextIdsWithTarget);

      const safeSec = Math.max(1, Math.min(30, Number(durationSeconds) || 3));
      const rollMs = safeSec * 1000;

      setActiveClusterId(clusterDef.id);
      setSpotlightMode('single_cluster');
      setSpotlightEntryKey(entry.key);
      setSpotlightTargetClusterId(clusterDef.id);
      setSpotlightActiveClusterValue(0);
      setSpotlightTotalDisplayScore(prevAccumScore);
      setPerStepRollMs(rollMs);
      setIsRolling(true);

      stopMusicRef.current = startRevealRollMusic(musicStyle, rollMs);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSpotlightClusterRollTrigger((n) => n + 1);
          setSpotlightActiveClusterValue(clusterTargetScore);
          if (prevAccumScore === 0) {
            setSpotlightTotalRollTrigger((n) => n + 1);
          }
          setSpotlightTotalDisplayScore(nextAccumScore);
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
        setRevealedClustersByStudent((prev) => {
          const cur = prev[entry.key] || [];
          if (cur.includes(clusterDef.id)) return prev;
          return { ...prev, [entry.key]: [...cur, clusterDef.id] };
        });
        setLastRankedKey(entry.key);
        setIsRolling(false);
        revealTimerRef.current = null;

        // Determine NEXT student in teacher's custom order for this cluster (no simultaneous reveal!)
        const updatedRevealedForCluster = (k: string) =>
          k === entry.key || (revealedClustersByStudent[k] || []).includes(clusterDef.id);

        const currentIdx = orderedEnabledContestants.findIndex((c) => c.key === entry.key);
        const searchList =
          currentIdx >= 0
            ? [
                ...orderedEnabledContestants.slice(currentIdx + 1),
                ...orderedEnabledContestants.slice(0, currentIdx),
              ]
            : orderedEnabledContestants;

        const nextStudent = searchList.find((c) => !updatedRevealedForCluster(c.key));
        if (nextStudent) {
          beginWaitTimer(entry.studentName, nextStudent, clusterDef, 'next_student');
        }
      }, rollMs + 100);
    },
    [
      isRolling,
      clearAllTimersAndAudio,
      cancelWaitCountdown,
      revealedClustersByStudent,
      getStudentRevealedScore,
      scaleMode,
      durationSeconds,
      musicStyle,
      captureLeaderboardPositions,
      orderedEnabledContestants,
      beginWaitTimer,
    ]
  );

  // Announce ONE student across their enabled clusters in `student_then_cluster` mode (then rank + wait -> next student)
  const handleAnnounceStudentFull = useCallback(
    (entry: ExamContestantEntry) => {
      if (isRolling || orderedEnabledClusters.length === 0) return;
      clearAllTimersAndAudio();
      cancelWaitCountdown();

      const targetClusters = orderedEnabledClusters;
      const k = targetClusters.length;
      const safeSec = Math.max(1, Math.min(30, Number(durationSeconds) || 3));
      const totalRollMs = safeSec * 1000;
      const stepMs = k > 1 ? Math.max(1000, Math.round(totalRollMs / k)) : totalRollMs;
      const overallMs = k > 1 ? k * stepMs + 360 : totalRollMs + 100;

      const enabledIds = targetClusters.map((c) => c.id);
      const finalStudentTotal = getStudentRevealedScore(entry, enabledIds);

      setSpotlightMode('multi_cluster');
      setSpotlightEntryKey(entry.key);
      setSpotlightTargetClusterId(null);
      setSpotlightTotalDisplayScore(0);
      setSpotlightMultiValues(
        Object.fromEntries(targetClusters.map((c) => [c.id, 0]))
      );
      setSpotlightMultiTriggers(
        Object.fromEntries(targetClusters.map((c) => [c.id, 0]))
      );
      setActiveMultiClusterId(targetClusters[0]?.id || null);
      setLockedMultiClusterIds(new Set());
      setPerStepRollMs(stepMs);
      setIsRolling(true);

      stopMusicRef.current = startRevealRollMusic(musicStyle, overallMs);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSpotlightTotalRollTrigger((n) => n + 1);
          let runningSum = 0;

          targetClusters.forEach((cDef, idx) => {
            const cs = entry.clusterScores.find((x) => x.clusterId === cDef.id);
            const cVal = cs ? (scaleMode === 'ten' ? cs.earnedTen : cs.earnedRaw) : 0;
            runningSum =
              idx === k - 1 ? finalStudentTotal : Number((runningSum + cVal).toFixed(2));
            const cumulativeTarget = runningSum;

            const startT = setTimeout(() => {
              setActiveMultiClusterId(cDef.id);
              setSpotlightMultiValues((prev) => ({ ...prev, [cDef.id]: cVal }));
              setSpotlightMultiTriggers((prev) => ({
                ...prev,
                [cDef.id]: (prev[cDef.id] || 0) + 1,
              }));
              setSpotlightTotalDisplayScore(cumulativeTarget);
            }, idx * stepMs);

            const lockT = setTimeout(() => {
              setLockedMultiClusterIds((prev) => {
                const next = new Set(prev);
                next.add(cDef.id);
                return next;
              });
            }, (idx + 1) * stepMs - 40);

            clusterTimersRef.current.push(startT, lockT);
          });
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
        setRevealedClustersByStudent((prev) => ({
          ...prev,
          [entry.key]: enabledIds,
        }));
        setLastRankedKey(entry.key);
        setActiveMultiClusterId(null);
        setLockedMultiClusterIds(new Set(enabledIds));
        setIsRolling(false);
        revealTimerRef.current = null;

        // Pick NEXT unrevealed student in teacher's custom order & enter Wait Phase
        const isDone = (key: string) =>
          key === entry.key || (revealedClustersByStudent[key]?.length || 0) > 0;
        const curIdx = orderedEnabledContestants.findIndex((c) => c.key === entry.key);
        const searchList =
          curIdx >= 0
            ? [
                ...orderedEnabledContestants.slice(curIdx + 1),
                ...orderedEnabledContestants.slice(0, curIdx),
              ]
            : orderedEnabledContestants;

        const nextStudent = searchList.find((c) => !isDone(c.key));
        if (nextStudent && targetClusters[0]) {
          beginWaitTimer(entry.studentName, nextStudent, targetClusters[0], 'next_student');
        }
      }, overallMs);
    },
    [
      isRolling,
      orderedEnabledClusters,
      clearAllTimersAndAudio,
      cancelWaitCountdown,
      durationSeconds,
      getStudentRevealedScore,
      musicStyle,
      scaleMode,
      captureLeaderboardPositions,
      revealedClustersByStudent,
      orderedEnabledContestants,
      beginWaitTimer,
    ]
  );

  // Wire stable callback for countdown auto-advance
  useEffect(() => {
    triggerNextStepRef.current = (studentKey: string, clusterId: string) => {
      const targetStudent = contestantMap.get(studentKey);
      if (!targetStudent) return;
      if (flowOrder === 'cluster_then_student') {
        const targetCluster =
          orderedEnabledClusters.find((c) => c.id === clusterId) || activeClusterDef;
        if (targetCluster) {
          handleAnnounceSingleClusterForStudent(targetStudent, targetCluster);
        }
      } else {
        handleAnnounceStudentFull(targetStudent);
      }
    };
  }, [
    contestantMap,
    flowOrder,
    orderedEnabledClusters,
    activeClusterDef,
    handleAnnounceSingleClusterForStudent,
    handleAnnounceStudentFull,
  ]);

  // Queue helpers for current active context
  const pendingInActiveCluster = useMemo(() => {
    if (!activeClusterDef) return [];
    if (flowOrder === 'cluster_then_student') {
      return orderedEnabledContestants.filter(
        (c) => !(revealedClustersByStudent[c.key] || []).includes(activeClusterDef.id)
      );
    }
    return orderedEnabledContestants.filter(
      (c) => (revealedClustersByStudent[c.key]?.length || 0) === 0
    );
  }, [orderedEnabledContestants, revealedClustersByStudent, activeClusterDef, flowOrder]);

  const nextClusterToPresent = useMemo(() => {
    if (!activeClusterDef || orderedEnabledClusters.length <= 1) return null;
    const idx = orderedEnabledClusters.findIndex((c) => c.id === activeClusterDef.id);
    for (let offset = 1; offset < orderedEnabledClusters.length; offset++) {
      const cand = orderedEnabledClusters[(idx + offset) % orderedEnabledClusters.length];
      const hasUnrevealed = orderedEnabledContestants.some(
        (st) => !(revealedClustersByStudent[st.key] || []).includes(cand.id)
      );
      if (hasUnrevealed) return cand;
    }
    return null;
  }, [activeClusterDef, orderedEnabledClusters, orderedEnabledContestants, revealedClustersByStudent]);

  // Non-score queue reordering helpers
  const applyNonScoreSort = (mode: 'sbd' | 'name' | 'shuffle' | 'reverse') => {
    if (isRolling) return;
    setStudentOrderKeys((prev) => {
      const current = prev
        .map((k) => contestantMap.get(k))
        .filter((c): c is ExamContestantEntry => Boolean(c));
      if (mode === 'reverse') return [...current].reverse().map((c) => c.key);
      if (mode === 'name') {
        return [...current]
          .sort((a, b) => a.studentName.localeCompare(b.studentName, 'vi'))
          .map((c) => c.key);
      }
      if (mode === 'sbd') {
        return [...current]
          .sort((a, b) =>
            (a.studentCode || a.studentName).localeCompare(b.studentCode || b.studentName, 'vi')
          )
          .map((c) => c.key);
      }
      // shuffle
      const arr = [...current];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.map((c) => c.key);
    });
  };

  const toggleClusterEnabled = (clusterId: string) => {
    if (isRolling) return;
    setDisabledClusterIds((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        // Keep at least 1 cluster enabled
        if (orderedAllClusters.length - next.size <= 1) return prev;
        next.add(clusterId);
      }
      return next;
    });
  };

  const toggleStudentEnabled = (studentKey: string) => {
    if (isRolling) return;
    setDisabledStudentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(studentKey)) next.delete(studentKey);
      else next.add(studentKey);
      return next;
    });
  };

  const maxTotalPossible = useMemo(() => {
    if (scaleMode === 'ten') {
      return isBundleSource ? Math.max(10, orderedEnabledClusters.length * 10) : 10;
    }
    return Math.max(
      10,
      orderedEnabledClusters.reduce((sum, c) => sum + c.maxRaw, 0)
    );
  }, [scaleMode, isBundleSource, orderedEnabledClusters]);

  const minIntDigits = maxTotalPossible >= 100 ? 3 : 2;

  const activeClusterCountDone = useMemo(() => {
    if (!activeClusterDef) return 0;
    return orderedEnabledContestants.filter((c) =>
      (revealedClustersByStudent[c.key] || []).includes(activeClusterDef.id)
    ).length;
  }, [activeClusterDef, orderedEnabledContestants, revealedClustersByStudent]);

  const triggerPrimaryAction = (entry: ExamContestantEntry) => {
    if (flowOrder === 'cluster_then_student' && activeClusterDef) {
      handleAnnounceSingleClusterForStudent(entry, activeClusterDef);
    } else {
      handleAnnounceStudentFull(entry);
    }
  };

  const currentTitle = isBundleSource
    ? selectedBundle?.title || 'Tổ hợp phân môn'
    : selectedExam?.title || 'Phòng thi EduTest';

  return (
    <div
      ref={stageRootRef}
      className={`@container w-full max-w-full overflow-x-hidden ${
        isFullscreenModal || isBrowserFullscreen
          ? 'fixed inset-0 z-[120] p-4 sm:p-6 overflow-y-auto'
          : 'rounded-2xl p-4 sm:p-6'
      } bg-slate-950 text-white flex flex-col gap-4 font-sans border border-slate-800 shadow-2xl`}
    >
      {/* Top Presenter Control Card (Row 1: Title & Source | Row 2: Settings Strip) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3.5 shrink-0">
        {/* Row 1: Title, Exam/Bundle Source, Class Filter, Stage Actions */}
        <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
                Trình chiếu công bố điểm phòng thi
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  disabled={isRolling}
                  className="w-full sm:w-auto max-w-full sm:max-w-md min-w-0 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs sm:text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {exams.length === 0 && effectiveBundles.length === 0 ? (
                    <option value="">Chưa có đề thi</option>
                  ) : (
                    <>
                      {exams.length > 0 && (
                        <optgroup label="Đề thi đơn">
                          {exams.map((ex) => {
                            const subCount = results.filter((r) => r.examId === ex.id).length;
                            return (
                              <option key={ex.id} value={ex.id}>
                                {ex.title} ({subCount} lượt nộp)
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      {effectiveBundles.length > 0 && (
                        <optgroup label="Tổ hợp phân môn">
                          {effectiveBundles.map((b) => {
                            const ids = new Set(getBundleExamIds(b));
                            const subCount = results.filter((r) => ids.has(r.examId)).length;
                            return (
                              <option key={`bundle:${b.id}`} value={`bundle:${b.id}`}>
                                [Tổ hợp] {b.title} ({subCount} lượt)
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </>
                  )}
                </select>

                {classrooms.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs max-w-full min-w-0">
                    <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={selectedClassId}
                      onChange={(e) => {
                        setSelectedClassId(e.target.value);
                        resetPresentationState();
                      }}
                      disabled={isRolling}
                      className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none max-w-[180px] min-w-0 truncate"
                      title="Lọc thí sinh theo lớp"
                    >
                      <option value="all" className="bg-slate-900">
                        Tất cả lớp
                      </option>
                      {classrooms.map((cls) => (
                        <option key={cls.id} value={cls.id} className="bg-slate-900">
                          Lớp: {cls.name}
                        </option>
                      ))}
                      <option value="__unassigned__" className="bg-slate-900">
                        Thí sinh tự do
                      </option>
                    </select>
                  </div>
                )}

                <span className="text-xs text-slate-400 font-mono whitespace-nowrap tabular-nums">
                  {orderedEnabledContestants.length}/{contestants.length} thí sinh
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={resetPresentationState}
              disabled={isRolling}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
              title="Đặt lại sân khấu về trạng thái chưa công bố"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Đặt lại</span>
            </button>

            <button
              type="button"
              onClick={toggleBrowserFullscreen}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {isBrowserFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Thu gọn</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Toàn màn hình</span>
                </>
              )}
            </button>

            {onClose && (
              <button
                type="button"
                onClick={() => {
                  clearAllTimersAndAudio();
                  if (document.fullscreenElement) {
                    void document.exitFullscreen().catch(() => {});
                  }
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>Đóng</span>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Scale, Dedupe, Decimals, Timers, Audio */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2.5">
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
            <option value="best">Điểm cao nhất / HS</option>
            <option value="latest">Lượt mới nhất / HS</option>
            {!isBundleSource && <option value="all">Tất cả lượt nộp</option>}
          </select>

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

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs shrink-0"
            title="Thời gian chạy số Odometer cho mỗi lượt công bố"
          >
            <Clock className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="text-slate-400 whitespace-nowrap">Chạy số:</span>
            <input
              type="number"
              min={1}
              max={30}
              value={durationSeconds}
              disabled={isRolling}
              onChange={(e) =>
                setDurationSeconds(Math.max(1, Math.min(30, Number(e.target.value) || 3)))
              }
              className="w-11 px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-center font-mono font-bold text-amber-300 focus:outline-none tabular-nums"
            />
            <span className="text-slate-400">s</span>
          </div>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-emerald-700/60 text-xs shrink-0"
            title="Thời gian chờ sau khi xếp hạng 1 học sinh trước khi chuyển sang học sinh tiếp theo (0s = bấm tay từng lượt)"
          >
            <Pause className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-slate-300 whitespace-nowrap">Chờ giữa HS:</span>
            <input
              type="number"
              min={0}
              max={30}
              value={waitSeconds}
              onChange={(e) =>
                setWaitSeconds(Math.max(0, Math.min(30, Number(e.target.value) || 0)))
              }
              className="w-11 px-1 py-0.5 rounded bg-slate-900 border border-slate-700 text-center font-mono font-bold text-emerald-300 focus:outline-none tabular-nums"
            />
            <span className="text-slate-400">s</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs shrink-0">
            {musicStyle === 'mute' ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <select
              value={musicStyle}
              onChange={(e) => setMusicStyle(e.target.value as RevealMusicStyle)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="dramatic" className="bg-slate-900">
                Nhạc Kịch tính
              </option>
              <option value="ceremonial" className="bg-slate-900">
                Nhạc Trang trọng
              </option>
              <option value="mute" className="bg-slate-900">
                Tắt nhạc
              </option>
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 shrink-0">
            <input
              type="checkbox"
              checked={autoAdvanceNextStudent}
              onChange={(e) => setAutoAdvanceNextStudent(e.target.checked)}
              className="rounded border-slate-600 text-amber-400 focus:ring-amber-400"
            />
            <span className="whitespace-nowrap">Tự chuyển HS tiếp ({waitSeconds}s)</span>
          </label>
        </div>
      </div>

      {/* Cluster Selection & Active Cluster Picker Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 shrink-0">
        <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
              Chọn cụm theo:
            </span>
            <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-slate-950 border border-slate-800 gap-1">
              {(
                [
                  { id: 'part', label: 'Phần đề thi', icon: Layers },
                  { id: 'subject', label: 'Phân môn', icon: Sparkles },
                  { id: 'person', label: 'Theo Người', icon: UserCheck },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const isActive = clusterDimension === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isRolling}
                    onClick={() => {
                      setClusterDimension(opt.id);
                      if (opt.id === 'person') {
                        setFlowOrder('student_then_cluster');
                      } else {
                        setFlowOrder('cluster_then_student');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                      isActive
                        ? 'bg-amber-400 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <select
              value={flowOrder}
              onChange={(e) => {
                cancelWaitCountdown();
                setFlowOrder(e.target.value as PresentationFlowOrder);
              }}
              disabled={isRolling}
              className="w-full sm:w-auto max-w-full min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-semibold text-indigo-200 focus:outline-none"
              title="Cách điều phối trình tự công bố"
            >
              <option value="cluster_then_student">
                Từng cụm → từng người (xong 1 HS chờ rồi sang HS sau)
              </option>
              <option value="student_then_cluster">
                Từng người → các cụm đã chọn (xong 1 HS chờ rồi sang HS sau)
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setLeftPanelTab((prev) => (prev === 'setup' ? 'queue' : 'setup'))}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer whitespace-nowrap shrink-0 self-start @3xl:self-auto ${
              leftPanelTab === 'setup'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-950 text-amber-300 border-amber-500/40 hover:bg-slate-800'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5 shrink-0" />
            <span>
              {leftPanelTab === 'setup'
                ? 'Về Hàng đợi công bố'
                : `Chọn & Xếp thứ tự (${orderedEnabledClusters.length} cụm · ${orderedEnabledContestants.length} người)`}
            </span>
          </button>
        </div>

        {/* Active Cluster Picker Strip (wraps cleanly without horizontal clipping) */}
        {orderedEnabledClusters.length > 0 && flowOrder === 'cluster_then_student' && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap mr-1">
              Cụm đang trình chiếu:
            </span>
            {orderedEnabledClusters.map((cDef, idx) => {
              const isSelected = activeClusterDef?.id === cDef.id;
              const doneCount = orderedEnabledContestants.filter((st) =>
                (revealedClustersByStudent[st.key] || []).includes(cDef.id)
              ).length;
              const isAllDone =
                orderedEnabledContestants.length > 0 &&
                doneCount >= orderedEnabledContestants.length;

              return (
                <button
                  key={cDef.id}
                  type="button"
                  disabled={isRolling}
                  onClick={() => {
                    cancelWaitCountdown();
                    setActiveClusterId(cDef.id);
                  }}
                  title={cDef.title}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border transition-colors cursor-pointer whitespace-nowrap max-w-full disabled:opacity-50 ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow'
                      : isAllDone
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/60'
                      : 'bg-slate-950 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <span className="font-mono opacity-75 shrink-0">{idx + 1}.</span>
                  <span className="truncate max-w-[200px]">{cDef.shortLabel}</span>
                  <span
                    className={`font-mono text-[11px] tabular-nums shrink-0 ${
                      isSelected ? 'text-slate-900 font-extrabold' : 'text-slate-400'
                    }`}
                  >
                    {doneCount}/{orderedEnabledContestants.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Split-Screen Stage (stacks cleanly below 1024px container width, 50/50 side-by-side at >= 1024px) */}
      {contestants.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center min-h-[280px]">
          <Users className="w-12 h-12 text-slate-600 mb-3" />
          <h3 className="text-lg font-bold text-white">Phòng thi chưa có dữ liệu bài nộp</h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mt-1">
            Khi học sinh hoàn thành và nộp bài ở đề thi / tổ hợp đang chọn, hệ thống sẽ tự động thu
            thập Tên gọi, SBD và Điểm số để bạn chọn cụm, sắp xếp thứ tự và trình chiếu công bố.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 @5xl:grid-cols-2 gap-6 items-start min-w-0">
          {/* LEFT COLUMN: SÂN KHẤU ĐIỂM THI & HÀNG ĐỢI / TÙY CHỌN THỨ TỰ */}
          <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col gap-5 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-300 truncate">
                  {flowOrder === 'cluster_then_student' && activeClusterDef
                    ? `Sân khấu cụm: ${activeClusterDef.title}`
                    : 'Sân khấu công bố điểm'}
                </h2>
              </div>
              {isRolling && musicStyle !== 'mute' && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 whitespace-nowrap shrink-0">
                  <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                  <span>Đang phát nhạc</span>
                </span>
              )}
            </div>

            {/* Active Spotlight Odometer Stage */}
            <div className="flex flex-col items-center justify-center py-5 px-4 rounded-2xl bg-gradient-to-b from-slate-950 via-indigo-950/45 to-slate-950 border border-slate-800 text-center min-h-[250px] gap-4 overflow-hidden">
              {!spotlightContestant ? (
                <div className="space-y-3 max-w-md w-full">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center mx-auto text-amber-400">
                    <Play className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-extrabold text-white text-balance break-words">
                    {currentTitle}
                  </h3>
                  {activeClusterDef && flowOrder === 'cluster_then_student' && (
                    <div className="text-xs font-bold text-indigo-300 break-words">
                      Cụm hiện tại: <span className="text-amber-300">{activeClusterDef.title}</span> ·{' '}
                      {orderedEnabledContestants.length} thí sinh trong hàng đợi
                    </div>
                  )}
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Công bố lần lượt từng thí sinh theo thứ tự bạn đã chọn. Sau mỗi học sinh lên
                    bảng xếp hạng sẽ có thời gian chờ{' '}
                    <strong className="text-emerald-300">
                      {waitSeconds > 0 ? `${waitSeconds} giây` : 'bấm tay'}
                    </strong>{' '}
                    trước khi sang thí sinh tiếp theo.
                  </p>
                  {pendingInActiveCluster.length > 0 && (
                    <button
                      type="button"
                      onClick={() => triggerPrimaryAction(pendingInActiveCluster[0])}
                      className="mt-1 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-black inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer max-w-full"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span className="truncate">
                        Bắt đầu: {pendingInActiveCluster[0].studentName}
                        {flowOrder === 'cluster_then_student' && activeClusterDef
                          ? ` (${activeClusterDef.shortLabel})`
                          : ''}
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4 w-full flex flex-col items-center min-w-0">
                  {/* Contestant Identity */}
                  <div className="space-y-1 w-full min-w-0">
                    {(spotlightContestant.studentCode || spotlightContestant.className) && (
                      <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-mono text-amber-300/90 uppercase tracking-widest">
                        {spotlightContestant.studentCode && (
                          <span>SBD: {spotlightContestant.studentCode}</span>
                        )}
                        {spotlightContestant.className && (
                          <>
                            {spotlightContestant.studentCode && <span>·</span>}
                            <span>{spotlightContestant.className}</span>
                          </>
                        )}
                      </div>
                    )}
                    <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight break-words">
                      {spotlightContestant.studentName}
                    </h3>
                  </div>

                  {/* Mode 1: Single Cluster Focus */}
                  {spotlightMode === 'single_cluster' && spotlightTargetClusterId && (
                    <div className="w-full max-w-lg space-y-3 min-w-0">
                      {(() => {
                        const targetDef = clusterDefMap.get(spotlightTargetClusterId);
                        const cs = spotlightContestant.clusterScores.find(
                          (x) => x.clusterId === spotlightTargetClusterId
                        );
                        const clusterMax = cs
                          ? scaleMode === 'ten'
                            ? cs.maxTen
                            : cs.maxRaw
                          : targetDef?.maxRaw || 10;

                        return (
                          <div className="p-4 rounded-2xl border border-amber-400/70 bg-amber-500/10 flex flex-col items-center gap-2 overflow-hidden">
                            <div className="text-xs font-bold text-amber-200 flex flex-wrap items-center justify-center gap-1.5 text-center">
                              <span className="break-words">
                                Điểm cụm: {targetDef?.title || cs?.title}
                              </span>
                              <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                                (/
                                {activeDecimalPlaces === 0
                                  ? Math.round(clusterMax)
                                  : clusterMax.toFixed(activeDecimalPlaces)}
                                )
                              </span>
                            </div>
                            <div className="max-w-full overflow-x-auto py-0.5">
                              <OdometerScore
                                key={`${spotlightContestant.key}-${spotlightTargetClusterId}`}
                                value={spotlightActiveClusterValue}
                                decimalPlaces={activeDecimalPlaces}
                                minIntDigits={clusterMax < 10 ? 1 : 2}
                                totalDurationMs={perStepRollMs}
                                rollTrigger={spotlightClusterRollTrigger}
                                isRolling={isRolling}
                                size="xl"
                                theme="dark"
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Strip of enabled clusters (Strictly ONLY revealed clusters show score; others say Chờ!) */}
                      {orderedEnabledClusters.length > 1 && (
                        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-2 w-full">
                          {orderedEnabledClusters.map((cDef) => {
                            const revealedList =
                              revealedClustersByStudent[spotlightContestant.key] || [];
                            const isRevealed = revealedList.includes(cDef.id);
                            const isCurrent = cDef.id === spotlightTargetClusterId;
                            const cs = spotlightContestant.clusterScores.find(
                              (x) => x.clusterId === cDef.id
                            );
                            const val = cs
                              ? scaleMode === 'ten'
                                ? cs.earnedTen
                                : cs.earnedRaw
                              : 0;
                            return (
                              <div
                                key={cDef.id}
                                className={`px-3 py-2 rounded-xl border text-left text-xs flex items-center justify-between gap-2 min-w-0 ${
                                  isCurrent
                                    ? 'border-amber-400/70 bg-amber-500/15 text-amber-100'
                                    : isRevealed
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                                    : 'border-slate-800 bg-slate-900/60 text-slate-400'
                                }`}
                              >
                                <span className="truncate font-semibold min-w-0" title={cDef.title}>
                                  {cDef.shortLabel}
                                </span>
                                <span className="font-mono font-bold tabular-nums shrink-0">
                                  {isRevealed
                                    ? activeDecimalPlaces === 0
                                      ? Math.round(val)
                                      : val.toFixed(activeDecimalPlaces)
                                    : isCurrent && isRolling
                                    ? 'Đang quay'
                                    : 'Chờ'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 2: Multi-Cluster Sequential for 1 Student (max 2 cols so cards never crush!) */}
                  {spotlightMode === 'multi_cluster' && orderedEnabledClusters.length > 1 && (
                    <div className="w-full grid grid-cols-1 @md:grid-cols-2 gap-3">
                      {orderedEnabledClusters.map((cDef) => {
                        const cs = spotlightContestant.clusterScores.find(
                          (x) => x.clusterId === cDef.id
                        );
                        const isCurrentlyRolling = isRolling && activeMultiClusterId === cDef.id;
                        const isClusterDone = !isRolling || lockedMultiClusterIds.has(cDef.id);
                        const clusterMax = cs
                          ? scaleMode === 'ten'
                            ? cs.maxTen
                            : cs.maxRaw
                          : cDef.maxRaw;
                        const clusterVal = spotlightMultiValues[cDef.id] ?? 0;

                        return (
                          <div
                            key={cDef.id}
                            className={`p-3 rounded-2xl border transition-colors text-center flex flex-col items-center justify-between gap-2 min-w-0 overflow-hidden ${
                              isCurrentlyRolling
                                ? 'bg-amber-500/15 border-amber-400 shadow-lg'
                                : isClusterDone
                                ? 'bg-emerald-500/10 border-emerald-400/40'
                                : 'bg-slate-900/70 border-slate-800 opacity-70'
                            }`}
                          >
                            <div className="w-full flex items-center justify-between gap-2 text-xs min-w-0">
                              <span
                                className="font-bold text-slate-200 truncate text-left min-w-0"
                                title={cDef.title}
                              >
                                {cDef.shortLabel}
                              </span>
                              <span className="font-mono text-slate-400 shrink-0 tabular-nums">
                                /
                                {activeDecimalPlaces === 0
                                  ? Math.round(clusterMax)
                                  : clusterMax.toFixed(activeDecimalPlaces)}
                              </span>
                            </div>
                            <div className="max-w-full overflow-x-auto">
                              <OdometerScore
                                key={`${spotlightContestant.key}-multi-${cDef.id}`}
                                value={clusterVal}
                                decimalPlaces={activeDecimalPlaces}
                                minIntDigits={clusterMax < 10 ? 1 : 2}
                                totalDurationMs={perStepRollMs}
                                rollTrigger={spotlightMultiTriggers[cDef.id] || 0}
                                isRolling={isCurrentlyRolling}
                                size="lg"
                                theme="dark"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Cumulative Revealed Total Odometer */}
                  <div className="flex flex-col items-center gap-1.5 max-w-full">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
                      {orderedEnabledClusters.length > 1
                        ? 'Tổng điểm đã công bố (tích lũy)'
                        : 'Điểm số chính thức'}
                    </span>
                    <div className="px-5 py-4 sm:px-8 sm:py-5 rounded-3xl bg-white text-slate-950 border-4 border-amber-400 shadow-2xl inline-flex items-center justify-center max-w-full overflow-x-auto">
                      <OdometerScore
                        key={spotlightContestant.key}
                        value={spotlightTotalDisplayScore}
                        decimalPlaces={activeDecimalPlaces}
                        minIntDigits={minIntDigits}
                        totalDurationMs={perStepRollMs}
                        rollTrigger={spotlightTotalRollTrigger}
                        isRolling={isRolling}
                        size="2xl"
                      />
                    </div>
                  </div>

                  {/* WAIT COUNTDOWN BANNER */}
                  {!isRolling && waitingState && (
                    <div className="w-full max-w-lg rounded-2xl bg-slate-900/95 border border-emerald-500/50 p-3.5 text-left space-y-2.5 shadow-lg">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="text-emerald-300 font-bold min-w-0">
                          Đã xếp hạng:{' '}
                          <span className="text-white break-words">
                            {waitingState.justCompletedName}
                          </span>
                        </div>
                        <div className="font-mono font-black text-amber-300 tabular-nums shrink-0">
                          {waitingState.totalMs > 0
                            ? `${(waitingState.remainingMs / 1000).toFixed(1)}s`
                            : 'Chờ bấm tay'}
                        </div>
                      </div>

                      {waitingState.totalMs > 0 && (
                        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 transition-all duration-100"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((waitingState.totalMs - waitingState.remainingMs) /
                                    waitingState.totalMs) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-300 min-w-0">
                          Tiếp theo:{' '}
                          <strong className="text-white">{waitingState.nextStudentName}</strong>
                          {flowOrder === 'cluster_then_student' && (
                            <span className="text-slate-400"> ({waitingState.nextClusterLabel})</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {waitingState.totalMs > 0 && autoAdvanceNextStudent && (
                            <button
                              type="button"
                              onClick={toggleWaitPause}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              {waitingState.isPaused ? (
                                <>
                                  <Play className="w-3.5 h-3.5 shrink-0" />
                                  <span>Tiếp tục đếm</span>
                                </>
                              ) : (
                                <>
                                  <Pause className="w-3.5 h-3.5 shrink-0" />
                                  <span>Tạm dừng</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const nextSt = contestantMap.get(waitingState.nextStudentKey);
                              const nextCl = clusterDefMap.get(waitingState.nextClusterId);
                              cancelWaitCountdown();
                              if (nextSt) {
                                if (flowOrder === 'cluster_then_student' && nextCl) {
                                  handleAnnounceSingleClusterForStudent(nextSt, nextCl);
                                } else {
                                  handleAnnounceStudentFull(nextSt);
                                }
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <SkipForward className="w-3.5 h-3.5 shrink-0" />
                            <span>Công bố ngay</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* End-of-Cluster CTA */}
                  {!isRolling &&
                    !waitingState &&
                    flowOrder === 'cluster_then_student' &&
                    pendingInActiveCluster.length === 0 &&
                    nextClusterToPresent && (
                      <div className="w-full max-w-lg rounded-2xl bg-indigo-950/70 border border-indigo-500/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-left min-w-0 flex-1">
                          <div className="text-xs font-bold text-emerald-300">
                            Đã hoàn tất {activeClusterDef?.shortLabel} cho toàn bộ danh sách!
                          </div>
                          <div className="text-xs text-slate-300 truncate">
                            Cụm tiếp theo:{' '}
                            <strong className="text-white">{nextClusterToPresent.title}</strong>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveClusterId(nextClusterToPresent.id);
                          }}
                          className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <SkipForward className="w-3.5 h-3.5 shrink-0" />
                          <span>Sang cụm: {nextClusterToPresent.shortLabel}</span>
                        </button>
                      </div>
                    )}

                  {/* Manual Next Button when idle without countdown */}
                  {!isRolling && !waitingState && pendingInActiveCluster.length > 0 && (
                    <button
                      type="button"
                      onClick={() => triggerPrimaryAction(pendingInActiveCluster[0])}
                      className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-md cursor-pointer max-w-full"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span className="truncate">
                        Công bố tiếp: {pendingInActiveCluster[0].studentName}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Left Panel: Tabbed Queue vs Cluster & Student Selection/Ordering */}
            <div className="flex flex-col gap-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 max-w-full">
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab('queue')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                      leftPanelTab === 'queue'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Hàng đợi công bố ({pendingInActiveCluster.length} chờ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab('setup')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                      leftPanelTab === 'setup'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Chọn &amp; Xếp thứ tự ({orderedEnabledClusters.length} cụm ·{' '}
                    {orderedEnabledContestants.length} người)
                  </button>
                </div>

                {flowOrder === 'cluster_then_student' && activeClusterDef && (
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
                    {activeClusterDef.shortLabel}: {activeClusterCountDone}/
                    {orderedEnabledContestants.length}
                  </span>
                )}
              </div>

              {/* TAB 1: ORDERED ANNOUNCEMENT QUEUE */}
              {leftPanelTab === 'queue' ? (
                <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                  {orderedEnabledContestants.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                      Chưa có thí sinh nào được chọn trong hàng đợi. Hãy mở tab{' '}
                      <strong>Chọn &amp; Xếp thứ tự</strong> để chọn thí sinh.
                    </div>
                  ) : (
                    orderedEnabledContestants.map((entry, idx) => {
                      const revealedIds = revealedClustersByStudent[entry.key] || [];
                      const isDoneForCurrent =
                        flowOrder === 'cluster_then_student' && activeClusterDef
                          ? revealedIds.includes(activeClusterDef.id)
                          : revealedIds.length >= orderedEnabledClusters.length;
                      const fullIndex = studentOrderKeys.indexOf(entry.key);

                      return (
                        <div
                          key={entry.key}
                          className={`px-3 py-2.5 rounded-xl border flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 ${
                            isDoneForCurrent
                              ? 'bg-emerald-950/30 border-emerald-800/50 opacity-80'
                              : 'bg-slate-950/90 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-sm text-white truncate">
                                {entry.studentName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                                {entry.studentCode && <span>SBD: {entry.studentCode}</span>}
                                {entry.studentCode && <span>·</span>}
                                <span
                                  className={
                                    isDoneForCurrent ? 'text-emerald-300 font-semibold' : ''
                                  }
                                >
                                  {isDoneForCurrent
                                    ? 'Đã công bố lượt này'
                                    : `Đã xong ${revealedIds.length}/${orderedEnabledClusters.length} cụm`}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-auto">
                            <button
                              type="button"
                              disabled={isRolling || fullIndex <= 0}
                              onClick={() =>
                                setStudentOrderKeys((prev) => moveItemInArray(prev, fullIndex, -1))
                              }
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer"
                              title="Đưa lên trước"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={
                                isRolling ||
                                fullIndex < 0 ||
                                fullIndex >= studentOrderKeys.length - 1
                              }
                              onClick={() =>
                                setStudentOrderKeys((prev) => moveItemInArray(prev, fullIndex, 1))
                              }
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 disabled:opacity-30 cursor-pointer"
                              title="Đưa xuống sau"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isRolling}
                              onClick={() => triggerPrimaryAction(entry)}
                              className={`ml-1 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                                isDoneForCurrent
                                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                              }`}
                            >
                              <Play className="w-3 h-3 fill-current shrink-0" />
                              <span>{isDoneForCurrent ? 'Quay lại' : 'Công bố'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                /* TAB 2: STACKED FULL-WIDTH CLUSTER & STUDENT SELECTION/ORDERING (Zero squishing!) */
                <div className="flex flex-col gap-5 max-h-[460px] overflow-y-auto pr-1">
                  {/* Section 1: Cluster Picker & Order */}
                  <div className="space-y-2.5 bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                        1. Chọn &amp; Xếp Cụm ({orderedEnabledClusters.length}/
                        {orderedAllClusters.length})
                      </span>
                      <button
                        type="button"
                        disabled={isRolling}
                        onClick={() => setDisabledClusterIds(new Set())}
                        className="text-xs font-semibold text-amber-300 hover:underline cursor-pointer disabled:opacity-40"
                      >
                        Chọn tất cả
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {orderedAllClusters.map((cDef, idx) => {
                        const isChecked = !disabledClusterIds.has(cDef.id);
                        return (
                          <div
                            key={cDef.id}
                            className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                              isChecked
                                ? 'bg-slate-950 border-slate-700 text-white'
                                : 'bg-slate-950/40 border-slate-800/70 text-slate-500'
                            }`}
                          >
                            <button
                              type="button"
                              disabled={isRolling}
                              onClick={() => toggleClusterEnabled(cDef.id)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-50"
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 shrink-0" />
                              )}
                              <span className="truncate font-semibold" title={cDef.title}>
                                {idx + 1}. {cDef.title}
                              </span>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={isRolling || idx === 0}
                                onClick={() =>
                                  setClusterOrderIds((prev) => moveItemInArray(prev, idx, -1))
                                }
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 cursor-pointer"
                                title="Đưa cụm lên"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isRolling || idx >= orderedAllClusters.length - 1}
                                onClick={() =>
                                  setClusterOrderIds((prev) => moveItemInArray(prev, idx, 1))
                                }
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 cursor-pointer"
                                title="Đưa cụm xuống"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: Student Picker & Custom Order */}
                  <div className="space-y-2.5 bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                        2. Chọn &amp; Xếp Người ({orderedEnabledContestants.length}/
                        {orderedAllContestants.length})
                      </span>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          disabled={isRolling}
                          onClick={() => setDisabledStudentKeys(new Set())}
                          className="text-amber-300 font-semibold hover:underline cursor-pointer"
                        >
                          Chọn tất cả
                        </button>
                        <span className="text-slate-600">·</span>
                        <button
                          type="button"
                          disabled={isRolling}
                          onClick={() =>
                            setDisabledStudentKeys(new Set(orderedAllContestants.map((c) => c.key)))
                          }
                          className="text-slate-400 hover:underline cursor-pointer"
                        >
                          Bỏ hết
                        </button>
                      </div>
                    </div>

                    {/* Non-score Quick Sort Controls */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isRolling}
                        onClick={() => applyNonScoreSort('sbd')}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-[11px] font-semibold text-slate-300 cursor-pointer"
                      >
                        Theo SBD
                      </button>
                      <button
                        type="button"
                        disabled={isRolling}
                        onClick={() => applyNonScoreSort('name')}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-[11px] font-semibold text-slate-300 cursor-pointer"
                      >
                        Tên A-Z
                      </button>
                      <button
                        type="button"
                        disabled={isRolling}
                        onClick={() => applyNonScoreSort('reverse')}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-[11px] font-semibold text-slate-300 cursor-pointer"
                      >
                        Đảo ngược
                      </button>
                      <button
                        type="button"
                        disabled={isRolling}
                        onClick={() => applyNonScoreSort('shuffle')}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-[11px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Shuffle className="w-3 h-3" />
                        <span>Ngẫu nhiên</span>
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {orderedAllContestants.map((entry, idx) => {
                        const isChecked = !disabledStudentKeys.has(entry.key);
                        return (
                          <div
                            key={entry.key}
                            className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                              isChecked
                                ? 'bg-slate-950 border-slate-700 text-white'
                                : 'bg-slate-950/40 border-slate-800/70 text-slate-500'
                            }`}
                          >
                            <button
                              type="button"
                              disabled={isRolling}
                              onClick={() => toggleStudentEnabled(entry.key)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-50"
                            >
                              {isChecked ? (
                                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold">
                                  {idx + 1}. {entry.studentName}
                                </div>
                                {entry.studentCode && (
                                  <div className="text-[10px] font-mono text-slate-400 truncate">
                                    SBD: {entry.studentCode}
                                  </div>
                                )}
                              </div>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={isRolling || idx === 0}
                                onClick={() =>
                                  setStudentOrderKeys((prev) => moveItemInArray(prev, idx, -1))
                                }
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 cursor-pointer"
                                title="Đưa lên trước"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isRolling || idx >= orderedAllContestants.length - 1}
                                onClick={() =>
                                  setStudentOrderKeys((prev) => moveItemInArray(prev, idx, 1))
                                }
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 cursor-pointer"
                                title="Đưa xuống sau"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: BẢNG XẾP HẠNG TRỰC TIẾP */}
          <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col gap-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-300">
                  Bảng xếp hạng trực tiếp
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
                {revealedLeaderboard.length} / {orderedEnabledContestants.length} đã lên bảng
              </span>
            </div>

            {revealedLeaderboard.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 min-h-[300px]">
                <Trophy className="w-10 h-10 text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-300">
                  Chưa có thí sinh nào trên bảng xếp hạng
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Khi mỗi học sinh công bố xong điểm cụm (hoặc trọn bài), thí sinh sẽ lập tức xếp
                  lên bảng xếp hạng tại đây trước khi chuyển sang học sinh tiếp theo.
                </p>
              </div>
            ) : (
              <div className="max-h-[720px] overflow-y-auto space-y-2.5 pr-1">
                {revealedLeaderboard.map((entry, idx) => {
                  const rank = idx + 1;
                  const scoreVal = getStudentRevealedScore(entry);
                  const revealedIdSet = new Set(revealedClustersByStudent[entry.key] || []);
                  const revealedClusterList = orderedEnabledClusters.filter((c) =>
                    revealedIdSet.has(c.id)
                  );
                  const isMostRecent = lastRankedKey === entry.key;

                  return (
                    <div
                      key={entry.key}
                      ref={(el) => {
                        rowRefs.current[entry.key] = el;
                      }}
                      className={`px-4 py-3.5 rounded-xl border flex flex-wrap @sm:flex-nowrap items-center justify-between gap-3 transition-colors ${
                        isMostRecent
                          ? 'border-emerald-400 bg-emerald-950/25 shadow-md'
                          : rank === 1
                          ? 'bg-amber-500/15 border-amber-400/70'
                          : rank === 2
                          ? 'bg-slate-800/95 border-slate-500/70'
                          : rank === 3
                          ? 'bg-amber-900/20 border-amber-700/60'
                          : 'bg-slate-950/85 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start @sm:items-center gap-3 min-w-0 flex-1">
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

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-bold text-base text-white truncate max-w-full">
                              {entry.studentName}
                            </span>
                            {isMostRecent && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 whitespace-nowrap">
                                Vừa cập nhật
                              </span>
                            )}
                          </div>
                          {(entry.studentCode || entry.className) && (
                            <div className="font-mono text-xs text-slate-400 truncate">
                              {entry.studentCode ? `SBD: ${entry.studentCode}` : ''}
                              {entry.studentCode && entry.className ? ' · ' : ''}
                              {entry.className || ''}
                            </div>
                          )}
                          {/* Strictly show ONLY clusters that have been revealed for this student */}
                          {orderedEnabledClusters.length > 1 && revealedClusterList.length > 0 && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] font-mono text-slate-300">
                              {revealedClusterList.map((cDef) => {
                                const cs = entry.clusterScores.find(
                                  (x) => x.clusterId === cDef.id
                                );
                                const val = cs
                                  ? scaleMode === 'ten'
                                    ? cs.earnedTen
                                    : cs.earnedRaw
                                  : 0;
                                const formatted =
                                  activeDecimalPlaces === 0
                                    ? Math.round(val)
                                    : val.toFixed(activeDecimalPlaces);
                                return (
                                  <span key={cDef.id} title={cDef.title} className="tabular-nums">
                                    {cDef.shortLabel}:{' '}
                                    <strong className="text-amber-300">{formatted}</strong>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-auto">
                        <span className="font-mono font-black text-xl sm:text-2xl text-amber-300 tabular-nums whitespace-nowrap">
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
