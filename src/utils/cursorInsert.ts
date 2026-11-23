import type React from 'react';

export type EditableTextElement = HTMLTextAreaElement | HTMLInputElement;

export function isEditableTextInput(el: Element | null | undefined): el is EditableTextElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly;
  }
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    const textTypes = new Set(['text', 'search', 'url', 'tel', 'email', 'password', '']);
    return textTypes.has(type) && !el.disabled && !el.readOnly;
  }
  return false;
}

/**
 * Chèn chuỗi vào đúng vị trí con trỏ (hoặc vùng đang bôi đen) của input/textarea React controlled,
 * kích hoạt sự kiện input để React state đồng bộ và giữ con trỏ ngay sau đoạn vừa chèn.
 */
export function insertTextAtEditableElement(
  el: EditableTextElement | null | undefined,
  snippet: string
): boolean {
  if (!isEditableTextInput(el)) return false;

  const currentVal = el.value ?? '';
  const hasSelection = typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number';
  const start = hasSelection ? (el.selectionStart as number) : currentVal.length;
  const end = hasSelection ? (el.selectionEnd as number) : start;

  const isBlock = snippet.trim().startsWith('|') || snippet.includes('\n');
  let insertStr = snippet;
  if (isBlock) {
    const trimmed = snippet.trim();
    const needLeadingNl = start > 0 && currentVal[start - 1] !== '\n';
    const needTrailingNl = end < currentVal.length && currentVal[end] !== '\n';
    insertStr = `${needLeadingNl ? '\n' : ''}${trimmed}${needTrailingNl ? '\n' : ''}`;
  }

  const nextValue = currentVal.slice(0, start) + insertStr + currentVal.slice(end);
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

  if (!nativeSetter) return false;

  nativeSetter.call(el, nextValue);
  el.dispatchEvent(new Event('input', { bubbles: true }));

  const nextCaret = start + insertStr.length;
  requestAnimationFrame(() => {
    try {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    } catch {
      // Ignore selection errors on unsupported elements
    }
  });

  return true;
}

/**
 * Bọc đoạn văn bản đang bôi đen bằng cặp thẻ/ký hiệu (ví dụ **...**, *...*, <u>...</u>, <span style="color:...">...</span>),
 * hoặc chèn mẫu tại vị trí con trỏ nếu chưa bôi đen. Tự động gỡ bỏ nếu đoạn chọn đã được bọc sẵn cặp thẻ giống hệt.
 */
export function wrapSelectionAtEditableElement(
  el: EditableTextElement | null | undefined,
  prefix: string,
  suffix: string,
  placeholderText = 'văn bản'
): boolean {
  if (!isEditableTextInput(el)) return false;

  const currentVal = el.value ?? '';
  const hasSelection = typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number';
  const start = hasSelection ? (el.selectionStart as number) : currentVal.length;
  const end = hasSelection ? (el.selectionEnd as number) : start;
  const selected = currentVal.slice(start, end);

  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!nativeSetter) return false;

  let nextValue: string;
  let nextSelStart: number;
  let nextSelEnd: number;

  if (selected.length > 0) {
    // Nếu vùng chọn bên trong đã chứa sẵn cặp prefix/suffix -> gỡ bỏ
    if (
      selected.startsWith(prefix) &&
      selected.endsWith(suffix) &&
      selected.length > prefix.length + suffix.length
    ) {
      const inner = selected.slice(prefix.length, selected.length - suffix.length);
      nextValue = currentVal.slice(0, start) + inner + currentVal.slice(end);
      nextSelStart = start;
      nextSelEnd = start + inner.length;
    } else if (
      start >= prefix.length &&
      currentVal.slice(start - prefix.length, start) === prefix &&
      currentVal.slice(end, end + suffix.length) === suffix
    ) {
      // Nếu bên ngoài vùng chọn đã bọc sẵn cặp prefix/suffix -> gỡ bỏ
      nextValue =
        currentVal.slice(0, start - prefix.length) +
        selected +
        currentVal.slice(end + suffix.length);
      nextSelStart = start - prefix.length;
      nextSelEnd = nextSelStart + selected.length;
    } else {
      nextValue = currentVal.slice(0, start) + prefix + selected + suffix + currentVal.slice(end);
      nextSelStart = start + prefix.length;
      nextSelEnd = nextSelStart + selected.length;
    }
  } else {
    nextValue =
      currentVal.slice(0, start) + prefix + placeholderText + suffix + currentVal.slice(end);
    nextSelStart = start + prefix.length;
    nextSelEnd = nextSelStart + placeholderText.length;
  }

  nativeSetter.call(el, nextValue);
  el.dispatchEvent(new Event('input', { bubbles: true }));

  requestAnimationFrame(() => {
    try {
      el.focus();
      el.setSelectionRange(nextSelStart, nextSelEnd);
    } catch {
      // Ignore selection errors on unsupported elements
    }
  });

  return true;
}

/**
 * Thêm hoặc bỏ tiền tố đầu dòng (danh sách `- `, tiêu đề `### `) trên các dòng đang chọn.
 */
export function applyLinePrefixAtEditableElement(
  el: EditableTextElement | null | undefined,
  linePrefix: string
): boolean {
  if (!isEditableTextInput(el)) return false;

  const currentVal = el.value ?? '';
  const hasSelection = typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number';
  const start = hasSelection ? (el.selectionStart as number) : currentVal.length;
  const end = hasSelection ? (el.selectionEnd as number) : start;

  const lineStart = currentVal.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndRaw = currentVal.indexOf('\n', end);
  const lineEnd = lineEndRaw === -1 ? currentVal.length : lineEndRaw;

  const segment = currentVal.slice(lineStart, lineEnd);
  const lines = segment.split('\n');
  const allHavePrefix = lines.every((l) => l.startsWith(linePrefix));

  const transformedLines = lines.map((l) => {
    if (allHavePrefix) return l.slice(linePrefix.length);
    return l.startsWith(linePrefix) ? l : `${linePrefix}${l}`;
  });
  const replaced = transformedLines.join('\n');

  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!nativeSetter) return false;

  const nextValue = currentVal.slice(0, lineStart) + replaced + currentVal.slice(lineEnd);
  nativeSetter.call(el, nextValue);
  el.dispatchEvent(new Event('input', { bubbles: true }));

  const nextEnd = lineStart + replaced.length;
  requestAnimationFrame(() => {
    try {
      el.focus();
      el.setSelectionRange(lineStart, nextEnd);
    } catch {
      // Ignore selection errors
    }
  });

  return true;
}

/**
 * Gỡ bỏ định dạng văn bản (đậm, nghiêng, gạch chân, màu chữ, tô nền...) trong vùng chọn.
 */
export function stripFormattingAtEditableElement(
  el: EditableTextElement | null | undefined
): boolean {
  if (!isEditableTextInput(el)) return false;

  const currentVal = el.value ?? '';
  const hasSelection = typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number';
  const start = hasSelection ? (el.selectionStart as number) : 0;
  const end = hasSelection ? (el.selectionEnd as number) : currentVal.length;
  if (end <= start) return false;

  const selected = currentVal.slice(start, end);
  const cleaned = selected
    .replace(/<\/?(?:u|b|strong|i|em|s|del|strike|mark|span|div)(?:\s+[^>]*)?>/gi, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1$2$3')
    .replace(/^#{1,4}\s+/gm, '');

  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!nativeSetter) return false;

  const nextValue = currentVal.slice(0, start) + cleaned + currentVal.slice(end);
  nativeSetter.call(el, nextValue);
  el.dispatchEvent(new Event('input', { bubbles: true }));

  const nextEnd = start + cleaned.length;
  requestAnimationFrame(() => {
    try {
      el.focus();
      el.setSelectionRange(start, nextEnd);
    } catch {
      // Ignore selection errors
    }
  });

  return true;
}

/**
 * Tìm phần tử nhập văn bản phù hợp trong phạm vi containerRef (hoặc targetRef),
 * ưu tiên phần tử đang focus (document.activeElement) hoặc phần tử được focus gần nhất trong container.
 */
export function resolveTargetEditableElement(options: {
  targetRef?: React.RefObject<EditableTextElement | null>;
  containerRef?: React.RefObject<HTMLElement | null>;
  getContainerEl?: () => HTMLElement | null;
  lastFocusedRef?: React.MutableRefObject<EditableTextElement | null>;
  ignoreContainer?: HTMLElement | null;
}): EditableTextElement | null {
  const { targetRef, containerRef, getContainerEl, lastFocusedRef, ignoreContainer } = options;
  const scopedContainer = getContainerEl ? getContainerEl() : containerRef?.current || null;
  const active = typeof document !== 'undefined' ? document.activeElement : null;

  if (
    isEditableTextInput(active) &&
    (!ignoreContainer || !ignoreContainer.contains(active))
  ) {
    if (scopedContainer) {
      if (scopedContainer.contains(active)) {
        return active;
      }
    } else if (targetRef?.current) {
      if (targetRef.current === active) {
        return active;
      }
    } else {
      return active;
    }
  }

  if (lastFocusedRef?.current && isEditableTextInput(lastFocusedRef.current)) {
    const candidate = lastFocusedRef.current;
    if (
      candidate.isConnected &&
      (!ignoreContainer || !ignoreContainer.contains(candidate)) &&
      (!scopedContainer || scopedContainer.contains(candidate))
    ) {
      return candidate;
    }
  }

  if (targetRef?.current && isEditableTextInput(targetRef.current)) {
    return targetRef.current;
  }

  return null;
}
