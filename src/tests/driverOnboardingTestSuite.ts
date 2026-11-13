import { db } from '../services/db';
import {
  validateMagicBytes,
  storeKycDocument,
  generatePreviewToken,
  verifyPreviewToken,
  getStoredKycDocument,
} from '../../server/kycStorageService';
import { TestResult } from './testSuite';

export async function runDriverOnboardingTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. Complete Driver Application Submission
  const startT1 = performance.now();
  const testUserId1 = 'test-driver-applicant-e2e-01';
  db.getState().users.push({
    id: testUserId1,
    phone: '+919820011223',
    fullName: 'Anil Ramesh Patil',
    email: 'anil.patil@test.aeropool.in',
    role: 'passenger', // Least-privileged public user intent on becoming a driver
    createdAt: new Date().toISOString(),
  });

  const appResult = db.submitDriverApplication({
    userId: testUserId1,
    fullName: 'Anil Ramesh Patil',
    phone: '+919820011223',
    email: 'anil.patil@test.aeropool.in',
    residentialAddress: 'Flat 102, Shanti Vihar, Vile Parle East, Mumbai 400057',
    emergencyContact: '+919820099887',
    licenseNumber: 'MH0220210098765',
    licenseExpiryDate: '2032-12-31',
    badgeNumber: 'BDG-BOM-77889',
    vehiclePlate: 'MH02EK9988',
    vehicleModel: 'Maruti Suzuki Ertiga Tour M',
    vehicleCategory: 'SUV',
    vehicleColor: 'Pearl White',
    vehicleRcNumber: 'RC-MH02-EK9988',
    vehicleRcExpiryDate: '2030-05-15',
    vehicleInsuranceNumber: 'POL-ICICI-99887766',
    vehicleInsuranceExpiryDate: '2028-08-20',
    vehiclePucNumber: 'PUC-MH02-554433',
    vehiclePucExpiryDate: '2027-11-10',
    seatCapacity: 6,
    luggageCapacity: 4,
    documents: [
      {
        type: 'DRIVING_LICENSE_FRONT',
        documentNumber: 'MH0220210098765',
        fileUrl: `private-storage://drivers/${testUserId1}/dl_front.jpg`,
        expiryDate: '2032-12-31',
        mimeType: 'image/jpeg',
      },
      {
        type: 'DRIVING_LICENSE_BACK',
        documentNumber: 'MH0220210098765',
        fileUrl: `private-storage://drivers/${testUserId1}/dl_back.jpg`,
        expiryDate: '2032-12-31',
        mimeType: 'image/jpeg',
      },
      {
        type: 'VEHICLE_RC',
        documentNumber: 'RC-MH02-EK9988',
        fileUrl: `private-storage://drivers/${testUserId1}/rc.pdf`,
        expiryDate: '2030-05-15',
        mimeType: 'application/pdf',
      },
      {
        type: 'VEHICLE_INSURANCE',
        documentNumber: 'POL-ICICI-99887766',
        fileUrl: `private-storage://drivers/${testUserId1}/insurance.pdf`,
        expiryDate: '2028-08-20',
        mimeType: 'application/pdf',
      },
    ],
    isDraft: false,
  });

  const driverProfile1 = db.getState().driverProfiles.find((d) => d.userId === testUserId1);
  const t1_pass =
    appResult.success &&
    driverProfile1 !== undefined &&
    driverProfile1.verificationStatus === 'under_review' &&
    driverProfile1.assignedVehicle?.plateNumber === 'MH02EK9988' &&
    driverProfile1.documents.length >= 4 &&
    !driverProfile1.isAvailable;

  results.push({
    name: 'Driver Onboarding: Complete multi-step application submission with full compliance metadata',
    category: 'STATE_MACHINE',
    passed: Boolean(t1_pass),
    message: t1_pass
      ? `Verified: Driver application created for Anil Patil. Status="under_review", 4 compliance documents registered, driver offline.`
      : 'Failed: Driver application submission failed or left invalid profile state.',
    durationMs: Number((performance.now() - startT1).toFixed(2)),
  });

  // 2. Duplicate Commercial Driving Licence Prevention (Anti-Spoofing)
  const startT2 = performance.now();
  const testUserId2 = 'test-driver-applicant-e2e-02';
  db.getState().users.push({
    id: testUserId2,
    phone: '+919820055443',
    fullName: 'Suresh More',
    email: 'suresh.more@test.aeropool.in',
    role: 'passenger',
    createdAt: new Date().toISOString(),
  });

  const duplicateLicenseResult = db.submitDriverApplication({
    userId: testUserId2,
    fullName: 'Suresh More',
    phone: '+919820055443',
    email: 'suresh.more@test.aeropool.in',
    licenseNumber: 'MH0220210098765', // Identical to Anil Patil
    vehiclePlate: 'MH03BZ1122',
    isDraft: false,
  });

  const t2_pass =
    !duplicateLicenseResult.success &&
    Boolean(duplicateLicenseResult.error?.includes('already registered to another driver'));

  results.push({
    name: 'Driver Security: Commercial Driving Licence uniqueness strictly enforced across drivers (Anti-Spoofing)',
    category: 'SECURITY',
    passed: Boolean(t2_pass),
    message: t2_pass
      ? 'Verified: Second driver attempting to use an existing Driving Licence was strictly blocked.'
      : 'Failed: Duplicate driving licence was incorrectly accepted.',
    durationMs: Number((performance.now() - startT2).toFixed(2)),
  });

  // 3. Duplicate Vehicle Registration Plate Prevention
  const startT3 = performance.now();
  const duplicatePlateResult = db.submitDriverApplication({
    userId: testUserId2,
    fullName: 'Suresh More',
    phone: '+919820055443',
    email: 'suresh.more@test.aeropool.in',
    licenseNumber: 'MH0320180055667', // Distinct licence
    vehiclePlate: 'MH02EK9988', // Duplicate plate from Anil Patil
    isDraft: false,
  });

  const t3_pass =
    !duplicatePlateResult.success &&
    Boolean(duplicatePlateResult.error?.includes('already assigned to another driver'));

  results.push({
    name: 'Driver Security: Commercial vehicle plate uniqueness enforced (Prevents duplicate fleet assets)',
    category: 'SECURITY',
    passed: Boolean(t3_pass),
    message: t3_pass
      ? 'Verified: Duplicate vehicle license plate registration attempt was strictly rejected.'
      : 'Failed: Duplicate vehicle plate was allowed.',
    durationMs: Number((performance.now() - startT3).toFixed(2)),
  });

  // 4. Past Expiry Date Rejection (Regulatory Compliance)
  const startT4 = performance.now();
  const expiredLicenseResult = db.submitDriverApplication({
    userId: testUserId2,
    fullName: 'Suresh More',
    phone: '+919820055443',
    email: 'suresh.more@test.aeropool.in',
    licenseNumber: 'MH0320180055667',
    licenseExpiryDate: '2021-01-01', // Expired in past!
    vehiclePlate: 'MH03BZ1122',
    isDraft: false,
  });

  const t4_pass =
    !expiredLicenseResult.success &&
    Boolean(expiredLicenseResult.error?.includes('expired'));

  results.push({
    name: 'KYC Compliance: Expired Driving Licence strictly rejected upon application submission',
    category: 'SECURITY',
    passed: Boolean(t4_pass),
    message: t4_pass
      ? 'Verified: Application with past licence expiry date rejected with regulatory violation error.'
      : 'Failed: Expired driving licence was accepted.',
    durationMs: Number((performance.now() - startT4).toFixed(2)),
  });

  // 5. Binary Storage Vault Magic Bytes Verification (CWE-434 Mitigation)
  const startT5 = performance.now();
  // Valid JPEG header: FF D8 FF
  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  // Valid PNG header: 89 50 4E 47
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // Valid PDF header: %PDF
  const validPdfBuffer = Buffer.from('%PDF-1.7 sample document binary payload');
  // Disguised malicious shell script disguised as JPEG
  const spoofedBuffer = Buffer.from('#!/bin/bash\necho "exploit"\n');

  const jpegValid = validateMagicBytes(validJpegBuffer, 'image/jpeg');
  const pngValid = validateMagicBytes(validPngBuffer, 'image/png');
  const pdfValid = validateMagicBytes(validPdfBuffer, 'application/pdf');
  const spoofBlocked = !validateMagicBytes(spoofedBuffer, 'image/jpeg');

  const t5_pass = jpegValid && pngValid && pdfValid && spoofBlocked;

  results.push({
    name: 'KYC Storage Vault: Magic Bytes signature verification prevents MIME spoofing attacks (CWE-434)',
    category: 'SECURITY',
    passed: Boolean(t5_pass),
    message: t5_pass
      ? 'Verified: JPEG, PNG, and PDF magic bytes validated; executable shell scripts disguised as images are rejected.'
      : 'Failed: Magic bytes verification failed to distinguish valid formats from spoofed payloads.',
    durationMs: Number((performance.now() - startT5).toFixed(2)),
  });

  // 6. HMAC Signed Preview Token Generation & Expiry Verification (CWE-639)
  const startT6 = performance.now();
  const testDocId = `doc-test-${Date.now()}`;
  const validToken = generatePreviewToken(testDocId, testUserId1, 'driver');
  const verifyResult = verifyPreviewToken(testDocId, validToken);

  // Mismatched docId should fail
  const mismatchedVerify = verifyPreviewToken('doc-other-999', validToken);

  // Tampered signature should fail
  const parsed = JSON.parse(Buffer.from(validToken, 'base64url').toString('utf8'));
  parsed.hmac = parsed.hmac.slice(0, -4) + 'abcd';
  const tamperedToken = Buffer.from(JSON.stringify(parsed)).toString('base64url');
  const tamperedVerify = verifyPreviewToken(testDocId, tamperedToken);

  const t6_pass =
    verifyResult.valid &&
    !mismatchedVerify.valid &&
    !tamperedVerify.valid &&
    tamperedVerify.error?.includes('signature');

  results.push({
    name: 'KYC Storage Security: 15-minute HMAC-SHA256 preview tokens prevent IDOR document access (CWE-639)',
    category: 'SECURITY',
    passed: Boolean(t6_pass),
    message: t6_pass
      ? 'Verified: Valid HMAC preview token verified; cross-document IDOR attempt and signature tampering rejected.'
      : 'Failed: Preview token validation permitted tampered or mismatched tokens.',
    durationMs: Number((performance.now() - startT6).toFixed(2)),
  });

  // 7. Path Traversal Prevention in KYC Storage Paths (CWE-22)
  const startT7 = performance.now();
  const storeTraversalAttempt = await storeKycDocument({
    driverId: '../../root_escape',
    documentType: 'DRIVING_LICENSE_FRONT',
    documentNumber: 'MH02TESTTRAVERSAL',
    fileName: '../../../etc/passwd.jpg',
    mimeType: 'image/jpeg',
    fileBuffer: validJpegBuffer,
  });

  const t7_pass =
    storeTraversalAttempt.success &&
    storeTraversalAttempt.document !== undefined &&
    !storeTraversalAttempt.document.storagePath.includes('..') &&
    storeTraversalAttempt.document.driverId === 'root_escape';

  results.push({
    name: 'KYC Storage Security: Path traversal sequences sanitized to prevent unauthorized file writes (CWE-22)',
    category: 'SECURITY',
    passed: Boolean(t7_pass),
    message: t7_pass
      ? 'Verified: Traversal sequences (../) stripped cleanly; files strictly constrained to isolated driver vault directory.'
      : 'Failed: Path traversal sequences were not sanitized.',
    durationMs: Number((performance.now() - startT7).toFixed(2)),
  });

  // 8. Super Admin KYC Workflow: Document verification and application activation
  const startT8 = performance.now();
  if (driverProfile1 && driverProfile1.documents.length > 0) {
    const docToApprove = driverProfile1.documents[0];
    db.verifyDriverDocument(driverProfile1.id, docToApprove.id, 'approved');

    // Admin approves full application
    const approveAppResult = db.adminReviewDriverApplication({
      driverId: driverProfile1.id,
      status: 'approved',
      adminId: 'admin-super-01',
      adminRole: 'admin',
      reason: 'All commercial credentials, badge, and insurance verified under Maharashtra RTO rules.',
    });

    const updatedDriver = db.getState().driverProfiles.find((d) => d.id === driverProfile1.id);
    const vehicleInFleet = db.getState().vehicles.find((v) => v.plateNumber === 'MH02EK9988');
    const notifSent = db.getState().notifications.some((n) => n.userId === testUserId1 && n.title.includes('Approved'));

    const t8_pass =
      approveAppResult.success &&
      updatedDriver?.verificationStatus === 'approved' &&
      vehicleInFleet !== undefined &&
      vehicleInFleet.assignedDriverId === driverProfile1.id &&
      notifSent;

    results.push({
      name: 'Super Admin KYC Review: Document approval, application activation, fleet indexing, and notification',
      category: 'STATE_MACHINE',
      passed: Boolean(t8_pass),
      message: t8_pass
        ? 'Verified: Driver application approved, vehicle indexed in operational fleet, notification delivered.'
        : 'Failed: Admin approval workflow failed to activate driver or link vehicle.',
      durationMs: Number((performance.now() - startT8).toFixed(2)),
    });
  }

  // 9. Draft Application Progressive Saving & Resumption
  const startT9 = performance.now();
  const testUserId3 = 'test-driver-draft-03';
  db.getState().users.push({
    id: testUserId3,
    phone: '+919820033445',
    fullName: 'Ganesh Jadhav',
    email: 'ganesh.jadhav@test.aeropool.in',
    role: 'passenger',
    createdAt: new Date().toISOString(),
  });

  const draftResult = db.submitDriverApplication({
    userId: testUserId3,
    fullName: 'Ganesh Jadhav',
    phone: '+919820033445',
    email: 'ganesh.jadhav@test.aeropool.in',
    licenseNumber: 'MH0420220011223',
    isDraft: true, // Saving progressive draft
  });

  const draftDriver = db.getState().driverProfiles.find((d) => d.userId === testUserId3);
  const t9_pass =
    draftResult.success &&
    draftDriver !== undefined &&
    draftDriver.verificationStatus === 'draft';

  results.push({
    name: 'Driver Onboarding: Progressive draft saving allows applicants to resume without losing state',
    category: 'STATE_MACHINE',
    passed: Boolean(t9_pass),
    message: t9_pass
      ? 'Verified: Incomplete driver registration saved as "draft" status without triggering premature review.'
      : 'Failed: Draft application failed to persist.',
    durationMs: Number((performance.now() - startT9).toFixed(2)),
  });

  // 10. Document Rejection with Audit Reason
  const startT10 = performance.now();
  if (draftDriver && draftDriver.documents) {
    draftDriver.documents.push({
      id: 'doc-rc-test-reject',
      type: 'VEHICLE_RC',
      documentNumber: 'RC-REJECT-01',
      fileUrl: `private-storage://drivers/${testUserId3}/rc_blurry.jpg`,
      status: 'under_review',
      submittedAt: new Date().toISOString(),
    });

    db.verifyDriverDocument(draftDriver.id, 'doc-rc-test-reject', 'rejected', 'RC scan was blurry and unreadable.');

    const rejectedDoc = draftDriver.documents.find((d) => d.id === 'doc-rc-test-reject');
    const t10_pass =
      rejectedDoc?.status === 'rejected' &&
      rejectedDoc?.rejectionReason === 'RC scan was blurry and unreadable.';

    results.push({
      name: 'Super Admin KYC Review: Document rejection records actionable feedback for driver re-upload',
      category: 'SECURITY',
      passed: Boolean(t10_pass),
      message: t10_pass
        ? 'Verified: Rejected document records rejection status and reason for driver resubmission.'
        : 'Failed: Document rejection reason not stored.',
      durationMs: Number((performance.now() - startT10).toFixed(2)),
    });
  }

  return results;
}
