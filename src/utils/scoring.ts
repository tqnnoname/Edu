import { 
  CandidateAnswerValue, 
  Exam, 
  ExamResult, 
  Question, 
  QuestionScoreDetail 
} from '../types/exam';

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
    const isCorrect = userAnswer === question.correctAnswer;
    return {
      questionId: question.id,
      earnedPoints: isCorrect ? maxPoints : 0,
      maxPoints,
      isFullyCorrect: isCorrect,
      isPartiallyCorrect: false,
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

    // Tính điểm mặc định nếu ý không có điểm riêng: chia đều điểm câu!
    const defaultItemPoints = maxPoints / items.length;

    let earnedTotal = 0;
    let correctItemsCount = 0;
    const itemScores: { [itemId: string]: { earned: number; max: number; correct: boolean } } = {};

    items.forEach((item) => {
      const itemMax = item.points !== undefined && item.points > 0 ? item.points : defaultItemPoints;
      const userChoice = ansMap[item.id];
      const isCorrect = userChoice !== undefined && userChoice === item.isCorrect;

      const earned = isCorrect ? itemMax : 0;
      earnedTotal += earned;
      if (isCorrect) correctItemsCount += 1;

      itemScores[item.id] = {
        earned,
        max: itemMax,
        correct: isCorrect,
      };
    });

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

  // 4. Dạng Grouped (Câu hỏi chùm)
  if (question.type === 'grouped') {
    const subQs = question.subQuestions || [];
    const subAnsMap = (userAnswer as { [subId: string]: CandidateAnswerValue }) || {};

    let totalSubMax = 0;
    let totalSubEarned = 0;
    let allSubCorrect = true;
    let anySubCorrect = false;
    let allSubSkipped = true;

    subQs.forEach((subQ) => {
      const subRes = gradeQuestion(subQ, subAnsMap[subQ.id]);
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
      if (q.type === 'single_choice' && q.options && q.options.length > 1) {
        const combined = q.options.map((opt, idx) => ({
          text: opt,
          image: q.optionImages ? q.optionImages[idx] : undefined,
          isCorrect: q.correctAnswer === idx,
        }));

        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }

        q.options = combined.map((c) => c.text);
        if (q.optionImages) {
          q.optionImages = combined.map((c) => c.image);
        }
        const newCorrectIdx = combined.findIndex((c) => c.isCorrect);
        if (newCorrectIdx !== -1) {
          q.correctAnswer = newCorrectIdx;
        }
      }

      // Nếu là câu hỏi chùm (grouped), cũng đảo options cho các subQuestions
      if (q.type === 'grouped' && q.subQuestions) {
        q.subQuestions.forEach((subQ) => {
          if (subQ.type === 'single_choice' && subQ.options && subQ.options.length > 1) {
            const combined = subQ.options.map((opt, idx) => ({
              text: opt,
              image: subQ.optionImages ? subQ.optionImages[idx] : undefined,
              isCorrect: subQ.correctAnswer === idx,
            }));

            for (let i = combined.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [combined[i], combined[j]] = [combined[j], combined[i]];
            }

            subQ.options = combined.map((c) => c.text);
            if (subQ.optionImages) {
              subQ.optionImages = combined.map((c) => c.image);
            }
            const newCorrectIdx = combined.findIndex((c) => c.isCorrect);
            if (newCorrectIdx !== -1) {
              subQ.correctAnswer = newCorrectIdx;
            }
          }
        });
      }
    });
  }

  // 2. Đảo thứ tự câu hỏi (shuffle questions) nếu bật
  let finalQuestions = clonedQuestions;
  if (shuffleQuestions && clonedQuestions.length > 1) {
    finalQuestions = [...clonedQuestions];
    for (let i = finalQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
    }
  }

  return {
    ...exam,
    questions: finalQuestions,
  };
}
