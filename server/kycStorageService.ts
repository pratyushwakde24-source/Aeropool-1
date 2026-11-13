import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredKycDocument {
  id: string;
  driverId: string;
  documentType: string;
  documentNumber: string;
  expiryDate?: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string; // Object path e.g. 'drivers/<driverId>/<docType>/<filename>'
  storageBackend: 'local_disk' | 'supabase_storage';
  bucketName?: string;
  submittedAt: string;
  status: 'under_review' | 'approved' | 'rejected';
  rejectionReason?: string;
  sha256Checksum: string;
}

export interface StorageUploadParams {
  driverId: string;
  documentType: string;
  documentNumber: string;
  expiryDate?: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
}

export interface StorageUploadResult {
  success: boolean;
  document?: StoredKycDocument;
  error?: string;
}

export interface DocumentBinaryResult {
  binary: Buffer | null;
  status: 'FOUND' | 'NOT_FOUND' | 'BACKEND_UNAVAILABLE';
  error?: string;
}

export interface IKycStorageAdapter {
  readonly backend: 'local_disk' | 'supabase_storage';
  upload(params: StorageUploadParams): Promise<StorageUploadResult>;
  getBinary(doc: StoredKycDocument): Promise<Buffer | null>;
  getBinaryDetailed?(doc: StoredKycDocument): Promise<DocumentBinaryResult>;
  createSignedPreview(doc: StoredKycDocument, expiresInSeconds?: number): Promise<string | null>;
  delete?(storagePath: string): Promise<boolean>;
}

// In-memory document index + disk persistence for sandbox resilience
const kycDocumentRegistry = new Map<string, StoredKycDocument>();

// Ensure local storage directory exists
const STORAGE_ROOT = path.resolve(__dirname, 'storage', 'kyc-vault');
if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

const REGISTRY_FILE = path.join(STORAGE_ROOT, 'kyc_registry.json');

// Rehydrate registry from disk on startup
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.id) {
            kycDocumentRegistry.set(item.id, item);
          }
        }
      }
    }
  } catch {
    // Silently continue if registry file is unreadable
  }
}
loadRegistry();

function persistRegistry() {
  try {
    const list = Array.from(kycDocumentRegistry.values());
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    // Silently continue if persistence fails
  }
}

// Allowed MIME types and extensions
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

let sessionKycSecret: string | null = null;

/**
 * Retrieve cryptographic secret for HMAC preview token signing.
 * Strictly avoids hardcoded fallback secrets or Razorpay secret re-use.
 */
export function getKycTokenSecret(): string {
  const configuredSecret = process.env.KYC_TOKEN_SECRET || process.env.JWT_SECRET;
  if (configuredSecret && configuredSecret.trim().length >= 32) {
    return configuredSecret.trim();
  }
  const isProduction =
    (process.env.VITE_OPERATING_MODE || process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProduction) {
    throw new Error(
      'KYC Security Configuration Error: Mandatory KYC_TOKEN_SECRET (or JWT_SECRET) with minimum 32 characters is required in production mode.'
    );
  }
  // In development / sandbox mode: generate a high-entropy session secret in memory
  if (!sessionKycSecret) {
    sessionKycSecret = crypto.randomBytes(32).toString('hex');
  }
  return sessionKycSecret;
}

/**
 * Validate binary buffer magic bytes to prevent MIME spoofing (CWE-434 mitigation)
 */
export function validateMagicBytes(buffer: Buffer, expectedMime: string): boolean {
  if (buffer.length < 4) return false;

  if (expectedMime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (expectedMime === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (expectedMime === 'application/pdf') {
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ); // %PDF
  }
  if (expectedMime === 'image/webp') {
    // RIFF....WEBP
    if (buffer.length < 12) return false;
    const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
    const isWebp = buffer.toString('ascii', 8, 12) === 'WEBP';
    return isRiff && isWebp;
  }

  return false;
}

/**
 * Sanitize filename and identifiers to prevent Path Traversal (CWE-22)
 */
export function sanitizeIdentifier(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Validate upload parameters common to all adapters
 */
function validateUploadCommon(params: StorageUploadParams): { isValid: boolean; error?: string; extension?: string; normMime?: string } {
  const { driverId, documentType, documentNumber, mimeType, fileBuffer } = params;

  if (!driverId || !documentType || !documentNumber) {
    return { isValid: false, error: 'Missing mandatory document parameters: driverId, documentType, documentNumber required.' };
  }

  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds 5 MB limit (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB).`,
    };
  }

  if (fileBuffer.length === 0) {
    return { isValid: false, error: 'Uploaded file is empty.' };
  }

  const normMime = mimeType.toLowerCase().trim();
  const extension = ALLOWED_MIME_TYPES[normMime];
  if (!extension) {
    return {
      isValid: false,
      error: `Unsupported file type: ${mimeType}. Allowed formats are JPEG, PNG, WebP, and PDF.`,
    };
  }

  if (!validateMagicBytes(fileBuffer, normMime)) {
    return {
      isValid: false,
      error: 'File contents do not match the declared MIME type (tampered or corrupted file rejected).',
    };
  }

  return { isValid: true, extension, normMime };
}

/**
 * Generate HMAC signed short-lived preview token (valid for 15 minutes)
 */
export function generatePreviewToken(documentId: string, userId: string, role: string): string {
  const secret = getKycTokenSecret();
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const payload = `${documentId}:${userId}:${role}:${expiresAt}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ documentId, userId, role, expiresAt, hmac })).toString('base64url');
}

/**
 * Verify HMAC signed preview token
 */
export function verifyPreviewToken(
  documentId: string,
  tokenString: string
): { valid: boolean; userId?: string; role?: string; error?: string } {
  try {
    const raw = Buffer.from(tokenString, 'base64url').toString('utf8');
    const { documentId: docId, userId, role, expiresAt, hmac } = JSON.parse(raw);

    if (docId !== documentId) {
      return { valid: false, error: 'Token document mismatch.' };
    }
    if (Date.now() > expiresAt) {
      return { valid: false, error: 'Preview token has expired.' };
    }

    const secret = getKycTokenSecret();
    const expectedPayload = `${docId}:${userId}:${role}:${expiresAt}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    const hmacBuf = Buffer.from(hmac);
    const expectedBuf = Buffer.from(expectedHmac);

    if (hmacBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
      return { valid: false, error: 'Invalid preview token signature.' };
    }

    return { valid: true, userId, role };
  } catch {
    return { valid: false, error: 'Malformed preview token.' };
  }
}

// ----------------------------------------------------------------------------
// ADAPTER A: Local Filesystem Storage Adapter (Sandbox / Development)
// ----------------------------------------------------------------------------
export class LocalStorageAdapter implements IKycStorageAdapter {
  public readonly backend = 'local_disk' as const;

  public async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    const validation = validateUploadCommon(params);
    if (!validation.isValid || !validation.extension || !validation.normMime) {
      return { success: false, error: validation.error };
    }

    const safeDriverId = sanitizeIdentifier(params.driverId);
    const safeDocType = sanitizeIdentifier(params.documentType).toUpperCase();
    const fileEntropy = crypto.randomBytes(8).toString('hex');
    const safeFileName = `${safeDocType.toLowerCase()}_${Date.now()}_${fileEntropy}.${validation.extension}`;

    // Target directory: STORAGE_ROOT/<driverId>/<docType>/
    const driverDir = path.join(STORAGE_ROOT, safeDriverId, safeDocType);
    if (!fs.existsSync(driverDir)) {
      fs.mkdirSync(driverDir, { recursive: true });
    }

    const absoluteFilePath = path.join(driverDir, safeFileName);
    fs.writeFileSync(absoluteFilePath, params.fileBuffer);

    // Object path matching unified structure: drivers/<driverId>/<documentType>/<uniqueFileName>
    const objectPath = `drivers/${safeDriverId}/${safeDocType}/${safeFileName}`;
    const sha256Checksum = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');
    const docId = crypto.randomUUID();

    const docRecord: StoredKycDocument = {
      id: docId,
      driverId: safeDriverId,
      documentType: params.documentType,
      documentNumber: params.documentNumber.trim().toUpperCase(),
      expiryDate: params.expiryDate ? params.expiryDate.trim() : undefined,
      fileName: path.basename(params.fileName || safeFileName),
      mimeType: validation.normMime,
      fileSizeBytes: params.fileBuffer.length,
      storagePath: objectPath,
      storageBackend: this.backend,
      submittedAt: new Date().toISOString(),
      status: 'under_review',
      sha256Checksum,
    };

    kycDocumentRegistry.set(docId, docRecord);
    persistRegistry();

    return { success: true, document: docRecord };
  }

  public async getBinaryDetailed(doc: StoredKycDocument): Promise<DocumentBinaryResult> {
    try {
      if (!fs.existsSync(STORAGE_ROOT)) {
        return {
          binary: null,
          status: 'BACKEND_UNAVAILABLE',
          error: 'Local disk storage root directory is inaccessible or unmounted.',
        };
      }

      // Parse objectPath: drivers/<driverId>/<docType>/<fileName> or legacy kyc-vault/drivers/<driverId>/<fileName>
      let fullPath: string;
      if (doc.storagePath.startsWith('drivers/')) {
        const parts = doc.storagePath.replace('drivers/', '').split('/');
        if (parts.length >= 3) {
          const [driverDir, docTypeDir, fileName] = parts;
          fullPath = path.join(STORAGE_ROOT, driverDir, docTypeDir, fileName);
        } else if (parts.length === 2) {
          const [driverDir, fileName] = parts;
          fullPath = path.join(STORAGE_ROOT, driverDir, fileName);
        } else {
          return { binary: null, status: 'NOT_FOUND', error: 'Malformed storage path.' };
        }
      } else {
        const parts = doc.storagePath.replace('kyc-vault/drivers/', '').split('/');
        if (parts.length < 2) return { binary: null, status: 'NOT_FOUND', error: 'Malformed legacy storage path.' };
        const [driverDir, fileName] = parts;
        fullPath = path.join(STORAGE_ROOT, driverDir, fileName);
      }

      if (!fs.existsSync(fullPath)) {
        return { binary: null, status: 'NOT_FOUND', error: 'Document file contents not found on local disk.' };
      }
      return { binary: fs.readFileSync(fullPath), status: 'FOUND' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Local disk error';
      return { binary: null, status: 'BACKEND_UNAVAILABLE', error: `Local disk error: ${msg}` };
    }
  }

  public async getBinary(doc: StoredKycDocument): Promise<Buffer | null> {
    const res = await this.getBinaryDetailed(doc);
    return res.binary;
  }

  public async createSignedPreview(doc: StoredKycDocument, _expiresInSeconds = 900): Promise<string | null> {
    const token = generatePreviewToken(doc.id, doc.driverId, 'driver');
    return `/api/driver/document-preview/${doc.id}?token=${token}`;
  }

  public async delete(storagePath: string): Promise<boolean> {
    try {
      const parts = storagePath.replace(/^drivers\//, '').split('/');
      const fullPath = path.join(STORAGE_ROOT, ...parts);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

// ----------------------------------------------------------------------------
// ADAPTER B: Supabase Private Storage Adapter (Production / Cloud Staging)
// ----------------------------------------------------------------------------
let mockSupabaseStorageClient: any = null;

export function setMockSupabaseStorageClient(mockClient: any): void {
  mockSupabaseStorageClient = mockClient;
}

export function clearMockSupabaseStorageClient(): void {
  mockSupabaseStorageClient = null;
}

export class SupabaseStorageAdapter implements IKycStorageAdapter {
  public readonly backend = 'supabase_storage' as const;
  private readonly bucketName: string;

  constructor() {
    this.bucketName = process.env.SUPABASE_KYC_BUCKET || 'kyc-vault';
  }

  private getClient(): SupabaseClient | null {
    if (mockSupabaseStorageClient) {
      return mockSupabaseStorageClient as SupabaseClient;
    }

    const url = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!url || !serviceRoleKey || url.includes('your-project') || serviceRoleKey.includes('your-service-role')) {
      return null;
    }

    return createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  public async upload(params: StorageUploadParams): Promise<StorageUploadResult> {
    const validation = validateUploadCommon(params);
    if (!validation.isValid || !validation.extension || !validation.normMime) {
      return { success: false, error: validation.error };
    }

    const client = this.getClient();
    if (!client) {
      return {
        success: false,
        error:
          'Supabase Storage Configuration Error: SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL are required for Supabase Storage adapter.',
      };
    }

    // Isolated path adhering strictly to: drivers/<driverId>/<documentType>/<uniqueFileName>
    const safeDriverId = sanitizeIdentifier(params.driverId);
    const safeDocType = sanitizeIdentifier(params.documentType).toUpperCase();
    const fileEntropy = crypto.randomBytes(8).toString('hex');
    const safeFileName = `${safeDocType.toLowerCase()}_${Date.now()}_${fileEntropy}.${validation.extension}`;
    const objectPath = `drivers/${safeDriverId}/${safeDocType}/${safeFileName}`;

    try {
      const { data, error } = await client.storage
        .from(this.bucketName)
        .upload(objectPath, params.fileBuffer, {
          contentType: validation.normMime,
          upsert: false, // Non-destructive: Never overwrite existing historical scans
        });

      if (error || !data) {
        // Do NOT silently fall back to local disk in staging or production
        return {
          success: false,
          error: `Supabase Storage upload failed: ${error?.message || 'Unknown upload rejection'}`,
        };
      }

      const sha256Checksum = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');
      const docId = crypto.randomUUID();

      const docRecord: StoredKycDocument = {
        id: docId,
        driverId: safeDriverId,
        documentType: params.documentType,
        documentNumber: params.documentNumber.trim().toUpperCase(),
        expiryDate: params.expiryDate ? params.expiryDate.trim() : undefined,
        fileName: path.basename(params.fileName || safeFileName),
        mimeType: validation.normMime,
        fileSizeBytes: params.fileBuffer.length,
        storagePath: objectPath, // Permanent cloud object path only (NO signed URLs stored)
        storageBackend: this.backend,
        bucketName: this.bucketName,
        submittedAt: new Date().toISOString(),
        status: 'under_review',
        sha256Checksum,
      };

      kycDocumentRegistry.set(docId, docRecord);
      persistRegistry();

      return { success: true, document: docRecord };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Storage network error';
      return {
        success: false,
        error: `Supabase Storage network error: ${msg}`,
      };
    }
  }

  public async getBinaryDetailed(doc: StoredKycDocument): Promise<DocumentBinaryResult> {
    const client = this.getClient();
    if (!client) {
      return {
        binary: null,
        status: 'BACKEND_UNAVAILABLE',
        error: 'Supabase Storage credentials unconfigured or missing (SUPABASE_SERVICE_ROLE_KEY required).',
      };
    }

    try {
      const { data, error } = await client.storage
        .from(this.bucketName)
        .download(doc.storagePath);

      if (error) {
        const msg = error.message || '';
        if (msg.includes('not found') || msg.includes('404') || (error as any).statusCode === '404') {
          return {
            binary: null,
            status: 'NOT_FOUND',
            error: `Object "${doc.storagePath}" not found in bucket "${this.bucketName}".`,
          };
        }
        return {
          binary: null,
          status: 'BACKEND_UNAVAILABLE',
          error: `Supabase Storage error: ${msg}`,
        };
      }

      if (!data) {
        return {
          binary: null,
          status: 'NOT_FOUND',
          error: `Empty payload returned from bucket "${this.bucketName}".`,
        };
      }

      if (typeof (data as any).arrayBuffer === 'function') {
        const ab = await (data as any).arrayBuffer();
        return { binary: Buffer.from(ab), status: 'FOUND' };
      }
      return { binary: Buffer.from(data as any), status: 'FOUND' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Storage network error';
      return {
        binary: null,
        status: 'BACKEND_UNAVAILABLE',
        error: `Supabase Storage network error: ${msg}`,
      };
    }
  }

  public async getBinary(doc: StoredKycDocument): Promise<Buffer | null> {
    const res = await this.getBinaryDetailed(doc);
    return res.binary;
  }

  public async createSignedPreview(doc: StoredKycDocument, expiresInSeconds = 900): Promise<string | null> {
    const client = this.getClient();
    if (!client) return null;

    try {
      const { data, error } = await client.storage
        .from(this.bucketName)
        .createSignedUrl(doc.storagePath, expiresInSeconds);

      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }

  public async delete(storagePath: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;

    try {
      const { error } = await client.storage
        .from(this.bucketName)
        .remove([storagePath]);
      return !error;
    } catch {
      return false;
    }
  }
}

// ----------------------------------------------------------------------------
// METADATA REPOSITORY INTERFACE & IMPLEMENTATIONS
// ----------------------------------------------------------------------------

export interface IKycMetadataRepository {
  readonly backend: 'local_json' | 'supabase_postgres';
  findById(id: string): Promise<StoredKycDocument | null>;
  findByDriverId(driverId: string): Promise<StoredKycDocument[]>;
  save(doc: StoredKycDocument): Promise<{ success: boolean; error?: string }>;
  updateStatus(id: string, status: StoredKycDocument['status'], rejectionReason?: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

export class LocalJsonMetadataRepository implements IKycMetadataRepository {
  public readonly backend = 'local_json' as const;

  public async findById(id: string): Promise<StoredKycDocument | null> {
    return kycDocumentRegistry.get(id) || null;
  }

  public async findByDriverId(driverId: string): Promise<StoredKycDocument[]> {
    const safeDriverId = sanitizeIdentifier(driverId);
    return Array.from(kycDocumentRegistry.values()).filter((d) => d.driverId === safeDriverId);
  }

  public async save(doc: StoredKycDocument): Promise<{ success: boolean; error?: string }> {
    try {
      kycDocumentRegistry.set(doc.id, doc);
      persistRegistry();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Local registry persistence failed';
      return { success: false, error: msg };
    }
  }

  public async updateStatus(id: string, status: StoredKycDocument['status'], rejectionReason?: string): Promise<boolean> {
    const doc = kycDocumentRegistry.get(id);
    if (!doc) return false;
    doc.status = status;
    if (rejectionReason) doc.rejectionReason = rejectionReason;
    kycDocumentRegistry.set(id, doc);
    persistRegistry();
    return true;
  }

  public async delete(id: string): Promise<boolean> {
    const deleted = kycDocumentRegistry.delete(id);
    if (deleted) persistRegistry();
    return deleted;
  }
}

let mockSupabaseDbClient: any = null;

export function setMockSupabaseDbClient(mockClient: any): void {
  mockSupabaseDbClient = mockClient;
}

export function clearMockSupabaseDbClient(): void {
  mockSupabaseDbClient = null;
}

export class SupabasePostgresMetadataRepository implements IKycMetadataRepository {
  public readonly backend = 'supabase_postgres' as const;

  private getClient(): SupabaseClient | null {
    if (mockSupabaseDbClient) {
      return mockSupabaseDbClient as SupabaseClient;
    }

    const url = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!url || !serviceRoleKey || url.includes('your-project') || serviceRoleKey.includes('your-service-role')) {
      return null;
    }

    return createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  public async findById(id: string): Promise<StoredKycDocument | null> {
    const cached = kycDocumentRegistry.get(id);
    if (cached) return cached;

    const client = this.getClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from('driver_documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) return null;

      const doc: StoredKycDocument = {
        id: data.id,
        driverId: data.driver_id,
        documentType: data.document_type,
        documentNumber: data.document_number,
        expiryDate: data.expiry_date || undefined,
        fileName: data.file_name || `${data.document_type}.pdf`,
        mimeType: data.mime_type || 'application/pdf',
        fileSizeBytes: data.file_size_bytes || 0,
        storagePath: data.storage_path || data.file_url,
        storageBackend: (data.storage_backend as any) || 'supabase_storage',
        submittedAt: data.submitted_at || new Date().toISOString(),
        status: data.status || 'under_review',
        rejectionReason: data.rejection_reason || undefined,
        sha256Checksum: data.sha256_checksum || '',
      };

      kycDocumentRegistry.set(doc.id, doc);
      return doc;
    } catch {
      return null;
    }
  }

  public async findByDriverId(driverId: string): Promise<StoredKycDocument[]> {
    const safeDriverId = sanitizeIdentifier(driverId);
    const client = this.getClient();
    if (!client) {
      return Array.from(kycDocumentRegistry.values()).filter((d) => d.driverId === safeDriverId);
    }

    try {
      const { data, error } = await client
        .from('driver_documents')
        .select('*')
        .eq('driver_id', safeDriverId);

      if (error || !data) {
        return Array.from(kycDocumentRegistry.values()).filter((d) => d.driverId === safeDriverId);
      }

      return data.map((row: any) => {
        const doc: StoredKycDocument = {
          id: row.id,
          driverId: row.driver_id,
          documentType: row.document_type,
          documentNumber: row.document_number,
          expiryDate: row.expiry_date || undefined,
          fileName: row.file_name || `${row.document_type}.pdf`,
          mimeType: row.mime_type || 'application/pdf',
          fileSizeBytes: row.file_size_bytes || 0,
          storagePath: row.storage_path || row.file_url,
          storageBackend: (row.storage_backend as any) || 'supabase_storage',
          submittedAt: row.submitted_at || new Date().toISOString(),
          status: row.status || 'under_review',
          rejectionReason: row.rejection_reason || undefined,
          sha256Checksum: row.sha256_checksum || '',
        };
        kycDocumentRegistry.set(doc.id, doc);
        return doc;
      });
    } catch {
      return Array.from(kycDocumentRegistry.values()).filter((d) => d.driverId === safeDriverId);
    }
  }

  public async save(doc: StoredKycDocument): Promise<{ success: boolean; error?: string }> {
    const client = this.getClient();
    if (!client) {
      return {
        success: false,
        error:
          'Supabase Database Configuration Error: SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL are required for PostgreSQL metadata persistence.',
      };
    }

    try {
      const record = {
        id: doc.id,
        driver_id: doc.driverId,
        document_type: doc.documentType,
        document_number: doc.documentNumber,
        expiry_date: doc.expiryDate || null,
        file_url: doc.storagePath,
        storage_path: doc.storagePath,
        storage_backend: doc.storageBackend,
        file_name: doc.fileName,
        mime_type: doc.mimeType,
        file_size_bytes: doc.fileSizeBytes,
        sha256_checksum: doc.sha256Checksum,
        status: doc.status || 'under_review',
        submitted_at: doc.submittedAt || new Date().toISOString(),
      };

      const { error } = await client.from('driver_documents').insert(record);
      if (error) {
        return {
          success: false,
          error: `PostgreSQL insert error on driver_documents: ${error.message}`,
        };
      }

      kycDocumentRegistry.set(doc.id, doc);
      persistRegistry();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database error';
      return {
        success: false,
        error: `Supabase PostgreSQL network/query error: ${msg}`,
      };
    }
  }

  public async updateStatus(id: string, status: StoredKycDocument['status'], rejectionReason?: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;

    try {
      const { error } = await client
        .from('driver_documents')
        .update({
          status,
          rejection_reason: rejectionReason || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (!error) {
        const cached = kycDocumentRegistry.get(id);
        if (cached) {
          cached.status = status;
          if (rejectionReason) cached.rejectionReason = rejectionReason;
          kycDocumentRegistry.set(id, cached);
          persistRegistry();
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async delete(id: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;

    try {
      const { error } = await client.from('driver_documents').delete().eq('id', id);
      if (!error) {
        kycDocumentRegistry.delete(id);
        persistRegistry();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

// ----------------------------------------------------------------------------
// FACTORY & PUBLIC API
// ----------------------------------------------------------------------------

const localAdapterInstance = new LocalStorageAdapter();
let supabaseAdapterInstance: SupabaseStorageAdapter | null = null;

export function getKycStorageProvider(overrideProvider?: 'local' | 'supabase'): IKycStorageAdapter {
  const provider =
    overrideProvider ||
    (process.env.AEROPOOL_KYC_STORAGE_PROVIDER || 'local').toLowerCase().trim();

  if (provider === 'supabase') {
    if (!supabaseAdapterInstance) {
      supabaseAdapterInstance = new SupabaseStorageAdapter();
    }
    return supabaseAdapterInstance;
  }

  return localAdapterInstance;
}

const localMetadataRepoInstance = new LocalJsonMetadataRepository();
let supabaseMetadataRepoInstance: SupabasePostgresMetadataRepository | null = null;

export function getKycMetadataRepository(overrideProvider?: 'local' | 'supabase'): IKycMetadataRepository {
  const provider =
    overrideProvider ||
    (process.env.AEROPOOL_KYC_STORAGE_PROVIDER || 'local').toLowerCase().trim();

  if (provider === 'supabase') {
    if (!supabaseMetadataRepoInstance) {
      supabaseMetadataRepoInstance = new SupabasePostgresMetadataRepository();
    }
    return supabaseMetadataRepoInstance;
  }

  return localMetadataRepoInstance;
}

/**
 * Public document storage entry point delegating to active configured provider
 * Implements strict safe sequencing with rollback cleanup on metadata persistence failure.
 */
export async function storeKycDocument(
  params: StorageUploadParams,
  overrideProvider?: 'local' | 'supabase'
): Promise<StorageUploadResult> {
  const storageAdapter = getKycStorageProvider(overrideProvider);
  const metadataRepo = getKycMetadataRepository(overrideProvider);

  // Step 1: Upload binary payload to storage adapter
  const uploadResult = await storageAdapter.upload(params);
  if (!uploadResult.success || !uploadResult.document) {
    return { success: false, error: uploadResult.error || 'Document binary upload failed.' };
  }

  const docRecord = uploadResult.document;

  // Step 2: Persist document metadata in repository (PostgreSQL or local JSON)
  const metaResult = await metadataRepo.save(docRecord);
  if (!metaResult.success) {
    // Safe cleanup rollback: Remove uploaded storage object if metadata persistence fails
    if (typeof storageAdapter.delete === 'function') {
      try {
        await storageAdapter.delete(docRecord.storagePath);
      } catch (cleanupErr) {
        console.error('[KYC Storage] Failed to delete orphan storage object after metadata failure:', cleanupErr);
      }
    }

    return {
      success: false,
      error: `Metadata persistence failed: ${metaResult.error || 'Database write error'}. Binary upload safely rolled back.`,
    };
  }

  return { success: true, document: docRecord };
}

/**
 * Retrieve document metadata by document ID.
 * Multi-backend resilient: checks in-memory registry, then PostgreSQL, then local JSON.
 */
export async function getStoredKycDocument(docId: string): Promise<StoredKycDocument | null> {
  const safeDocId = sanitizeIdentifier(docId);
  if (!safeDocId) return null;

  // 1. In-memory active registry check (fast path)
  const cached = kycDocumentRegistry.get(safeDocId);
  if (cached) return cached;

  // 2. Authoritative PostgreSQL repository check
  const supabaseRepo = getKycMetadataRepository('supabase');
  try {
    const pgDoc = await supabaseRepo.findById(safeDocId);
    if (pgDoc) {
      kycDocumentRegistry.set(pgDoc.id, pgDoc);
      return pgDoc;
    }
  } catch {
    // Non-fatal: PostgreSQL unavailable, fall through to local repository
  }

  // 3. Local JSON repository check
  const localRepo = getKycMetadataRepository('local');
  try {
    const localDoc = await localRepo.findById(safeDocId);
    if (localDoc) {
      kycDocumentRegistry.set(localDoc.id, localDoc);
      return localDoc;
    }
  } catch {
    // Non-fatal
  }

  return null;
}

/**
 * Retrieve binary content of stored document with detailed status & outage discrimination.
 * Never silently redirects or falls back across storage backends!
 */
export async function getDocumentBinaryDetailed(doc: StoredKycDocument): Promise<DocumentBinaryResult> {
  if (doc.storageBackend === 'supabase_storage') {
    const adapter = getKycStorageProvider('supabase');
    if (typeof (adapter as any).getBinaryDetailed === 'function') {
      return (adapter as any).getBinaryDetailed(doc);
    }
    const binary = await adapter.getBinary(doc);
    return binary ? { binary, status: 'FOUND' } : { binary: null, status: 'NOT_FOUND', error: 'Document not found in Supabase Storage.' };
  }

  // local_disk backend
  if (typeof localAdapterInstance.getBinaryDetailed === 'function') {
    return localAdapterInstance.getBinaryDetailed(doc);
  }
  const binary = await localAdapterInstance.getBinary(doc);
  return binary ? { binary, status: 'FOUND' } : { binary: null, status: 'NOT_FOUND', error: 'Document not found on local disk.' };
}

/**
 * Retrieve binary content of stored document (convenience wrapper)
 */
export async function getDocumentBinary(doc: StoredKycDocument): Promise<Buffer | null> {
  const res = await getDocumentBinaryDetailed(doc);
  return res.binary;
}

/**
 * Generate a short-lived signed preview URL for an authorized document
 */
export async function createDocumentSignedPreview(
  doc: StoredKycDocument,
  expiresInSeconds = 900
): Promise<string | null> {
  if (doc.storageBackend === 'supabase_storage') {
    const adapter = getKycStorageProvider('supabase');
    return adapter.createSignedPreview(doc, expiresInSeconds);
  }
  return localAdapterInstance.createSignedPreview(doc, expiresInSeconds);
}

/**
 * Get all documents for a specific driver.
 * Merges authoritative PostgreSQL metadata with local sandbox documents without duplication.
 * Guarantees that documents uploaded to Supabase remain visible even if the provider is rolled back to local.
 */
export async function getDriverDocuments(driverId: string): Promise<StoredKycDocument[]> {
  const safeDriverId = sanitizeIdentifier(driverId);
  if (!safeDriverId) return [];

  const docMap = new Map<string, StoredKycDocument>();

  // 1. Authoritative PostgreSQL repository check
  const supabaseRepo = getKycMetadataRepository('supabase');
  try {
    const pgDocs = await supabaseRepo.findByDriverId(safeDriverId);
    for (const d of pgDocs) {
      if (d && d.id) {
        docMap.set(d.id, d);
      }
    }
  } catch (err) {
    // Non-fatal if Supabase is offline; continue to local repository
  }

  // 2. Local JSON repository check (includes local sandbox documents)
  const localRepo = getKycMetadataRepository('local');
  try {
    const localDocs = await localRepo.findByDriverId(safeDriverId);
    for (const d of localDocs) {
      if (d && d.id && !docMap.has(d.id)) {
        docMap.set(d.id, d);
      }
    }
  } catch (err) {
    // Non-fatal
  }

  // 3. In-memory active registry check for any newly-registered in-flight records
  for (const d of kycDocumentRegistry.values()) {
    if (d && d.driverId === safeDriverId && !docMap.has(d.id)) {
      docMap.set(d.id, d);
    }
  }

  return Array.from(docMap.values());
}

/**
 * Startup rehydration: Synchronize PostgreSQL documents into local in-memory registry on boot.
 * Protects against metadata loss on ephemeral cloud containers.
 */
export async function rehydrateRegistryFromPostgres(): Promise<number> {
  const supabaseRepo = getKycMetadataRepository('supabase');
  try {
    const client = (supabaseRepo as any).getClient?.();
    if (!client) return 0;

    const { data, error } = await client
      .from('driver_documents')
      .select('*')
      .limit(500);

    if (error || !data) return 0;

    let count = 0;
    for (const row of data) {
      if (row && row.id) {
        const doc: StoredKycDocument = {
          id: row.id,
          driverId: row.driver_id,
          documentType: row.document_type,
          documentNumber: row.document_number,
          expiryDate: row.expiry_date || undefined,
          fileName: row.file_name || `${row.document_type}.pdf`,
          mimeType: row.mime_type || 'application/pdf',
          fileSizeBytes: row.file_size_bytes || 0,
          storagePath: row.storage_path || row.file_url,
          storageBackend: (row.storage_backend as any) || 'supabase_storage',
          submittedAt: row.submitted_at || new Date().toISOString(),
          status: row.status || 'under_review',
          rejectionReason: row.rejection_reason || undefined,
          sha256Checksum: row.sha256_checksum || '',
        };
        kycDocumentRegistry.set(doc.id, doc);
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Isolated test helper: Clear in-memory registry to simulate process restarts or ephemeral disks.
 */
export function clearKycRegistryForTesting(): void {
  kycDocumentRegistry.clear();
}
