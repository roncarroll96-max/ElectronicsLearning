/**
 * Compiler and linker messages, read into a list a learner can use: where the
 * problem is (a line in their sketch when possible), the compiler's own words
 * (kept, because they're what a real Arduino IDE shows), and a plain-English
 * hint for the common mistakes.
 */
import { SKETCH_FILE } from './sketch';

export type Severity = 'error' | 'warning' | 'note';

export interface Diagnostic {
  severity: Severity;
  /** Line and column in the sketch, when the message points at it. */
  line?: number;
  col?: number;
  /** The compiler's message, e.g. "expected ';' before '}' token". */
  message: string;
  /** What it usually means, in plain English. */
  hint?: string;
}

const LOCATED = /^(.*?):(\d+):(?:(\d+):)?\s*(fatal error|error|warning|note):\s*(.*)$/;

/** Read cc1plus output (GCC style "file:line:col: error: message"). */
export function parseCompilerOutput(text: string): Diagnostic[] {
  const out: (Diagnostic & { file: string })[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const m = LOCATED.exec(line);
    if (!m) continue;
    const [, file, ln, col, sev, message] = m;
    out.push({
      file: file.trim(),
      line: Number(ln),
      col: col ? Number(col) : undefined,
      severity: sev === 'fatal error' ? 'error' : (sev as Severity),
      message: message.trim(),
    });
  }
  // A problem found inside a library header usually comes from a line of the
  // sketch (a macro used there): point at that line, taken from the notes after it.
  for (let i = 0; i < out.length; i++) {
    const d = out[i];
    if (d.severity === 'note' || isSketch(d.file)) continue;
    for (let j = i + 1; j < out.length && out[j].severity === 'note'; j++) {
      if (isSketch(out[j].file)) {
        d.file = out[j].file;
        d.line = out[j].line;
        d.col = out[j].col;
        break;
      }
    }
  }
  return out.map(({ file, ...d }) => {
    const r: Diagnostic = isSketch(file) ? d : { ...d, line: undefined, col: undefined, message: `${shortFile(file)}: ${d.message}` };
    const hint = hintFor(r.message);
    return hint ? { ...r, hint } : r;
  });
}

/** Read linker output: missing functions and a program that doesn't fit. */
export function parseLinkerOutput(text: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let message: string | null = null;
    const undef = /undefined reference to [`'](.+?)'/.exec(line);
    if (undef) message = `undefined reference to '${undef[1]}'`;
    else if (/multiple definition of/.test(line)) message = line.replace(/^.*?(multiple definition of)/, '$1');
    else if (/region .* overflowed|will not fit in region/.test(line)) message = 'the program is too big for the memory';
    else if (/^.*ld(-new)?:.*error/i.test(line)) message = line.replace(/^.*?: /, '');
    if (!message || seen.has(message)) continue;
    seen.add(message);
    const hint = hintFor(message);
    out.push(hint ? { severity: 'error', message, hint } : { severity: 'error', message });
  }
  return out;
}

function isSketch(file: string): boolean {
  return file === SKETCH_FILE || file.endsWith('/' + SKETCH_FILE);
}

function shortFile(file: string): string {
  return file.split('/').pop() || file;
}

const HINTS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/expected (?:',' or )?';' before/, () => 'A semicolon (;) is probably missing at the end of the line before this one. Every statement ends with ;.'],
  [/expected '\}' at end of input/, () => 'A closing brace } is missing: every { needs a matching }.'],
  [/expected declaration before '\}' token|expected unqualified-id before/, () => 'There may be an extra } here, or code that sits outside any function.'],
  [/^'(.+?)' was not declared in this scope/, (m) => `“${m[1]}” isn’t known here. Check the spelling and capital letters (Arduino code is case-sensitive: digitalWrite, not digitalwrite), and make sure it’s declared before it’s used.`],
  [/^'(.+?)' does not name a type/, (m) => `“${m[1]}” isn’t a type the compiler knows. Check the spelling and capitals (int, float, bool, String), or a library that’s missing.`],
  [/expected '\)' before/, () => 'Something is missing inside the brackets ( ): often a comma between two values, or the closing ).'],
  [/expected primary-expression before/, () => 'A value is missing here, for example in a calculation or between the brackets of a function call.'],
  [/too few arguments to function/, () => 'This function needs more values between its brackets.'],
  [/too many arguments to function/, () => 'This function is given more values than it takes.'],
  [/(\S+): No such file or directory/, (m) => `The app doesn’t have “${m[1]}”. For now only the built-in Arduino functions are available, not extra libraries.`],
  [/^redefinition of '(.+?)'/, (m) => `“${m[1]}” is written twice. Remove or rename one of them.`],
  [/stray '\\\d+' in program/, () => 'There’s a character here the compiler can’t read, often a curly quote “ ” or a long dash pasted from a web page. Retype it with straight quotes " and a plain minus -.'],
  [/missing terminating (["']) character/, (m) => `A piece of text is missing its closing ${m[1]}.`],
  [/'else' without a previous 'if'/, () => 'This else has no matching if. A common cause is a semicolon straight after if (...).'],
  [/^undefined reference to '(setup|loop)'/, (m) => `Every sketch needs a ${m[1]}() function, even an empty one: void ${m[1]}() { }`],
  [/^undefined reference to '(.+?)'/, (m) => `“${m[1]}” is used but never written. Check its spelling where it’s defined, or it may belong to a library the app doesn’t have.`],
  [/^multiple definition of/, () => 'Something is defined twice in the program.'],
  [/invalid conversion from/, () => 'A value of one type is used where a different type is needed.'],
  [/lvalue required as left operand of assignment/, () => 'The left side of = must be a variable. Did you mean == (compare) instead of = (store)?'],
];

/** A plain-English explanation of a compiler message, if it's a common one. */
export function hintFor(message: string): string | undefined {
  for (const [re, make] of HINTS) {
    const m = re.exec(message);
    if (m) return make(m);
  }
  return undefined;
}
