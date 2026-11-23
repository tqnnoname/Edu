import { Question } from '../types/exam';

/**
 * Copy plain/formatted text to system clipboard while preserving all line breaks,
 * LaTeX formulas ($...$, $$...$$), Markdown syntax, and UTF-8 Vietnamese text.
 * Includes a reliable off-screen textarea fallback for sandboxed iframes.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  // Try modern Clipboard API first
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below when iframe Permissions-Policy blocks navigator.clipboard
    }
  }

  // Fallback via temporary textarea (preserves \n newlines & special symbols)
  try {
    const activeEl = document.activeElement as HTMLElement | null;
    const selection = window.getSelection();
    const savedRanges: Range[] = [];
    if (selection) {
      for (let i = 0; i < selection.rangeCount; i++) {
        savedRanges.push(selection.getRangeAt(i).cloneRange());
      }
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    ta.style.whiteSpace = 'pre';
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, text.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);

    // Restore prior selection / focus if applicable
    if (selection) {
      selection.removeAllRanges();
      savedRanges.forEach((r) => selection.addRange(r));
    }
    if (activeEl && typeof activeEl.focus === 'function' && activeEl !== document.body) {
      activeEl.focus({ preventScroll: true });
    }

    return Boolean(ok);
  } catch {
    return false;
  }
}

/**
 * Format a full Question object (prompt, options/statements, answers, explanation)
 * into clean multi-line text with LaTeX preserved for copying.
 */
export function formatQuestionForCopy(q: Question, questionNumber?: number): string {
  const lines: string[] = [];
  const header = questionNumber !== undefined ? `Câu ${questionNumber}: ` : '';
  lines.push(`${header}${q.question || ''}`.trimEnd());

  if (q.imageUrl) {
    lines.push(`[Ảnh minh họa]: ${q.imageUrl}`);
  }

  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    (q.options || []).forEach((opt, idx) => {
      const letter = String.fromCharCode(65 + idx);
      lines.push(`${letter}. ${opt}`);
    });
    if (q.type === 'single_choice' && typeof q.correctAnswer === 'number') {
      lines.push(`Đáp án: ${String.fromCharCode(65 + q.correctAnswer)}`);
    } else if (q.type === 'multiple_choice' && Array.isArray(q.correctAnswers)) {
      lines.push(
        `Đáp án: ${q.correctAnswers.map((i) => String.fromCharCode(65 + i)).join(', ')}`
      );
    }
  } else if (q.type === 'true_false' && q.tfItems) {
    q.tfItems.forEach((it, idx) => {
      const letter = String.fromCharCode(97 + idx);
      lines.push(`${letter}) ${it.statement} [${it.isCorrect ? 'Đúng' : 'Sai'}]`);
    });
  } else if (q.type === 'text_input' && q.acceptedAnswers) {
    lines.push(`Đáp án: ${q.acceptedAnswers.join('; ')}`);
  } else if (q.type === 'essay' && q.sampleAnswer) {
    lines.push(`Đáp án tham khảo:\n${q.sampleAnswer}`);
  } else if (q.type === 'matching' && q.matchingLeftItems && q.matchingRightItems) {
    lines.push('Cột trái:');
    q.matchingLeftItems.forEach((l, i) => lines.push(`  ${i + 1}. ${l.content}`));
    lines.push('Cột phải:');
    q.matchingRightItems.forEach((r, i) =>
      lines.push(`  ${String.fromCharCode(65 + i)}. ${r.content}`)
    );
  } else if (q.type === 'grouped' && q.subQuestions) {
    q.subQuestions.forEach((sub, sIdx) => {
      lines.push('');
      lines.push(
        formatQuestionForCopy(
          sub,
          questionNumber !== undefined ? Number(`${questionNumber}.${sIdx + 1}`) : sIdx + 1
        )
      );
    });
  }

  if (q.explanation && q.explanation.trim()) {
    lines.push(`Lời giải: ${q.explanation}`);
  }

  return lines.join('\n');
}
