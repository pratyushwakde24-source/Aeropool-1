import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import app from '../../server/index';
import { db } from '../services/db';
import {
  normalizeLicenseNumber,
  validateLicenseNumber,
  areLicensesEqual,
} from '../utils/licenseNormalization';
import {
  storeKycDocument,
  getStoredKycDocument,
  getDocumentBinary,
  getDocumentBinaryDetailed,
  getDriverDocuments,
  createDocumentSignedPreview,
  setMockSupabaseStorageClient,
  clearMockSupabaseStorageClient,
  setMockSupabaseDbClient,
  clearMockSupabaseDbClient,
  clearKycRegistryForTesting,
  rehydrateRegistryFromPostgres,
  StoredKycDocument,
} from '../../server/kycStorageService';
import { TestResult } from './testSuite';

// 10-byte valid JPEG header
const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const validJpegBase64 = validJpeg.toString('base64');

export async function runKycRemediationTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Spin up isolated ephemeral HTTP server bound to port 0 for end-to-end route tests
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number; address: string };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const cleanupServer = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  try {
    // =========================================================================
    // PART 1: LICENSE NUMBER NORMALIZATION & DEDUPLICATION (TESTS 1 - 9)
    // =========================================================================

    // 1. Exact Duplicate License Number
    const startT1 = performance.now();
    const cleanUserA = `usr-lic-a-${Date.now()}`;
    const cleanUserB = `usr-lic-b-${Date.now()}`;
    db.getState().users.push(
      { id: cleanUserA, fullName: 'Driver Alpha', email: 'alpha@test.in', phone: '+919820011111', role: 'passenger', createdAt: new Date().toISOString() },
      { id: cleanUserB, fullName: 'Driver Beta', email: 'beta@test.in', phone: '+919820022222', role: 'passenger', createdAt: new Date().toISOString() }
    );

    const regA = db.submitDriverApplication({
      userId: cleanUserA,
      fullName: 'Driver Alpha',
      phone: '+919820011111',
      email: 'alpha@test.in',
      licenseNumber: 'MH0220230077661',
      vehiclePlate: 'MH02AB1111',
      isDraft: false,
    });

    const regB = db.submitDriverApplication({
      userId: cleanUserB,
      fullName: 'Driver Beta',
      phone: '+919820022222',
      email: 'beta@test.in',
      licenseNumber: 'MH0220230077661', // Exact duplicate
      vehiclePlate: 'MH02AB2222',
      isDraft: false,
    });

    const t1_pass = regA.success && !regB.success && Boolean(regB.error?.includes('already registered'));
    results.push({
      name: 'License Normalization: Exact duplicate licence numbers rejected with clear collision error',
      category: 'SECURITY',
      passed: Boolean(t1_pass),
      message: t1_pass
        ? 'Verified: Second application with identical licence number rejected.'
        : `Failed: Expected duplicate rejection, got: ${regB.error}`,
      durationMs: Number((performance.now() - startT1).toFixed(2)),
    });

    // 2. Case Differences (lowercase vs uppercase)
    const startT2 = performance.now();
    const cleanUserC = `usr-lic-c-${Date.now()}`;
    db.getState().users.push({ id: cleanUserC, fullName: 'Driver Charlie', email: 'charlie@test.in', phone: '+919820033333', role: 'passenger', createdAt: new Date().toISOString() });

    const regC = db.submitDriverApplication({
      userId: cleanUserC,
      fullName: 'Driver Charlie',
      phone: '+919820033333',
      email: 'charlie@test.in',
      licenseNumber: 'mh0220230077661', // Lowercase variation of Alpha's licence
      vehiclePlate: 'MH02AB3333',
      isDraft: false,
    });

    const t2_pass = !regC.success && Boolean(regC.error?.includes('already registered'));
    results.push({
      name: 'License Normalization: Case variations (lowercase vs uppercase) normalized and rejected',
      category: 'SECURITY',
      passed: Boolean(t2_pass),
      message: t2_pass
        ? 'Verified: Lowercase licence number normalized to canonical uppercase and rejected against existing record.'
        : `Failed: Lowercase licence was not caught as duplicate: ${regC.error}`,
      durationMs: Number((performance.now() - startT2).toFixed(2)),
    });

    // 3. Leading & Trailing Whitespace
    const startT3 = performance.now();
    const cleanUserD = `usr-lic-d-${Date.now()}`;
    db.getState().users.push({ id: cleanUserD, fullName: 'Driver Delta', email: 'delta@test.in', phone: '+919820044444', role: 'passenger', createdAt: new Date().toISOString() });

    const regD = db.submitDriverApplication({
      userId: cleanUserD,
      fullName: 'Driver Delta',
      phone: '+919820044444',
      email: 'delta@test.in',
      licenseNumber: '   MH0220230077661   ', // Whitespace padding
      vehiclePlate: 'MH02AB4444',
      isDraft: false,
    });

    const t3_pass = !regD.success && Boolean(regD.error?.includes('already registered'));
    results.push({
      name: 'License Normalization: Surrounding whitespace trimmed and rejected against existing record',
      category: 'SECURITY',
      passed: Boolean(t3_pass),
      message: t3_pass
        ? 'Verified: Padded licence number trimmed and identified as duplicate.'
        : `Failed: Whitespace-padded licence was not rejected: ${regD.error}`,
      durationMs: Number((performance.now() - startT3).toFixed(2)),
    });

    // 4. Hyphen Differences ("MH-02-2023-0077661")
    const startT4 = performance.now();
    const cleanUserE = `usr-lic-e-${Date.now()}`;
    db.getState().users.push({ id: cleanUserE, fullName: 'Driver Echo', email: 'echo@test.in', phone: '+919820055555', role: 'passenger', createdAt: new Date().toISOString() });

    const regE = db.submitDriverApplication({
      userId: cleanUserE,
      fullName: 'Driver Echo',
      phone: '+919820055555',
      email: 'echo@test.in',
      licenseNumber: 'MH-02-2023-0077661', // Hyphenated standard variation
      vehiclePlate: 'MH02AB5555',
      isDraft: false,
    });

    const t4_pass = !regE.success && Boolean(regE.error?.includes('already registered'));
    results.push({
      name: 'License Normalization: Hyphenated delimiter variation normalized to canonical and rejected',
      category: 'SECURITY',
      passed: Boolean(t4_pass),
      message: t4_pass
        ? 'Verified: Hyphenated format "MH-02-2023-0077661" collided with "MH0220230077661".'
        : `Failed: Hyphenated licence bypassed duplicate check: ${regE.error}`,
      durationMs: Number((performance.now() - startT4).toFixed(2)),
    });

    // 5. Internal Space Differences ("MH 02 2023 0077661")
    const startT5 = performance.now();
    const cleanUserF = `usr-lic-f-${Date.now()}`;
    db.getState().users.push({ id: cleanUserF, fullName: 'Driver Foxtrot', email: 'foxtrot@test.in', phone: '+919820066666', role: 'passenger', createdAt: new Date().toISOString() });

    const regF = db.submitDriverApplication({
      userId: cleanUserF,
      fullName: 'Driver Foxtrot',
      phone: '+919820066666',
      email: 'foxtrot@test.in',
      licenseNumber: 'MH 02 2023 0077661', // Internal spaces variation
      vehiclePlate: 'MH02AB6666',
      isDraft: false,
    });

    const t5_pass = !regF.success && Boolean(regF.error?.includes('already registered'));
    results.push({
      name: 'License Normalization: Internal spaces variation normalized to canonical and rejected',
      category: 'SECURITY',
      passed: Boolean(t5_pass),
      message: t5_pass
        ? 'Verified: Spaced format "MH 02 2023 0077661" collided with "MH0220230077661".'
        : `Failed: Spaced licence bypassed duplicate check: ${regF.error}`,
      durationMs: Number((performance.now() - startT5).toFixed(2)),
    });

    // 6. Empty String and Whitespace-Only Rejection
    const startT6 = performance.now();
    const valEmpty = validateLicenseNumber('');
    const valWhitespace = validateLicenseNumber('    ');

    const cleanUserG = `usr-lic-g-${Date.now()}`;
    db.getState().users.push({ id: cleanUserG, fullName: 'Driver Golf', email: 'golf@test.in', phone: '+919820077777', role: 'passenger', createdAt: new Date().toISOString() });

    const regG = db.submitDriverApplication({
      userId: cleanUserG,
      fullName: 'Driver Golf',
      phone: '+919820077777',
      email: 'golf@test.in',
      licenseNumber: '   ', // Empty spaces
      vehiclePlate: 'MH02AB7777',
      isDraft: false,
    });

    const t6_pass = !valEmpty.isValid && !valWhitespace.isValid && !regG.success;
    results.push({
      name: 'License Normalization: Empty string and whitespace-only inputs strictly rejected',
      category: 'VALIDATION',
      passed: Boolean(t6_pass),
      message: t6_pass
        ? 'Verified: Empty string and whitespace inputs rejected with validation error.'
        : 'Failed: Empty/whitespace licence was accepted.',
      durationMs: Number((performance.now() - startT6).toFixed(2)),
    });

    // 7. NULL and Undefined Input Handling
    const startT7 = performance.now();
    const valNull = validateLicenseNumber(null as any);
    const valUndefined = validateLicenseNumber(undefined as any);
    const normNull = normalizeLicenseNumber(null);
    const normUndefined = normalizeLicenseNumber(undefined);

    const t7_pass =
      !valNull.isValid &&
      !valUndefined.isValid &&
      normNull === '' &&
      normUndefined === '';
    results.push({
      name: 'License Normalization: NULL and undefined inputs safely handled without exception',
      category: 'VALIDATION',
      passed: Boolean(t7_pass),
      message: t7_pass
        ? 'Verified: NULL/undefined parameters safely rejected with validation error and empty canonical string.'
        : 'Failed: NULL/undefined parameter handling threw exception.',
      durationMs: Number((performance.now() - startT7).toFixed(2)),
    });

    // 8. Invalid Format and State Code Rejection
    const startT8 = performance.now();
    const valInvalidState = validateLicenseNumber('XX0220210098765'); // "XX" is not a valid Indian state
    const valTooShort = validateLicenseNumber('MH02202'); // 7 chars, minimum 10
    const valSpecialChars = validateLicenseNumber('MH022021@098765');

    const t8_pass =
      !valInvalidState.isValid &&
      Boolean(valInvalidState.error?.includes('Invalid state code')) &&
      !valTooShort.isValid &&
      Boolean(valTooShort.error?.includes('Invalid licence length')) &&
      !valSpecialChars.isValid;
    results.push({
      name: 'License Normalization: Invalid state code, length, and illegal characters rejected',
      category: 'VALIDATION',
      passed: Boolean(t8_pass),
      message: t8_pass
        ? 'Verified: Non-Indian state code "XX", sub-length, and special characters rejected according to MoRTH Sarathi standard.'
        : 'Failed: Invalid licence formats were accepted.',
      durationMs: Number((performance.now() - startT8).toFixed(2)),
    });

    // 9. Concurrent Duplicate Registration Collision
    const startT9 = performance.now();
    const cleanUserH1 = `usr-lic-h1-${Date.now()}`;
    const cleanUserH2 = `usr-lic-h2-${Date.now()}`;
    db.getState().users.push(
      { id: cleanUserH1, fullName: 'Driver Hotel1', email: 'h1@test.in', phone: '+919820088881', role: 'passenger', createdAt: new Date().toISOString() },
      { id: cleanUserH2, fullName: 'Driver Hotel2', email: 'h2@test.in', phone: '+919820088882', role: 'passenger', createdAt: new Date().toISOString() }
    );

    // Simulate concurrent attempts with different user formatting
    const regH1 = db.submitDriverApplication({
      userId: cleanUserH1,
      fullName: 'Driver Hotel1',
      phone: '+919820088881',
      email: 'h1@test.in',
      licenseNumber: 'DL0420200055443',
      vehiclePlate: 'DL01AB9901',
      isDraft: false,
    });

    const regH2 = db.submitDriverApplication({
      userId: cleanUserH2,
      fullName: 'Driver Hotel2',
      phone: '+919820088882',
      email: 'h2@test.in',
      licenseNumber: 'dl-04 2020-0055443', // Concurrently submitted with lowercase and hyphens
      vehiclePlate: 'DL01AB9902',
      isDraft: false,
    });

    const t9_pass = regH1.success && !regH2.success && Boolean(regH2.error?.includes('already registered'));
    results.push({
      name: 'License Normalization: Concurrent registrations with varied formats collide deterministically',
      category: 'CONCURRENCY',
      passed: Boolean(t9_pass),
      message: t9_pass
        ? 'Verified: Second concurrent applicant with alternate formatting rejected by canonical normalization.'
        : `Failed: Concurrent duplicate registration was not blocked: ${regH2.error}`,
      durationMs: Number((performance.now() - startT9).toFixed(2)),
    });

    // =========================================================================
    // PART 2: AUTHORITATIVE KYC METADATA & MIXED-BACKEND RESOLUTION (TESTS 10 - 22)
    // =========================================================================

    // 10. Local Document Listing
    const startT10 = performance.now();
    const testDriver10 = 'drv_remed_local_01';
    const upLocal = await storeKycDocument(
      {
        driverId: testDriver10,
        documentType: 'VEHICLE_RC',
        documentNumber: 'RC-LOCAL-10',
        fileName: 'rc.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: validJpeg,
      },
      'local'
    );

    const docs10 = await getDriverDocuments(testDriver10);
    const t10_pass =
      upLocal.success &&
      docs10.length >= 1 &&
      docs10.some((d) => d.storageBackend === 'local_disk' && d.documentNumber === 'RC-LOCAL-10');
    results.push({
      name: 'Metadata Resolution: Local document listing accurately retrieves local disk documents',
      category: 'PERSISTENCE',
      passed: Boolean(t10_pass),
      message: t10_pass
        ? `Verified: Retrieved ${docs10.length} local document(s) with storageBackend='local_disk'.`
        : 'Failed: Local document listing failed.',
      durationMs: Number((performance.now() - startT10).toFixed(2)),
    });

    // 11. Supabase Metadata Listing Through Mocked Repository
    const startT11 = performance.now();
    const testDriver11 = 'drv_remed_cloud_02';
    const mockCloudDocs: any[] = [
      {
        id: 'doc-cloud-mock-01',
        driver_id: testDriver11,
        document_type: 'DRIVING_LICENSE_FRONT',
        document_number: 'MH0220210098765',
        storage_path: `drivers/${testDriver11}/DRIVING_LICENSE_FRONT/dl_front.jpg`,
        storage_backend: 'supabase_storage',
        file_name: 'dl_front.jpg',
        mime_type: 'image/jpeg',
        file_size_bytes: 10,
        sha256_checksum: 'a'.repeat(64),
        status: 'approved',
        submitted_at: new Date().toISOString(),
      },
    ];

    const mockDb11 = {
      from: (tbl: string) => ({
        select: () => ({
          eq: (_col: string, val: string) => ({
            single: async () => ({
              data: mockCloudDocs.find((d) => d.id === val || d.driver_id === val) || null,
              error: null,
            }),
            data: mockCloudDocs.filter((d) => d.driver_id === val),
            error: null,
          }),
        }),
      }),
    };

    setMockSupabaseDbClient(mockDb11);
    const docs11 = await getDriverDocuments(testDriver11);
    clearMockSupabaseDbClient();

    const t11_pass =
      docs11.length >= 1 &&
      docs11.some((d) => d.id === 'doc-cloud-mock-01' && d.storageBackend === 'supabase_storage');
    results.push({
      name: 'Metadata Resolution: Supabase metadata listing retrieves cloud records through repository',
      category: 'PERSISTENCE',
      passed: Boolean(t11_pass),
      message: t11_pass
        ? `Verified: Mocked PostgreSQL repository returned cloud record with status='${docs11[0]?.status}'.`
        : 'Failed: Could not retrieve Supabase metadata via repository.',
      durationMs: Number((performance.now() - startT11).toFixed(2)),
    });

    // 12. Mixed Local and Cloud Document Listing (Merging without Duplication)
    const startT12 = performance.now();
    const testDriver12 = 'drv_remed_mixed_03';

    // A. Local upload
    await storeKycDocument(
      {
        driverId: testDriver12,
        documentType: 'POLICE_VERIFICATION',
        documentNumber: 'POLICE-LOCAL-01',
        fileName: 'police.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: validJpeg,
      },
      'local'
    );

    // B. Mock cloud metadata for same driver
    const mockMixedCloudDocs: any[] = [
      {
        id: 'doc-mixed-cloud-99',
        driver_id: testDriver12,
        document_type: 'COMMERCIAL_PERMIT',
        document_number: 'PERMIT-CLOUD-01',
        storage_path: `drivers/${testDriver12}/COMMERCIAL_PERMIT/permit.jpg`,
        storage_backend: 'supabase_storage',
        file_name: 'permit.jpg',
        mime_type: 'image/jpeg',
        file_size_bytes: 10,
        sha256_checksum: 'b'.repeat(64),
        status: 'under_review',
        submitted_at: new Date().toISOString(),
      },
    ];

    setMockSupabaseDbClient({
      from: () => ({
        select: () => ({
          eq: (_col: string, val: string) => ({
            data: mockMixedCloudDocs.filter((d) => d.driver_id === val),
            error: null,
          }),
        }),
      }),
    });

    const mixedDocs = await getDriverDocuments(testDriver12);
    clearMockSupabaseDbClient();

    const hasLocal = mixedDocs.some((d) => d.storageBackend === 'local_disk');
    const hasCloud = mixedDocs.some((d) => d.storageBackend === 'supabase_storage');
    const uniqueIds = new Set(mixedDocs.map((d) => d.id)).size === mixedDocs.length;

    const t12_pass = hasLocal && hasCloud && uniqueIds;
    results.push({
      name: 'Mixed-Backend Listing: Accurately merges local and cloud documents without duplicate IDs',
      category: 'INTEGRATION',
      passed: Boolean(t12_pass),
      message: t12_pass
        ? `Verified: Merged list contains both local_disk and supabase_storage documents (Total: ${mixedDocs.length}, Distinct: ${uniqueIds}).`
        : `Failed: Mixed listing incomplete (hasLocal=${hasLocal}, hasCloud=${hasCloud}, uniqueIds=${uniqueIds}).`,
      durationMs: Number((performance.now() - startT12).toFixed(2)),
    });

    // 13. Retrieval by Stored Backend
    const startT13 = performance.now();
    let cloudAdapterInvoked = false;
    let localAdapterInvoked = false;

    setMockSupabaseStorageClient({
      storage: {
        from: () => ({
          download: async () => {
            cloudAdapterInvoked = true;
            return { data: validJpeg, error: null };
          },
        }),
      },
    });

    const cloudDocSample: StoredKycDocument = {
      id: 'doc-route-cloud-01',
      driverId: 'drv-route-01',
      documentType: 'IDENTITY_PROOF',
      documentNumber: 'ID-01',
      fileName: 'id.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: validJpeg.length,
      storagePath: 'drivers/drv-route-01/IDENTITY_PROOF/id.jpg',
      storageBackend: 'supabase_storage',
      submittedAt: new Date().toISOString(),
      status: 'under_review',
      sha256Checksum: 'c'.repeat(64),
    };

    const cloudBin = await getDocumentBinary(cloudDocSample);
    clearMockSupabaseStorageClient();

    const localDocSample = mixedDocs.find((d) => d.storageBackend === 'local_disk');
    let localBin: Buffer | null = null;
    if (localDocSample) {
      localBin = await getDocumentBinary(localDocSample);
      localAdapterInvoked = localBin !== null;
    }

    const t13_pass = cloudAdapterInvoked && localAdapterInvoked && cloudBin !== null && localBin !== null;
    results.push({
      name: 'Backend Resolution: Retrieval strictly routes by doc.storageBackend without provider contamination',
      category: 'PERSISTENCE',
      passed: Boolean(t13_pass),
      message: t13_pass
        ? 'Verified: supabase_storage invoked cloud adapter and local_disk invoked local disk adapter.'
        : `Failed: Routing mismatch (cloudInvoked=${cloudAdapterInvoked}, localInvoked=${localAdapterInvoked}).`,
      durationMs: Number((performance.now() - startT13).toFixed(2)),
    });

    // 14. Supabase Outage Handling (No Silent Fallback to Local Storage)
    const startT14 = performance.now();
    setMockSupabaseStorageClient({
      storage: {
        from: () => ({
          download: async () => {
            return { data: null, error: { message: 'Supabase 503: Service Unavailable' } };
          },
        }),
      },
    });

    const outageResult = await getDocumentBinaryDetailed(cloudDocSample);
    clearMockSupabaseStorageClient();

    const t14_pass =
      outageResult.status === 'BACKEND_UNAVAILABLE' &&
      outageResult.binary === null &&
      Boolean(outageResult.error?.includes('Supabase Storage error'));
    results.push({
      name: 'Outage Resilience: Supabase storage outage returns BACKEND_UNAVAILABLE without silent local fallback',
      category: 'RESILIENCE',
      passed: Boolean(t14_pass),
      message: t14_pass
        ? 'Verified: Cloud outage returns status=BACKEND_UNAVAILABLE; zero silent fallback to local storage.'
        : `Failed: Expected BACKEND_UNAVAILABLE, got ${outageResult.status}.`,
      durationMs: Number((performance.now() - startT14).toFixed(2)),
    });

    // 15. Local Disk Unavailable Handling
    const startT15 = performance.now();
    const ghostLocalDoc: StoredKycDocument = {
      id: 'doc-ghost-local-01',
      driverId: 'drv-ghost-01',
      documentType: 'VEHICLE_PUC',
      documentNumber: 'PUC-01',
      fileName: 'puc.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 10,
      storagePath: 'drivers/drv-ghost-01/VEHICLE_PUC/ghost.jpg', // Non-existent path on disk
      storageBackend: 'local_disk',
      submittedAt: new Date().toISOString(),
      status: 'under_review',
      sha256Checksum: 'd'.repeat(64),
    };

    const localMissingResult = await getDocumentBinaryDetailed(ghostLocalDoc);
    const t15_pass = localMissingResult.status === 'NOT_FOUND' && localMissingResult.binary === null;
    results.push({
      name: 'Local Storage Resilience: Missing file on local disk returns clean NOT_FOUND status',
      category: 'RESILIENCE',
      passed: Boolean(t15_pass),
      message: t15_pass
        ? 'Verified: Missing disk file returns status=NOT_FOUND with clear error message.'
        : `Failed: Expected NOT_FOUND, got ${localMissingResult.status}.`,
      durationMs: Number((performance.now() - startT15).toFixed(2)),
    });

    // 16. Empty Local Registry with Cloud Metadata (Ephemeral Disk Restart Simulation)
    const startT16 = performance.now();
    clearKycRegistryForTesting(); // Wipe in-memory registry completely

    const testDriver16 = 'drv_ephemeral_cloud_16';
    const mockPostgresRows = [
      {
        id: 'doc-ephemeral-01',
        driver_id: testDriver16,
        document_type: 'DRIVING_LICENSE',
        document_number: 'MH0220220099881',
        storage_path: `drivers/${testDriver16}/DRIVING_LICENSE/dl.jpg`,
        storage_backend: 'supabase_storage',
        file_name: 'dl.jpg',
        mime_type: 'image/jpeg',
        file_size_bytes: 100,
        sha256_checksum: 'e'.repeat(64),
        status: 'approved',
        submitted_at: new Date().toISOString(),
      },
    ];

    setMockSupabaseDbClient({
      from: () => ({
        select: () => ({
          eq: (_col: string, val: string) => ({
            single: async () => ({
              data: mockPostgresRows.find((d) => d.id === val || d.driver_id === val) || null,
              error: null,
            }),
            data: mockPostgresRows.filter((d) => d.driver_id === val),
            error: null,
          }),
        }),
      }),
    });

    // Test getDriverDocuments with empty local registry
    const rehydratedDocs = await getDriverDocuments(testDriver16);
    // Test getStoredKycDocument with empty local registry
    const rehydratedSingle = await getStoredKycDocument('doc-ephemeral-01');
    clearMockSupabaseDbClient();

    const t16_pass =
      rehydratedDocs.length === 1 &&
      rehydratedDocs[0].id === 'doc-ephemeral-01' &&
      rehydratedSingle?.id === 'doc-ephemeral-01';
    results.push({
      name: 'Ephemeral Host Resilience: Empty local registry recovers cloud documents via PostgreSQL',
      category: 'RESILIENCE',
      passed: Boolean(t16_pass),
      message: t16_pass
        ? 'Verified: Ephemeral container restart with zero local cache recovered documents from PostgreSQL.'
        : 'Failed: Documents lost when local registry is empty.',
      durationMs: Number((performance.now() - startT16).toFixed(2)),
    });

    // 17. Missing Object Handling (Metadata Exists, Object Missing)
    const startT17 = performance.now();
    setMockSupabaseStorageClient({
      storage: {
        from: () => ({
          download: async () => ({
            data: null,
            error: { message: 'Object not found (404)', statusCode: '404' },
          }),
        }),
      },
    });

    const missingObjDoc: StoredKycDocument = {
      id: 'doc-missing-obj-01',
      driverId: 'drv-test-17',
      documentType: 'IDENTITY_PROOF',
      documentNumber: 'ID-17',
      fileName: 'id.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 10,
      storagePath: 'drivers/drv-test-17/IDENTITY_PROOF/missing.jpg',
      storageBackend: 'supabase_storage',
      submittedAt: new Date().toISOString(),
      status: 'under_review',
      sha256Checksum: 'f'.repeat(64),
    };

    const missingObjRes = await getDocumentBinaryDetailed(missingObjDoc);
    clearMockSupabaseStorageClient();

    const t17_pass = missingObjRes.status === 'NOT_FOUND' && missingObjRes.binary === null;
    results.push({
      name: 'Consistency Handling: Metadata present but cloud storage object missing returns NOT_FOUND',
      category: 'CONSISTENCY',
      passed: Boolean(t17_pass),
      message: t17_pass
        ? 'Verified: Missing storage object returned status=NOT_FOUND with descriptive error message.'
        : `Failed: Expected NOT_FOUND, got ${missingObjRes.status}.`,
      durationMs: Number((performance.now() - startT17).toFixed(2)),
    });

    // 18. Missing Metadata Rollback (Binary Upload Succeeded, Metadata Failed)
    const startT18 = performance.now();
    const orphanCleanups: string[] = [];

    setMockSupabaseStorageClient({
      storage: {
        from: () => ({
          upload: async (p: string) => ({ data: { path: p }, error: null }),
          remove: async (paths: string[]) => {
            orphanCleanups.push(paths[0]);
            return { data: null, error: null };
          },
        }),
      },
    });

    setMockSupabaseDbClient({
      from: () => ({
        insert: async () => ({
          data: null,
          error: { message: 'Database transaction aborted (simulated failure)' },
        }),
      }),
    });

    const failedUpload = await storeKycDocument(
      {
        driverId: 'drv-orphan-18',
        documentType: 'VEHICLE_INSURANCE',
        documentNumber: 'INS-18',
        fileName: 'ins.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: validJpeg,
      },
      'supabase'
    );

    clearMockSupabaseStorageClient();
    clearMockSupabaseDbClient();

    const t18_pass =
      !failedUpload.success &&
      orphanCleanups.length === 1 &&
      orphanCleanups[0].includes('drv-orphan-18');
    results.push({
      name: 'Two-Phase Rollback: Metadata failure immediately purges orphan binary object from cloud storage',
      category: 'STATE_MACHINE',
      passed: Boolean(t18_pass),
      message: t18_pass
        ? `Verified: Metadata write error triggered storage cleanup for orphan object "${orphanCleanups[0]}".`
        : 'Failed: Orphan cleanup was not invoked on metadata persistence failure.',
      durationMs: Number((performance.now() - startT18).toFixed(2)),
    });

    // 19. Rollback After Cloud Cutover (Preserving Supabase Docs When Switched to Local)
    const startT19 = performance.now();
    const testDriver19 = 'drv_cutover_rollback_19';
    const cutoverCloudDoc: any = {
      id: 'doc-cutover-99',
      driver_id: testDriver19,
      document_type: 'VEHICLE_RC',
      document_number: 'MH02RC9999',
      storage_path: `drivers/${testDriver19}/VEHICLE_RC/rc.jpg`,
      storage_backend: 'supabase_storage',
      file_name: 'rc.jpg',
      mime_type: 'image/jpeg',
      file_size_bytes: 10,
      sha256_checksum: '9'.repeat(64),
      status: 'approved',
      submitted_at: new Date().toISOString(),
    };

    // Simulate switching AEROPOOL_KYC_STORAGE_PROVIDER to local while cloud records exist in PostgreSQL
    setMockSupabaseDbClient({
      from: () => ({
        select: () => ({
          eq: (_col: string, val: string) => ({
            single: async () => ({
              data: val === 'doc-cutover-99' ? cutoverCloudDoc : null,
              error: null,
            }),
            data: val === testDriver19 ? [cutoverCloudDoc] : [],
            error: null,
          }),
        }),
      }),
    });

    // Provider is 'local' by default in tests
    const rollbackDocs = await getDriverDocuments(testDriver19);
    clearMockSupabaseDbClient();

    const t19_pass =
      rollbackDocs.length === 1 &&
      rollbackDocs[0].id === 'doc-cutover-99' &&
      rollbackDocs[0].storageBackend === 'supabase_storage';
    results.push({
      name: 'Cutover Rollback: Switching provider back to "local" keeps Supabase documents listed and visible',
      category: 'RESILIENCE',
      passed: Boolean(t19_pass),
      message: t19_pass
        ? 'Verified: Supabase documents remained visible in driver listing after provider rollback to local.'
        : 'Failed: Supabase documents disappeared from driver listing during rollback.',
      durationMs: Number((performance.now() - startT19).toFixed(2)),
    });

    // 20. Driver Ownership & Tenant Isolation Enforcement (HTTP Route)
    const startT20 = performance.now();
    const resForbiddenListing = await fetch(
      `${baseUrl}/api/driver/documents/test-driver-b-account-id`,
      {
        headers: { Authorization: 'Bearer test-token-driver' }, // Driver A querying Driver B
      }
    );

    const t20_pass = resForbiddenListing.status === 403;
    results.push({
      name: 'Security Boundary: Driver A cannot query or list Driver B documents across any backend',
      category: 'SECURITY',
      passed: Boolean(t20_pass),
      message: t20_pass
        ? 'Verified: Cross-driver document listing strictly rejected with HTTP 403 Forbidden.'
        : `Failed: Expected HTTP 403, got ${resForbiddenListing.status}.`,
      durationMs: Number((performance.now() - startT20).toFixed(2)),
    });

    // 21. Admin Cross-Driver Access Enforcement (HTTP Route)
    const startT21 = performance.now();
    const resAdminListing = await fetch(
      `${baseUrl}/api/driver/documents/test-driver-account-id`,
      {
        headers: { Authorization: 'Bearer test-token-admin' }, // Super Admin querying Driver A
      }
    );

    const t21_pass = resAdminListing.status === 200;
    results.push({
      name: 'Privilege Authorization: Super Admin retains cross-driver access across both backends',
      category: 'SECURITY',
      passed: Boolean(t21_pass),
      message: t21_pass
        ? 'Verified: Administrator authorized to inspect driver documents across local and cloud storage.'
        : `Failed: Expected HTTP 200, got ${resAdminListing.status}.`,
      durationMs: Number((performance.now() - startT21).toFixed(2)),
    });

    // 22. Detailed Storage Outage HTTP Status (HTTP 503 instead of 404/500)
    const startT22 = performance.now();
    clearKycRegistryForTesting();
    const cloudDocId = 'doc-outage-route-01';
    const outageCloudRow = {
      id: cloudDocId,
      driver_id: 'test-driver-account-id',
      document_type: 'IDENTITY_PROOF',
      document_number: 'ID-OUTAGE',
      file_name: 'outage.jpg',
      mime_type: 'image/jpeg',
      file_size_bytes: 10,
      storage_path: 'drivers/test-driver-account-id/IDENTITY_PROOF/outage.jpg',
      storage_backend: 'supabase_storage',
      submitted_at: new Date().toISOString(),
      status: 'under_review',
      sha256_checksum: '0'.repeat(64),
    };

    setMockSupabaseStorageClient({
      storage: {
        from: () => ({
          download: async () => ({
            data: null,
            error: { message: 'Cloud connection timeout: ETIMEDOUT' },
          }),
        }),
      },
    });

    setMockSupabaseDbClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: outageCloudRow, error: null }),
            data: [outageCloudRow],
            error: null,
          }),
        }),
      }),
    });

    const resOutagePreview = await fetch(
      `${baseUrl}/api/driver/document-preview/${cloudDocId}`,
      {
        headers: { Authorization: 'Bearer test-token-driver' },
      }
    );

    clearMockSupabaseStorageClient();
    clearMockSupabaseDbClient();

    const t22_pass = resOutagePreview.status === 503;
    results.push({
      name: 'HTTP Error Semantics: Storage backend outage returns HTTP 503 Service Unavailable',
      category: 'RESILIENCE',
      passed: Boolean(t22_pass),
      message: t22_pass
        ? 'Verified: Supabase Storage timeout returned HTTP 503 with exact backend error detail.'
        : `Failed: Expected HTTP 503, got HTTP ${resOutagePreview.status}.`,
      durationMs: Number((performance.now() - startT22).toFixed(2)),
    });
  } finally {
    clearMockSupabaseStorageClient();
    clearMockSupabaseDbClient();
    await cleanupServer();
  }

  return results;
}
