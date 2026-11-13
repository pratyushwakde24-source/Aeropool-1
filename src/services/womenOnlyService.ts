import { WomenOnlyPoolConfig, WomenOnlyVerificationRecord, RidePool, UserProfile } from '../types';
import { db } from './db';

const STORAGE_KEY = 'aeropool_women_only_config_v1';

export const DEFAULT_WOMEN_ONLY_CONFIG: WomenOnlyPoolConfig = {
  enabled: true,
  nighttimeStartHour: 20, // 8:00 PM (20:00) IST
  nighttimeEndHour: 6,    // 6:00 AM (06:00) IST
  timezone: 'Asia/Kolkata',
  eligibleAirports: ['BOM'],
  eligiblePickupZones: [], // Empty means all CSMIA pickup zones permitted
  allowDaytimeBooking: true,
  requireOptInVerification: true,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
};

/**
 * In-memory / persistent config store for Women-Only Pool
 */
class WomenOnlyPoolManager {
  private config: WomenOnlyPoolConfig;
  private verificationRecords: Map<string, WomenOnlyVerificationRecord> = new Map();

  constructor() {
    this.config = this.loadConfig();
    this.seedInitialVerifications();
  }

  private loadConfig(): WomenOnlyPoolConfig {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return { ...DEFAULT_WOMEN_ONLY_CONFIG, ...JSON.parse(stored) };
        }
      }
    } catch {
      // Fallback to default
    }
    return { ...DEFAULT_WOMEN_ONLY_CONFIG };
  }

  private saveConfig(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      }
    } catch {
      // Ignore in non-browser or sandbox environments
    }
  }

  private seedInitialVerifications() {
    // Seed verification for default demo passengers if present
    const demoVerified = [
      { id: 'usr-pass-002', name: 'Dr. Priya Sharma', phone: '+91 98201 44552' },
      { id: 'usr-pass-005', name: 'Ananya Deshmukh', phone: '+91 98202 88991' },
      { id: 'usr-pass-007', name: 'Ritu Varma', phone: '+91 98203 11223' },
    ];
    demoVerified.forEach((p) => {
      this.verificationRecords.set(p.id, {
        id: `wov-${p.id}`,
        passengerId: p.id,
        passengerName: p.name,
        passengerPhone: p.phone,
        status: 'verified',
        optInTimestamp: '2026-11-01T10:00:00.000Z',
        verifiedAt: '2026-11-01T10:05:00.000Z',
        verifiedBy: 'system_auto_review',
        selfDeclarationConfirmed: true,
      });
    });
  }

  public getConfig(): WomenOnlyPoolConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<WomenOnlyPoolConfig>, adminId: string = 'super-admin'): WomenOnlyPoolConfig {
    this.config = {
      ...this.config,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: adminId,
    };
    this.saveConfig();

    // Log administrative action
    db.createAuditLog({
      action: 'UPDATE_WOMEN_ONLY_CONFIG',
      actorId: adminId,
      actorName: 'Super Admin',
      actorRole: 'admin',
      entityType: 'SETTING',
      entityId: 'women-only-pool-config',
      details: `Women-Only Pool config updated: enabled=${this.config.enabled}, nighttime=${this.config.nighttimeStartHour}:00-${this.config.nighttimeEndHour}:00, timezone=${this.config.timezone}`,
    });

    return this.getConfig();
  }

  /**
   * Evaluates whether the given date/time falls within the configured airport nighttime window.
   * Computed using the airport's local timezone (e.g. Asia/Kolkata).
   */
  public isNighttime(date: Date = new Date()): boolean {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: this.config.timezone,
        hour: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const hourPart = parts.find((p) => p.type === 'hour');
      const hour = hourPart ? parseInt(hourPart.value, 10) : date.getHours();

      const { nighttimeStartHour, nighttimeEndHour } = this.config;

      if (nighttimeStartHour > nighttimeEndHour) {
        // e.g. 20 (8 PM) to 6 (6 AM)
        return hour >= nighttimeStartHour || hour < nighttimeEndHour;
      } else {
        // e.g. 22 to 24
        return hour >= nighttimeStartHour && hour < nighttimeEndHour;
      }
    } catch {
      const localHour = date.getHours();
      return localHour >= 20 || localHour < 6;
    }
  }

  /**
   * Check whether a passenger is verified & eligible for Women-Only Pool
   */
  public isPassengerEligible(passengerId: string): boolean {
    // Check in-memory verification map first
    const record = this.verificationRecords.get(passengerId);
    if (record && record.status === 'verified') {
      return true;
    }

    // Check user profile in DB
    const state = db.getState();
    const user = state.users.find((u) => u.id === passengerId);
    if (user && user.isWomenOnlyEligible) {
      return true;
    }

    // Default demo user fallback for passenger testing
    if (passengerId === 'usr-pass-001' || passengerId === 'guest-user-session') {
      return record?.status === 'verified';
    }

    return false;
  }

  /**
   * Voluntary opt-in and self-declaration for women passengers
   */
  public optInPassenger(params: {
    passengerId: string;
    passengerName: string;
    passengerPhone: string;
    selfDeclarationConfirmed: boolean;
  }): { success: boolean; error?: string } {
    if (!params.selfDeclarationConfirmed) {
      return {
        success: false,
        error: 'Explicit voluntary confirmation is required to access Women-Only Pooling.',
      };
    }

    const verificationId = `wov-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const record: WomenOnlyVerificationRecord = {
      id: verificationId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      passengerPhone: params.passengerPhone,
      status: 'verified',
      optInTimestamp: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'passenger_voluntary_opt_in',
      selfDeclarationConfirmed: true,
    };

    this.verificationRecords.set(params.passengerId, record);

    // Update user record in db if existing
    const state = db.getState();
    const existingUser = state.users.find((u) => u.id === params.passengerId);
    if (existingUser) {
      existingUser.isWomenOnlyEligible = true;
      existingUser.womenOnlyVerificationStatus = 'verified';
      existingUser.genderSelfIdentified = 'female';
      existingUser.womenOnlyVerifiedAt = record.verifiedAt;
    }

    // Audit log entry for privacy & compliance audit
    db.createAuditLog({
      action: 'OPT_IN_WOMEN_ONLY',
      actorId: params.passengerId,
      actorName: params.passengerName,
      actorRole: 'passenger',
      entityType: 'SETTING',
      entityId: params.passengerId,
      details: 'Passenger completed voluntary opt-in and self-declaration for Women-Only Pool.',
    });

    return { success: true };
  }

  /**
   * Retrieve all verification records for Super Admin review
   */
  public getAllVerificationRecords(): WomenOnlyVerificationRecord[] {
    return Array.from(this.verificationRecords.values());
  }

  /**
   * Review or revoke a passenger verification status (Super Admin action)
   */
  public setVerificationStatus(
    passengerId: string,
    status: 'verified' | 'rejected',
    adminId: string,
    reason?: string
  ): { success: boolean; error?: string } {
    const record = this.verificationRecords.get(passengerId);
    if (!record) {
      return { success: false, error: 'Verification record not found.' };
    }

    record.status = status;
    record.verifiedBy = adminId;
    record.verifiedAt = new Date().toISOString();
    if (reason) record.rejectionReason = reason;

    const state = db.getState();
    const user = state.users.find((u) => u.id === passengerId);
    if (user) {
      user.isWomenOnlyEligible = status === 'verified';
      user.womenOnlyVerificationStatus = status;
    }

    db.createAuditLog({
      action: status === 'verified' ? 'APPROVE_WOMEN_ONLY_VERIFICATION' : 'REJECT_WOMEN_ONLY_VERIFICATION',
      actorId: adminId,
      actorName: 'Super Admin',
      actorRole: 'admin',
      entityType: 'SETTING',
      entityId: passengerId,
      details: `Admin updated Women-Only verification to ${status}. Reason: ${reason || 'N/A'}`,
    });

    return { success: true };
  }

  /**
   * Aggregate metrics for Super Admin dashboard
   */
  public getAnalytics(): {
    enabled: boolean;
    activePoolsCount: number;
    verifiedPassengersCount: number;
    completedTripsCount: number;
    isNighttimeNow: boolean;
  } {
    const state = db.getState();
    const activePoolsCount = state.pools.filter(
      (p) => p.isWomenOnlyPool && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
    ).length;

    const completedTripsCount = state.pools.filter(
      (p) => p.isWomenOnlyPool && p.status === 'COMPLETED'
    ).length;

    const verifiedPassengersCount = Array.from(this.verificationRecords.values()).filter(
      (r) => r.status === 'verified'
    ).length;

    return {
      enabled: this.config.enabled,
      activePoolsCount,
      verifiedPassengersCount,
      completedTripsCount,
      isNighttimeNow: this.isNighttime(),
    };
  }
}

export const womenOnlyService = new WomenOnlyPoolManager();
