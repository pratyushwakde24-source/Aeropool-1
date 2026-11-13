-- ============================================================================
-- AEROPOOL PRODUCTION MIGRATION: DRIVER ONBOARDING, KYC STORAGE & COMPLIANCE
-- Date: 2026-11-09
-- Scope: Schema extension for document expiries, vehicle compliance, and private kyc-vault storage
-- ============================================================================

-- 1. Extend driver_profiles with license expiry date
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS license_expiry_date DATE;

-- 2. Extend driver_documents with metadata and expiry tracking
ALTER TABLE driver_documents
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS file_size_bytes INT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS sha256_checksum TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_backend TEXT DEFAULT 'supabase_storage';

-- 2b. Expand document_type CHECK constraint to support new KYC and compliance document types
ALTER TABLE driver_documents 
  DROP CONSTRAINT IF EXISTS driver_documents_document_type_check;

ALTER TABLE driver_documents
  ADD CONSTRAINT driver_documents_document_type_check
  CHECK (document_type IN (
    'DRIVING_LICENSE',
    'DRIVING_LICENSE_FRONT',
    'DRIVING_LICENSE_BACK',
    'VEHICLE_RC',
    'COMMERCIAL_PERMIT',
    'POLICE_VERIFICATION',
    'VEHICLE_INSURANCE',
    'VEHICLE_PUC',
    'IDENTITY_PROOF'
  ));

-- 3. Extend vehicles table with color, RC, insurance and PUC expiry dates
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS rc_number TEXT,
  ADD COLUMN IF NOT EXISTS rc_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS puc_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 4. Enforce uniqueness on driving license numbers to prevent duplicate accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_driver_profiles_license_number'
  ) THEN
    ALTER TABLE driver_profiles
      ADD CONSTRAINT uq_driver_profiles_license_number UNIQUE (license_number);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- 5. Storage Bucket: kyc-vault (Private, Encrypted Airport Commercial Driver Vault)
-- Note: Requires Supabase storage extension enabled
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-vault',
  'kyc-vault',
  FALSE,
  5242880, -- 5 MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET 
  public = FALSE,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- 6. Storage Security Policies for kyc-vault (Row Level Security on storage.objects)
-- Policy A: Drivers can upload documents into their own partitioned folder
DROP POLICY IF EXISTS "Drivers can upload their own KYC documents" ON storage.objects;
CREATE POLICY "Drivers can upload their own KYC documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kyc-vault'
  AND (storage.foldername(name))[1] = 'drivers'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy B: Drivers can read only their own documents
DROP POLICY IF EXISTS "Drivers can view their own KYC documents" ON storage.objects;
CREATE POLICY "Drivers can view their own KYC documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'kyc-vault'
  AND (storage.foldername(name))[1] = 'drivers'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Policy C: Super Admins have full access to review and audit all driver KYC documents
-- Uses the SECURITY DEFINER function public.is_admin() to prevent RLS recursion
DROP POLICY IF EXISTS "Super Admins have full access to kyc-vault" ON storage.objects;
CREATE POLICY "Super Admins have full access to kyc-vault"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'kyc-vault'
  AND (public.is_admin())
);

