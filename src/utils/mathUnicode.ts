import { IRunOptions, TextRun } from 'docx';

// Private-use placeholders used internally during LaTeX-to-Unicode transformation
const LITERAL_LBRACE = '\uE001';
const LITERAL_RBRACE = '\uE002';
const LITERAL_DOLLAR = '\uE003';
const LITERAL_BACKSLASH = '\uE004';
const LITERAL_UNDERSCORE = '\uE005';
const LITERAL_CARET = '\uE006';

const SUP_START = '\uE010';
const SUP_END = '\uE011';
const SUB_START = '\uE012';
const SUB_END = '\uE013';

/**
 * Standard Unicode superscripts widely supported in Times New Roman / Arial / Word.
 */
const UNICODE_SUPERSCRIPT_CORE: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '−': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};

/**
 * Extended Unicode superscripts used only when producing plain-text Unicode strings (outside Word native runs).
 */
const UNICODE_SUPERSCRIPT_EXTENDED: Record<string, string> = {
  ...UNICODE_SUPERSCRIPT_CORE,
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  o: 'ᵒ',
  p: 'ᵖ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
};

/**
 * Standard Unicode subscripts widely supported in Times New Roman / Arial / Word.
 */
const UNICODE_SUBSCRIPT_CORE: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '−': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
};

/**
 * Extended Unicode subscripts used only when producing plain-text Unicode strings.
 */
const UNICODE_SUBSCRIPT_EXTENDED: Record<string, string> = {
  ...UNICODE_SUBSCRIPT_CORE,
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
};

const BLACKBOARD_MAP: Record<string, string> = {
  R: 'ℝ',
  N: 'ℕ',
  Z: 'ℤ',
  Q: 'ℚ',
  C: 'ℂ',
  P: 'ℙ',
  E: '𝔼',
  H: 'ℍ',
  K: '𝕂',
  '1': '𝟙',
};

const LATEX_SYMBOLS: Record<string, string> = {
  // Comparisons & relations
  leqslant: '≤',
  leq: '≤',
  le: '≤',
  geqslant: '≥',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  doteq: '≐',

  // Arrows & logic
  Longleftrightarrow: '⇔',
  Leftrightarrow: '⇔',
  iff: '⇔',
  Longrightarrow: '⇒',
  Rightarrow: '⇒',
  implies: '⇒',
  Longleftarrow: '⇐',
  Leftarrow: '⇐',
  impliedby: '⇐',
  longleftrightarrow: '↔',
  leftrightarrow: '↔',
  longrightarrow: '→',
  rightarrow: '→',
  to: '→',
  longleftarrow: '←',
  leftarrow: '←',
  gets: '←',
  mapsto: '↦',
  longmapsto: '↦',
  uparrow: '↑',
  downarrow: '↓',
  updownarrow: '↕',
  nearrow: '↗',
  searrow: '↘',
  swarrow: '↙',
  nwarrow: '↖',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  land: '∧',
  wedge: '∧',
  lor: '∨',
  vee: '∨',
  lnot: '¬',
  neg: '¬',
  therefore: '∴',
  because: '∵',

  // Sets & operators
  notin: '∉',
  in: '∈',
  ni: '∋',
  subsetneq: '⊊',
  supsetneq: '⊋',
  subseteq: '⊆',
  supseteq: '⊇',
  subset: '⊂',
  supset: '⊃',
  cup: '∪',
  cap: '∩',
  bigcup: '⋃',
  bigcap: '⋂',
  varnothing: '∅',
  emptyset: '∅',
  pm: '±',
  mp: '∓',
  times: '×',
  cdot: '·',
  centerdot: '·',
  div: '÷',
  ast: '∗',
  star: '⋆',
  bullet: '•',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  iiint: '∭',
  iint: '∬',
  oint: '∮',
  int: '∫',
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  ldots: '…',
  cdots: '…',
  dots: '…',
  vdots: '⋮',
  ddots: '⋱',
  prime: '′',
  degree: '°',

  // Geometry & brackets
  angle: '∠',
  measuredangle: '∠',
  sphericalangle: '∠',
  perp: '⊥',
  parallel: '∥',
  triangle: '△',
  bigtriangleup: '△',
  square: '□',
  Box: '□',
  odot: '⊙',
  langle: '⟨',
  rangle: '⟩',
  lfloor: '⌊',
  rfloor: '⌋',
  lceil: '⌈',
  rceil: '⌉',
  Vert: '‖',
  vert: '|',

  // Greek lowercase
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  varepsilon: 'ε',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  varphi: 'φ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',

  // Greek uppercase
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

const FUNCTION_COMMANDS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'log',
  'ln',
  'lg',
  'exp',
  'lim',
  'limsup',
  'liminf',
  'sup',
  'inf',
  'max',
  'min',
  'arg',
  'det',
  'dim',
  'gcd',
  'lcm',
  'deg',
  'hom',
  'ker',
  'Pr',
  'mod',
  'bmod',
]);

function mapAllChars(str: string, map: Record<string, string>): string | null {
  if (!str) return '';
  let out = '';
  for (const ch of str) {
    if (ch === ' ') continue;
    const mapped = map[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

function findMatchingBracePlain(str: string, openBraceIdx: number): number {
  if (str[openBraceIdx] !== '{') return -1;
  let depth = 0;
  for (let i = openBraceIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function readNextArg(str: string, startIdx: number): { value: string; nextIdx: number } | null {
  let cursor = startIdx;
  while (cursor < str.length && (str[cursor] === ' ' || str[cursor] === '\t')) cursor++;
  if (cursor >= str.length) return null;

  if (str[cursor] === '{') {
    const end = findMatchingBracePlain(str, cursor);
    if (end !== -1) {
      return { value: str.slice(cursor + 1, end), nextIdx: end + 1 };
    }
    return { value: str.slice(cursor + 1), nextIdx: str.length };
  }

  // Shorthand single LaTeX symbol e.g. \frac12 or \vec u or ^\infty
  if (str[cursor] === '\\') {
    const cmdMatch = str.slice(cursor).match(/^\\([a-zA-Z]+|.)/);
    if (cmdMatch) {
      return { value: cmdMatch[0], nextIdx: cursor + cmdMatch[0].length };
    }
  }

  return { value: str[cursor], nextIdx: cursor + 1 };
}

function stripScriptMarkers(str: string): string {
  return str
    .replaceAll(SUP_START, '')
    .replaceAll(SUP_END, '')
    .replaceAll(SUB_START, '')
    .replaceAll(SUB_END, '');
}

function hasBalancedOuterParens(s: string): boolean {
  if (!(s.startsWith('(') && s.endsWith(')'))) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0 && i < s.length - 1) return false;
    }
  }
  return depth === 0;
}

function isSimpleRootBody(inner: string): boolean {
  if (!inner) return true;
  if (/^[a-zA-Z0-9π]$/.test(inner)) return true;
  if (/^\d+$/.test(inner)) return true;
  return false;
}

function needsNumeratorParens(num: string): boolean {
  const s = num.trim();
  if (!s) return false;
  if (hasBalancedOuterParens(s) || (s.startsWith('|') && s.endsWith('|') && s.indexOf('|', 1) === s.length - 1)) {
    return false;
  }
  // Check top-level +, binary -, =, <, >, ≤, ≥, /, spaces outside parens
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === LITERAL_LBRACE) depth++;
    else if (ch === ')' || ch === ']' || ch === LITERAL_RBRACE) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (ch === '+' || ch === '=' || ch === '<' || ch === '>' || ch === '≤' || ch === '≥' || ch === '/') {
        return true;
      }
      if ((ch === '-' || ch === '−') && i > 0) {
        return true;
      }
    }
  }
  return false;
}

function needsDenominatorParens(den: string): boolean {
  const s = den.trim();
  if (!s) return false;
  if (hasBalancedOuterParens(s) || (s.startsWith('|') && s.endsWith('|') && s.indexOf('|', 1) === s.length - 1)) {
    return false;
  }
  // Single number, single letter (with optional unicode superscript/subscript), or simple √x / √25
  const cleanS = stripScriptMarkers(s);
  if (/^[a-zA-Z0-9π][⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎′']*$/.test(cleanS)) return false;
  if (/^\d+$/.test(cleanS)) return false;
  if (/^[√∛∜][a-zA-Z0-9π]+$/.test(cleanS)) return false;
  if (/^[√∛∜]\([^)]+\)$/.test(cleanS)) return false;
  return true;
}

function convertScriptsInText(raw: string): string {
  let out = '';
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '^' || ch === '_') {
      const isSup = ch === '^';
      const arg = readNextArg(raw, i + 1);
      if (!arg) {
        out += ch;
        i++;
        continue;
      }

      // Recursively convert any nested superscripts/subscripts inside the exponent/subscript
      const inner = stripScriptMarkers(convertScriptsInText(arg.value)).trim();
      if (!inner) {
        i = arg.nextIdx;
        continue;
      }

      const mapped = mapAllChars(
        inner,
        isSup ? UNICODE_SUPERSCRIPT_CORE : UNICODE_SUBSCRIPT_CORE
      );
      if (mapped !== null) {
        out += mapped;
      } else {
        out += isSup ? `${SUP_START}${inner}${SUP_END}` : `${SUB_START}${inner}${SUB_END}`;
      }
      i = arg.nextIdx;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function convertEnvironments(expr: string, depth: number): string {
  const envRegex = /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g;
  return expr.replace(envRegex, (_match, envName: string, body: string) => {
    let innerBody = body;
    // Strip column alignment spec for \begin{array}{cc}
    if (envName === 'array') {
      const trimmed = innerBody.trimStart();
      if (trimmed.startsWith('{')) {
        const endSpec = findMatchingBracePlain(trimmed, 0);
        if (endSpec !== -1) {
          innerBody = trimmed.slice(endSpec + 1);
        }
      }
    }

    const rawRows = innerBody
      .split(/\\\\/)
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const isMatrix = ['pmatrix', 'bmatrix', 'vmatrix', 'Bmatrix', 'Vmatrix', 'matrix', 'smallmatrix'].includes(envName);
    const convertedRows = rawRows.map((row) => {
      const cells = row
        .split('&')
        .map((c) => convertLatexMathCore(c.trim(), depth + 1))
        .filter((c) => c.length > 0);
      return cells.join(isMatrix ? ', ' : ' ');
    });

    const joined = convertedRows.join(' ; ');
    if (envName === 'cases' || envName === 'Bmatrix') {
      return `${LITERAL_LBRACE} ${joined} ${LITERAL_RBRACE}`;
    }
    if (envName === 'pmatrix') return `(${joined})`;
    if (envName === 'bmatrix') return `[${joined}]`;
    if (envName === 'vmatrix') return `|${joined}|`;
    if (envName === 'Vmatrix') return `‖${joined}‖`;
    return joined;
  });
}

/**
 * Converts a single math expression (without outer `$...$` delimiters) into
 * Unicode text containing internal SUP/SUB markers for non-ASCII script spans.
 */
function convertLatexMathCore(rawExpr: string, depth = 0): string {
  if (!rawExpr) return '';
  if (depth > 12) return rawExpr.replace(/[{}]/g, '');

  let text = rawExpr;

  // 1. Protect escaped literals first so brace matching ignores them cleanly
  text = text
    .replace(/\\left\s*\\\{/g, LITERAL_LBRACE)
    .replace(/\\right\s*\\\}/g, LITERAL_RBRACE)
    .replace(/\\\{/g, LITERAL_LBRACE)
    .replace(/\\\}/g, LITERAL_RBRACE)
    .replace(/\\_/g, LITERAL_UNDERSCORE)
    .replace(/\\%/g, '%')
    .replace(/\\#/g, '#')
    .replace(/\\&/g, '&')
    .replace(/\\setminus\b|\\smallsetminus\b/g, LITERAL_BACKSLASH)
    .replace(/\\textasciicircum\b/g, LITERAL_CARET);

  // 2. Environments (\begin{cases}...\end{cases}, matrices, aligned, etc.)
  text = convertEnvironments(text, depth);

  // 3. Sizing / display directives and delimiter prefixes
  text = text
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits)\b/g, '')
    .replace(/\\(?:left|right)\s*\\\|/g, '‖')
    .replace(/\\(?:left|right)\s*\./g, '')
    .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|bigm|Bigm|big|Big|bigg|Bigg)\s*/g, '');

  // 4. Negated commands before standard symbol substitution
  text = text
    .replace(/\\not\s*\\in\b/g, '∉')
    .replace(/\\not\s*\\subset\b/g, '⊄')
    .replace(/\\not\s*\\equiv\b/g, '≢')
    .replace(/\\not\s*=/g, '≠');

  // 5. Degree notation: ^{\circ}, ^\circ, and \d\circ
  text = text
    .replace(/\^\s*\{\s*\\circ\s*\}/g, '°')
    .replace(/\^\s*\\circ\b/g, '°')
    .replace(/(\d)\s*\\circ\b/g, '$1°');

  // 6. Balanced-brace command walker
  let walked = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '\\') {
      walked += text[i];
      i++;
      continue;
    }

    const cmdMatch = text.slice(i).match(/^\\([a-zA-Z]+|[,;:!\s\\])/);
    if (!cmdMatch) {
      // Stray backslash
      i++;
      continue;
    }

    const fullCmd = cmdMatch[0];
    const cmdName = cmdMatch[1];
    const afterCmd = i + fullCmd.length;

    // Spacing commands & linebreaks
    if (cmdName === ',' || cmdName === ':' || cmdName === ';' || cmdName === ' ') {
      walked += ' ';
      i = afterCmd;
      continue;
    }
    if (cmdName === '!') {
      i = afterCmd;
      continue;
    }
    if (cmdName === '\\') {
      walked += ' ; ';
      i = afterCmd;
      continue;
    }
    if (cmdName === 'quad') {
      walked += '  ';
      i = afterCmd;
      continue;
    }
    if (cmdName === 'qquad') {
      walked += '    ';
      i = afterCmd;
      continue;
    }
    if (cmdName === 'hspace') {
      const arg = readNextArg(text, afterCmd);
      walked += ' ';
      i = arg ? arg.nextIdx : afterCmd;
      continue;
    }
    if (cmdName === 'vspace' || cmdName === 'color') {
      const arg = readNextArg(text, afterCmd);
      i = arg ? arg.nextIdx : afterCmd;
      continue;
    }
    if (cmdName === 'textcolor') {
      const colorArg = readNextArg(text, afterCmd);
      const bodyArg = colorArg ? readNextArg(text, colorArg.nextIdx) : null;
      if (bodyArg) {
        walked += convertLatexMathCore(bodyArg.value, depth + 1);
        i = bodyArg.nextIdx;
      } else {
        i = colorArg ? colorArg.nextIdx : afterCmd;
      }
      continue;
    }

    // Fractions: \frac, \dfrac, \tfrac, \cfrac
    if (cmdName === 'frac' || cmdName === 'dfrac' || cmdName === 'tfrac' || cmdName === 'cfrac') {
      const numArg = readNextArg(text, afterCmd);
      const denArg = numArg ? readNextArg(text, numArg.nextIdx) : null;
      if (numArg && denArg) {
        const num = convertLatexMathCore(numArg.value, depth + 1).trim();
        const den = convertLatexMathCore(denArg.value, depth + 1).trim();
        const numFmt = needsNumeratorParens(num) ? `(${num})` : num;
        const denFmt = needsDenominatorParens(den) ? `(${den})` : den;
        walked += `${numFmt}/${denFmt}`;
        i = denArg.nextIdx;
        continue;
      }
    }

    // Binomial coefficients: \binom{n}{k}
    if (cmdName === 'binom' || cmdName === 'tbinom' || cmdName === 'dbinom') {
      const nArg = readNextArg(text, afterCmd);
      const kArg = nArg ? readNextArg(text, nArg.nextIdx) : null;
      if (nArg && kArg) {
        const nVal = convertLatexMathCore(nArg.value, depth + 1).trim();
        const kVal = convertLatexMathCore(kArg.value, depth + 1).trim();
        walked += `C(${nVal}, ${kVal})`;
        i = kArg.nextIdx;
        continue;
      }
    }

    // Roots: \sqrt[n]{x} or \sqrt{x}
    if (cmdName === 'sqrt') {
      let cursor = afterCmd;
      while (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\t')) cursor++;

      let rootIndex = '';
      if (text[cursor] === '[') {
        const closeBracket = text.indexOf(']', cursor + 1);
        if (closeBracket !== -1) {
          rootIndex = convertLatexMathCore(text.slice(cursor + 1, closeBracket), depth + 1).trim();
          cursor = closeBracket + 1;
        }
      }

      const bodyArg = readNextArg(text, cursor);
      if (bodyArg) {
        const body = convertLatexMathCore(bodyArg.value, depth + 1).trim();
        let rootSymbol = '√';
        if (rootIndex === '3') {
          rootSymbol = '∛';
        } else if (rootIndex === '4') {
          rootSymbol = '∜';
        } else if (rootIndex) {
          const mappedIdx = mapAllChars(stripScriptMarkers(rootIndex), UNICODE_SUPERSCRIPT_CORE);
          rootSymbol = mappedIdx !== null ? `${mappedIdx}√` : `${SUP_START}${stripScriptMarkers(rootIndex)}${SUP_END}√`;
        }
        walked += isSimpleRootBody(body) ? `${rootSymbol}${body}` : `${rootSymbol}(${body})`;
        i = bodyArg.nextIdx;
        continue;
      }
    }

    // Extensible arrows / Stacked labels: \xrightarrow[below]{above}, \overset{top}{base}, \underset{bottom}{base}
    if (
      cmdName === 'xrightarrow' ||
      cmdName === 'xleftarrow' ||
      cmdName === 'overset' ||
      cmdName === 'underset' ||
      cmdName === 'stackrel'
    ) {
      let cursor = afterCmd;
      while (cursor < text.length && (text[cursor] === ' ' || text[cursor] === '\t')) cursor++;

      if (cmdName === 'xrightarrow' || cmdName === 'xleftarrow') {
        let below = '';
        if (text[cursor] === '[') {
          const closeB = text.indexOf(']', cursor + 1);
          if (closeB !== -1) {
            below = convertLatexMathCore(text.slice(cursor + 1, closeB), depth + 1).trim();
            cursor = closeB + 1;
          }
        }
        const aboveArg = readNextArg(text, cursor);
        if (aboveArg) {
          const above = convertLatexMathCore(aboveArg.value, depth + 1).trim();
          const arrowChar = cmdName === 'xleftarrow' ? '←' : '→';
          const labelParts = [above, below].filter(Boolean).join(', ');
          walked += labelParts ? ` ${arrowChar}(${labelParts}) ` : ` ${arrowChar} `;
          i = aboveArg.nextIdx;
          continue;
        }
      } else {
        const firstArg = readNextArg(text, cursor);
        const secondArg = firstArg ? readNextArg(text, firstArg.nextIdx) : null;
        if (firstArg && secondArg) {
          const modText = convertLatexMathCore(firstArg.value, depth + 1).trim();
          const baseText = convertLatexMathCore(secondArg.value, depth + 1).trim();
          if (baseText === '→' || baseText === '←' || baseText === '=' || baseText === '⇒' || baseText === '⇔') {
            walked += modText ? ` ${baseText}(${modText}) ` : ` ${baseText} `;
          } else {
            walked += modText ? `${baseText}(${modText})` : baseText;
          }
          i = secondArg.nextIdx;
          continue;
        }
      }
    }

    // Vectors: \vec{u}, \overrightarrow{AB}, \overleftarrow{AB}
    if (cmdName === 'vec' || cmdName === 'overrightarrow' || cmdName === 'overleftarrow') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        const inner = convertLatexMathCore(arg.value, depth + 1).trim();
        const arrow = cmdName === 'overleftarrow' ? '\u20d6' : '\u20d7';
        // Put combining vector arrow right after the letter name (before any subscript if present)
        const subMatch = inner.match(/^([a-zA-Z0-9']+)([₀₁₂₃₄₅₆₇₈₉\uE012][\s\S]*)$/);
        if (subMatch) {
          walked += `${subMatch[1]}${arrow}${subMatch[2]}`;
        } else {
          walked += `${inner}${arrow}`;
        }
        i = arg.nextIdx;
        continue;
      }
    }

    // Overline / Bar
    if (cmdName === 'bar' || cmdName === 'overline') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        const inner = convertLatexMathCore(arg.value, depth + 1).trim();
        if (inner.length === 1) {
          walked += `${inner}\u0304`;
        } else if (/^[a-zA-Z0-9]{2,5}$/.test(inner)) {
          walked += inner.split('').map((c) => `${c}\u0304`).join('');
        } else {
          walked += `(${inner})\u0304`;
        }
        i = arg.nextIdx;
        continue;
      }
    }

    // Hat / Angle arc (\widehat{ABC} -> ∠ABC, \hat{a} -> â)
    if (cmdName === 'hat' || cmdName === 'widehat') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        const inner = convertLatexMathCore(arg.value, depth + 1).trim();
        if (inner.length === 1) {
          walked += `${inner}\u0302`;
        } else if (/^[a-zA-Z0-9']{2,6}$/.test(inner)) {
          walked += `∠${inner}`;
        } else {
          walked += `(${inner})\u0302`;
        }
        i = arg.nextIdx;
        continue;
      }
    }

    // Tilde / Dots / Overparen
    if (cmdName === 'tilde' || cmdName === 'widetilde') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        const inner = convertLatexMathCore(arg.value, depth + 1).trim();
        walked += inner.length === 1 ? `${inner}\u0303` : `~(${inner})`;
        i = arg.nextIdx;
        continue;
      }
    }
    if (cmdName === 'dot' || cmdName === 'ddot') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        const inner = convertLatexMathCore(arg.value, depth + 1).trim();
        const mark = cmdName === 'ddot' ? '\u0308' : '\u0307';
        walked += inner.length === 1 ? `${inner}${mark}` : `${inner}${mark}`;
        i = arg.nextIdx;
        continue;
      }
    }
    if (cmdName === 'overparen' || cmdName === 'wideparen') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        const inner = convertLatexMathCore(arg.value, depth + 1).trim();
        walked += `⌒${inner}`;
        i = arg.nextIdx;
        continue;
      }
    }

    // Blackboard bold: \mathbb{R}, \mathbb{N}, etc.
    if (cmdName === 'mathbb') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        const inner = arg.value.trim();
        const mapped = inner
          .split('')
          .map((c) => BLACKBOARD_MAP[c] || c)
          .join('');
        walked += mapped;
        i = arg.nextIdx;
        continue;
      }
    }

    // Text / Font wrappers
    if (
      cmdName === 'text' ||
      cmdName === 'textrm' ||
      cmdName === 'textbf' ||
      cmdName === 'textit' ||
      cmdName === 'mathrm' ||
      cmdName === 'mathbf' ||
      cmdName === 'mathit' ||
      cmdName === 'mathsf' ||
      cmdName === 'mathtt' ||
      cmdName === 'mathcal' ||
      cmdName === 'mathfrak' ||
      cmdName === 'operatorname' ||
      cmdName === 'mbox' ||
      cmdName === 'underline' ||
      cmdName === 'cancel' ||
      cmdName === 'boxed'
    ) {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        walked +=
          cmdName === 'text' || cmdName === 'textrm' || cmdName === 'textbf' || cmdName === 'textit' || cmdName === 'mbox'
            ? arg.value
            : convertLatexMathCore(arg.value, depth + 1);
        i = arg.nextIdx;
        continue;
      }
    }

    if (cmdName === 'pmod') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        walked += ` (mod ${convertLatexMathCore(arg.value, depth + 1).trim()})`;
        i = arg.nextIdx;
        continue;
      }
    }

    // Standalone \circ (not preceded by ^) -> ∘
    if (cmdName === 'circ') {
      walked += '∘';
      i = afterCmd;
      continue;
    }

    // Named symbols
    if (LATEX_SYMBOLS[cmdName] !== undefined) {
      const sym = LATEX_SYMBOLS[cmdName];
      // Add subtle separating space if Greek/word symbol runs directly into an ASCII letter e.g. \pi x -> πx or \forall x -> ∀ x
      const nextCh = text[afterCmd];
      walked += sym;
      if (
        (cmdName === 'forall' || cmdName === 'exists' || cmdName === 'in' || cmdName === 'notin' || cmdName === 'iff' || cmdName === 'implies') &&
        nextCh &&
        /[a-zA-Z0-9\\]/.test(nextCh) &&
        !walked.endsWith(' ')
      ) {
        walked += ' ';
      }
      i = afterCmd;
      continue;
    }

    // Standard math function names (\sin, \cos, \lim, \log...)
    if (FUNCTION_COMMANDS.has(cmdName)) {
      walked += cmdName;
      const nextCh = text[afterCmd];
      if (nextCh && /[a-zA-Z\\]/.test(nextCh)) {
        walked += ' ';
      }
      i = afterCmd;
      continue;
    }

    // Unknown command with 1 brace arg -> unwrap gracefully instead of leaking raw \cmd{...}
    if (text[afterCmd] === '{') {
      const arg = readNextArg(text, afterCmd);
      if (arg) {
        walked += convertLatexMathCore(arg.value, depth + 1);
        i = arg.nextIdx;
        continue;
      }
    }

    // Unknown bare command: drop backslash so no raw LaTeX slash remains
    walked += cmdName;
    i = afterCmd;
  }

  // 7. Vietnamese decimal comma brace `{,}` -> `,`
  walked = walked.replace(/\{\s*,\s*\}/g, ',');

  // 8. Superscripts (^) and Subscripts (_)
  walked = convertScriptsInText(walked);

  // 9. Remove any remaining unescaped grouping braces `{` `}` inside math
  walked = walked.replace(/[{}]/g, '');

  // 10. Clean spacing
  walked = walked.replace(/[ \t]{2,}/g, ' ').trim();
  return walked;
}

/**
 * Converts unwrapped LaTeX/math patterns outside `$...$` delimiters without
 * altering normal Vietnamese prose or markdown emphasis.
 */
function convertUnwrappedMathOutsideDelimiters(segment: string): string {
  if (!segment) return '';
  let text = segment;

  // Remove stray unclosed '$' immediately before a LaTeX command (e.g. "Tính $\frac{1}{2}")
  text = text.replace(/\$(?=\s*\\[a-zA-Z])/g, '');

  // Convert \begin{...}...\end{...} blocks outside delimiters
  text = text.replace(/\\begin\{([a-zA-Z*]+)\}[\s\S]*?\\end\{\1\}/g, (m) => convertLatexMathCore(m));

  // Convert multi-arg / braced LaTeX commands outside delimiters using balanced braces
  const bracedCommands = [
    { name: '\\frac', args: 2, opt: false },
    { name: '\\dfrac', args: 2, opt: false },
    { name: '\\tfrac', args: 2, opt: false },
    { name: '\\binom', args: 2, opt: false },
    { name: '\\sqrt', args: 1, opt: true },
    { name: '\\overrightarrow', args: 1, opt: false },
    { name: '\\overleftarrow', args: 1, opt: false },
    { name: '\\vec', args: 1, opt: false },
    { name: '\\overline', args: 1, opt: false },
    { name: '\\bar', args: 1, opt: false },
    { name: '\\widehat', args: 1, opt: false },
    { name: '\\hat', args: 1, opt: false },
    { name: '\\mathbb', args: 1, opt: false },
    { name: '\\text', args: 1, opt: false },
    { name: '\\mathrm', args: 1, opt: false },
    { name: '\\mathbf', args: 1, opt: false },
  ];

  let out = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const cmd of bracedCommands) {
      if (text.startsWith(cmd.name, i)) {
        let cursor = i + cmd.name.length;
        const nextCh = text[cursor];
        if (nextCh && /[a-zA-Z]/.test(nextCh)) continue;

        while (cursor < text.length && text[cursor] === ' ') cursor++;
        if (cmd.opt && text[cursor] === '[') {
          const closeB = text.indexOf(']', cursor + 1);
          if (closeB !== -1) {
            cursor = closeB + 1;
            while (cursor < text.length && text[cursor] === ' ') cursor++;
          }
        }
        let ok = true;
        for (let a = 0; a < cmd.args; a++) {
          const arg = readNextArg(text, cursor);
          if (!arg) {
            ok = false;
            break;
          }
          cursor = arg.nextIdx;
        }
        if (ok) {
          out += convertLatexMathCore(text.slice(i, cursor));
          i = cursor;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      out += text[i];
      i++;
    }
  }
  text = out;

  // Convert remaining standalone LaTeX symbol commands outside delimiters
  if (text.includes('\\')) {
    text = text
      .replace(/\\\{/g, LITERAL_LBRACE)
      .replace(/\\\}/g, LITERAL_RBRACE)
      .replace(/\\setminus\b|\\smallsetminus\b/g, LITERAL_BACKSLASH)
      .replace(/\\left\s*([(|[\].])/g, (_, d) => (d === '.' ? '' : d))
      .replace(/\\right\s*([)|[\].])/g, (_, d) => (d === '.' ? '' : d))
      .replace(/\\([a-zA-Z]+)/g, (m, cmd: string) => {
        if (LATEX_SYMBOLS[cmd] !== undefined) return LATEX_SYMBOLS[cmd];
        if (FUNCTION_COMMANDS.has(cmd)) return cmd;
        return m;
      });
  }

  // Convert unwrapped degree, superscripts, and subscripts outside delimiters
  text = text
    .replace(/\^\s*\{\s*\\circ\s*\}/g, '°')
    .replace(/\^\s*°/g, '°')
    .replace(/([a-zA-Z0-9)\]])\^\{([^{}]+)\}/g, (_, base: string, exp: string) => `${base}${convertScriptsInText(`^{${exp}}`)}`)
    .replace(/([a-zA-Z0-9)\]])\^([0-9n])/g, (_, base: string, ch: string) => `${base}${UNICODE_SUPERSCRIPT_CORE[ch] || ch}`)
    .replace(/([a-zA-Z0-9)\]])_\{([^{}]+)\}/g, (_, base: string, sub: string) => `${base}${convertScriptsInText(`_{${sub}}`)}`)
    .replace(/([a-zA-Z0-9)\]])_([0-9])(?![a-zA-Z0-9_])/g, (_, base: string, ch: string) => `${base}${UNICODE_SUBSCRIPT_CORE[ch] || ch}`)
    .replace(/(\d)\{,\}(\d)/g, '$1,$2');

  return text;
}

/**
 * Pipeline transforming raw text with LaTeX into Unicode text with internal
 * script markers (`SUP_START`..`SUP_END`, `SUB_START`..`SUB_END`) preserved.
 */
function transformToMarkedUnicode(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n');

  // Protect escaped dollars before delimiter parsing
  text = text.replace(/\\\$/g, LITERAL_DOLLAR);

  // Protect converted math segments so outside pass won't re-process them
  const convertedHolders: string[] = [];
  const hold = (converted: string): string => {
    const token = `\uE020${convertedHolders.length}\uE021`;
    convertedHolders.push(converted);
    return token;
  };

  // 1. Display math: $$...$$ and \[...\]
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math: string) => hold(convertLatexMathCore(math)));
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => hold(convertLatexMathCore(math)));

  // 2. Inline math: $...$ and \(...\)
  text = text.replace(/\$([^$\n]+?)\$/g, (_, math: string) => hold(convertLatexMathCore(math)));
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => hold(convertLatexMathCore(math)));

  // 3. Process unwrapped math outside delimiters
  text = convertUnwrappedMathOutsideDelimiters(text);

  // 4. Restore held math segments
  text = text.replace(/\uE020(\d+)\uE021/g, (_, idxStr: string) => convertedHolders[Number(idxStr)] ?? '');

  return text;
}

function restoreLiteralPlaceholders(str: string): string {
  return str
    .replaceAll(LITERAL_LBRACE, '{')
    .replaceAll(LITERAL_RBRACE, '}')
    .replaceAll(LITERAL_DOLLAR, '$')
    .replaceAll(LITERAL_BACKSLASH, '\\')
    .replaceAll(LITERAL_UNDERSCORE, '_')
    .replaceAll(LITERAL_CARET, '^');
}

function stripRichTextFormattingTags(str: string): string {
  return str
    .replace(/<\/?(?:u|b|strong|i|em|s|del|strike|mark|span|div)(?:\s+[^>]*)?>/gi, '')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1$2$3');
}

/**
 * Chuyển đổi công thức LaTeX sang dạng văn bản thuần Unicode hoàn chỉnh
 * (không còn `$`, `{`, `}`, `\frac`, `\sqrt`, `\[...\]`, `\(...\)`).
 * Phù hợp cho Excel, tiêu đề, văn bản thuần.
 */
export function formatMathToReadableText(raw: string): string {
  if (!raw) return '';
  let text = transformToMarkedUnicode(raw);

  // Convert remaining script markers cleanly to plain Unicode
  text = text.replace(new RegExp(`${SUP_START}([\\s\\S]*?)${SUP_END}`, 'g'), (_, inner: string) => {
    const clean = restoreLiteralPlaceholders(inner);
    const ext = mapAllChars(clean, UNICODE_SUPERSCRIPT_EXTENDED);
    if (ext !== null) return ext;
    if (clean === '*' || clean === '′' || clean === "'") return clean;
    return clean.length === 1 ? `^${clean}` : `^(${clean})`;
  });

  text = text.replace(new RegExp(`${SUB_START}([\\s\\S]*?)${SUB_END}`, 'g'), (_, inner: string) => {
    const clean = restoreLiteralPlaceholders(inner);
    const ext = mapAllChars(clean, UNICODE_SUBSCRIPT_EXTENDED);
    if (ext !== null) return ext;
    return `(${clean})`;
  });

  text = restoreLiteralPlaceholders(text);
  text = stripRichTextFormattingTags(text);
  return text;
}

/**
 * Tạo danh sách `TextRun` cho Microsoft Word (.docx):
 * - Các ký hiệu toán học chuyển sang Unicode chuẩn (`≤`, `≥`, `≠`, `≈`, `ℝ`, `√`, `∫`, `∑`, `⇔`, `⇒`, `°`, `∠`, `²`, `³`, `₁`...)
 * - Không còn bất kỳ ký tự code LaTeX nào (`$`, `{`, `}`, `\frac`, `\sqrt`...)
 * - Chỉ số trên/dưới phức tạp (như `y_{CĐ}`, `\lim_{x \to x_0}`, `e^{x^2}`) được xuất bằng
 *   thuộc tính `superScript` / `subScript` gốc của Word để hiển thị sắc nét tuyệt đối.
 */
export function buildDocxMathTextRuns(
  raw: string,
  baseOptions: Partial<IRunOptions> = {}
): TextRun[] {
  if (!raw) return [];
  const marked = transformToMarkedUnicode(raw);
  const runs: TextRun[] = [];

  const scriptTokenRegex = new RegExp(
    `(${SUP_START}[\\s\\S]*?${SUP_END}|${SUB_START}[\\s\\S]*?${SUB_END})`,
    'g'
  );

  const pushPlainWithMarkdownBold = (plainChunk: string) => {
    if (!plainChunk) return;
    // Strip rich-text wrapper tags cleanly so raw HTML never leaks into .docx text runs
    const sanitizedChunk = plainChunk
      .replace(/<\/?(?:u|b|strong|i|em|s|del|strike|mark|span|div)(?:\s+[^>]*)?>/gi, '')
      .replace(/~~([^~\n]+)~~/g, '$1');

    const boldParts = sanitizedChunk.split(/(\*\*[^*\n]+\*\*)/g);
    for (const part of boldParts) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const cleanBold = restoreLiteralPlaceholders(part.slice(2, -2));
        if (cleanBold) {
          runs.push(
            new TextRun({
              font: 'Times New Roman',
              ...baseOptions,
              bold: true,
              text: cleanBold,
            })
          );
        }
      } else {
        const cleanNormal = restoreLiteralPlaceholders(part);
        if (cleanNormal) {
          runs.push(
            new TextRun({
              font: 'Times New Roman',
              ...baseOptions,
              text: cleanNormal,
            })
          );
        }
      }
    }
  };

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = scriptTokenRegex.exec(marked)) !== null) {
    if (match.index > lastIdx) {
      pushPlainWithMarkdownBold(marked.slice(lastIdx, match.index));
    }

    const token = match[0];
    const isSup = token.startsWith(SUP_START);
    const innerText = restoreLiteralPlaceholders(token.slice(1, -1));
    if (innerText) {
      runs.push(
        new TextRun({
          font: 'Times New Roman',
          ...baseOptions,
          superScript: isSup ? true : baseOptions.superScript,
          subScript: !isSup ? true : baseOptions.subScript,
          text: innerText,
        })
      );
    }

    lastIdx = match.index + token.length;
  }

  if (lastIdx < marked.length) {
    pushPlainWithMarkdownBold(marked.slice(lastIdx));
  }

  return runs;
}
