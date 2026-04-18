/**
 * Sanitize a value for safe CSV cell inclusion.
 * Prefixes dangerous characters (=, +, -, @, \t, \r) with a single quote
 * to prevent CSV formula injection (CWE-1236, SEC-016).
 */
export function sanitizeCsvCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`
  }
  return value
}

/**
 * Sanitize a value for safe log output.
 * Strips newlines, carriage returns, and ANSI escape sequences.
 * Truncates to maxLength (default 1000) to prevent log flooding (SEC-016).
 */
export function sanitizeLogInput(value: string, maxLength = 1000): string {
  const cleaned = value
    .replace(/[\n\r]/g, ' ')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) + '\u2026' : cleaned
}

/**
 * Sanitize a value for safe use as a filename.
 * Strips path separators, null bytes, and special characters.
 * Limits length to maxLength (default 255).
 */
export function sanitizeForFilename(value: string): string {
  const cleaned = value
    .replace(/[\x00/\\:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
  return cleaned.slice(0, 255) || 'unnamed'
}

export interface SanitizeForAIOptions {
  customPatterns?: Array<{ pattern: RegExp; replacement: string }>
}

/**
 * Strip PII/sensitive data before sending text to LLM APIs.
 * Replaces emails, phone numbers, IBANs, tax IDs, credit cards,
 * and IP addresses with safe placeholders.
 *
 * Compliance: SEC-010 (data minimization), OWASP LLM02 (prompt injection / data leakage).
 *
 * Custom patterns are applied AFTER all default replacements,
 * allowing callers to extend coverage for domain-specific PII.
 *
 * @example
 * sanitizeForAI('Contact joe@example.com or +43 660 1234567')
 * // → 'Contact [EMAIL] or [PHONE]'
 *
 * @example
 * sanitizeForAI('ID: CUST-9999', {
 *   customPatterns: [{ pattern: /CUST-\d+/g, replacement: '[CUSTOMER_ID]' }]
 * })
 * // → 'ID: [CUSTOMER_ID]'
 */
export function sanitizeForAI(text: string, options?: SanitizeForAIOptions): string {
  let result = text

  // Email addresses
  result = result.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]'
  )

  // Austrian/German phone numbers: +43..., 0043..., 06xx..., 01...
  // Austrian international: +43/0043 followed by area code (1-4 digits) + subscriber number
  result = result.replace(
    /(?:\+43|0043)[\s.\-/]?\d{1,4}[\s.\-/]?\d{2,4}[\s.\-/]?\d{2,8}/g,
    '[PHONE]'
  )
  result = result.replace(
    /\b06\d{1,2}[\s.\-/]?\d{3,4}[\s.\-/]?\d{3,5}\b/g,
    '[PHONE]'
  )
  // Vienna landline: 01 followed by 7-8 digits (with optional separators)
  result = result.replace(/\b01[\s.\-/]?\d{3}[\s.\-/]?\d{3,4}\b/g, '[PHONE]')

  // IBANs (AT: 2 letter + 2 check + 16 digits = 20 chars, DE: 2 letter + 2 check + 18 digits = 22 chars)
  result = result.replace(
    /\b(?:AT|DE)\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{0,4}[\s]?\d{0,4}\b/g,
    '[IBAN]'
  )

  // Austrian social security number (SVNr): NNNN DDMMYY
  result = result.replace(
    /\b\d{4}[\s]?(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])\d{2}\b/g,
    '[SVNR]'
  )

  // Austrian UID numbers (ATU + 8 digits)
  result = result.replace(
    /\bATU\d{8}\b/g,
    '[TAX_ID]'
  )

  // Austrian Steuernummer (XX-XXX/XXXX pattern)
  result = result.replace(
    /\b\d{2}-\d{3}\/\d{4}\b/g,
    '[TAX_ID]'
  )

  // Credit card numbers (4 groups of 4 digits with optional separators)
  result = result.replace(
    /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
    '[CC]'
  )

  // IPv6 addresses (simplified: at least two groups separated by colons, with optional :: shorthand)
  result = result.replace(
    /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    '[IP]'
  )
  result = result.replace(
    /\b(?:[0-9a-fA-F]{1,4}:){1,7}:[0-9a-fA-F]{0,4}\b/g,
    '[IP]'
  )
  result = result.replace(
    /\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b/g,
    '[IP]'
  )

  // IPv4 addresses
  result = result.replace(
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    '[IP]'
  )

  // Custom patterns (applied after defaults)
  if (options?.customPatterns) {
    for (const { pattern, replacement } of options.customPatterns) {
      result = result.replace(pattern, replacement)
    }
  }

  return result
}
