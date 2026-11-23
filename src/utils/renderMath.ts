import renderMathInElement from 'katex/contrib/auto-render';

/**
 * Extracts a balanced `{...}` group starting at `openBraceIdx` (where `str[openBraceIdx] === '{'`).
 * Returns the end index (inclusive of closing `}`) or -1 if unbalanced.
 */
export function findMatchingBrace(str: string, openBraceIdx: number): number {
  if (str[openBraceIdx] !== '{') return -1;
  let depth = 0;
  for (let i = openBraceIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Extracts a balanced `(...)` group starting at `openParenIdx` (where `str[openParenIdx] === '('`).
 */
export function findMatchingParen(str: string, openParenIdx: number): number {
  if (str[openParenIdx] !== '(') return -1;
  let depth = 0;
  for (let i = openParenIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Replaces calls like `prefix(...)` with balanced parentheses, allowing nested `(...)` inside.
 */
export function replaceBalancedParenPattern(
  text: string,
  prefixes: string[],
  transform: (prefix: string, inner: string) => string
): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    if (text.startsWith('___BLOCKMATH_', i) || text.startsWith('___INLINEMATH_', i)) {
      const endPlaceholder = text.indexOf('___', i + 3);
      if (endPlaceholder !== -1) {
        const end = endPlaceholder + 3;
        result += text.slice(i, end);
        i = end;
        continue;
      }
    }

    let matched = false;
    for (const prefix of prefixes) {
      if (text.startsWith(prefix, i)) {
        if (/^[a-zA-Z]/.test(prefix) && i > 0 && /[\\a-zA-Z0-9_]/.test(text[i - 1])) {
          continue;
        }
        let cursor = i + prefix.length;
        while (cursor < text.length && text[cursor] === ' ') cursor++;
        if (text[cursor] === '(') {
          const closeParen = findMatchingParen(text, cursor);
          if (closeParen !== -1) {
            const inner = text.slice(cursor + 1, closeParen);
            result += transform(prefix, inner);
            i = closeParen + 1;
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) {
      result += text[i];
      i++;
    }
  }

  return result;
}

/**
 * Upgrades `\vec{AB}` / `\vec{Ox}` (2+ characters) into `\overrightarrow{...}` so
 * the right-pointing arrow stretches smoothly across multi-character vector names,
 * while keeping single-character `\vec{u}` as a crisp right arrow above the letter.
 */
export function normalizeVectorAndRootLatex(latex: string): string {
  let clean = latex.trim();
  clean = clean.replace(/\\vec\{([a-zA-Z0-9']{2,})\}/g, '\\overrightarrow{$1}');
  // Recover \sqrt if JS previously stripped the backslash from \s
  clean = clean.replace(/(^|[^\\a-zA-Z])sqrt(?=\s*[\[{])/g, '$1\\sqrt');
  clean = replaceBalancedParenPattern(clean, ['sqrt'], (_, inner) => `\\sqrt{${inner}}`);
  return clean;
}

/**
 * Wraps raw LaTeX commands outside math delimiters (such as `\sqrt{...}`, `\sqrt[n]{...}`,
 * `\frac{...}{...}`, `\overrightarrow{...}`, `\vec{...}`) in `$...$` while properly handling
 * arbitrarily nested `{...}` braces like `\sqrt{\frac{1}{x^2+1}}`.
 */
export function wrapUnwrappedLatexCommands(text: string): string {
  const commands = [
    { name: '\\sqrt', allowOptionalBracket: true, braceArgs: 1 },
    { name: '\\frac', allowOptionalBracket: false, braceArgs: 2 },
    { name: '\\overrightarrow', allowOptionalBracket: false, braceArgs: 1 },
    { name: '\\vec', allowOptionalBracket: false, braceArgs: 1 },
  ];

  let result = '';
  let i = 0;

  while (i < text.length) {
    if (text.startsWith('___BLOCKMATH_', i) || text.startsWith('___INLINEMATH_', i)) {
      const endPlaceholder = text.indexOf('___', i + 3);
      if (endPlaceholder !== -1) {
        const end = endPlaceholder + 3;
        result += text.slice(i, end);
        i = end;
        continue;
      }
    }

    let matched = false;
    for (const cmd of commands) {
      if (text.startsWith(cmd.name, i)) {
        let cursor = i + cmd.name.length;

        const nextChar = text[cursor];
        if (nextChar && /[a-zA-Z]/.test(nextChar)) {
          continue;
        }

        while (cursor < text.length && text[cursor] === ' ') cursor++;

        if (cmd.allowOptionalBracket && text[cursor] === '[') {
          const closeBracket = text.indexOf(']', cursor + 1);
          if (closeBracket === -1) continue;
          cursor = closeBracket + 1;
          while (cursor < text.length && text[cursor] === ' ') cursor++;
        }

        let validArgs = true;
        for (let arg = 0; arg < cmd.braceArgs; arg++) {
          while (cursor < text.length && text[cursor] === ' ') cursor++;
          if (text[cursor] !== '{') {
            validArgs = false;
            break;
          }
          const closeBrace = findMatchingBrace(text, cursor);
          if (closeBrace === -1) {
            validArgs = false;
            break;
          }
          cursor = closeBrace + 1;
        }

        if (validArgs) {
          let rawExpr = text.slice(i, cursor);
          if (cmd.name === '\\vec') {
            rawExpr = rawExpr.replace(/^\\vec\{([a-zA-Z0-9']{2,})\}$/, '\\overrightarrow{$1}');
          }
          result += `$${rawExpr}$`;
          i = cursor;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      result += text[i];
      i++;
    }
  }

  return result;
}

/**
 * Normalizes math expressions in raw text (roots, vectors, \[...\], \(...\)) into
 * standard `$$...$$` and `$...$` delimiters for KaTeX auto-render.
 */
export function normalizeMathSyntax(raw: string): string {
  let text = raw;

  // 1. Protect existing block math $$...$$ and \[...\]
  const blockMathHolders: string[] = [];
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const key = `___BLOCKMATH_${blockMathHolders.length}___`;
    blockMathHolders.push(normalizeVectorAndRootLatex(math));
    return key;
  });
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    const key = `___BLOCKMATH_${blockMathHolders.length}___`;
    blockMathHolders.push(normalizeVectorAndRootLatex(math));
    return key;
  });

  // 2. Protect existing inline math $...$ and \(...\)
  const inlineMathHolders: string[] = [];
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
    const key = `___INLINEMATH_${inlineMathHolders.length}___`;
    inlineMathHolders.push(normalizeVectorAndRootLatex(math));
    return key;
  });
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    const key = `___INLINEMATH_${inlineMathHolders.length}___`;
    inlineMathHolders.push(normalizeVectorAndRootLatex(math));
    return key;
  });

  // 3. Process raw LaTeX & plain-text roots / vectors outside math delimiters
  text = text.replace(/(^|[^\\a-zA-Z])sqrt(?=\s*[\[{])/g, '$1\\sqrt');
  text = wrapUnwrappedLatexCommands(text);

  // Balanced parenthesis conversions for sqrt(...), √(...), ∛(...)
  text = replaceBalancedParenPattern(text, ['sqrt', '√'], (_, inner) => `$\\sqrt{${inner}}$`);
  text = replaceBalancedParenPattern(text, ['∛'], (_, inner) => `$\\sqrt[3]{${inner}}$`);

  // Unicode roots with braces or single token
  text = text.replace(/√\{([^\}]+)\}/g, '$\\sqrt{$1}$');
  text = text.replace(/√\s*([a-zA-Z0-9]+)/g, '$\\sqrt{$1}$');
  text = text.replace(/∛\{([^\}]+)\}/g, '$\\sqrt[3]{$1}$');
  text = text.replace(/∛\s*([a-zA-Z0-9]+)/g, '$\\sqrt[3]{$1}$');

  // Unicode combining right arrow above letter(s): e.g. u⃗ -> $\vec{u}$, AB⃗ -> $\overrightarrow{AB}$
  text = text.replace(/([a-zA-Z0-9']{2,})\u20d7/g, '$\\overrightarrow{$1}$');
  text = text.replace(/([a-zA-Z0-9])\u20d7/g, '$\\vec{$1}$');

  // Plain text vector notations: vecto(...) / vec(...) / vecto AB / vecto u
  text = replaceBalancedParenPattern(text, ['vecto', 'vec'], (_, inner) => {
    const trimmed = inner.trim();
    return trimmed.length >= 2 ? `$\\overrightarrow{${trimmed}}$` : `$\\vec{${trimmed}}$`;
  });
  text = text.replace(/\bvecto\s+([a-zA-Z0-9']{2,})\b/g, '$\\overrightarrow{$1}$');
  text = text.replace(/\bvecto\s+([a-zA-Z0-9])\b/g, '$\\vec{$1}$');

  // 4. Restore inline and block math holders
  text = text.replace(/___INLINEMATH_(\d+)___/g, (_, idx) => `$${inlineMathHolders[Number(idx)]}$`);
  text = text.replace(/___BLOCKMATH_(\d+)___/g, (_, idx) => `$$${blockMathHolders[Number(idx)]}$$`);

  return text;
}

/**
 * Hàm helper chuyên dụng cho việc render toán học bằng KaTeX trên DOM element.
 * Sử dụng renderMathInElement với trust: true và output: 'htmlAndMathml'
 * để đảm bảo dấu căn (\sqrt) và ký hiệu toán học được vẽ lại đầy đủ khi DOM thay đổi.
 */
export function renderMath(element: HTMLElement | null | undefined): void {
  if (!element) return;
  try {
    renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
      ignoredClasses: ['katex', 'katex-html', 'katex-mathml'],
      throwOnError: false,
      trust: true,
      output: 'htmlAndMathml',
    });
  } catch (err) {
    console.warn('KaTeX renderMath error:', err);
  }
}
