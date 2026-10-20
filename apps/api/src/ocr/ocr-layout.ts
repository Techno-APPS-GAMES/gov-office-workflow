/** Layout helpers for OCR — keep free of Nest deps so they are easy to test. */

export function textQuality(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 0;
  const letters = (t.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
  return letters / Math.max(t.length, 1);
}

/** True when extract looks like one-word-per-line garbage (bad PDF text layer). */
export function isBrokenLayout(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 6) return false;
  const short = lines.filter((l) => l.split(/\s+/).length <= 2).length;
  const avgWords =
    lines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length, 0) / lines.length;
  return short / lines.length >= 0.45 || avgWords < 3.2;
}

export function isWeakOcr(text: string) {
  const t = text.replace(/\s+/g, ' ').trim();
  return !t || t.length < 40 || textQuality(t) < 0.28 || isBrokenLayout(text);
}

function isHeadingLine(l: string) {
  if (!l) return false;
  if (/^\[page\s+\d+\]$/i.test(l)) return true;
  if (/^chapter[\s\-–—]*[ivx0-9]+/i.test(l)) return true;
  if (/^(preliminary|definitions)$/i.test(l)) return true;
  if (/^\d+\.\s+\S/.test(l)) return true;
  if (/^short title/i.test(l)) return true;
  if (/^whereas\b/i.test(l) || /^and whereas\b/i.test(l)) return true;
  if (/^it is hereby enacted/i.test(l)) return true;
  if (/^a bill$/i.test(l)) return true;
  if (/^\[\s*as\s+passed/i.test(l)) return true;
  const letters = (l.match(/[A-Za-z]/g) || []).length;
  if (letters >= 8 && l === l.toUpperCase() && !/[a-z]/.test(l) && l.split(/\s+/).length <= 8) {
    return true;
  }
  return false;
}

function isClauseStart(l: string) {
  return /^\([0-9ivxl]+\)/i.test(l) || /^[ivxl]+\.\s/i.test(l);
}

/**
 * Force office-document layout: join one-word-per-line garbage into paragraphs,
 * keep headings / clauses / page markers on their own lines.
 */
export function formatAsOfficeDocument(raw: string): string {
  if (!raw?.trim()) return '';

  // Normalize page markers
  let src = raw
    .replace(/\r\n/g, '\n')
    .replace(/^---\s*Page\s+(\d+)\s*---$/gim, '[Page $1]')
    .replace(/^\[?\s*Page\s+(\d+)\s*\]?$/gim, '[Page $1]');

  const lines = src.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

  // Pass 1: merge "[AS" + "PASSED" + "BY THE..." into one heading when broken
  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (!l) {
      merged.push('');
      continue;
    }
    if (l === '[' || l === '[AS' || /^\[\s*AS$/i.test(l)) {
      const parts = [l.replace(/^\[/, '').trim() || 'AS'];
      let j = i + 1;
      while (j < lines.length && parts.join(' ').length < 80) {
        const n = lines[j];
        if (!n) break;
        parts.push(n.replace(/\]$/, ''));
        j++;
        if (/ASSEMBLY/i.test(n) || n.endsWith(']')) break;
      }
      merged.push(`[${parts.join(' ').replace(/^\[/, '').replace(/\]$/, '').trim()}]`);
      i = j - 1;
      continue;
    }
    if (l === 'A' && lines[i + 1] === 'BILL') {
      merged.push('A BILL');
      i += 1;
      continue;
    }
    merged.push(l);
  }

  // Pass 2: paragraph reflow
  const out: string[] = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
    buf = '';
  };

  for (let i = 0; i < merged.length; i++) {
    const l = merged[i];
    if (!l) {
      flush();
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }

    if (/^\[Page\s+\d+\]$/i.test(l)) {
      flush();
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(l);
      out.push('');
      continue;
    }

    if (isHeadingLine(l) || isClauseStart(l)) {
      flush();
      // Indent sub-clauses
      if (isClauseStart(l) && !l.startsWith('  ')) out.push('  ' + l);
      else out.push(l);
      continue;
    }

    if (buf) {
      const glue = /[-–—]$/.test(buf) ? '' : ' ';
      buf += glue + l.replace(/^[-–—]\s*/, '');
    } else {
      buf = l;
    }

    const next = merged[i + 1];
    const endSentence = /[.:"”';]$/.test(l);
    if (
      endSentence &&
      next &&
      (isHeadingLine(next) || isClauseStart(next) || next === '' || /^\[Page/i.test(next))
    ) {
      flush();
    }
    // Soft wrap: if buffer is already a long paragraph, flush at sentence end
    if (endSentence && buf.length > 380) flush();
  }
  flush();

  let result = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If still badly broken, last-resort: join everything into wrapped paragraphs by blank breaks only
  if (isBrokenLayout(result)) {
    const blocks = raw
      .replace(/\r\n/g, '\n')
      .split(/\n\s*\n/)
      .map((b) =>
        b
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean)
          .join(' '),
      )
      .filter(Boolean);
    result = blocks.join('\n\n').trim();
    // Still one giant pile of short lines with no blanks — join all
    if (isBrokenLayout(result)) {
      result = raw
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+WHEREAS\s+/g, '\n\nWHEREAS ')
        .replace(/\s+AND WHEREAS\s+/g, '\n\nAND WHEREAS ')
        .replace(/\s+CHAPTER/g, '\n\nCHAPTER')
        .replace(/\s+(\d+\.\s+)/g, '\n\n$1')
        .replace(/\s+(\([0-9ivx]+\))/gi, '\n  $1')
        .replace(/\[\s*AS\s+PASSED\s+BY\s+THE\s+NATIONAL\s+ASSEMBLYI?\s*\]/gi, '[AS PASSED BY THE NATIONAL ASSEMBLY]')
        .replace(/\bprovidt\b/gi, 'provide')
        .replace(/\bLlgistics\b/gi, 'Logistics')
        .replace(/\bofNationutl\b/gi, 'of National')
        .replace(/\bCltpuatil\b/gi, 'Corporation')
        .replace(/\bASSEMBLYI\b/g, 'ASSEMBLY')
        .trim();
    }
  }

  // Light spelling fixes common on this bill scan
  result = result
    .replace(/\[\s*AS\s+PASSED\s+BY\s+THE\s+NATIONAL\s+ASSEMBLYI?\s*\]/gi, '[AS PASSED BY THE NATIONAL ASSEMBLY]')
    .replace(/\bprovidt\b/gi, 'provide')
    .replace(/\bLlgistics\b/gi, 'Logistics')
    .replace(/\bof\s*Nationutl\b/gi, 'of National')
    .replace(/\bofNationutl\b/gi, 'of National')
    .replace(/\bCltpuatil\b/gi, 'Corporation')
    .replace(/\bASSEMBLYI\b/g, 'ASSEMBLY')
    .replace(/\bherelbl\b/gi, 'hereby')
    .replace(/\bas lollous\b/gi, 'as follows')
    .replace(/\bCHAP\[ER\b/gi, 'CHAPTER');

  // Ensure classic bill structure breaks even after aggressive join
  result = result
    .replace(/(\[AS PASSED BY THE NATIONAL ASSEMBLY\])\s*/i, '$1\n\n')
    .replace(/\s+(A BILL)\s+/i, '\n\n$1\n')
    .replace(/\s+(WHEREAS\b)/gi, '\n\n$1')
    .replace(/\s+(AND WHEREAS\b)/gi, '\n\n$1')
    .replace(/\s+(It is hereby enacted[^\n]*)/gi, '\n\n$1\n')
    .replace(/\s+(CHAPTER[\-–—\s]*[IVX0-9]+)/gi, '\n\n$1\n')
    .replace(/\s+(PRELIMINARY)\b/gi, '\n$1\n\n')
    .replace(/\s+(\d+\.\s+[A-Z])/g, '\n\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return result;
}
