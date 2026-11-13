import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'src/services/db.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const isCrlf = content.includes('\r\n');
if (isCrlf) content = content.replace(/\r\n/g, '\n');

const target = `    this.notify();
    return { success: true };
  }

  /**
   * Driver Onboarding: Submit or update driver profile and compliance documents
   */`;

const replacement = `    this.notify();
    return { success: true };
  }

  /**
   * System Audit Log: Appends an immutable audit log entry to the state ledger.
   */
  public createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): AuditLog {
    if (!this.state.auditLogs) {
      this.state.auditLogs = [];
    }
    const entry: AuditLog = {
      id: log.id || \`audit-\${Date.now()}-\${Math.floor(Math.random() * 1000)}\`,
      actorId: log.actorId,
      actorName: log.actorName,
      actorRole: log.actorRole,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.details,
      timestamp: log.timestamp || new Date().toISOString(),
    };
    this.state.auditLogs.unshift(entry);
    this.notify();
    return entry;
  }

  /**
   * Driver Onboarding: Submit or update driver profile and compliance documents
   */`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  console.log('Successfully inserted createAuditLog into db.ts');
} else {
  console.error('Target not found in db.ts!');
}

if (isCrlf) content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content, 'utf-8');

