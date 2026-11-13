-- ============================================================================
-- AEROPOOL PRODUCTION MIGRATION: LICENSE NUMBER NORMALIZATION & RESILIENT KYC
-- Migration: 20261110000000_normalized_license_and_resilient_kyc.sql
-- Date: 2026-11-10
-- Purpose: Functional uniqueness on normalized license number & empty-string rejection
-- Regulatory Standard: MoRTH Sarathi National Driving Licence Registry
-- ============================================================================

-- 1. Check Constraint: Reject empty, whitespace-only, or sub-length license numbers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_profiles_license_not_empty'
  ) THEN
    ALTER TABLE driver_profiles
      ADD CONSTRAINT chk_driver_profiles_license_not_empty
      CHECK (length(trim(regexp_replace(license_number, '[\s\-\/]', '', 'g'))) >= 10);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Functional Unique Index on Canonical Normalized License Number
-- Strips all internal spaces, hyphens, and slashes, and enforces case insensitivity.
-- Prevents collision variations like "MH-02 2021 0098765" vs "MH0220210098765".
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_profiles_clean_license
ON driver_profiles (regexp_replace(UPPER(license_number), '[\s\-\/]', '', 'g'));

-- 3. Document Number Check Constraint on driver_documents (Commercial Driving Licence rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_driver_documents_dl_not_empty'
  ) THEN
    ALTER TABLE driver_documents
      ADD CONSTRAINT chk_driver_documents_dl_not_empty
      CHECK (
        document_type NOT IN ('DRIVING_LICENSE', 'DRIVING_LICENSE_FRONT', 'DRIVING_LICENSE_BACK')
        OR length(trim(regexp_replace(document_number, '[\s\-\/]', '', 'g'))) >= 10
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

