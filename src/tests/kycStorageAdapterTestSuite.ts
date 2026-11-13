import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  LocalStorageAdapter,
  SupabaseStorageAdapter,
  getKycStorageProvider,
  setMockSupabaseStorageClient,
  clearMockSupabaseStorageClient,
  validateMagicBytes,
  StoredKycDocument,
} from '../../server/kycStorageService';
import { TestResult } from './testSuite';

export async function runKycStorageAdapterTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Valid JPEG header buffer: FF D8 FF E0
  const sampleJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  // =========================================================================
  // 1. Storage Abstraction: Provider selection via explicit configuration
  // =========================================================================
  const startT1 = performance.now();
  const localProvider = getKycStorageProvider('local');
  const supabaseProvider = getKycStorageProvider('supabase');
  const defaultProvider = getKycStorageProvider(); // Unspecified -> defaults to local in sandbox

  const t1_pass =
    localProvider.backend === 'local_disk' &&
    supabaseProvider.backend === 'supabase_storage' &&
    defaultProvider.backend === 'local_disk';

  results.push({
    name: 'Storage Abstraction: Provider selection determines active adapter (local vs supabase)',
    category: 'PERSISTENCE',
    passed: Boolean(t1_pass),
    message: t1_pass
      ? 'Verified: getKycStorageProvider correctly resolves LocalStorageAdapter (local_disk) and SupabaseStorageAdapter (supabase_storage).'
      : 'Failed: Provider resolution returned unexpected backend type.',
    durationMs: Number((performance.now() - startT1).toFixed(2)),
  });

  // =========================================================================
  // 2. Local Storage Adapter: Binary upload and retrieval
  // =========================================================================
  const startT2 = performance.now();
  const testDriverId = 'drv_adapter_test_01';
  const localAdapter = new LocalStorageAdapter();

  const uploadResult = await localAdapter.upload({
    driverId: testDriverId,
    documentType: 'DRIVING_LICENSE_FRONT',
    documentNumber: 'MH0220220011223',
    expiryDate: '2032-10-15',
    fileName: 'dl_front.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: sampleJpeg,
  });

  let binaryRetrieved: Buffer | null = null;
  if (uploadResult.success && uploadResult.document) {
    binaryRetrieved = await localAdapter.getBinary(uploadResult.document);
  }

  const t2_pass =
    uploadResult.success &&
    uploadResult.document?.storageBackend === 'local_disk' &&
    uploadResult.document.storagePath.includes(`drivers/${testDriverId}/DRIVING_LICENSE_FRONT/`) &&
    binaryRetrieved !== null &&
    binaryRetrieved.length === sampleJpeg.length &&
    binaryRetrieved[0] === 0xff &&
    binaryRetrieved[1] === 0xd8;

  results.push({
    name: 'Local Storage Adapter: Binary upload, path isolation, and byte retrieval',
    category: 'PERSISTENCE',
    passed: Boolean(t2_pass),
    message: t2_pass
      ? `Verified: Uploaded and retrieved ${sampleJpeg.length} bytes from local vault path ${uploadResult.document?.storagePath}.`
      : 'Failed: Local storage upload or binary retrieval failed.',
    durationMs: Number((performance.now() - startT2).toFixed(2)),
  });

  // =========================================================================
  // 3. Local Storage Adapter: Restart persistence via disk registry
  // =========================================================================
  const startT3 = performance.now();
  const registryPath = path.resolve(process.cwd(), 'server', 'storage', 'kyc-vault', 'kyc_registry.json');
  const registryExists = fs.existsSync(registryPath);
  let indexedInRegistry = false;

  if (registryExists && uploadResult.document) {
    try {
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      indexedInRegistry = Array.isArray(data) && data.some((d: any) => d.id === uploadResult.document?.id);
    } catch {
      indexedInRegistry = false;
    }
  }

  const t3_pass = registryExists && indexedInRegistry;

  results.push({
    name: 'Local Storage Adapter: In-memory registry persists to disk for process restart rehydration',
    category: 'PERSISTENCE',
    passed: Boolean(t3_pass),
    message: t3_pass
      ? 'Verified: kyc_registry.json persisted on disk containing uploaded document ID, preventing 404s on backend restart.'
      : 'Failed: Registry file missing or document ID was not indexed.',
    durationMs: Number((performance.now() - startT3).toFixed(2)),
  });

  // =========================================================================
  // 4. Local Storage Adapter: Magic bytes validation blocks disguised files (CWE-434)
  // =========================================================================
  const startT4 = performance.now();
  const maliciousScript = Buffer.from('#!/bin/bash\necho "malicious"\n');
  const spoofUpload = await localAdapter.upload({
    driverId: testDriverId,
    documentType: 'VEHICLE_RC',
    documentNumber: 'MH02EK1122',
    fileName: 'rc.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: maliciousScript,
  });

  const t4_pass =
    !spoofUpload.success &&
    Boolean(spoofUpload.error?.includes('tampered or corrupted file rejected'));

  results.push({
    name: 'Local Storage Adapter: Magic Bytes validation strictly blocks executable script uploads (CWE-434)',
    category: 'SECURITY',
    passed: Boolean(t4_pass),
    message: t4_pass
      ? 'Verified: Disguised shell script with image/jpeg header was rejected by magic bytes engine.'
      : 'Failed: Executable script disguised as image was accepted.',
    durationMs: Number((performance.now() - startT4).toFixed(2)),
  });

  // =========================================================================
  // 5. Local Storage Adapter: Path traversal sanitization (CWE-22)
  // =========================================================================
  const startT5 = performance.now();
  const traversalAttempt = await localAdapter.upload({
    driverId: '../../evil_driver',
    documentType: 'VEHICLE_INSURANCE',
    documentNumber: 'POL-TRAVERSAL-01',
    fileName: '../../../../etc/shadow.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: sampleJpeg,
  });

  const t5_pass =
    traversalAttempt.success &&
    traversalAttempt.document !== undefined &&
    !traversalAttempt.document.storagePath.includes('..') &&
    traversalAttempt.document.driverId === 'evil_driver';

  results.push({
    name: 'Local Storage Adapter: Path traversal sequences sanitized to prevent vault boundary escape (CWE-22)',
    category: 'SECURITY',
    passed: Boolean(t5_pass),
    message: t5_pass
      ? `Verified: Traversal sequences stripped; constrained to object path: ${traversalAttempt.document?.storagePath}`
      : 'Failed: Path traversal allowed escaped storage directory.',
    durationMs: Number((performance.now() - startT5).toFixed(2)),
  });

  // =========================================================================
  // 6. Supabase Storage Adapter: Object path formatting correctness
  // =========================================================================
  const startT6 = performance.now();
  const capturedCalls: Array<{ bucket: string; path: string; options: any; buffer: Buffer }> = [];

  const mockSupabaseClient = {
    storage: {
      from: (bucket: string) => ({
        upload: async (objectPath: string, buffer: Buffer, options: any) => {
          capturedCalls.push({ bucket, path: objectPath, options, buffer });
          return { data: { path: objectPath }, error: null };
        },
        createSignedUrl: async (objectPath: string, expiresIn: number) => {
          return {
            data: { signedUrl: `https://test-project.supabase.co/storage/v1/object/sign/kyc-vault/${objectPath}?token=mock_token_123` },
            error: null,
          };
        },
        download: async (objectPath: string) => {
          return { data: sampleJpeg, error: null };
        },
      }),
    },
  };

  setMockSupabaseStorageClient(mockSupabaseClient);
  const supabaseAdapter = new SupabaseStorageAdapter();

  const supabaseUploadResult = await supabaseAdapter.upload({
    driverId: 'drv_supabase_test_99',
    documentType: 'DRIVING_LICENSE_BACK',
    documentNumber: 'MH0120230044556',
    expiryDate: '2033-05-20',
    fileName: 'dl_back.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: sampleJpeg,
  });

  const uploadedPath = capturedCalls[0]?.path || '';
  const expectedPathRegex = /^drivers\/drv_supabase_test_99\/DRIVING_LICENSE_BACK\/driving_license_back_\d+_[a-f0-9]+\.jpg$/;

  const t6_pass =
    supabaseUploadResult.success &&
    capturedCalls.length === 1 &&
    capturedCalls[0].bucket === 'kyc-vault' &&
    expectedPathRegex.test(uploadedPath) &&
    capturedCalls[0].options?.upsert === false &&
    supabaseUploadResult.document?.storageBackend === 'supabase_storage' &&
    supabaseUploadResult.document.storagePath === uploadedPath;

  results.push({
    name: 'Supabase Storage Adapter: Object path strictly formatted as drivers/<driverId>/<docType>/<fileName>',
    category: 'PERSISTENCE',
    passed: Boolean(t6_pass),
    message: t6_pass
      ? `Verified: Cloud object path correctly formatted: "${uploadedPath}" in bucket "${capturedCalls[0]?.bucket}".`
      : `Failed: Object path "${uploadedPath}" did not match expected structure.`,
    durationMs: Number((performance.now() - startT6).toFixed(2)),
  });

  // =========================================================================
  // 7. Supabase Storage Adapter: Short-lived signed preview generation
  // =========================================================================
  const startT7 = performance.now();
  let signedPreviewUrl: string | null = null;
  if (supabaseUploadResult.document) {
    signedPreviewUrl = await supabaseAdapter.createSignedPreview(supabaseUploadResult.document, 900);
  }

  const t7_pass =
    signedPreviewUrl !== null &&
    signedPreviewUrl.includes('https://') &&
    signedPreviewUrl.includes('/storage/v1/object/sign/kyc-vault/drivers/drv_supabase_test_99/') &&
    signedPreviewUrl.includes('token=') &&
    // Ensure signed URL is NOT permanently saved into storagePath
    !supabaseUploadResult.document?.storagePath.includes('token=');

  results.push({
    name: 'Supabase Storage Adapter: Short-lived signed preview URL generated without permanent URL persistence',
    category: 'SECURITY',
    passed: Boolean(t7_pass),
    message: t7_pass
      ? `Verified: 15-minute signed URL generated for private bucket object; permanent storagePath retains clean object path only.`
      : 'Failed: Signed preview URL generation failed or leaked into permanent storagePath.',
    durationMs: Number((performance.now() - startT7).toFixed(2)),
  });

  // =========================================================================
  // 8. Supabase Storage Adapter: Binary download from cloud storage
  // =========================================================================
  const startT8 = performance.now();
  let downloadedBinary: Buffer | null = null;
  if (supabaseUploadResult.document) {
    downloadedBinary = await supabaseAdapter.getBinary(supabaseUploadResult.document);
  }

  const t8_pass =
    downloadedBinary !== null &&
    downloadedBinary.length === sampleJpeg.length &&
    downloadedBinary[0] === 0xff &&
    downloadedBinary[1] === 0xd8;

  results.push({
    name: 'Supabase Storage Adapter: Binary retrieval streams cloud storage object bytes for secure server preview',
    category: 'INTEGRATION',
    passed: Boolean(t8_pass),
    message: t8_pass
      ? `Verified: Retrieved ${downloadedBinary?.length} bytes from Supabase Storage mock client.`
      : 'Failed: Could not retrieve binary from Supabase Storage adapter.',
    durationMs: Number((performance.now() - startT8).toFixed(2)),
  });

  // =========================================================================
  // 9. Supabase Storage Adapter: Failed upload handling — Zero silent fallback
  // =========================================================================
  const startT9 = performance.now();
  const failingMockClient = {
    storage: {
      from: () => ({
        upload: async () => ({
          data: null,
          error: { message: 'Bucket not found: kyc-vault' },
        }),
      }),
    },
  };

  setMockSupabaseStorageClient(failingMockClient);

  const failedUploadResult = await supabaseAdapter.upload({
    driverId: 'drv_fail_test_01',
    documentType: 'VEHICLE_PUC',
    documentNumber: 'PUC-FAIL-01',
    fileName: 'puc.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: sampleJpeg,
  });

  // Ensure local disk did NOT silently store this file
  const localDiskEscapePath = path.resolve(process.cwd(), 'server', 'storage', 'kyc-vault', 'drv_fail_test_01');
  const silentFallbackDetected = fs.existsSync(localDiskEscapePath);

  const t9_pass =
    !failedUploadResult.success &&
    failedUploadResult.error?.includes('Supabase Storage upload failed: Bucket not found: kyc-vault') &&
    !silentFallbackDetected;

  results.push({
    name: 'Supabase Storage Adapter: Explicit failure propagation with zero silent fallback to local disk',
    category: 'SECURITY',
    passed: Boolean(t9_pass),
    message: t9_pass
      ? 'Verified: Supabase storage failure returned explicit error; silent fallback to local disk strictly prevented in cloud mode.'
      : 'Failed: Upload succeeded or silently fell back to local disk.',
    durationMs: Number((performance.now() - startT9).toFixed(2)),
  });

  // =========================================================================
  // 10. Supabase Storage Adapter: Network failure exception handling
  // =========================================================================
  const startT10 = performance.now();
  const networkErrorMockClient = {
    storage: {
      from: () => ({
        upload: async () => {
          throw new Error('ETIMEDOUT: Connection to storage.supabase.co failed');
        },
      }),
    },
  };

  setMockSupabaseStorageClient(networkErrorMockClient);

  const networkErrorResult = await supabaseAdapter.upload({
    driverId: 'drv_network_test_02',
    documentType: 'IDENTITY_PROOF',
    documentNumber: 'AADHAAR-9988',
    fileName: 'aadhaar.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: sampleJpeg,
  });

  const t10_pass =
    !networkErrorResult.success &&
    Boolean(networkErrorResult.error?.includes('Supabase Storage network error: ETIMEDOUT'));

  results.push({
    name: 'Supabase Storage Adapter: Network failure resilience and structured error response',
    category: 'INTEGRATION',
    passed: Boolean(t10_pass),
    message: t10_pass
      ? 'Verified: Network timeout exception caught safely and returned as structured error message without crash.'
      : 'Failed: Network timeout exception unhandled.',
    durationMs: Number((performance.now() - startT10).toFixed(2)),
  });

  // =========================================================================
  // 11. Document Lifecycle: Non-destructive document replacement
  // =========================================================================
  const startT11 = performance.now();
  setMockSupabaseStorageClient(mockSupabaseClient);
  capturedCalls.length = 0; // reset

  // Initial upload
  const docVersion1 = await supabaseAdapter.upload({
    driverId: 'drv_lifecycle_01',
    documentType: 'DRIVING_LICENSE_FRONT',
    documentNumber: 'MH022020001',
    fileName: 'dl_front_v1.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: sampleJpeg,
  });

  // Replacement / re-upload after rejection
  const docVersion2 = await supabaseAdapter.upload({
    driverId: 'drv_lifecycle_01',
    documentType: 'DRIVING_LICENSE_FRONT',
    documentNumber: 'MH022020001',
    fileName: 'dl_front_v2.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: sampleJpeg,
  });

  const t11_pass =
    docVersion1.success &&
    docVersion2.success &&
    docVersion1.document?.storagePath !== docVersion2.document?.storagePath &&
    capturedCalls.length === 2 &&
    capturedCalls[0].path !== capturedCalls[1].path &&
    capturedCalls[0].options?.upsert === false &&
    capturedCalls[1].options?.upsert === false;

  results.push({
    name: 'Document Lifecycle: Non-destructive document replacement preserves historical audit records',
    category: 'STATE_MACHINE',
    passed: Boolean(t11_pass),
    message: t11_pass
      ? `Verified: Re-uploaded document generated distinct unique object path without overwriting prior scan (upsert=false).`
      : 'Failed: Document replacement collided with or overwrote prior object path.',
    durationMs: Number((performance.now() - startT11).toFixed(2)),
  });

  // Clear mock client after test suite completion
  clearMockSupabaseStorageClient();

  return results;
}

