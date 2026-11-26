import mammoth from 'mammoth';
import type { Exam, MicroCourse, MountainQuestionItem, Question } from '../types/exam';
import { collectUsedInlineImages } from './inlineImages';

export function extractSingleChoiceFromExam(exam: Exam): MountainQuestionItem[] {
  const list: MountainQuestionItem[] = [];

  const pushQuestion = (q: Question, idxLabel: string) => {
    if (
      q.type === 'single_choice' &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      typeof q.correctAnswer === 'number' &&
      q.correctAnswer >= 0 &&
      q.correctAnswer < q.options.length
    ) {
      const slicedOptions = q.options.slice(0, 6);
      const inlineImages = collectUsedInlineImages(
        [q.question, ...slicedOptions, q.explanation],
        q.inlineImages
      );
      list.push({
        id: `${exam.id}_${q.id || idxLabel}`,
        question: q.question,
        imageUrl: q.imageUrl,
        options: slicedOptions,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || '',
        ...(q.explanationImageUrl ? { explanationImageUrl: q.explanationImageUrl } : {}),
        ...(inlineImages ? { inlineImages } : {}),
        sourceTitle: exam.title,
      });
    } else if (q.type === 'grouped' && Array.isArray(q.subQuestions)) {
      q.subQuestions.forEach((sub, sIdx) => {
        if (
          sub.type === 'single_choice' &&
          Array.isArray(sub.options) &&
          sub.options.length >= 2 &&
          typeof sub.correctAnswer === 'number' &&
          sub.correctAnswer >= 0 &&
          sub.correctAnswer < sub.options.length
        ) {
          const combinedQuestion = q.question ? `${q.question}\n\n${sub.question}` : sub.question;
          const slicedOptions = sub.options.slice(0, 6);
          const mergedMap = { ...(q.inlineImages || {}), ...(sub.inlineImages || {}) };
          const inlineImages = collectUsedInlineImages(
            [combinedQuestion, ...slicedOptions, sub.explanation],
            mergedMap
          );
          list.push({
            id: `${exam.id}_${q.id}_${sub.id || sIdx}`,
            question: combinedQuestion,
            imageUrl: sub.imageUrl || q.imageUrl,
            options: slicedOptions,
            correctAnswer: sub.correctAnswer,
            explanation: sub.explanation || '',
            ...(sub.explanationImageUrl ? { explanationImageUrl: sub.explanationImageUrl } : {}),
            ...(inlineImages ? { inlineImages } : {}),
            sourceTitle: exam.title,
          });
        }
      });
    }
  };

  (exam.questions || []).forEach((q, idx) => pushQuestion(q, String(idx + 1)));
  return list;
}

export function extractSingleChoiceFromCourse(
  course: MicroCourse,
  allExams: Exam[]
): MountainQuestionItem[] {
  const list: MountainQuestionItem[] = [];
  const seenIds = new Set<string>();

  const processLesson = (lesson: MicroCourse['lessons'][number], lKey: string) => {
    (lesson.blocks || []).forEach((block, bIdx) => {
      if (block.type === 'question' && block.question) {
        const q = block.question;
        if (
          q.type === 'single_choice' &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          typeof q.correctAnswer === 'number' &&
          q.correctAnswer >= 0 &&
          q.correctAnswer < q.options.length
        ) {
          const itemId = `${course.id}_${lesson.id || lKey}_${q.id || bIdx}`;
          if (!seenIds.has(itemId)) {
            seenIds.add(itemId);
            const slicedOptions = q.options.slice(0, 6);
            const mergedMap = { ...(block.inlineImages || {}), ...(q.inlineImages || {}) };
            const inlineImages = collectUsedInlineImages(
              [q.question, ...slicedOptions, q.explanation],
              mergedMap
            );
            list.push({
              id: itemId,
              question: q.question,
              imageUrl: q.imageUrl || block.imageUrl,
              options: slicedOptions,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation || '',
              ...(q.explanationImageUrl ? { explanationImageUrl: q.explanationImageUrl } : {}),
              ...(inlineImages ? { inlineImages } : {}),
              sourceTitle: `${course.title} • ${lesson.title}`,
            });
          }
        }
      }
      if (block.type === 'practice_link' && block.practiceExamId) {
        const linked = allExams.find((e) => e.id === block.practiceExamId);
        if (linked) {
          for (const item of extractSingleChoiceFromExam(linked)) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              list.push(item);
            }
          }
        }
      }
    });

    if (lesson.practiceExamId) {
      const linked = allExams.find((e) => e.id === lesson.practiceExamId);
      if (linked) {
        for (const item of extractSingleChoiceFromExam(linked)) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            list.push(item);
          }
        }
      }
    }
  };

  (course.lessons || []).forEach((lesson, lIdx) => processLesson(lesson, `l_${lIdx}`));

  (course.chapters || []).forEach((chapter, cIdx) => {
    (chapter.lessons || []).forEach((lesson, lIdx) =>
      processLesson(lesson, `c_${cIdx}_${lIdx}`)
    );
    if (chapter.chapterExamId) {
      const chExam = allExams.find((e) => e.id === chapter.chapterExamId);
      if (chExam) {
        for (const item of extractSingleChoiceFromExam(chExam)) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            list.push(item);
          }
        }
      }
    }
  });

  if (course.finalExamId) {
    const finalExam = allExams.find((e) => e.id === course.finalExamId);
    if (finalExam) {
      for (const item of extractSingleChoiceFromExam(finalExam)) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          list.push(item);
        }
      }
    }
  }

  return list;
}

/**
 * Parses pasted quiz text or extracted document text into single-choice MountainQuestionItem[].
 * Supports KaTeX math ($...$ / $$...$$), Câu N: ..., A. / B. / C. / D., and Đáp án: A (or *A. prefix).
 */
export function parseQuizDocumentText(rawText: string, sourceTitle = 'Tài liệu tải lên'): MountainQuestionItem[] {
  const normalized = String(rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const results: MountainQuestionItem[] = [];

  let currentQuestionLines: string[] = [];
  let currentOptions: { letter: string; text: string; starred: boolean }[] = [];
  let currentAnswerIdx: number | null = null;
  let currentExplanationLines: string[] = [];
  let inExplanation = false;

  const flushCurrent = () => {
    const qText = currentQuestionLines.join('\n').trim();
    if (qText && currentOptions.length >= 2) {
      let resolvedAnswer = currentAnswerIdx;
      if (resolvedAnswer === null) {
        const starredIdx = currentOptions.findIndex((o) => o.starred);
        resolvedAnswer = starredIdx >= 0 ? starredIdx : 0;
      }
      if (resolvedAnswer < 0 || resolvedAnswer >= currentOptions.length) {
        resolvedAnswer = 0;
      }
      results.push({
        id: `doc_q_${results.length + 1}`,
        question: qText,
        options: currentOptions.map((o) => o.text),
        correctAnswer: resolvedAnswer,
        explanation: currentExplanationLines.join('\n').trim(),
        sourceTitle,
      });
    }
    currentQuestionLines = [];
    currentOptions = [];
    currentAnswerIdx = null;
    currentExplanationLines = [];
    inExplanation = false;
  };

  const questionStartRe = /^(?:Câu|Bài|Question|Q)\s*\d+\s*[:.)\-]?\s*(.*)$/i;
  const numericStartRe = /^(\d{1,3})\s*[.)]\s+(.+)$/;
  const optionRe = /^(\*?)\s*([A-F])\s*[.):]\s+(.+)$/;
  const answerRe = /^(?:Đáp\s*án|Answer|ĐA|Chọn)\s*[:\-]?\s*([A-F])\b(.*)$/i;
  const explanationRe = /^(?:Giải\s*thích|Hướng\s*dẫn|Lời\s*giải|Explanation)\s*[:\-]?\s*(.*)$/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const qMatch = line.match(questionStartRe);
    if (qMatch) {
      if (currentOptions.length >= 2 || currentQuestionLines.length > 0) {
        flushCurrent();
      }
      const rest = (qMatch[1] || '').trim();
      if (rest) currentQuestionLines.push(rest);
      continue;
    }

    // Inline options on a single line? e.g. "A. 1  B. 2  C. 3  D. 4"
    if (currentQuestionLines.length > 0 && currentOptions.length === 0) {
      const inlineParts = line.split(/(?=(?:^|\s)\*?[A-D]\s*[.):]\s+)/g).map((s) => s.trim()).filter(Boolean);
      if (inlineParts.length >= 2 && inlineParts.every((p) => optionRe.test(p))) {
        for (const p of inlineParts) {
          const m = p.match(optionRe);
          if (m) {
            currentOptions.push({
              letter: m[2].toUpperCase(),
              text: m[3].trim(),
              starred: Boolean(m[1]),
            });
          }
        }
        continue;
      }
    }

    const optMatch = line.match(optionRe);
    if (optMatch && (currentQuestionLines.length > 0 || currentOptions.length > 0)) {
      inExplanation = false;
      currentOptions.push({
        letter: optMatch[2].toUpperCase(),
        text: optMatch[3].trim(),
        starred: Boolean(optMatch[1]),
      });
      continue;
    }

    const ansMatch = line.match(answerRe);
    if (ansMatch && currentOptions.length >= 2) {
      const letter = ansMatch[1].toUpperCase();
      const idx = currentOptions.findIndex((o) => o.letter === letter);
      currentAnswerIdx = idx >= 0 ? idx : Math.max(0, letter.charCodeAt(0) - 65);
      const trailing = (ansMatch[2] || '').trim();
      if (trailing) currentExplanationLines.push(trailing);
      continue;
    }

    const expMatch = line.match(explanationRe);
    if (expMatch && currentOptions.length >= 2) {
      inExplanation = true;
      if (expMatch[1]?.trim()) currentExplanationLines.push(expMatch[1].trim());
      continue;
    }

    if (currentOptions.length === 0) {
      const numMatch = line.match(numericStartRe);
      if (numMatch && currentQuestionLines.length === 0) {
        currentQuestionLines.push(numMatch[2].trim());
      } else if (numMatch && currentOptions.length > 0) {
        flushCurrent();
        currentQuestionLines.push(numMatch[2].trim());
      } else {
        currentQuestionLines.push(line);
      }
    } else if (inExplanation) {
      currentExplanationLines.push(line);
    } else if (currentAnswerIdx === null && currentOptions.length > 0) {
      // Append continuation line to last option
      const last = currentOptions[currentOptions.length - 1];
      last.text = `${last.text} ${line}`;
    } else {
      currentExplanationLines.push(line);
    }
  }

  flushCurrent();
  return results;
}

export async function extractTextFromUploadedDocument(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.docx')) {
    const buffer = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buffer });
    return res.value || '';
  }
  return await file.text();
}

export function buildObstacleQuestionList(
  pool: MountainQuestionItem[],
  requestedCount: number
): MountainQuestionItem[] {
  const cleanPool = pool.filter(
    (q) =>
      q.question &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      typeof q.correctAnswer === 'number'
  );
  if (cleanPool.length === 0) return [];
  const count = Math.max(3, Math.min(30, Math.round(requestedCount)));
  const out: MountainQuestionItem[] = [];
  for (let i = 0; i < count; i++) {
    const base = cleanPool[i % cleanPool.length];
    out.push({
      ...base,
      id: `${base.id}_st${i + 1}`,
      options: [...base.options],
    });
  }
  return out;
}
