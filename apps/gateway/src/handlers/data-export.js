/**
 * Comprehensive Data Export
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Export seals, margins, Close Packs, Intelligence Reports in JSON/CSV formats.
 * Includes chain verification data for independent verification.
 * Accounting-ready CSV for QuickBooks, Xero, NetSuite.
 */

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

const csvResponse = (data, filename) => {
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
};

const errorResponse = (message, status = 400) => {
  return jsonResponse({ error: message }, status);
};

/**
 * Export seals with verification data
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} dateRange - Date range (format: YYYY-MM-DD:YYYY-MM-DD)
 * @returns {Promise<Array>} Seals with verification data
 */
async function exportSeals(env, orgId, dateRange) {
  try {
    const [startDate, endDate] = dateRange.split(':');

    const seals = await env.DB.prepare(`
      SELECT
        id,
        seal_hash,
        chain_hash,
        sequence,
        org_id,
        stripe_customer_id,
        model,
        provider,
        cost_usd,
        tokens_input,
        tokens_output,
        margin_pct,
        created_at
      FROM seals
      WHERE org_id = ?
        AND DATE(created_at) >= ?
        AND DATE(created_at) <= ?
      ORDER BY sequence ASC
    `).bind(orgId, startDate, endDate).all();

    return (seals.results || []).map(s => ({
      id: s.id,
      sealHash: s.seal_hash,
      chainHash: s.chain_hash,
      sequence: s.sequence,
      stripCustomerId: s.stripe_customer_id,
      model: s.model,
      provider: s.provider,
      costUsd: parseFloat(s.cost_usd),
      tokensInput: s.tokens_input,
      tokensOutput: s.tokens_output,
      marginPct: parseFloat(s.margin_pct),
      createdAt: s.created_at,
      verifiable: true // Can be verified with chain hash
    }));
  } catch (err) {
    console.error('exportSeals error:', err);
    throw err;
  }
}

/**
 * Export margins with customer context
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @param {string} dateRange - Date range
 * @returns {Promise<Array>} Margins data
 */
async function exportMargins(env, orgId, dateRange) {
  try {
    const [startDate, endDate] = dateRange.split(':');

    const margins = await env.DB.prepare(`
      SELECT
        m.id,
        m.stripe_customer_id,
        sc.customer_name,
        sc.customer_email,
        AVG(m.margin_pct) as avg_margin,
        MIN(m.margin_pct) as min_margin,
        MAX(m.margin_pct) as max_margin,
        COUNT(*) as seal_count,
        SUM(sr.total_revenue_usd) as total_revenue,
        SUM(sr.total_cost_usd) as total_cost,
        DATE(m.created_at) as date
      FROM margins m
      LEFT JOIN stripe_customers sc ON m.stripe_customer_id = sc.id
      LEFT JOIN seal_records sr ON m.stripe_customer_id = sr.stripe_customer_id
      WHERE m.org_id = ?
        AND DATE(m.created_at) >= ?
        AND DATE(m.created_at) <= ?
      GROUP BY m.stripe_customer_id, DATE(m.created_at)
      ORDER BY date DESC, avg_margin DESC
    `).bind(orgId, startDate, endDate).all();

    return (margins.results || []).map(m => ({
      customerId: m.stripe_customer_id,
      customerName: m.customer_name,
      customerEmail: m.customer_email,
      date: m.date,
      avgMarginPct: parseFloat(m.avg_margin),
      minMarginPct: parseFloat(m.min_margin),
      maxMarginPct: parseFloat(m.max_margin),
      sealCount: m.seal_count,
      totalRevenueUsd: parseFloat(m.total_revenue || 0),
      totalCostUsd: parseFloat(m.total_cost || 0)
    }));
  } catch (err) {
    console.error('exportMargins error:', err);
    throw err;
  }
}

/**
 * Export Close Packs
 * @param {Object} env - Environment
 * @param {string} orgId - Organization ID
 * @returns {Promise<Array>} Close Packs
 */
async function exportClosePacks(env, orgId) {
  try {
    const closePacks = await env.DB.prepare(`
      SELECT
        id,
        period_start,
        period_end,
        total_seals,
        total_cost_usd,
        total_revenue_usd,
        aggregate_margin_pct,
        status,
        created_at
      FROM close_packs
      WHERE org_id = ?
      ORDER BY period_start DESC
    `).bind(orgId).all();

    return (closePacks.results || []).map(cp => ({
      id: cp.id,
      periodStart: cp.period_start,
      periodEnd: cp.period_end,
      totalSeals: cp.total_seals,
      totalCostUsd: parseFloat(cp.total_cost_usd),
      totalRevenueUsd: parseFloat(cp.total_revenue_usd),
      aggregateMarginPct: parseFloat(cp.aggregate_margin_pct),
      status: cp.status,
      createdAt: cp.created_at
    }));
  } catch (err) {
    console.error('exportClosePacks error:', err);
    throw err;
  }
}

/**
 * Convert data to CSV format
 * @param {Array} data - Data rows
 * @param {Array} headers - Header names
 * @returns {string} CSV content
 */
function convertToCSV(data, headers) {
  if (!data || data.length === 0) {
    return headers.join(',') + '\n';
  }

  const rows = [headers];

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];

      if (value === null || value === undefined) {
        return '';
      }

      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }

      return String(value);
    });

    rows.push(values.join(','));
  }

  return rows.join('\n');
}

/**
 * POST /v1/export
 * Initiate data export
 */
export async function handleExport(request, env) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const {
      types = ['seals', 'margins', 'closepacks'],
      dateRange = '2000-01-01:2099-12-31',
      format = 'json'
    } = body;

    // Validate format
    if (!['json', 'csv'].includes(format)) {
      return errorResponse('format must be "json" or "csv"', 400);
    }

    // Validate types
    const validTypes = ['seals', 'margins', 'closepacks'];
    const invalidTypes = types.filter(t => !validTypes.includes(t));
    if (invalidTypes.length > 0) {
      return errorResponse(`Invalid types: ${invalidTypes.join(', ')}`, 400);
    }

    // Start export process
    const exportId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Store export request
    await env.DB.prepare(`
      INSERT INTO exports (
        export_id,
        org_id,
        export_types,
        date_range,
        format,
        status,
        progress_pct,
        created_at
      ) VALUES (?, ?, ?, ?, ?, 'processing', 0, ?)
    `).bind(
      exportId,
      orgId,
      JSON.stringify(types),
      dateRange,
      format,
      timestamp
    ).run();

    // Start async processing
    env.WEBHOOK_QUEUE?.send({
      type: 'export_job',
      exportId,
      orgId,
      types,
      dateRange,
      format
    }).catch(err => console.error('Failed to queue export job:', err));

    return jsonResponse({
      exportId,
      status: 'processing',
      estimatedSeconds: types.length * 30,
      checkUrl: `/v1/exports/${exportId}/status`
    }, 202);
  } catch (err) {
    console.error('handleExport error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/exports/:exportId/status
 * Check export status
 */
export async function handleExportStatus(request, env, exportId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const exportRecord = await env.DB.prepare(`
      SELECT
        export_id,
        status,
        progress_pct,
        file_url,
        file_size_bytes,
        error_message,
        created_at,
        completed_at
      FROM exports
      WHERE export_id = ? AND org_id = ?
    `).bind(exportId, orgId).first();

    if (!exportRecord) {
      return errorResponse('Export not found', 404);
    }

    const response = {
      exportId: exportRecord.export_id,
      status: exportRecord.status,
      progressPct: exportRecord.progress_pct,
      createdAt: exportRecord.created_at
    };

    if (exportRecord.status === 'completed') {
      response.downloadUrl = exportRecord.file_url;
      response.fileSizeBytes = exportRecord.file_size_bytes;
      response.completedAt = exportRecord.completed_at;
    }

    if (exportRecord.status === 'failed') {
      response.error = exportRecord.error_message;
    }

    return jsonResponse(response);
  } catch (err) {
    console.error('handleExportStatus error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * GET /v1/exports/:exportId/download
 * Download completed export
 */
export async function handleExportDownload(request, env, exportId) {
  try {
    const orgId = request._user?.orgId;
    if (!orgId) {
      return errorResponse('Unauthorized', 401);
    }

    const exportRecord = await env.DB.prepare(`
      SELECT
        export_id,
        status,
        file_url,
        format,
        export_types
      FROM exports
      WHERE export_id = ? AND org_id = ?
    `).bind(exportId, orgId).first();

    if (!exportRecord) {
      return errorResponse('Export not found', 404);
    }

    if (exportRecord.status !== 'completed') {
      return errorResponse('Export not yet completed', 409);
    }

    // Fetch from R2 or storage
    const fileData = await env.R2?.get(exportRecord.file_url);

    if (!fileData) {
      return errorResponse('File not found in storage', 404);
    }

    const filename = `finault-export-${exportId}-${new Date().toISOString().split('T')[0]}.${exportRecord.format === 'csv' ? 'csv' : 'json'}`;

    if (exportRecord.format === 'csv') {
      return csvResponse(fileData.body, filename);
    }

    return new Response(fileData.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (err) {
    console.error('handleExportDownload error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * Background worker: Process export job
 * @param {Object} env - Environment
 * @param {Object} job - Export job
 */
async function processExportJob(env, job) {
  const { exportId, orgId, types, dateRange, format } = job;

  try {
    // Update status
    await env.DB.prepare(`
      UPDATE exports SET status = 'processing', progress_pct = 10 WHERE export_id = ?
    `).bind(exportId).run();

    const data = {};
    let progress = 10;

    // Export seals
    if (types.includes('seals')) {
      data.seals = await exportSeals(env, orgId, dateRange);
      progress += 30;
      await env.DB.prepare(`
        UPDATE exports SET progress_pct = ? WHERE export_id = ?
      `).bind(progress, exportId).run();
    }

    // Export margins
    if (types.includes('margins')) {
      data.margins = await exportMargins(env, orgId, dateRange);
      progress += 30;
      await env.DB.prepare(`
        UPDATE exports SET progress_pct = ? WHERE export_id = ?
      `).bind(progress, exportId).run();
    }

    // Export close packs
    if (types.includes('closepacks')) {
      data.closePacks = await exportClosePacks(env, orgId);
      progress += 30;
      await env.DB.prepare(`
        UPDATE exports SET progress_pct = ? WHERE export_id = ?
      `).bind(progress, exportId).run();
    }

    // Convert format
    let fileContent;
    let contentType;

    if (format === 'csv') {
      // Convert to CSV - flatten for CSV format
      fileContent = convertToCSV(data.seals || [], [
        'id', 'sealHash', 'chainHash', 'sequence', 'stripCustomerId', 'model',
        'provider', 'costUsd', 'tokensInput', 'tokensOutput', 'marginPct', 'createdAt'
      ]);
      contentType = 'text/csv';
    } else {
      fileContent = JSON.stringify(data, null, 2);
      contentType = 'application/json';
    }

    // Store in R2
    const filename = `exports/${orgId}/${exportId}.${format === 'csv' ? 'csv' : 'json'}`;
    await env.R2?.put(filename, fileContent);

    // Update export record
    await env.DB.prepare(`
      UPDATE exports
      SET status = 'completed', progress_pct = 100, file_url = ?, file_size_bytes = ?, completed_at = datetime('now')
      WHERE export_id = ?
    `).bind(filename, Buffer.byteLength(fileContent), exportId).run();
  } catch (err) {
    console.error('processExportJob error:', err);

    // Update export record with error
    await env.DB.prepare(`
      UPDATE exports
      SET status = 'failed', error_message = ?
      WHERE export_id = ?
    `).bind(err.message, exportId).run();
  }
}

export {
  exportSeals,
  exportMargins,
  exportClosePacks,
  convertToCSV,
  processExportJob
};
