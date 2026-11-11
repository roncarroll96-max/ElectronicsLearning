/**
 * Turns a sketch into the C++ the compiler sees, the way the Arduino IDE does:
 *
 * 1. `#include <Arduino.h>` goes at the top, so digitalWrite, Serial and friends exist.
 * 2. A declaration (prototype) for each function the sketch defines goes just
 *    before the first function, so a function can be used above the place it's
 *    written (plain C++ doesn't allow that; Arduino sketches do).
 *
 * `#line` directives keep every compiler message pointing at the line the
 * learner wrote.
 *
 * Like the IDE, functions whose parameters have default values get no
 * prototype, and nor do templates or class member functions.
 */

/** The file name compiler messages use for the learner's code. */
export const SKETCH_FILE = 'sketch.ino';

export interface PreparedSketch {
  /** The C++ handed to the compiler. */
  code: string;
  /** The prototypes that were added, e.g. "void blink(int times)". */
  prototypes: string[];
}

/**
 * The source with comments, string and character literals, and preprocessor
 * lines blanked out (newlines kept), so braces and parentheses inside them
 * don't confuse the scan.
 */
export function maskSource(src: string): string {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  let lineStart = true;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      lineStart = true;
      i++;
      continue;
    }
    if (lineStart && (c === ' ' || c === '\t' || c === '\r')) {
      i++;
      continue;
    }
    if (lineStart && c === '#') {
      // A preprocessor line, including any lines continued with a backslash.
      let j = i;
      while (j < n) {
        if (src[j] === '\n' && src[j - 1] !== '\\' && !(src[j - 1] === '\r' && src[j - 2] === '\\')) break;
        if (src[j] === '/' && src[j + 1] === '*') {
          const end = src.indexOf('*/', j + 2);
          j = end < 0 ? n : end + 2;
          continue;
        }
        j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    lineStart = false;
    if (c === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const j = end < 0 ? n : end + 2;
      blank(i, j);
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j + 1, n);
      blank(i, j);
      i = j;
    } else {
      i++;
    }
  }
  return out.join('');
}

const NOT_A_RETURN_TYPE = /^(return|else|case|goto|new|delete|throw|typedef|using)$/;

/** Find the sketch's top-level function definitions: their signatures and where each begins. */
export function findFunctions(src: string): { signature: string; name: string; offset: number; hasDefaults: boolean }[] {
  const m = maskSource(src);
  const found: { signature: string; name: string; offset: number; hasDefaults: boolean }[] = [];
  let depth = 0;
  let stmtStart = 0; // where the current top-level statement began
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '{') {
      if (depth === 0) {
        const header = m.slice(stmtStart, i);
        const fn = parseHeader(header);
        if (fn) {
          const lead = header.length - header.trimStart().length;
          found.push({ ...fn, offset: stmtStart + lead });
        }
      }
      depth++;
    } else if (c === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) stmtStart = i + 1;
    } else if (c === ';' && depth === 0) {
      stmtStart = i + 1;
    }
  }
  return found;
}

/** If this text (just before a top-level `{`) is a plain function's header, its parts. */
function parseHeader(raw: string): { signature: string; name: string; hasDefaults: boolean } | null {
  const h = raw.replace(/\s+/g, ' ').trim();
  if (!h.endsWith(')')) return null;
  if (/^template\b/.test(h)) return null;
  const params = paramsPart(h);
  if (params === null) return null;
  const before = h.slice(0, h.length - params.length - 2).trimEnd();
  if (before.includes('=')) return null;
  const nameMatch = /([A-Za-z_]\w*)$/.exec(before);
  if (!nameMatch) return null;
  const name = nameMatch[1];
  const returnType = before.slice(0, before.length - name.length).trim();
  // Needs a return type made of plain type words (so ISR(...), if (...), constructors,
  // Class::method and initialisers are left alone).
  if (!returnType || before.slice(0, -name.length).endsWith(':')) return null;
  if (!/^[A-Za-z_][\w\s*&<>,]*$/.test(returnType)) return null;
  if (NOT_A_RETURN_TYPE.test(returnType.split(' ').pop() ?? '')) return null;
  if (/^(if|for|while|switch|catch|sizeof|return)$/.test(name)) return null;
  return { signature: `${returnType} ${name}(${params.trim()})`.replace(/\s+([*&])/g, '$1').replace(/([*&])(?=\w)/g, '$1 '), name, hasDefaults: params.includes('=') };
}

/** The text inside the final, outermost pair of parentheses, or null. */
function paramsPart(h: string): string | null {
  let depth = 0;
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i] === ')') depth++;
    else if (h[i] === '(') {
      depth--;
      if (depth === 0) return h.slice(i + 1, h.length - 1);
    }
  }
  return null;
}

export function prepareSketch(source: string): PreparedSketch {
  const src = source.replace(/\r\n?/g, '\n');
  const fns = findFunctions(src);
  const usable = fns.filter((f) => !f.hasDefaults);
  const seen = new Set<string>();
  const protos: { signature: string; line: number }[] = [];
  const lineOf = (offset: number) => src.slice(0, offset).split('\n').length;
  for (const f of usable) {
    if (seen.has(f.signature)) continue;
    seen.add(f.signature);
    protos.push({ signature: f.signature, line: lineOf(f.offset) });
  }

  const head = `#include <Arduino.h>\n#line 1 "${SKETCH_FILE}"\n`;
  if (!fns.length || !protos.length) {
    return { code: head + src + '\n', prototypes: [] };
  }
  const insertLine = lineOf(fns[0].offset);
  const lines = src.split('\n');
  const before = lines.slice(0, insertLine - 1).join('\n');
  const after = lines.slice(insertLine - 1).join('\n');
  const protoText = protos.map((p) => `#line ${p.line} "${SKETCH_FILE}"\n${p.signature};\n`).join('');
  const code = head + (before ? before + '\n' : '') + protoText + `#line ${insertLine} "${SKETCH_FILE}"\n` + after + '\n';
  return { code, prototypes: protos.map((p) => p.signature) };
}
