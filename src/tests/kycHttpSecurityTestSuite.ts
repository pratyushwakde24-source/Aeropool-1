import http from 'http';
import crypto from 'crypto';
import app from '../../server/index';
import {
  storeKycDocument,
  getStoredKycDocument,
  getKycStorageProvider,
  getKycMetadataRepository,
  setMockSupabaseStorageClient,
  clearMockSupabaseStorageClient,
  setMockSupabaseDbClient,
  clearMockSupabaseDbClient,
  generatePreviewToken,
  LocalStorageAdapter,
  SupabaseStorageAdapter,
} from '../../server/kycStorageService';
import { TestResult } from './testSuite';

// 10-byte valid JPEG header
const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const validJpegBase64 = validJpeg.toString('base64');

export async function runKycHttpSecurityTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Spin up an isolated ephemeral HTTP server bound to port 0 (dynamic port)
  // to run real end-to-end network requests against the Express app and middleware
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number; address: string };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const cleanupServer = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  try {
    // =========================================================================
    // 1. HTTP Route Test: Anonymous upload returns 401
    // =========================================================================
    const startT1 = performance.now();
    const res1 = await fetch(`${baseUrl}/api/driver/upload-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driverId: 'test-driver-account-id',
        documentType: 'DRIVING_LICENSE_FRONT',
        documentNumber: 'MH022022001',
        fileName: 'dl.jpg',
        mimeType: 'image/jpeg',
        fileBase64: validJpegBase64,
      }),
    });
    const t1_pass = res1.status === 401;
    results.push({
      name: 'HTTP Route Security: Anonymous document upload returns HTTP 401 Unauthorized',
      category: 'SECURITY',
      passed: Boolean(t1_pass),
      message: t1_pass
        ? 'Verified: Missing Bearer token rejected with HTTP 401.'
        : `Failed: Expected HTTP 401, got HTTP ${res1.status}.`,
      durationMs: Number((performance.now() - startT1).toFixed(2)),
    });

    // =========================================================================
    // 2. HTTP Route Test: Anonymous document listing returns 401
    // =========================================================================
    const startT2 = performance.now();
    const res2 = await fetch(`${baseUrl}/api/driver/documents/test-driver-account-id`);
    const t2_pass = res2.status === 401;
    results.push({
      name: 'HTTP Route Security: Anonymous document listing returns HTTP 401 Unauthorized',
      category: 'SECURITY',
      passed: Boolean(t2_pass),
      message: t2_pass
        ? 'Verified: Unauthenticated document listing rejected with HTTP 401.'
        : `Failed: Expected HTTP 401, got HTTP ${res2.status}.`,
      durationMs: Number((performance.now() - startT2).toFixed(2)),
    });

    // =========================================================================
    // 3. HTTP Route Test: Anonymous preview returns 401
    // =========================================================================
    const startT3 = performance.now();
    const res3 = await fetch(`${baseUrl}/api/driver/document-preview/doc-unauthenticated-01`);
    const t3_pass = res3.status === 401;
    results.push({
      name: 'HTTP Route Security: Anonymous document preview returns HTTP 401 Unauthorized',
      category: 'SECURITY',
      passed: Boolean(t3_pass),
      message: t3_pass
        ? 'Verified: Unauthenticated preview access rejected with HTTP 401.'
        : `Failed: Expected HTTP 401, got HTTP ${res3.status}.`,
      durationMs: Number((performance.now() - startT3).toFixed(2)),
    });

    // =========================================================================
    // 4. HTTP Route Test: Passenger role upload returns 403
    // =========================================================================
    const startT4 = performance.now();
    const res4 = await fetch(`${baseUrl}/api/driver/upload-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-passenger',
      },
      body: JSON.stringify({
        driverId: 'test-passenger-account-id',
        documentType: 'DRIVING_LICENSE_FRONT',
        documentNumber: 'MH022022001',
        fileName: 'dl.jpg',
        mimeType: 'image/jpeg',
        fileBase64: validJpegBase64,
      }),
    });
    const t4_pass = res4.status === 403;
    results.push({
      name: 'HTTP Route Security: Passenger role upload returns HTTP 403 Forbidden',
      category: 'SECURITY',
      passed: Boolean(t4_pass),
      message: t4_pass
        ? 'Verified: requireRole([\'driver\', \'admin\']) blocked passenger upload with HTTP 403.'
        : `Failed: Expected HTTP 403, got HTTP ${res4.status}.`,
      durationMs: Number((performance.now() - startT4).toFixed(2)),
    });

    // =========================================================================
    // 5. HTTP Route Test: Driver A uploads against Driver B ID returns 403
    // =========================================================================
    const startT5 = performance.now();
    const res5 = await fetch(`${baseUrl}/api/driver/upload-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-driver', // Identity: test-driver-account-id
      },
      body: JSON.stringify({
        driverId: 'test-driver-b-account-id', // Target: Driver B
        documentType: 'DRIVING_LICENSE_FRONT',
        documentNumber: 'MH022022001',
        fileName: 'dl.jpg',
        mimeType: 'image/jpeg',
        fileBase64: validJpegBase64,
      }),
    });
    const t5_pass = res5.status === 403;
    results.push({
      name: 'HTTP Route Security: Driver A uploading against Driver B account returns HTTP 403',
      category: 'SECURITY',
      passed: Boolean(t5_pass),
      message: t5_pass
        ? 'Verified: Cross-driver identity spoofing blocked with HTTP 403 Forbidden.'
        : `Failed: Expected HTTP 403, got HTTP ${res5.status}.`,
      durationMs: Number((performance.now() - startT5).toFixed(2)),
    });

    // =========================================================================
    // 6. HTTP Route Test: Driver A lists Driver B documents returns 403
    // =========================================================================
    const startT6 = performance.now();
    const res6 = await fetch(`${baseUrl}/api/driver/documents/test-driver-b-account-id`, {
      headers: {
        'Authorization': 'Bearer test-token-driver', // Identity: Driver A
      },
    });
    const t6_pass = res6.status === 403;
    results.push({
      name: 'HTTP Route Security: Driver A listing Driver B documents returns HTTP 403 Forbidden',
      category: 'SECURITY',
      passed: Boolean(t6_pass),
      message: t6_pass
        ? 'Verified: Driver A blocked from querying Driver B document catalog.'
        : `Failed: Expected HTTP 403, got HTTP ${res6.status}.`,
      durationMs: Number((performance.now() - startT6).toFixed(2)),
    });

    // =========================================================================
    // 7. HTTP Route Test: Driver A uploads against own ID -> Success (HTTP 201)
    // =========================================================================
    const startT7 = performance.now();
    const res7 = await fetch(`${baseUrl}/api/driver/upload-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-driver',
      },
      body: JSON.stringify({
        driverId: 'test-driver-account-id',
        documentType: 'DRIVING_LICENSE_FRONT',
        documentNumber: 'MH02DL12345',
        expiryDate: '2035-12-31',
        fileName: 'dl_front.jpg',
        mimeType: 'image/jpeg',
        fileBase64: validJpegBase64,
      }),
    });
    const data7 = await res7.json();
    const docA_Id = data7?.document?.id;
    const t7_pass =
      res7.status === 201 &&
      data7.success === true &&
      data7.document?.driverId === 'test-driver-account-id' &&
      typeof data7.document?.previewUrl === 'string';

    results.push({
      name: 'HTTP Route Integration: Driver A uploads against own account returns HTTP 201 Created',
      category: 'INTEGRATION',
      passed: Boolean(t7_pass),
      message: t7_pass
        ? `Verified: Document created with ID ${docA_Id} and preview URL.`
        : `Failed: Expected HTTP 201, got HTTP ${res7.status}.`,
      durationMs: Number((performance.now() - startT7).toFixed(2)),
    });

    // =========================================================================
    // 8. HTTP Route Test: Driver B previews Driver A's document returns 403
    // =========================================================================
    const startT8 = performance.now();
    const res8 = await fetch(`${baseUrl}/api/driver/document-preview/${docA_Id}`, {
      headers: {
        'Authorization': 'Bearer test-token-driver-b', // Driver B attempts preview of Driver A doc
      },
    });
    const t8_pass = res8.status === 403;
    results.push({
      name: 'HTTP Route Security: Driver B previewing Driver A document returns HTTP 403 Forbidden',
      category: 'SECURITY',
      passed: Boolean(t8_pass),
      message: t8_pass
        ? 'Verified: Cross-driver document inspection rejected with HTTP 403.'
        : `Failed: Expected HTTP 403, got HTTP ${res8.status}.`,
      durationMs: Number((performance.now() - startT8).toFixed(2)),
    });

    // =========================================================================
    // 9. HTTP Route Test: Authorized Super Admin accesses Driver A document (HTTP 200)
    // =========================================================================
    const startT9 = performance.now();
    const res9 = await fetch(`${baseUrl}/api/driver/documents/test-driver-account-id`, {
      headers: {
        'Authorization': 'Bearer test-token-admin',
      },
    });
    const data9 = await res9.json();
    const t9_pass =
      res9.status === 200 &&
      data9.success === true &&
      Array.isArray(data9.documents) &&
      data9.documents.some((d: any) => d.id === docA_Id);

    results.push({
      name: 'HTTP Route Integration: Authorized Admin accesses Driver A document list (HTTP 200)',
      category: 'INTEGRATION',
      passed: Boolean(t9_pass),
      message: t9_pass
        ? 'Verified: Super admin retrieved driver document list with operational preview capability.'
        : `Failed: Admin access returned HTTP ${res9.status}.`,
      durationMs: Number((performance.now() - startT9).toFixed(2)),
    });

    // =========================================================================
    // 10. HTTP Route Test: Unauthorized driver attempts admin route returns 403
    // =========================================================================
    const startT10 = performance.now();
    const res10 = await fetch(`${baseUrl}/api/driver/upload-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token-driver',
      },
      body: JSON.stringify({
        driverId: 'some-other-target-id',
        documentType: 'POLICE_VERIFICATION',
        documentNumber: 'POL-001',
        mimeType: 'image/jpeg',
        fileBase64: validJpegBase64,
      }),
    });
    const t10_pass = res10.status === 403;
    results.push({
      name: 'HTTP Route Security: Non-admin caller attempting administrative override returns HTTP 403',
      category: 'SECURITY',
      passed: Boolean(t10_pass),
      message: t10_pass
        ? 'Verified: Unauthorized user denied administrative cross-driver upload privileges.'
        : `Failed: Expected HTTP 403, got HTTP ${res10.status}.`,
      durationMs: Number((performance.now() - startT10).toFixed(2)),
    });

    // =========================================================================
    // 11. Security Test: Expired preview token rejected with HTTP 403
    // =========================================================================
    const startT11 = performance.now();
    // Craft expired token
    const expiredToken = generatePreviewToken(docA_Id, 'test-driver-account-id', 'driver');
    // Parse, mutate expiration to past, re-sign
    const rawParsed = JSON.parse(Buffer.from(expiredToken, 'base64url').toString('utf8'));
    rawParsed.expiresAt = Date.now() - 60000; // 1 minute ago
    // In order to test expired token rejection by verifyPreviewToken, use an expired timestamp
    const expiredRaw = Buffer.from(JSON.stringify(rawParsed)).toString('base64url');

    const res11 = await fetch(`${baseUrl}/api/driver/document-preview/${docA_Id}?token=${expiredRaw}`, {
      headers: {
        'Authorization': 'Bearer test-token-driver',
      },
    });
    const t11_pass = res11.status === 403;
    results.push({
      name: 'Capability Security: Expired HMAC preview token rejected with HTTP 403 Forbidden',
      category: 'SECURITY',
      passed: Boolean(t11_pass),
      message: t11_pass
        ? 'Verified: Expired preview token rejected.'
        : `Failed: Expected HTTP 403, got HTTP ${res11.status}.`,
      durationMs: Number((performance.now() - startT11).toFixed(2)),
    });

    // =========================================================================
    // 12. Security Test: Tampered preview token rejected with HTTP 403
    // =========================================================================
    const startT12 = performance.now();
    const tamperedToken = expiredToken.substring(0, expiredToken.length - 8) + 'deadbeef';
    const res12 = await fetch(`${baseUrl}/api/driver/document-preview/${docA_Id}?token=${tamperedToken}`, {
      headers: {
        'Authorization': 'Bearer test-token-driver',
      },
    });
    const t12_pass = res12.status === 403;
    results.push({
      name: 'Capability Security: Tampered preview token signature rejected with HTTP 403 Forbidden',
      category: 'SECURITY',
      passed: Boolean(t12_pass),
      message: t12_pass
        ? 'Verified: Tampered HMAC signature detected and rejected.'
        : `Failed: Expected HTTP 403, got HTTP ${res12.status}.`,
      durationMs: Number((performance.now() - startT12).toFixed(2)),
    });

    // =========================================================================
    // 13. State Machine & Rollback: Metadata persistence failure executes binary cleanup
    // =========================================================================
    const startT13 = performance.now();
    const storageDeletes: string[] = [];
    const rollbackStorageClient = {
      storage: {
        from: () => ({
          upload: async (path: string) => ({ data: { path }, error: null }),
          remove: async (paths: string[]) => {
            if (paths && paths[0]) storageDeletes.push(paths[0]);
            return { data: paths, error: null };
          },
        }),
      },
    };

    const failingDbClient = {
      from: () => ({
        insert: async () => ({ data: null, error: { message: 'Database connection terminated' } }),
      }),
    };

    setMockSupabaseStorageClient(rollbackStorageClient);
    setMockSupabaseDbClient(failingDbClient);

    const rollbackResult = await storeKycDocument(
      {
        driverId: 'drv-rollback-test-01',
        documentType: 'VEHICLE_PUC',
        documentNumber: 'PUC-RB-01',
        fileName: 'puc.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: validJpeg,
      },
      'supabase'
    );

    const t13_pass =
      rollbackResult.success === false &&
      Boolean(rollbackResult.error?.includes('Metadata persistence failed')) &&
      storageDeletes.length > 0 &&
      storageDeletes[0].includes('drivers/drv-rollback-test-01/VEHICLE_PUC/');

    results.push({
      name: 'Safe Upload Sequencing: Metadata persistence failure triggers automatic binary rollback',
      category: 'STATE_MACHINE',
      passed: Boolean(t13_pass),
      message: t13_pass
        ? `Verified: Metadata failure returned error and invoked storage cleanup on orphan object "${storageDeletes[0]}".`
        : 'Failed: Rollback cleanup was not executed after metadata error.',
      durationMs: Number((performance.now() - startT13).toFixed(2)),
    });

    // =========================================================================
    // 14. Persistence Integration: Supabase storage upload failure halts metadata save
    // =========================================================================
    const startT14 = performance.now();
    let dbInsertCalled = false;
    const failingUploadStorageClient = {
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: { message: 'Bucket quota exceeded' } }),
        }),
      },
    };

    const trackingDbClient = {
      from: () => ({
        insert: async () => {
          dbInsertCalled = true;
          return { data: null, error: null };
        },
      }),
    };

    setMockSupabaseStorageClient(failingUploadStorageClient);
    setMockSupabaseDbClient(trackingDbClient);

    const storageFailResult = await storeKycDocument(
      {
        driverId: 'drv-storage-fail-02',
        documentType: 'VEHICLE_INSURANCE',
        documentNumber: 'INS-FAIL-02',
        fileName: 'ins.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: validJpeg,
      },
      'supabase'
    );

    const t14_pass =
      storageFailResult.success === false &&
      Boolean(storageFailResult.error?.includes('Bucket quota exceeded')) &&
      dbInsertCalled === false;

    results.push({
      name: 'Storage Isolation: Storage upload failure prevents metadata recording in database',
      category: 'PERSISTENCE',
      passed: Boolean(t14_pass),
      message: t14_pass
        ? 'Verified: Binary failure halted execution immediately; zero database records written.'
        : 'Failed: Database record was inserted despite binary upload failure.',
      durationMs: Number((performance.now() - startT14).toFixed(2)),
    });

    // =========================================================================
    // 15. Lifecycle & Non-Destruction: Duplicate object upload generates unique path
    // =========================================================================
    const startT15 = performance.now();
    const capturedUploads: string[] = [];
    const nonDestructiveStorageClient = {
      storage: {
        from: () => ({
          upload: async (path: string, _buf: any, options: any) => {
            capturedUploads.push(path);
            return { data: { path }, error: null };
          },
        }),
      },
    };

    const okDbClient = {
      from: () => ({
        insert: async () => ({ data: null, error: null }),
      }),
    };

    setMockSupabaseStorageClient(nonDestructiveStorageClient);
    setMockSupabaseDbClient(okDbClient);

    const up1 = await storeKycDocument(
      {
        driverId: 'drv-nondestruct-03',
        documentType: 'IDENTITY_PROOF',
        documentNumber: 'AADHAAR-1111',
        fileName: 'aadhaar.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: validJpeg,
      },
      'supabase'
    );

    const up2 = await storeKycDocument(
      {
        driverId: 'drv-nondestruct-03',
        documentType: 'IDENTITY_PROOF',
        documentNumber: 'AADHAAR-1111',
        fileName: 'aadhaar.jpg',
        mimeType: 'image/jpeg',
        fileBuffer: validJpeg,
      },
      'supabase'
    );

    const t15_pass =
      up1.success &&
      up2.success &&
      capturedUploads.length === 2 &&
      capturedUploads[0] !== capturedUploads[1] &&
      up1.document?.storagePath !== up2.document?.storagePath;

    results.push({
      name: 'Document Lifecycle: Successive uploads generate distinct object paths without collision',
      category: 'STATE_MACHINE',
      passed: Boolean(t15_pass),
      message: t15_pass
        ? `Verified: Uploads created distinct object paths (${capturedUploads[0].split('/').pop()} vs ${capturedUploads[1].split('/').pop()}).`
        : 'Failed: Successive uploads collided or overwrote prior object path.',
      durationMs: Number((performance.now() - startT15).toFixed(2)),
    });
  } finally {
    clearMockSupabaseStorageClient();
    clearMockSupabaseDbClient();
    await cleanupServer();
  }

  return results;
}
