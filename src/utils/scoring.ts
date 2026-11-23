import { 
  CandidateAnswerValue, 
  Exam, 
  ExamPart,
  ExamPartScore,
  ExamResult, 
  MatchingItem,
  MatchingLabelStyle,
  Question, 
  QuestionScoreDetail,
  QuestionType
} from '../types/exam';
import { formatMatchingLabel } from './matching';

export const DEFAULT_QUESTION_TYPE_ORDER: QuestionType[] = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'text_input',
  'matching',
  'grouped',
  'essay',
];

export const QUESTION_TYPE_CLUSTER_META: Record<
  QuestionType,
  { shortLabel: string; partTitle: string }
> = {
  single_choice: {
    shortLabel: 'Trắc nghiệm đơn',
    partTitle: 'Trắc nghiệm nhiều phương án lựa chọn (1 đáp án)',
  },
  multiple_choice: {
    shortLabel: 'Chọn nhiều đáp án',
    partTitle: 'Trắc nghiệm chọn nhiều phương án đúng',
  },
  true_false: {
    shortLabel: 'Đúng / Sai',
    partTitle: 'Câu trắc nghiệm Đúng / Sai',
  },
  text_input: {
    shortLabel: 'Trả lời ngắn',
    partTitle: 'Câu trắc nghiệm trả lời ngắn',
  },
  matching: {
    shortLabel: 'Ghép đôi',
    partTitle: 'Câu hỏi ghép đôi hai cột',
  },
  grouped: {
    shortLabel: 'Câu hỏi chùm',
    partTitle: 'Câu hỏi chùm / Đọc hiểu bối cảnh',
  },
  essay: {
    shortLabel: 'Tự luận / Soạn thảo',
    partTitle: 'Câu hỏi tự luận (Soạn thảo văn bản & công thức)',
  },
};

export function toRomanNumeral(num: number): string {
  const romans: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let n = Math.max(1, Math.floor(num));
  let res = '';
  for (const [val, sym] of romans) {
    while (n >= val) {
      res += sym;
      n -= val;
    }
  }
  return res;
}

export function normalizeQuestionTypeOrder(customOrder?: QuestionType[]): QuestionType[] {
  const seen = new Set<QuestionType>();
  const result: QuestionType[] = [];
  for (const t of customOrder || []) {
    if (DEFAULT_QUESTION_TYPE_ORDER.includes(t) && !seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  for (const t of DEFAULT_QUESTION_TYPE_ORDER) {
    if (!seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  return result;
}

export interface QuestionClusterGroup {
  partIndex: number;
  roman: string;
  type: QuestionType;
  shortLabel: string;
  partTitle: string;
  items: { question: Question; flatIndex: number }[];
}

export function buildQuestionClusters(
  questions: Question[],
  typeOrder?: QuestionType[]
): QuestionClusterGroup[] {
  const order = normalizeQuestionTypeOrder(typeOrder);
  const buckets = new Map<QuestionType, { question: Question; flatIndex: number }[]>();

  order.forEach((t) => buckets.set(t, []));

  questions.forEach((question, flatIndex) => {
    const qType = question.type || 'single_choice';
    const existing = buckets.get(qType) || [];
    existing.push({ question, flatIndex });
    buckets.set(qType, existing);
  });

  const clusters: QuestionClusterGroup[] = [];
  order.forEach((type) => {
    const items = buckets.get(type) || [];
    if (items.length > 0) {
      const meta = QUESTION_TYPE_CLUSTER_META[type] || {
        shortLabel: type,
        partTitle: type,
      };
      const partIndex = clusters.length;
      clusters.push({
        partIndex,
        roman: toRomanNumeral(partIndex + 1),
        type,
        shortLabel: meta.shortLabel,
        partTitle: meta.partTitle,
        items,
      });
    }
  });

  return clusters;
}

/**
 * Chuẩn hóa chuỗi văn bản hoặc số để so sánh câu trả lời ngắn
 */
export function normalizeTextAnswer(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Chuẩn hóa dấu phẩy thập phân sang dấu chấm (VD: 3,5 -> 3.5)
    .replace(/(\d+),(\d+)/g, '$1.$2');
}

/**
 * Chuẩn hóa số thập phân về dạng dấu phẩy (VD: 3.5 -> 3,5),
 * bỏ qua chuỗi nhiều dấu chấm như địa chỉ IP (192.168.1.1) hoặc số phiên bản (2.0.1).
 */
export function formatShortAnswerDecimalComma(str: string): string {
  if (!str) return '';
  return str.replace(/(^|[^0-9.])(-?\d+)\.(\d+)(?![0-9.]|\.\d)/g, '$1$2,$3');
}

/**
 * Tách danh sách đáp án đúng cho câu trả lời ngắn (ngăn cách bởi dấu chấm phẩy ";"),
 * đồng thời chuẩn hóa số thập phân sang dấu phẩy.
 */
export function parseAcceptedShortAnswers(raw: string): string[] {
  const cleaned = raw
    .split(';')
    .map((s) => formatShortAnswerDecimalComma(s.trim()))
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

/**
 * Định dạng danh sách đáp án đúng của câu trả lời ngắn để hiển thị
 * (số thập phân dùng dấu phẩy, ngăn cách các đáp án đúng bằng dấu chấm phẩy ";").
 */
export function formatAcceptedShortAnswersList(answers?: string[], separator = ' ; '): string {
  if (!answers || answers.length === 0) return '';
  const formatted = answers
    .map((a) => formatShortAnswerDecimalComma(a.trim()))
    .filter(Boolean);
  return Array.from(new Set(formatted)).join(separator);
}

/**
 * Chấm điểm cho 1 câu hỏi cụ thể theo quy tắc của người dùng:
 * - Single choice: đúng nhận trọn điểm câu.
 * - True / False: nếu từng ý có điểm thì chấm theo điểm ý; nếu không có điểm từng ý thì mặc định chia đều điểm của câu!
 * - Text input: so khớp với danh sách acceptedAnswers (chuẩn hóa số, phẩy/chấm).
 * - Grouped: tổng hợp điểm các câu hỏi con.
 */
export function gradeQuestion(
  question: Question,
  userAnswer: CandidateAnswerValue | undefined
): QuestionScoreDetail {
  const maxPoints = question.points || 1.0;

  // 1. Dạng Single Choice
  if (question.type === 'single_choice') {
    const isSkipped = userAnswer === undefined || userAnswer === null;
    if (isSkipped) {
      return {
        questionId: question.id,
        earnedPoints: 0,
        maxPoints,
        isFullyCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
      };
    }
    const isCorrect = Number(userAnswer) === question.correctAnswer;
    return {
      questionId: question.id,
      earnedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      isFullyCorrect: isCorrect,
      isPartiallyCorrect: false,
      isSkipped: false,
    };
  }

  // 1b. Dạng Multiple Choice (Chọn nhiều phương án đúng)
  if (question.type === 'multiple_choice') {
    const userChoices = Array.isArray(userAnswer) ? (userAnswer as number[]) : [];
    const isSkipped = userChoices.length === 0;

    if (isSkipped) {
      return {
        questionId: question.id,
        earnedPoints: 0,
        maxPoints,
        isFullyCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
      };
    }

    const correctList = question.correctAnswers || (question.correctAnswer !== undefined ? [question.correctAnswer] : []);
    if (correctList.length === 0) {
      return {
        questionId: question.id,
        earnedPoints: maxPoints,
        maxPoints,
        isFullyCorrect: true,
        isPartiallyCorrect: false,
        isSkipped: false,
      };
    }

    const correctSet = new Set(correctList);
    let correctCount = 0;
    let incorrectCount = 0;

    userChoices.forEach((idx) => {
      if (correctSet.has(idx)) correctCount++;
      else incorrectCount++;
    });

    const isFullyCorrect = correctCount === correctList.length && incorrectCount === 0;
    // Chấm điểm từng phần: tỷ lệ đúng trừ số phương án chọn sai (tối thiểu 0)
    const ratio = Math.max(0, (correctCount - incorrectCount) / correctList.length);
    const earnedPoints = Number((ratio * maxPoints).toFixed(3));
    const isPartiallyCorrect = earnedPoints > 0 && !isFullyCorrect;

    return {
      questionId: question.id,
      earnedPoints,
      maxPoints,
      isFullyCorrect,
      isPartiallyCorrect,
      isSkipped: false,
    };
  }

  // 2. Dạng True / False (Nhiều ý Đúng / Sai)
  if (question.type === 'true_false') {
    const items = question.tfItems || [];
    if (items.length === 0) {
      return {
        questionId: question.id,
        earnedPoints: 0,
        maxPoints,
        isFullyCorrect: true,
        isPartiallyCorrect: false,
        isSkipped: false,
      };
    }

    const ansMap = (userAnswer as { [itemId: string]: boolean }) || {};
    const isSkipped = Object.keys(ansMap).length === 0;

    let correctItemsCount = 0;
    const itemScores: { [itemId: string]: { earned: number; max: number; correct: boolean } } = {};

    // Đánh giá từng ý đúng hay sai
    items.forEach((item) => {
      const userChoice = ansMap[item.id];
      const isCorrect = userChoice !== undefined && userChoice === item.isCorrect;
      if (isCorrect) correctItemsCount += 1;

      itemScores[item.id] = {
        earned: 0,
        max: item.points !== undefined && item.points > 0 ? item.points : maxPoints / items.length,
        correct: isCorrect,
      };
    });

    let earnedTotal = 0;

    // Chế độ 1: Bậc thang tùy chỉnh theo số ý đúng (tiered)
    if (question.tfScoringMode === 'tiered' && question.tfTierPoints && question.tfTierPoints.length > 0) {
      if (correctItemsCount > 0) {
        const tierIdx = correctItemsCount - 1;
        earnedTotal = question.tfTierPoints[tierIdx] !== undefined 
          ? question.tfTierPoints[tierIdx] 
          : (correctItemsCount === items.length ? maxPoints : 0);
      } else {
        earnedTotal = 0;
      }
    }
    // Chế độ 2: Chuẩn Bộ GD&ĐT 2025 (1 ý = 10%, 2 ý = 25%, 3 ý = 50%, 4 ý = 100% điểm câu)
    else if (question.tfScoringMode === 'standard_ministry') {
      if (correctItemsCount === 1) earnedTotal = 0.1 * maxPoints;
      else if (correctItemsCount === 2) earnedTotal = 0.25 * maxPoints;
      else if (correctItemsCount === 3) earnedTotal = 0.50 * maxPoints;
      else if (correctItemsCount >= 4) earnedTotal = maxPoints;
      else earnedTotal = 0;
    }
    // Chế độ 3: Điểm riêng từng ý đã gán trong TrueFalseItem
    else if (question.tfScoringMode === 'custom_item_points') {
      earnedTotal = 0;
      items.forEach((item) => {
        const itemMax = item.points !== undefined && item.points > 0 ? item.points : maxPoints / items.length;
        if (itemScores[item.id].correct) {
          earnedTotal += itemMax;
          itemScores[item.id].earned = itemMax;
        }
      });
    }
    // Chế độ 4: Chia đều mặc định (divide_equally)
    else {
      const defaultItemPoints = maxPoints / items.length;
      earnedTotal = 0;
      items.forEach((item) => {
        const itemMax = item.points !== undefined && item.points > 0 ? item.points : defaultItemPoints;
        if (itemScores[item.id].correct) {
          earnedTotal += itemMax;
          itemScores[item.id].earned = itemMax;
        }
      });
    }

    const isFullyCorrect = correctItemsCount === items.length;
    const isPartiallyCorrect = correctItemsCount > 0 && !isFullyCorrect;

    return {
      questionId: question.id,
      earnedPoints: Number(earnedTotal.toFixed(3)),
      maxPoints,
      isFullyCorrect,
      isPartiallyCorrect,
      isSkipped,
      itemScores,
    };
  }

  // 3. Dạng Text Input (Nhập chuỗi / số)
  if (question.type === 'text_input') {
    const rawInput = (userAnswer as string) || '';
    const isSkipped = !rawInput.trim();

    if (isSkipped) {
      return {
        questionId: question.id,
        earnedPoints: 0,
        maxPoints,
        isFullyCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
      };
    }

    const accepted = question.acceptedAnswers || [];
    const normalizedInput = question.caseSensitive ? rawInput.trim() : normalizeTextAnswer(rawInput);

    const isCorrect = accepted.some((acc) => {
      const normAcc = question.caseSensitive ? acc.trim() : normalizeTextAnswer(acc);
      return normAcc === normalizedInput;
    });

    return {
      questionId: question.id,
      earnedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      isFullyCorrect: isCorrect,
      isPartiallyCorrect: false,
      isSkipped: false,
    };
  }

  // 3b. Dạng Matching (Ghép đôi hai cột)
  if (question.type === 'matching') {
    const leftItems = question.matchingLeftItems || [];
    if (leftItems.length === 0) {
      return {
        questionId: question.id,
        earnedPoints: 0,
        maxPoints,
        isFullyCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
      };
    }

    const ansMap =
      userAnswer && typeof userAnswer === 'object' && !Array.isArray(userAnswer)
        ? (userAnswer as { [leftId: string]: string })
        : {};

    const hasAnyInput = leftItems.some((item) => {
      const val = ansMap[item.id];
      if (!val) return false;
      if (val.startsWith('__raw__:')) {
        return val.slice('__raw__:'.length).trim().length > 0;
      }
      return val.trim().length > 0;
    });

    if (!hasAnyInput) {
      return {
        questionId: question.id,
        earnedPoints: 0,
        maxPoints,
        isFullyCorrect: false,
        isPartiallyCorrect: false,
        isSkipped: true,
      };
    }

    const correctPairs = question.matchingCorrectPairs || {};
    const perItemMax = maxPoints / leftItems.length;
    const itemScores: { [itemId: string]: { earned: number; max: number; correct: boolean } } = {};
    let correctCount = 0;

    leftItems.forEach((leftItem) => {
      const userRightId = ansMap[leftItem.id];
      const expectedRightId = correctPairs[leftItem.id];
      const isCorrect =
        Boolean(expectedRightId) &&
        Boolean(userRightId) &&
        !userRightId.startsWith('__raw__:') &&
        userRightId === expectedRightId;

      if (isCorrect) correctCount += 1;

      itemScores[leftItem.id] = {
        earned: isCorrect ? Number(perItemMax.toFixed(3)) : 0,
        max: Number(perItemMax.toFixed(3)),
        correct: isCorrect,
      };
    });

    const earnedPoints = Number(((correctCount / leftItems.length) * maxPoints).toFixed(3));
    const isFullyCorrect = correctCount === leftItems.length;
    const isPartiallyCorrect = correctCount > 0 && !isFullyCorrect;

    return {
      questionId: question.id,
      earnedPoints,
      maxPoints,
      isFullyCorrect,
      isPartiallyCorrect,
      isSkipped: false,
      itemScores,
    };
  }

  // 4. Dạng Grouped (Câu hỏi chùm)
  if (question.type === 'grouped') {
    const subQs = question.subQuestions || [];
    const subAnsMap = (userAnswer as { [subId: string]: CandidateAnswerValue }) || {};

    let totalSubMax = 0;
    let totalSubEarned = 0;
    let allSubCorrect = true;
    let anySubCorrect = false;
    let allSubSkipped = true;
    const subQuestionScores: { [subId: string]: QuestionScoreDetail } = {};

    subQs.forEach((subQ) => {
      const subRes = gradeQuestion(subQ, subAnsMap[subQ.id]);
      subQuestionScores[subQ.id] = subRes;
      totalSubMax += subRes.maxPoints;
      totalSubEarned += subRes.earnedPoints;

      if (!subRes.isSkipped) allSubSkipped = false;
      if (subRes.isFullyCorrect) anySubCorrect = true;
      else allSubCorrect = false;
    });

    const effectiveMax = totalSubMax > 0 ? totalSubMax : maxPoints;

    return {
      questionId: question.id,
      earnedPoints: Number(totalSubEarned.toFixed(3)),
      maxPoints: effectiveMax,
      isFullyCorrect: allSubCorrect && subQs.length > 0,
      isPartiallyCorrect: anySubCorrect && !allSubCorrect,
      isSkipped: allSubSkipped,
      subQuestionScores,
    };
  }

  // 5. Dạng Tự luận / Soạn thảo văn bản (Essay)
  if (question.type === 'essay') {
    const rawText = typeof userAnswer === 'string' ? userAnswer : '';
    const isSkipped = !rawText.trim();
    return {
      questionId: question.id,
      earnedPoints: 0,
      maxPoints,
      isFullyCorrect: false,
      isPartiallyCorrect: !isSkipped,
      isSkipped,
    };
  }

  // Fallback
  return {
    questionId: question.id,
    earnedPoints: 0,
    maxPoints,
    isFullyCorrect: false,
    isPartiallyCorrect: false,
    isSkipped: true,
  };
}

/**
 * Xác định danh sách các phần thi (parts) & câu hỏi thuộc từng phần:
 * 1. Ưu tiên `exam.parts` do giáo viên thiết lập thủ công.
 * 2. Hoặc `q.partId` / `q.partTitle` gắn trực tiếp trên câu hỏi.
 * 3. Hoặc tự động suy diễn theo cụm dạng câu hỏi khi `groupByQuestionType` bật (hoặc có >= 2 dạng câu hỏi).
 */
export function resolveExamPartDefinitions(
  exam: Pick<Exam, 'parts' | 'questions' | 'settings'>
): { part: ExamPart; questions: Question[] }[] {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  if (questions.length === 0) return [];

  const explicitParts = Array.isArray(exam.parts) ? [...exam.parts].sort((a, b) => a.order - b.order) : [];
  if (explicitParts.length > 0) {
    const groups = new Map<string, { part: ExamPart; questions: Question[] }>();
    explicitParts.forEach((p, idx) => {
      groups.set(p.id, { part: { ...p, order: p.order ?? idx + 1 }, questions: [] });
    });
    const unassigned: Question[] = [];
    questions.forEach((q) => {
      if (q.partId && groups.has(q.partId)) {
        groups.get(q.partId)!.questions.push(q);
      } else if (q.partTitle) {
        const matched = explicitParts.find(
          (p) => p.title.trim().toLowerCase() === q.partTitle!.trim().toLowerCase()
        );
        if (matched) {
          groups.get(matched.id)!.questions.push(q);
        } else {
          unassigned.push(q);
        }
      } else {
        unassigned.push(q);
      }
    });

    const result = Array.from(groups.values()).filter((g) => g.questions.length > 0);
    if (unassigned.length > 0) {
      if (result.length === 0) {
        return [{ part: explicitParts[0], questions: unassigned }];
      }
      result.push({
        part: {
          id: 'part_other',
          title: 'Phần khác',
          order: explicitParts.length + 1,
        },
        questions: unassigned,
      });
    }
    return result;
  }

  // Check if questions carry explicit partId/partTitle tags directly
  const taggedMap = new Map<string, { part: ExamPart; questions: Question[] }>();
  let hasAnyTagged = false;
  questions.forEach((q) => {
    if (q.partId || q.partTitle) hasAnyTagged = true;
  });
  if (hasAnyTagged) {
    let orderIdx = 1;
    questions.forEach((q) => {
      const key = q.partId || q.partTitle || 'part_general';
      const title = q.partTitle || `Phần ${toRomanNumeral(orderIdx)}`;
      if (!taggedMap.has(key)) {
        taggedMap.set(key, {
          part: { id: key, title, order: orderIdx++ },
          questions: [],
        });
      }
      taggedMap.get(key)!.questions.push(q);
    });
    return Array.from(taggedMap.values());
  }

  // Auto-derive from question-type clusters when grouped by type OR multiple question types exist
  const clusters = buildQuestionClusters(questions, exam.settings?.questionTypeOrder);
  if (exam.settings?.groupByQuestionType || clusters.length > 1) {
    return clusters.map((c) => ({
      part: {
        id: `type_${c.type}`,
        title: `Phần ${c.roman}: ${c.shortLabel}`,
        description: c.partTitle,
        order: c.partIndex + 1,
      },
      questions: c.items.map((item) => item.question),
    }));
  }

  return [];
}

/**
 * Tính điểm chi tiết cho từng phần của đề thi
 */
export function computeExamPartBreakdowns(
  exam: Pick<Exam, 'parts' | 'questions' | 'settings'>,
  scoreDetails: { [qId: string]: QuestionScoreDetail }
): ExamPartScore[] {
  const partDefs = resolveExamPartDefinitions(exam);
  if (partDefs.length === 0) return [];

  return partDefs.map(({ part, questions }, idx) => {
    let earned = 0;
    let maxPts = 0;
    let correctCount = 0;
    const questionIds: string[] = [];

    questions.forEach((q) => {
      questionIds.push(q.id);
      const detail = scoreDetails[q.id];
      if (detail) {
        earned += detail.earnedPoints;
        maxPts += detail.maxPoints;
        if (detail.isFullyCorrect) correctCount += 1;
      } else {
        maxPts += q.points || 1.0;
      }
    });

    const finalEarned = Number(earned.toFixed(2));
    const finalMax = Number(maxPts.toFixed(2));
    const scoreOnTenScale = finalMax > 0 ? Number(((finalEarned / finalMax) * 10).toFixed(2)) : 0;

    return {
      partId: part.id,
      partTitle: part.title,
      order: part.order ?? idx + 1,
      questionIds,
      questionCount: questions.length,
      earnedPoints: finalEarned,
      maxPoints: finalMax,
      scoreOnTenScale,
      correctCount,
    };
  });
}

/**
 * Chấm điểm toàn bộ đề thi
 */
export function gradeEntireExam(
  exam: Exam,
  answers: { [qId: string]: CandidateAnswerValue },
  timeSpentSeconds: number,
  meta?: {
    submissionReason?: string;
    tabSwitchCount?: number;
  }
): ExamResult {
  let totalEarned = 0;
  let totalMax = 0;
  let correctCount = 0;
  let partialCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  const scoreDetails: { [qId: string]: QuestionScoreDetail } = {};
  const topicStats: { [topic: string]: { total: number; earned: number; maxPoints: number } } = {};

  exam.questions.forEach((q) => {
    const detail = gradeQuestion(q, answers[q.id]);
    scoreDetails[q.id] = detail;

    totalEarned += detail.earnedPoints;
    totalMax += detail.maxPoints;

    if (detail.isSkipped) {
      skippedCount += 1;
    } else if (detail.isFullyCorrect) {
      correctCount += 1;
    } else if (detail.isPartiallyCorrect) {
      partialCount += 1;
    } else {
      wrongCount += 1;
    }

    const topic = q.topic || 'Tổng hợp';
    if (!topicStats[topic]) {
      topicStats[topic] = { total: 0, earned: 0, maxPoints: 0 };
    }
    topicStats[topic].total += 1;
    topicStats[topic].earned += detail.earnedPoints;
    topicStats[topic].maxPoints += detail.maxPoints;
  });

  const finalEarned = Number(totalEarned.toFixed(2));
  const finalMax = Number(totalMax.toFixed(2)) || (exam.totalPoints || 10.0);
  const scoreOnTenScale = finalMax > 0 ? Number(((finalEarned / finalMax) * 10).toFixed(2)) : 0;
  const percentage = finalMax > 0 ? Math.round((finalEarned / finalMax) * 100) : 0;
  const partBreakdowns = computeExamPartBreakdowns(exam, scoreDetails);

  return {
    id: 'res-' + Date.now(),
    examId: exam.id,
    examTitle: exam.title,
    subject: exam.subject,
    grade: exam.grade,
    earnedPoints: finalEarned,
    totalPoints: finalMax,
    scoreOnTenScale,
    score: scoreOnTenScale,
    percentage,
    correctCount,
    partialCount,
    wrongCount,
    skippedCount,
    totalQuestions: exam.questions.length,
    timeSpentSeconds,
    totalDurationSeconds: exam.durationMinutes * 60,
    completedAt: new Date().toISOString(),
    submissionReason: meta?.submissionReason,
    tabSwitchCount: meta?.tabSwitchCount,
    answers,
    questions: exam.questions,
    scoreDetails,
    topicBreakdown: topicStats,
    ...(partBreakdowns.length > 0 ? { partBreakdowns } : {}),
  };
}

/**
 * Đảo ngẫu nhiên câu hỏi và/hoặc các phương án trả lời
 */
export function shuffleExamQuestionsAndOptions(
  exam: Exam,
  shuffleQuestions: boolean,
  shuffleOptions: boolean
): Exam {
  // Deep clone
  const clonedQuestions: Question[] = JSON.parse(JSON.stringify(exam.questions));

  // 1. Đảo phương án lựa chọn (shuffle options) nếu bật
  if (shuffleOptions) {
    clonedQuestions.forEach((q) => {
      // Đảo phương án cho câu hỏi đơn & nhiều đáp án
      if ((q.type === 'single_choice' || q.type === 'multiple_choice') && q.options && q.options.length > 1) {
        const combined = q.options.map((opt, idx) => ({
          text: opt,
          image: q.optionImages ? q.optionImages[idx] : undefined,
          isCorrect: q.type === 'single_choice' 
            ? q.correctAnswer === idx 
            : (q.correctAnswers || []).includes(idx),
        }));

        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }

        q.options = combined.map((c) => c.text);
        if (q.optionImages) {
          q.optionImages = combined.map((c) => c.image);
        }
        if (q.type === 'multiple_choice') {
          q.correctAnswers = combined
            .map((c, i) => (c.isCorrect ? i : -1))
            .filter((i) => i !== -1);
        } else {
          const newCorrectIdx = combined.findIndex((c) => c.isCorrect);
          if (newCorrectIdx !== -1) {
            q.correctAnswer = newCorrectIdx;
          }
        }
      }

      const shuffleMatchingColumn = (
        items: MatchingItem[] | undefined,
        style: MatchingLabelStyle
      ): MatchingItem[] | undefined => {
        if (!items || items.length <= 1) return items;
        const slotLabels = items.map((item) => item.label);
        const shuffled = [...items];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.map((item, idx) => ({
          ...item,
          label: formatMatchingLabel(idx, style, slotLabels[idx]),
        }));
      };

      // Đảo cả cột trái và cột phải cho câu hỏi ghép đôi (matchingCorrectPairs giữ nguyên vì map theo ID ổn định,
      // đồng thời cập nhật lại nhãn chữ cái/số thứ tự tương ứng theo vị trí mới)
      if (q.type === 'matching') {
        q.matchingLeftItems = shuffleMatchingColumn(
          q.matchingLeftItems,
          q.matchingLeftLabelStyle || 'number'
        );
        q.matchingRightItems = shuffleMatchingColumn(
          q.matchingRightItems,
          q.matchingRightLabelStyle || 'upper_alpha'
        );
      }

      // Nếu là câu hỏi chùm (grouped), cũng đảo options cho các subQuestions
      if (q.type === 'grouped' && q.subQuestions) {
        q.subQuestions.forEach((subQ) => {
          if ((subQ.type === 'single_choice' || subQ.type === 'multiple_choice') && subQ.options && subQ.options.length > 1) {
            const combined = subQ.options.map((opt, idx) => ({
              text: opt,
              image: subQ.optionImages ? subQ.optionImages[idx] : undefined,
              isCorrect: subQ.type === 'single_choice' 
                ? subQ.correctAnswer === idx 
                : (subQ.correctAnswers || []).includes(idx),
            }));

            for (let i = combined.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [combined[i], combined[j]] = [combined[j], combined[i]];
            }

            subQ.options = combined.map((c) => c.text);
            if (subQ.optionImages) {
              subQ.optionImages = combined.map((c) => c.image);
            }
            if (subQ.type === 'multiple_choice') {
              subQ.correctAnswers = combined
                .map((c, i) => (c.isCorrect ? i : -1))
                .filter((i) => i !== -1);
            } else {
              const newCorrectIdx = combined.findIndex((c) => c.isCorrect);
              if (newCorrectIdx !== -1) {
                subQ.correctAnswer = newCorrectIdx;
              }
            }
          }

          if (subQ.type === 'matching') {
            subQ.matchingLeftItems = shuffleMatchingColumn(
              subQ.matchingLeftItems,
              subQ.matchingLeftLabelStyle || 'number'
            );
            subQ.matchingRightItems = shuffleMatchingColumn(
              subQ.matchingRightItems,
              subQ.matchingRightLabelStyle || 'upper_alpha'
            );
          }
        });
      }
    });
  }

  // 2. Gom cụm theo dạng câu hỏi (nếu bật) & Đảo thứ tự câu hỏi
  const groupByType = Boolean(exam.settings?.groupByQuestionType);
  let finalQuestions: Question[] = clonedQuestions;

  const shuffleArray = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  if (groupByType) {
    // Thứ tự cụm cố định; nếu bật shuffleQuestions thì CHỈ tráo đổi câu hỏi bên trong từng cụm
    const typeOrder = normalizeQuestionTypeOrder(exam.settings?.questionTypeOrder);
    const buckets = new Map<QuestionType, Question[]>();
    typeOrder.forEach((t) => buckets.set(t, []));

    clonedQuestions.forEach((q) => {
      const t = q.type || 'single_choice';
      const bucket = buckets.get(t) || [];
      bucket.push(q);
      buckets.set(t, bucket);
    });

    const assembled: Question[] = [];
    typeOrder.forEach((t) => {
      const bucket = buckets.get(t) || [];
      if (bucket.length > 0) {
        const orderedBucket = shuffleQuestions && bucket.length > 1 ? shuffleArray(bucket) : bucket;
        assembled.push(...orderedBucket);
      }
    });
    finalQuestions = assembled;
  } else if (shuffleQuestions && clonedQuestions.length > 1) {
    finalQuestions = shuffleArray(clonedQuestions);
  }

  return {
    ...exam,
    questions: finalQuestions,
  };
}

/**
 * Trả về mảng điểm theo số ý đúng tương ứng (vị trí 0 = đúng 1 ý, vị trí 1 = đúng 2 ý, ...)
 */
export function getTrueFalseTierPoints(question: Question): number[] {
  const count = question.tfItems?.length || 4;
  const maxP = question.points || 1.0;

  if (question.tfScoringMode === 'tiered' && question.tfTierPoints && question.tfTierPoints.length > 0) {
    return question.tfTierPoints;
  }

  if (question.tfScoringMode === 'standard_ministry') {
    if (count === 4) {
      return [
        Number((0.1 * maxP).toFixed(2)),
        Number((0.25 * maxP).toFixed(2)),
        Number((0.5 * maxP).toFixed(2)),
        Number((1.0 * maxP).toFixed(2)),
      ];
    }
    return Array.from({ length: count }, (_, i) => {
      const step = i + 1;
      if (step === 1) return Number((0.1 * maxP).toFixed(2));
      if (step === 2) return Number((0.25 * maxP).toFixed(2));
      if (step === 3) return Number((0.5 * maxP).toFixed(2));
      return Number(((step / count) * maxP).toFixed(2));
    });
  }

  // Chia đều mặc định
  return Array.from({ length: count }, (_, i) => 
    Number((((i + 1) * maxP) / count).toFixed(2))
  );
}

/**
 * Tạo nhãn mô tả quy chế chấm điểm câu Đúng/Sai cho học sinh dễ đọc
 */
export function formatTrueFalseScoringRule(question: Question): string {
  const count = question.tfItems?.length || 4;
  const tiers = getTrueFalseTierPoints(question);

  if (question.tfScoringMode === 'tiered') {
    const parts = tiers.slice(0, count).map((p, idx) => `Đúng ${idx + 1} ý: ${p}đ`);
    return `Chấm theo bậc số ý đúng: ${parts.join(' | ')}`;
  }

  if (question.tfScoringMode === 'standard_ministry') {
    const parts = tiers.slice(0, count).map((p, idx) => `Đúng ${idx + 1} ý: ${p}đ`);
    return `Chuẩn Bộ GD&ĐT 2025: ${parts.join(' | ')}`;
  }

  if (question.tfScoringMode === 'custom_item_points') {
    return 'Chấm theo điểm riêng từng ý mệnh đề.';
  }

  const perItem = (question.points || 1.0) / count;
  return `Chia đều điểm câu (${perItem.toFixed(2)}đ / ý).`;
}

