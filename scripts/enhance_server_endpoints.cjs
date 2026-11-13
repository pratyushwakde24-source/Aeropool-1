const fs = require('fs');

const path = 'server/index.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Update imports from ./orderStore
content = content.replace(
  '  ServerSettlementRecord,\r\n} from \'./orderStore\';',
  `  ServerSettlementRecord,
  getPaginatedServerOrders,
  getPaginatedServerRefunds,
  runReconciliationAudit,
  getAllDiscrepancies,
  resolveDiscrepancy,
  setDiscrepancyUnderReview,
  generateFinancialCsv,
  maskPassengerId,\r\n} from './orderStore';`
);
content = content.replace(
  '  ServerSettlementRecord,\n} from \'./orderStore\';',
  `  ServerSettlementRecord,
  getPaginatedServerOrders,
  getPaginatedServerRefunds,
  runReconciliationAudit,
  getAllDiscrepancies,
  resolveDiscrepancy,
  setDiscrepancyUnderReview,
  generateFinancialCsv,
  maskPassengerId,\n} from './orderStore';`
);

// 2. Update imports from ../src/services/commissionEngine
content = content.replace(
  "import { getActiveCommissionPolicy } from '../src/services/commissionEngine';",
  "import { getActiveCommissionPolicy, COMMISSION_POLICY_80_20, COMMISSION_POLICY_85_15 } from '../src/services/commissionEngine';"
);

// 3. Define new Phase 5D Admin Endpoints
const newAdminEndpoints = `
// Super-admin only: Paginated & filtered payment transactions
app.get(
  '/api/admin/transactions',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { page, pageSize, status, search, startDate, endDate } = req.query;
    const result = getPaginatedServerOrders({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });

    const sanitizedOrders = result.orders.map((o) => ({
      ...o,
      passengerIdMasked: maskPassengerId(o.passengerId),
    }));

    return res.json({
      success: true,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      orders: sanitizedOrders,
    });
  }
);

// Super-admin only: Paginated & filtered refund records
app.get(
  '/api/admin/refunds',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { page, pageSize, status, search, startDate, endDate } = req.query;
    const result = getPaginatedServerRefunds({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status ? String(status) : undefined,
      search: search ? String(search) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
    });

    return res.json({
      success: true,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      refunds: result.refunds,
    });
  }
);

// Super-admin only: Update refund lifecycle status (REQUESTED -> SUBMITTED -> PROCESSED / FAILED)
app.post(
  '/api/admin/refunds/update-status',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { refundId, status, failureReason } = req.body;
    if (!refundId || !status) {
      return res.status(400).json({ error: 'Missing refundId or status in request body.' });
    }

    if (!['SUBMITTED', 'PROCESSED', 'FAILED'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Allowed transitions: SUBMITTED, PROCESSED, FAILED." });
    }

    const refund = getServerRefund(refundId);
    if (!refund) {
      return res.status(404).json({ error: \`Refund not found: \${refundId}\` });
    }

    const previousStatus = refund.status;
    refund.status = status;
    if (status === 'SUBMITTED') {
      refund.submittedAt = new Date().toISOString();
    } else if (status === 'PROCESSED') {
      refund.processedAt = new Date().toISOString();
      const order = getServerOrder(refund.orderId);
      if (order) {
        order.status = (order.refundedAmountPaise || 0) >= order.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      }
    } else if (status === 'FAILED') {
      refund.failureReason = failureReason || 'Provider rejected refund transaction';
    }

    const caller = req.user;
    console.log(\`[AeroPool Server] Refund \${refundId} status updated: \${previousStatus} -> \${status} by Admin \${caller?.id}\`);

    return res.json({
      success: true,
      refundId: refund.refundId,
      previousStatus,
      currentStatus: refund.status,
      updatedAt: new Date().toISOString(),
      refund,
    });
  }
);

// Super-admin only: Financial reconciliation engine query
app.get(
  '/api/admin/reconciliation',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.query;
    // Run dynamic check across all current orders and settlements
    runReconciliationAudit();
    const discrepancies = getAllDiscrepancies(status ? String(status) : undefined);

    const openCount = discrepancies.filter((d) => d.status === 'OPEN').length;
    const underReviewCount = discrepancies.filter((d) => d.status === 'UNDER_REVIEW').length;
    const resolvedCount = discrepancies.filter((d) => d.status === 'RESOLVED').length;

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalDiscrepancies: discrepancies.length,
        openCount,
        underReviewCount,
        resolvedCount,
        reconciledCleanly: openCount === 0 && underReviewCount === 0,
      },
      discrepancies,
    });
  }
);

// Super-admin only: Resolve or review reconciliation discrepancy
app.post(
  '/api/admin/reconciliation/resolve',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { discrepancyId, resolutionNotes, action } = req.body;
    if (!discrepancyId || !resolutionNotes) {
      return res.status(400).json({ error: 'Missing discrepancyId or resolutionNotes in request body.' });
    }

    const caller = req.user;
    const adminId = caller?.id || 'admin';

    let result;
    if (action === 'UNDER_REVIEW') {
      result = setDiscrepancyUnderReview(discrepancyId, adminId);
    } else {
      result = resolveDiscrepancy(discrepancyId, adminId, resolutionNotes);
    }

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    console.log(\`[AeroPool Server] Discrepancy \${discrepancyId} \${action || 'RESOLVED'} by Admin \${adminId}.\`);

    return res.json({
      success: true,
      message: \`Discrepancy \${discrepancyId} successfully updated to \${result.discrepancy?.status}.\`,
      discrepancy: result.discrepancy,
    });
  }
);

// Super-admin only: Commission policy management & governance
app.get(
  '/api/admin/commission-policies',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (_req: AuthenticatedRequest, res: Response) => {
    const activePolicy = getActiveCommissionPolicy();
    const policies = [
      COMMISSION_POLICY_80_20,
      COMMISSION_POLICY_85_15,
    ];

    return res.json({
      success: true,
      activePolicyId: activePolicy.policyId,
      activePolicy,
      policies: policies.map((p) => ({
        ...p,
        isActive: p.policyId === activePolicy.policyId,
        requiresCommercialSignOff: p.commercialApprovalStatus !== 'APPROVED',
      })),
    });
  }
);

// Super-admin only: Secure CSV Export with anti-formula-injection sanitization
app.post(
  '/api/admin/export/csv',
  privilegedApiLimiter,
  authenticateJwt(),
  requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    const { exportType, records } = req.body;

    if (!['TRANSACTIONS', 'REFUNDS', 'DRIVER_LEDGER', 'SETTLEMENTS', 'RECONCILIATION'].includes(exportType)) {
      return res.status(400).json({ error: 'Invalid exportType. Must be TRANSACTIONS, REFUNDS, DRIVER_LEDGER, SETTLEMENTS, or RECONCILIATION.' });
    }

    let exportData: any[] = [];

    if (Array.isArray(records) && records.length > 0) {
      exportData = records;
    } else if (exportType === 'TRANSACTIONS') {
      exportData = getAllServerOrders();
    } else if (exportType === 'REFUNDS') {
      exportData = getAllServerRefunds();
    } else if (exportType === 'SETTLEMENTS') {
      exportData = getAllServerSettlements();
    } else if (exportType === 'RECONCILIATION') {
      exportData = getAllDiscrepancies();
    }

    const csvContent = generateFinancialCsv(exportType as any, exportData);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = \`aeropool_\${exportType.toLowerCase()}_\${timestamp}.csv\`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', \`attachment; filename="\${filename}"\`);
    return res.status(200).send(csvContent);
  }
);
`;

const insertTarget = "// Super-admin only: Manual dispatch override";
content = content.replace(insertTarget, newAdminEndpoints + '\r\n' + insertTarget);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully added Phase 5D Admin Endpoints to server/index.ts');

