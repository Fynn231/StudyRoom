export const GOAL_LIMITS = { files: 5, fileBytes: 65536, totalBytes: 131072 } as const;

export async function readGoalFiles(files: File[], read?: (file: File) => Promise<ArrayBuffer>, signal?: AbortSignal): Promise<GoalNote[]> {
  if (!files.length || files.length > GOAL_LIMITS.files) throw Error('Choose 1–5 Markdown files.');
  if (files.some(f => !/\.(md|markdown)$/i.test(f.name))) throw Error('Only .md or .markdown files are supported.');
  if (files.some(f => f.size > GOAL_LIMITS.fileBytes) || files.reduce((n, f) => n + f.size, 0) > GOAL_LIMITS.totalBytes) throw Error('Limit: 64 KiB per file, 128 KiB total.');
  const notes: GoalNote[] = [];
  let total = 0;
  for (const file of files) {
    let bytes: ArrayBuffer;
    try { signal?.throwIfAborted(); bytes = await (read ? read(file) : readFileBytes(file, signal)); signal?.throwIfAborted(); } catch { throw Error('Could not read a selected file. Please choose again.'); }
    total += bytes.byteLength;
    if (bytes.byteLength > GOAL_LIMITS.fileBytes || total > GOAL_LIMITS.totalBytes) throw Error('Read exceeded the file size limits.');
    let raw: string;
    try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw Error('A selected file is not valid UTF-8. Save it as UTF-8 and choose again.'); }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(raw)) throw Error('A selected file contains binary/control data. Choose plain UTF-8 Markdown.');
    notes.push(parseGoalNote(file.name, raw));
  }
  return notes;
}

function readFileBytes(file: File, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const clean = () => { reader.onload = reader.onerror = reader.onabort = null; signal?.removeEventListener('abort', abort); };
    const fail = () => { clean(); reject(Error('Read failed')); };
    const abort = () => { clean(); reader.abort(); reject(Error('Read cancelled')); };
    reader.onload = () => { const result = reader.result; clean(); result instanceof ArrayBuffer ? resolve(result) : reject(Error('Invalid read')); };
    reader.onerror = reader.onabort = fail;
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { reader.readAsArrayBuffer(file); } catch { fail(); }
  });
}

export type GoalLine = { text: string; heading: string; line: number };
export type GoalNote = { filename: string; tasks: GoalLine[]; context: GoalLine[]; ignoredHistory: boolean };

/** Deliberately small Markdown subset, not a priority inference engine. */
export function parseGoalNote(filename: string, raw: string): GoalNote {
  const result: GoalNote = { filename, tasks: [], context: [], ignoredHistory: false };
  const headings: { level: number; text: string; historical: boolean }[] = [];
  let frontmatter = false;
  let fence: { char: string; length: number } | null = null;
  raw.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, i) => {
    if (i === 0 && line.trim() === '---') { frontmatter = true; return; }
    if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false; return; }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) { if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && /^ {0,3}(`+|~+)\s*$/.test(line)) fence = null; return; }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; return; }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      const historical = /\b(historical|earlier|prior content|superseded)\b/i.test(heading[2]);
      headings.push({ level, text: heading[2], historical });
      if (historical) result.ignoredHistory = true;
      return;
    }
    if (headings.some(h => h.historical)) return;
    const task = line.match(/^\s*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s+(.+?)\s*$/);
    const source = { heading: headings.map(h => h.text).join(' / ') || 'Untitled section', line: i + 1 };
    if (task) { if (task[1] === ' ') result.tasks.push({ ...source, text: task[2] }); return; }
    if (line.trim()) result.context.push({ ...source, text: line.trim() });
  });
  return result;
}
