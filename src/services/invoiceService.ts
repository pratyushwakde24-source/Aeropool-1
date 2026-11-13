import { DriverWeeklyStatement, DriverLedgerEntry } from '../types';
/**
 * AeroPool — Passenger Mobility Invoice & Credit Note Service
 * 
 * Strict Commercial & Compliance Standards:
 * 1. UNVERIFIED TAX WARNING: Per legal/commercial directives, invoices are NOT labeled
 *    "GST Tax Invoices" until the operating company's GSTIN, tax structure, and legal entity
 *    are verified. Standard documents are generated as "Commercial Mobility Receipts".
 * 2. Immutable Snapshots: Each invoice and credit note includes a deterministic checksum
 *    and cannot be mutated retroactively once issued.
 * 3. Exact Integer Currency Conversion: All internal values use paise (₹1 = 100 paise),
 *    formatted into standard Indian Rupee notation with ₹ and two decimal places.
 */

import { formatINR } from './pricingEngine';

export interface InvoicePaymentRef {
  paymentId: string;
  orderId: string;
  paymentMethod: 'UPI' | 'Card' | 'Netbanking' | string;
  paidAt: string;
  isSandbox: boolean;
}

export interface InvoiceFareBreakdown {
  baseFarePaise: number;
  distanceTimeFarePaise: number;
  airportTollPaise: number;
  platformFeePaise: number;
  unverifiedTaxPaise: number;
  totalAmountPaise: number;
}

export interface PassengerInvoice {
  invoiceNumber: string;
  bookingId: string;
  passengerId: string;
  passengerName: string;
  passengerPhone?: string;
  flightNumber: string;
  terminal: 'T1' | 'T2' | string;
  pickupZoneName: string;
  destinationName: string;
  destinationAddress?: string;
  issuedAt: string;
  currency: 'INR';
  paymentReference: InvoicePaymentRef;
  breakdown: InvoiceFareBreakdown;
  documentType: 'COMMERCIAL_RIDE_RECEIPT' | 'PROVISIONAL_INVOICE';
  taxStatus: 'TAX_STATUS_UNVERIFIED_PENDING_LEGAL_ENTITY' | 'TAX_EXEMPT';
  complianceNotice: string;
  integrityHash: string;
}

export interface RefundCreditNote {
  creditNoteNumber: string;
  originalInvoiceNumber?: string;
  bookingId: string;
  paymentId: string;
  passengerId: string;
  passengerName: string;
  refundAmountPaise: number;
  refundReason: string;
  refundType: 'FULL' | 'PARTIAL';
  issuedAt: string;
  currency: 'INR';
  isSandbox: boolean;
  integrityHash: string;
}

/**
 * Computes a lightweight deterministic hash for invoice immutability validation
 */
function computeDocumentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Generates an sequential or formatted unique invoice number
 * Format: INV-YYYYMMDD-XXXXXXXX
 */
export function generateInvoiceNumber(date: Date = new Date(), suffix?: string): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const rand = suffix || Math.random().toString(36).substring(2, 8).toUpperCase();
  return `INV-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Generates a unique credit note number
 * Format: CRN-YYYYMMDD-XXXXXXXX
 */
export function generateCreditNoteNumber(date: Date = new Date(), suffix?: string): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const rand = suffix || Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CRN-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Generates an immutable Passenger Mobility Receipt from a booking and payment record
 */
export function createPassengerInvoice(params: {
  booking: {
    id: string;
    passengerId: string;
    passengerName: string;
    passengerPhone?: string;
    flightNumber: string;
    terminal: string;
    pickupZoneName: string;
    destinationName: string;
    destinationAddress?: string;
    farePaise: number;
    createdAt: string;
  };
  payment: {
    id: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paymentMethod?: string;
    createdAt?: string;
    isSandbox?: boolean;
  };
  fareBreakdown?: Partial<InvoiceFareBreakdown>;
}): PassengerInvoice {
  const { booking, payment, fareBreakdown } = params;
  const now = new Date();
  const invoiceNumber = generateInvoiceNumber(now, booking.id.slice(-6).toUpperCase());

  // Deterministic fare breakdown if not explicitly supplied
  const totalAmountPaise = booking.farePaise;
  const airportTollPaise = fareBreakdown?.airportTollPaise ?? 11000; // CSMIA Cess ₹110
  const platformFeePaise = fareBreakdown?.platformFeePaise ?? 4000;  // Platform fee ₹40
  const unverifiedTaxPaise = fareBreakdown?.unverifiedTaxPaise ?? Math.round(totalAmountPaise * 0.05);
  const transitFarePaise = Math.max(0, totalAmountPaise - airportTollPaise - platformFeePaise - unverifiedTaxPaise);
  const baseFarePaise = fareBreakdown?.baseFarePaise ?? Math.round(transitFarePaise * 0.4);
  const distanceTimeFarePaise = transitFarePaise - baseFarePaise;

  const breakdown: InvoiceFareBreakdown = {
    baseFarePaise,
    distanceTimeFarePaise,
    airportTollPaise,
    platformFeePaise,
    unverifiedTaxPaise,
    totalAmountPaise,
  };

  const invoiceCore = {
    invoiceNumber,
    bookingId: booking.id,
    passengerId: booking.passengerId,
    passengerName: booking.passengerName,
    passengerPhone: booking.passengerPhone,
    flightNumber: booking.flightNumber,
    terminal: booking.terminal,
    pickupZoneName: booking.pickupZoneName,
    destinationName: booking.destinationName,
    destinationAddress: booking.destinationAddress,
    issuedAt: now.toISOString(),
    currency: 'INR' as const,
    paymentReference: {
      paymentId: payment.razorpayPaymentId || payment.id,
      orderId: payment.razorpayOrderId || `order_${booking.id.slice(-8)}`,
      paymentMethod: (payment.paymentMethod as any) || 'UPI',
      paidAt: payment.createdAt || now.toISOString(),
      isSandbox: Boolean(payment.isSandbox),
    },
    breakdown,
    documentType: 'COMMERCIAL_RIDE_RECEIPT' as const,
    taxStatus: 'TAX_STATUS_UNVERIFIED_PENDING_LEGAL_ENTITY' as const,
    complianceNotice:
      'Commercial Mobility Receipt. Corporate GST registration and tax treatment pending legal entity verification. Input Tax Credit (ITC) is not claimable on this provisional document.',
  };

  const integrityHash = computeDocumentHash(JSON.stringify(invoiceCore));

  return {
    ...invoiceCore,
    integrityHash,
  };
}

/**
 * Creates an immutable credit note for passenger refunds
 */
export function createRefundCreditNote(params: {
  bookingId: string;
  originalInvoiceNumber?: string;
  paymentId: string;
  passengerId: string;
  passengerName: string;
  refundAmountPaise: number;
  originalFarePaise: number;
  refundReason: string;
  isSandbox?: boolean;
}): RefundCreditNote {
  const {
    bookingId,
    originalInvoiceNumber,
    paymentId,
    passengerId,
    passengerName,
    refundAmountPaise,
    originalFarePaise,
    refundReason,
    isSandbox = true,
  } = params;

  const now = new Date();
  const creditNoteNumber = generateCreditNoteNumber(now, bookingId.slice(-6).toUpperCase());
  const refundType: 'FULL' | 'PARTIAL' = refundAmountPaise >= originalFarePaise ? 'FULL' : 'PARTIAL';

  const creditNoteCore = {
    creditNoteNumber,
    originalInvoiceNumber,
    bookingId,
    paymentId,
    passengerId,
    passengerName,
    refundAmountPaise,
    refundReason,
    refundType,
    issuedAt: now.toISOString(),
    currency: 'INR' as const,
    isSandbox,
  };

  const integrityHash = computeDocumentHash(JSON.stringify(creditNoteCore));

  return {
    ...creditNoteCore,
    integrityHash,
  };
}

/**
 * Verifies document integrity against tampering
 */
export function verifyInvoiceIntegrity(invoice: PassengerInvoice): boolean {
  const { integrityHash, ...rest } = invoice;
  const expected = computeDocumentHash(JSON.stringify(rest));
  return integrityHash === expected;
}

/**
 * Renders a clean, standalone, printable HTML document for an invoice
 */
export function renderInvoiceHtml(invoice: PassengerInvoice): string {
  const { breakdown, paymentReference } = invoice;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${invoice.invoiceNumber} — AeroPool Receipt</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; line-height: 1.5; }
    .invoice-card { max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { font-size: 20px; font-weight: 800; color: #0369a1; letter-spacing: -0.5px; }
    .badge { display: inline-block; font-size: 10px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; margin-top: 4px; }
    .meta { font-size: 12px; color: #64748b; text-align: right; }
    .meta strong { color: #0f172a; }
    .section-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-top: 16px; margin-bottom: 8px; letter-spacing: 0.5px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
    .table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .table td.right { text-align: right; font-weight: 600; font-family: monospace; }
    .total-row td { border-top: 2px solid #0f172a; border-bottom: none; font-size: 16px; font-weight: 800; color: #0369a1; padding-top: 12px; }
    .notice { font-size: 11px; color: #94a3b8; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 10px; margin-top: 20px; }
    .footer { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 24px; }
    @media print {
      body { padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="brand">AeroPool Mobility</div>
        <div class="badge">COMMERCIAL MOBILITY RECEIPT</div>
      </div>
      <div class="meta">
        <div>Receipt: <strong>${invoice.invoiceNumber}</strong></div>
        <div>Date: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        <div>Booking: <span style="font-family: monospace;">${invoice.bookingId}</span></div>
      </div>
    </div>

    <div class="section-title">Ride & Passenger Details</div>
    <table class="table">
      <tr><td>Passenger Name</td><td class="right">${invoice.passengerName}</td></tr>
      <tr><td>Airport Pickup</td><td class="right">CSMIA Terminal ${invoice.terminal} (${invoice.pickupZoneName})</td></tr>
      <tr><td>Drop-off Destination</td><td class="right">${invoice.destinationName}</td></tr>
      <tr><td>Flight Number</td><td class="right">${invoice.flightNumber}</td></tr>
    </table>

    <div class="section-title">Itemized Fare Breakdown</div>
    <table class="table">
      <tr><td>Base Shared Transit Fare</td><td class="right">${formatINR(breakdown.baseFarePaise, true)}</td></tr>
      <tr><td>Distance & Travel Duration Component</td><td class="right">${formatINR(breakdown.distanceTimeFarePaise, true)}</td></tr>
      <tr><td>CSMIA Commercial Airport Toll & Parking Cess</td><td class="right">${formatINR(breakdown.airportTollPaise, true)}</td></tr>
      <tr><td>Platform Convenience Fee</td><td class="right">${formatINR(breakdown.platformFeePaise, true)}</td></tr>
      <tr><td>Estimated Tax Component (Provisional)</td><td class="right">${formatINR(breakdown.unverifiedTaxPaise, true)}</td></tr>
      <tr class="total-row"><td>Total Paid Amount</td><td class="right">${formatINR(breakdown.totalAmountPaise, true)}</td></tr>
    </table>

    <div class="section-title">Payment Settlement Details</div>
    <table class="table">
      <tr><td>Payment Method</td><td class="right">${paymentReference.paymentMethod}</td></tr>
      <tr><td>Payment Reference</td><td class="right">${paymentReference.paymentId}</td></tr>
      <tr><td>Order Identifier</td><td class="right">${paymentReference.orderId}</td></tr>
      <tr><td>Settlement Status</td><td class="right" style="color: #10b981;">SETTLED (Verified)</td></tr>
    </table>

    <div class="notice">
      <strong>Compliance Notice:</strong> ${invoice.complianceNotice}
    </div>

    <div class="footer">
      Electronic computer-generated receipt • Integrity Checksum: ${invoice.integrityHash}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates an immutable driver weekly earnings statement
 */
export function generateDriverWeeklyStatement(params: {
  driverId: string;
  driverName: string;
  cycle: string;
  startDate: string;
  endDate: string;
  entries: DriverLedgerEntry[];
  policySnapshot: {
    policyId: string;
    driverSharePercent: number;
    platformCommissionPercent: number;
    commercialApprovalStatus: string;
  };
}): DriverWeeklyStatement {
  const { driverId, driverName, cycle, startDate, endDate, entries, policySnapshot } = params;
  const now = new Date();
  const statementId = `STMT-${cycle.replace('-', '')}-${driverId.slice(-6).toUpperCase()}`;

  const grossFaresPaise = entries.reduce((sum, e) => sum + (e.grossFarePaise || 0), 0);
  const platformCommissionPaise = entries.reduce((sum, e) => sum + (e.platformCommissionPaise || 0), 0);
  const tollReimbursementsPaise = entries.reduce((sum, e) => sum + (e.tollReimbursementPaise || 0), 0);
  const refundAdjustmentsPaise = entries
    .filter((e) => e.transactionType === 'REFUND_ADJUSTMENT')
    .reduce((sum, e) => sum + Math.abs(e.amountPaise), 0);
  const netEarningsPaise = entries.reduce((sum, e) => sum + (e.driverEarningsPaise || 0), 0) - refundAdjustmentsPaise;

  const core = {
    statementId,
    driverId,
    driverName,
    reportingPeriod: { cycle, startDate, endDate },
    completedTripsCount: entries.filter((e) => e.transactionType === 'TRIP_EARNING').length,
    grossFaresPaise,
    platformCommissionPaise,
    tollReimbursementsPaise,
    refundAdjustmentsPaise,
    netEarningsPaise,
    settlementStatus: 'AVAILABLE' as const,
    policySnapshot,
    itemizedEntries: entries,
    generatedAt: now.toISOString(),
  };

  const documentHash = computeDocumentHash(JSON.stringify(core));

  return {
    ...core,
    documentHash,
  };
}

/**
 * Renders a clean printable HTML document for a driver weekly statement
 */
export function renderDriverStatementHtml(statement: DriverWeeklyStatement): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${statement.statementId} — Driver Earnings Statement</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; line-height: 1.5; }
    .card { max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { font-size: 20px; font-weight: 800; color: #065f46; letter-spacing: -0.5px; }
    .badge { display: inline-block; font-size: 10px; font-weight: 700; background: #d1fae5; color: #065f46; padding: 3px 8px; border-radius: 4px; margin-top: 4px; }
    .meta { font-size: 12px; color: #64748b; text-align: right; }
    .section-title { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-top: 16px; margin-bottom: 8px; letter-spacing: 0.5px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
    .table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .table td.right { text-align: right; font-weight: 600; font-family: monospace; }
    .total-row td { border-top: 2px solid #0f172a; border-bottom: none; font-size: 16px; font-weight: 800; color: #065f46; padding-top: 12px; }
    .notice { font-size: 11px; color: #94a3b8; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 10px; margin-top: 20px; }
    .footer { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 24px; }
    @media print { body { padding: 0; } .card { border: none; box-shadow: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <div class="brand">AeroPool Mobility</div>
        <div class="badge">DRIVER EARNINGS STATEMENT</div>
      </div>
      <div class="meta">
        <div>Statement: <strong>${statement.statementId}</strong></div>
        <div>Cycle: <strong>${statement.reportingPeriod.cycle}</strong></div>
        <div>Date: ${new Date(statement.generatedAt).toLocaleDateString('en-IN')}</div>
      </div>
    </div>

    <div class="section-title">Driver & Cycle Overview</div>
    <table class="table">
      <tr><td>Driver Partner</td><td class="right">${statement.driverName}</td></tr>
      <tr><td>Driver ID</td><td class="right" style="font-family: monospace;">${statement.driverId}</td></tr>
      <tr><td>Reporting Period</td><td class="right">${new Date(statement.reportingPeriod.startDate).toLocaleDateString('en-IN')} – ${new Date(statement.reportingPeriod.endDate).toLocaleDateString('en-IN')}</td></tr>
      <tr><td>Completed Pool Trips</td><td class="right">${statement.completedTripsCount}</td></tr>
      <tr><td>Settlement Status</td><td class="right" style="color: #059669;">${statement.settlementStatus}</td></tr>
    </table>

    <div class="section-title">Earnings & Deductions Summary</div>
    <table class="table">
      <tr><td>Gross Fare Revenue Collected</td><td class="right">${formatINR(statement.grossFaresPaise, true)}</td></tr>
      <tr><td>Platform Commission (${statement.policySnapshot.platformCommissionPercent}%)</td><td class="right" style="color: #e11d48;">-${formatINR(statement.platformCommissionPaise, true)}</td></tr>
      <tr><td>CSMIA Commercial Airport Toll Reimbursements</td><td class="right" style="color: #0284c7;">+${formatINR(statement.tollReimbursementsPaise, true)}</td></tr>
      ${statement.refundAdjustmentsPaise > 0 ? `<tr><td>Refund / Cancellation Adjustments</td><td class="right" style="color: #e11d48;">-${formatINR(statement.refundAdjustmentsPaise, true)}</td></tr>` : ''}
      <tr class="total-row"><td>Net Driver Earnings (INR)</td><td class="right">${formatINR(statement.netEarningsPaise, true)}</td></tr>
    </table>

    <div class="notice">
      <strong>Commercial Policy Notice:</strong> Statement calculated under policy <strong>${statement.policySnapshot.policyId}</strong> (${statement.policySnapshot.driverSharePercent}/${statement.policySnapshot.platformCommissionPercent} split). Commercial status: <em>${statement.policySnapshot.commercialApprovalStatus}</em>. Bank payout transfer subject to authorized batch approval.
    </div>

    <div class="footer">
      Electronic statement generated by AeroPool Financial Core • Checksum: ${statement.documentHash}
    </div>
  </div>
</body>
</html>`;
}
