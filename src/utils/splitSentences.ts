/**
 * Splits text into sentences, respecting abbreviations, ellipses, and word-count limits.
 * Ported from ai-service splitTextIntoSentencesV2.
 * @param text - input text to split
 * @param maxWordsPerSentence - hard cap on words per output sentence (default 50)
 */
export function splitSentences(text: string, maxWordsPerSentence = 50): string[] {
  if (!text || text.trim().length === 0) return [];

  const abbreviations = new Set([
    'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'viz', 'i.e', 'e.g', 'ie', 'eg',
    'am', 'pm', 'a.m', 'p.m', 'ad', 'bc', 'b.c', 'a.d',
    'no', 'nos', 'vol', 'pp', 'ed', 'eds', 'rev', 'approx', 'est', 'min', 'max',
    'inc', 'ltd', 'corp', 'co', 'llc', 'st', 'ave', 'blvd', 'rd',
    'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
    'u.s', 'u.k', 'u.n', 'e.u', 'usa', 'nato', 'fbi', 'cia', 'irs', 'fda', 'epa',
    'ph.d', 'm.d', 'b.a', 'm.a', 'b.s', 'm.s', 'phd', 'md', 'ba', 'ma', 'bs', 'ms',
  ]);

  const sentences: string[] = [];
  let current = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    const nextChar = i + 1 < text.length ? text[i + 1] : '';
    const prevChar = i > 0 ? text[i - 1] : '';

    current += char;

    if (char === '.' || char === '!' || char === '?') {
      let isEndOfSentence = false;

      if (char === '.' && (prevChar === '.' || nextChar === '.')) {
        if (prevChar === '.' && /\s/.test(nextChar)) {
          const afterWs = text.slice(i + 1).trim();
          if (!afterWs[0] || !/[A-Z]/.test(afterWs[0])) { i++; continue; }
        } else { i++; continue; }
      }

      if (/\s/.test(nextChar) || nextChar === '') {
        const beforePunct = current.slice(0, -1).trim();
        const lastFewWords = beforePunct.split(/\s+/).slice(-3).join(' ');
        const lastWord = beforePunct.split(/\s+/).pop() || '';
        const lastWordClean = lastWord.toLowerCase().replace(/[^\w.]/g, '');
        const lastWordNoPeriod = lastWord.replace(/\.$/, '');
        const lastWordLower = lastWordNoPeriod.toLowerCase();

        const hasDecimal = /\d+\.\d+/.test(lastFewWords);
        const hasUrl = /(www\.|http:\/\/|https:\/\/|\.com|\.org|\.net|\.edu|\.gov|\.io)/i.test(lastFewWords);
        const isKnownAbbreviation = abbreviations.has(lastWordLower) || abbreviations.has(lastWordLower.replace(/\./g, ''));
        const isSingleLetterAbbr = /^[a-zA-Z]\.$/.test(lastWord);
        const allCapsWord = lastWordNoPeriod.replace(/[^\w]/g, '');
        const isAllCapsAbbr = /^[A-Z]{2,5}$/.test(allCapsWord);
        const allCapsWithPeriods = lastWord.replace(/[^\w.]/g, '');
        const isAllCapsPeriodAbbr = /^[A-Z](\.[A-Z])+\.?$/.test(allCapsWithPeriods);
        const isAcademicAbbr = /^(ph\.d|m\.d|b\.a|m\.a|b\.s|m\.s|phd|md|ba|ma|bs|ms)\.?$/i.test(lastWordClean);
        const isAbbreviation = isKnownAbbreviation || isSingleLetterAbbr || hasDecimal || hasUrl || isAllCapsAbbr || isAllCapsPeriodAbbr || isAcademicAbbr;

        const afterWhitespace = text.slice(i + 1).trim();
        const firstCharAfter = afterWhitespace[0] || '';
        const hasQuoteInSentence = /["']/.test(beforePunct);

        if (char === '!' || char === '?') {
          isEndOfSentence = true;
        } else if (firstCharAfter === '') {
          isEndOfSentence = true;
        } else if (isSingleLetterAbbr) {
          isEndOfSentence = false;
        } else if (hasDecimal || hasUrl) {
          isEndOfSentence = false;
        } else if (hasQuoteInSentence && /[A-Z]/.test(firstCharAfter) && !isAbbreviation) {
          isEndOfSentence = true;
        } else if (!isAbbreviation && /[A-Z]/.test(firstCharAfter)) {
          isEndOfSentence = true;
        } else if (isAllCapsAbbr && /[A-Z]/.test(firstCharAfter) && !isAllCapsPeriodAbbr) {
          isEndOfSentence = true;
        }
      } else if (nextChar === '') {
        isEndOfSentence = true;
      }

      if (isEndOfSentence) {
        sentences.push(current.trim());
        current = '';
        i++;
        while (i < text.length && /\s/.test(text[i])) i++;
        continue;
      }
    }

    i++;
  }

  if (current.trim().length > 0) sentences.push(current.trim());

  const result: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    if (words.length >= maxWordsPerSentence) {
      const remaining = [...words];
      while (remaining.length > maxWordsPerSentence) {
        result.push(remaining.splice(0, maxWordsPerSentence).join(' '));
      }
      if (remaining.length > 0) result.push(remaining.join(' '));
    } else {
      result.push(sentence);
    }
  }

  return result.filter(s => s.length > 0);
}
