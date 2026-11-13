/**
 * AeroPool — Commercial Driving Licence Normalization & Validation Engine
 * 
 * Target Regulatory Standard: Ministry of Road Transport and Highways (MoRTH),
 * Government of India — Sarathi National Driving Licence Registry Standard.
 * 
 * Standard Format: {State: 2 letters}{RTO: 2 digits}{Year: 4 digits}{Sequence: 7 digits}
 * Example canonical: MH0220210098765 (15 characters)
 * Permitted user representations: "MH-02-2021-0098765", "MH 02 2021 0098765", "mh02 20210098765"
 * 
 * Legacy formats (pre-Sarathi): 10 to 16 alphanumeric characters starting with valid state code.
 */

// Official 2-letter State & Union Territory codes recognized by MoRTH
export const VALID_INDIAN_STATE_CODES = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN',
  'GA', 'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD',
  'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ',
  'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB',
]);

export interface LicenseValidationResult {
  isValid: boolean;
  canonical: string;       // Normalized alphanumeric string for indexing and deduplication: e.g. "MH0220210098765"
  displayFormatted: string; // Human-friendly display string: e.g. "MH-02-2021-0098765"
  error?: string;
}

/**
 * Strips whitespace, hyphens, slashes, and converts to uppercase.
 * This canonical form MUST be used for all uniqueness checks and database indices.
 */
export function normalizeLicenseNumber(input?: string | null): string {
  if (!input) return '';
  return input.trim().replace(/[\s\-\/]/g, '').toUpperCase();
}

/**
 * Validates whether the given license number conforms to Indian Commercial Driving Licence standards.
 */
export function validateLicenseNumber(input?: string | null): LicenseValidationResult {
  if (!input || typeof input !== 'string') {
    return {
      isValid: false,
      canonical: '',
      displayFormatted: '',
      error: 'Commercial driving licence number is mandatory.',
    };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      canonical: '',
      displayFormatted: '',
      error: 'Commercial driving licence number cannot be empty or whitespace.',
    };
  }

  const canonical = normalizeLicenseNumber(input);

  // Character set check: must be alphanumeric only
  if (!/^[A-Z0-9]+$/.test(canonical)) {
    return {
      isValid: false,
      canonical,
      displayFormatted: trimmed,
      error: 'Licence number contains invalid characters. Only letters, digits, spaces, and hyphens are permitted.',
    };
  }

  // Length check: Indian DLs are between 10 and 16 characters
  if (canonical.length < 10 || canonical.length > 16) {
    return {
      isValid: false,
      canonical,
      displayFormatted: trimmed,
      error: `Invalid licence length (${canonical.length} characters). Standard Indian driving licences contain 10 to 16 alphanumeric characters.`,
    };
  }

  // State code validation: first 2 characters must be a recognized Indian State / UT code
  const stateCode = canonical.substring(0, 2);
  if (!VALID_INDIAN_STATE_CODES.has(stateCode)) {
    return {
      isValid: false,
      canonical,
      displayFormatted: trimmed,
      error: `Invalid state code "${stateCode}". Driving licence must begin with a recognized Indian state/UT code (e.g. MH, DL, KA).`,
    };
  }

  // Year validation for modern Sarathi format: characters 4-8 should be a plausible year (1970 - current year + 1)
  let displayFormatted = canonical;
  if (/^[A-Z]{2}[0-9]{13}$/.test(canonical)) {
    // Exact standard 15-char Sarathi format: SS RR YYYY NNNNNNN
    const state = canonical.substring(0, 2);
    const rto = canonical.substring(2, 4);
    const yearStr = canonical.substring(4, 8);
    const seq = canonical.substring(8);
    const year = parseInt(yearStr, 10);
    const currentYear = new Date().getFullYear();

    if (year >= 1970 && year <= currentYear + 1) {
      displayFormatted = `${state}-${rto}-${yearStr}-${seq}`;
    }
  } else if (/^[A-Z]{2}[0-9]{2}/.test(canonical)) {
    // General formatted split for readability
    displayFormatted = `${canonical.substring(0, 2)}-${canonical.substring(2, 4)}-${canonical.substring(4)}`;
  }

  return {
    isValid: true,
    canonical,
    displayFormatted,
  };
}

/**
 * Checks whether two licence inputs refer to the same commercial driving licence,
 * regardless of spacing, hyphens, or casing differences.
 */
export function areLicensesEqual(licA?: string | null, licB?: string | null): boolean {
  const normA = normalizeLicenseNumber(licA);
  const normB = normalizeLicenseNumber(licB);
  if (!normA || !normB) return false;
  return normA === normB;
}

