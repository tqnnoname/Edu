import { MatchingItem, MatchingLabelStyle } from '../types/exam';

function toRoman(num: number): string {
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

function toAlpha(index: number, uppercase: boolean): string {
  // 0 -> A, 25 -> Z, 26 -> AA...
  let n = index;
  let result = '';
  do {
    result = String.fromCharCode((uppercase ? 65 : 97) + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/**
 * Formats the display label of a matching item at `index` given the column's labeling style.
 */
export function formatMatchingLabel(
  index: number,
  style: MatchingLabelStyle = 'number',
  customLabel?: string
): string {
  if (style === 'custom') {
    const trimmed = (customLabel || '').trim();
    return trimmed || String(index + 1);
  }
  if (style === 'upper_alpha') return toAlpha(index, true);
  if (style === 'lower_alpha') return toAlpha(index, false);
  if (style === 'roman') return toRoman(index + 1);
  return String(index + 1);
}

export const MATCHING_LABEL_STYLE_OPTIONS: {
  value: MatchingLabelStyle;
  label: string;
  example: string;
}[] = [
  { value: 'number', label: 'Số (1, 2, 3...)', example: '1, 2, 3' },
  { value: 'upper_alpha', label: 'Chữ hoa (A, B, C...)', example: 'A, B, C' },
  { value: 'lower_alpha', label: 'Chữ thường (a, b, c...)', example: 'a, b, c' },
  { value: 'roman', label: 'Số La Mã (I, II, III...)', example: 'I, II, III' },
  { value: 'custom', label: 'Tự nhập nhãn từng ý', example: 'Tùy chỉnh' },
];

export const MATCHING_LABEL_PRESETS: {
  id: string;
  label: string;
  left: MatchingLabelStyle;
  right: MatchingLabelStyle;
}[] = [
  { id: '1_A', label: '1 - A (Số & Chữ hoa)', left: 'number', right: 'upper_alpha' },
  { id: 'a_1', label: 'a - 1 (Chữ thường & Số)', left: 'lower_alpha', right: 'number' },
  { id: 'A_1', label: 'A - 1 (Chữ hoa & Số)', left: 'upper_alpha', right: 'number' },
  { id: '1_a', label: '1 - a (Số & Chữ thường)', left: 'number', right: 'lower_alpha' },
  { id: 'I_A', label: 'I - A (La Mã & Chữ hoa)', left: 'roman', right: 'upper_alpha' },
];

/**
 * Finds the matching right-column item given user text input (case-insensitive, trimmed).
 */
export function resolveRightItemByInputLabel(
  rawInput: string,
  rightItems: MatchingItem[],
  rightStyle: MatchingLabelStyle = 'upper_alpha'
): MatchingItem | undefined {
  const normalized = rawInput.trim().toLowerCase();
  if (!normalized) return undefined;

  return rightItems.find((item, idx) => {
    const label = formatMatchingLabel(idx, rightStyle, item.label).trim().toLowerCase();
    return label === normalized;
  });
}

/**
 * Gets the display label for a stored answer value (either a rightItem.id or `__raw__:...`).
 */
export function getDisplayedLabelForAnswerValue(
  answerValue: string | undefined,
  rightItems: MatchingItem[],
  rightStyle: MatchingLabelStyle = 'upper_alpha'
): string {
  if (!answerValue) return '';
  if (answerValue.startsWith('__raw__:')) {
    return answerValue.slice('__raw__:'.length);
  }
  const idx = rightItems.findIndex((item) => item.id === answerValue);
  if (idx === -1) return '';
  return formatMatchingLabel(idx, rightStyle, rightItems[idx].label);
}

/**
 * Creates starter matching data (3 left items, 4 right items so right >= left with 1 distractor).
 */
export function createDefaultMatchingData(prefix: string): {
  matchingLeftLabelStyle: MatchingLabelStyle;
  matchingRightLabelStyle: MatchingLabelStyle;
  matchingLeftItems: MatchingItem[];
  matchingRightItems: MatchingItem[];
  matchingCorrectPairs: { [leftId: string]: string };
} {
  const l1 = `${prefix}_L1`;
  const l2 = `${prefix}_L2`;
  const l3 = `${prefix}_L3`;
  const r1 = `${prefix}_R1`;
  const r2 = `${prefix}_R2`;
  const r3 = `${prefix}_R3`;
  const r4 = `${prefix}_R4`;

  return {
    matchingLeftLabelStyle: 'number',
    matchingRightLabelStyle: 'upper_alpha',
    matchingLeftItems: [
      { id: l1, content: '' },
      { id: l2, content: '' },
      { id: l3, content: '' },
    ],
    matchingRightItems: [
      { id: r1, content: '' },
      { id: r2, content: '' },
      { id: r3, content: '' },
      { id: r4, content: '' },
    ],
    matchingCorrectPairs: {
      [l1]: r1,
      [l2]: r2,
      [l3]: r3,
    },
  };
}
