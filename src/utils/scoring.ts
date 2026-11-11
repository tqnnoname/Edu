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

