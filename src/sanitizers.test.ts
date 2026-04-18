import { describe, expect, it } from 'vitest';
import { sanitizeCsvCell, sanitizeLogInput, sanitizeForFilename, sanitizeForAI } from './sanitizers';

describe('sanitizeCsvCell', () => {
  it('prefixes = with quote', () => { expect(sanitizeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)"); });
  it('prefixes + with quote', () => { expect(sanitizeCsvCell('+cmd')).toBe("'+cmd"); });
  it('prefixes - with quote', () => { expect(sanitizeCsvCell('-cmd')).toBe("'-cmd"); });
  it('prefixes @ with quote', () => { expect(sanitizeCsvCell('@SUM')).toBe("'@SUM"); });
  it('passes safe values through', () => { expect(sanitizeCsvCell('hello')).toBe('hello'); });
  it('handles empty string', () => { expect(sanitizeCsvCell('')).toBe(''); });
});

describe('sanitizeLogInput', () => {
  it('strips newlines', () => { expect(sanitizeLogInput('line1\nline2')).toBe('line1 line2'); });
  it('strips carriage returns', () => { expect(sanitizeLogInput('a\rb')).toBe('a b'); });
  it('strips ANSI escapes', () => { expect(sanitizeLogInput('\x1b[31mred\x1b[0m')).toBe('red'); });
  it('truncates long strings', () => { expect(sanitizeLogInput('a'.repeat(2000)).length).toBeLessThanOrEqual(1001); });
  it('respects custom maxLength', () => { expect(sanitizeLogInput('abcdef', 3)).toBe('abc\u2026'); });
});

describe('sanitizeForFilename', () => {
  it('strips path separators', () => { expect(sanitizeForFilename('../../etc/passwd')).toBe('._._etc_passwd'); });
  it('strips null bytes', () => { expect(sanitizeForFilename('file\x00.txt')).toBe('file_.txt'); });
  it('strips special chars', () => { expect(sanitizeForFilename('a:b*c?d')).toBe('a_b_c_d'); });
  it('collapses double dots', () => { expect(sanitizeForFilename('file..txt')).toBe('file.txt'); });
  it('returns unnamed for empty', () => { expect(sanitizeForFilename('')).toBe('unnamed'); });
  it('limits length to 255', () => { expect(sanitizeForFilename('a'.repeat(300)).length).toBeLessThanOrEqual(255); });
});

describe('sanitizeForAI', () => {
  it('redacts email addresses', () => {
    expect(sanitizeForAI('Contact john@example.com')).toBe('Contact [EMAIL]');
  });

  it('redacts Austrian IBAN', () => {
    expect(sanitizeForAI('IBAN: AT61 1904 3002 3457 3201')).toBe('IBAN: [IBAN]');
  });

  it('redacts German IBAN', () => {
    expect(sanitizeForAI('IBAN: DE89 3704 0044 0532 0130 00')).toBe('IBAN: [IBAN]');
  });

  it('redacts Vienna landline 01 format', () => {
    expect(sanitizeForAI('Call 01 234 5678')).toBe('Call [PHONE]');
  });

  it('redacts Austrian mobile +43', () => {
    expect(sanitizeForAI('Mobile: +43 664 1234567')).toBe('Mobile: [PHONE]');
  });

  it('redacts Vienna international +43 1', () => {
    expect(sanitizeForAI('Tel: +43 1 234 5678')).toBe('Tel: [PHONE]');
  });

  it('redacts Austrian UID', () => {
    expect(sanitizeForAI('UID: ATU12345678')).toBe('UID: [TAX_ID]');
  });

  it('redacts credit card numbers', () => {
    expect(sanitizeForAI('Card: 4111 1111 1111 1111')).toBe('Card: [CC]');
  });

  it('redacts IPv4 addresses', () => {
    expect(sanitizeForAI('Server: 192.168.1.1')).toBe('Server: [IP]');
  });

  it('preserves non-PII text unchanged', () => {
    expect(sanitizeForAI('Revenue was 50000 EUR in Q1')).toBe('Revenue was 50000 EUR in Q1');
  });

  it('redacts Austrian social security number (SVNr)', () => {
    expect(sanitizeForAI('SVNr: 1234 010190')).toBe('SVNr: [SVNR]');
  });

  it('handles custom patterns', () => {
    const result = sanitizeForAI('Order ORD-12345', {
      customPatterns: [{ pattern: /ORD-\d+/g, replacement: '[ORDER_ID]' }],
    });
    expect(result).toBe('Order [ORDER_ID]');
  });
});
