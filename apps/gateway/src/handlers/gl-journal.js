/**
 * GL Journal Entry Generator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates double-entry journal entries for AI costs.
 * Supports CSV (QuickBooks/Xero compatible) and JSON formats.
 */

import { jsonResponse, errorResponse } from '../utils.js';
import { getOrgIdFromAuth } from '../auth.js';

async function supabaseQuery(env, table, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }

  return res.json();
}

function parsePeriod(periodStr) {
  if (!periodStr) {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    };
  }

  // Format: YYYY-MM
  const [year, month] = periodStr.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0, 23, 59, 59)
  };
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function generateGLJournal(env, orgId, period, format = 'json') {
  const { start, end } = parsePeriod(period);

  // Fetch usage records for the period
  const usageQuery = `org_id=eq.${orgId}&timestamp=gte.${start.toISOString()}&timestamp=lte.${end.toISOString()}&order=customer_id.asc`;
  const usageRecords = await supabaseQuery(env, 'usage', usageQuery);

  // Group by customer for per-customer entries
  const byCustomer = {};
  let totalCompanyCost = 0;

  for (const record of usageRecords) {
    const customerId = record.customer_id || 'default';
    if (!byCustomer[customerId]) {
      byCustomer[customerId] = {
        cost: 0,
        transactions: 0
      };
    }
    byCustomer[customerId].cost += parseFloat(record.cost) || 0;
    byCustomer[customerId].transactions += 1;
    totalCompanyCost += parseFloat(record.cost) || 0;
  }

  const entries = [];
  let entryNumber = 1;
  const journalDate = formatDate(new Date(end));

  // Company-level entry: DR AI Cost Expense / CR Accounts Payable
  if (totalCompanyCost > 0) {
    entries.push({
      entry_number: entryNumber++,
      date: journalDate,
      account_number: '6510',
      account_name: 'AI Cost Expense',
      description: `Monthly AI costs for ${period}`,
      debit: totalCompanyCost,
      credit: null
    });

    entries.push({
      entry_number: entryNumber - 1,
      date: journalDate,
      account_number: '2100',
      account_name: 'Accounts Payable - AI',
      description: `Monthly AI cost payable for ${period}`,
      debit: null,
      credit: totalCompanyCost
    });

    entryNumber += 1;
  }

  // Per-customer allocations: DR Cost of Revenue / CR AI Cost Allocation
  for (const [customerId, data] of Object.entries(byCustomer)) {
    if (data.cost > 0) {
      entries.push({
        entry_number: entryNumber++,
        date: journalDate,
        account_number: '5120',
        account_name: 'Cost of Revenue - AI',
        description: `AI cost allocation for customer ${customerId}`,
        debit: data.cost,
        credit: null
      });

      entries.push({
        entry_number: entryNumber - 1,
        date: journalDate,
        account_number: '6710',
        account_name: 'AI Cost Allocation',
        description: `AI cost allocation for customer ${customerId}`,
        debit: null,
        credit: data.cost
      });

      entryNumber += 1;
    }
  }

  return {
    period,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    entries,
    summary: {
      total_debit: entries.reduce((sum, e) => sum + (e.debit || 0), 0),
      total_credit: entries.reduce((sum, e) => sum + (e.credit || 0), 0),
      total_entries: Math.max(...entries.map(e => e.entry_number))
    }
  };
}

function generateCSV(journal) {
  const rows = [];

  // Header
  rows.push(['Date', 'Entry #', 'Account #', 'Account Name', 'Description', 'Debit', 'Credit'].join(','));

  // Data rows
  for (const entry of journal.entries) {
    const row = [
      entry.date,
      entry.entry_number,
      entry.account_number,
      `"${entry.account_name}"`,
      `"${entry.description}"`,
      entry.debit ? entry.debit.toFixed(2) : '',
      entry.credit ? entry.credit.toFixed(2) : ''
    ];
    rows.push(row.join(','));
  }

  // Summary
  rows.push('');
  rows.push([
    'Summary',
    '',
    '',
    '',
    `Total Debit: ${journal.summary.total_debit.toFixed(2)}`,
    journal.summary.total_debit.toFixed(2),
    ''
  ].join(','));

  rows.push([
    '',
    '',
    '',
    '',
    `Total Credit: ${journal.summary.total_credit.toFixed(2)}`,
    '',
    journal.summary.total_credit.toFixed(2)
  ].join(','));

  return rows.join('\n');
}

async function handleGLJournal(request, env, ctx) {
  try {
    const orgId = getOrgIdFromAuth(request);
    const url = new URL(request.url);
    const period = url.searchParams.get('period');
    const format = url.searchParams.get('format') || 'json';

    if (!['json', 'csv'].includes(format)) {
      return errorResponse('INVALID_REQUEST', 'format must be json or csv');
    }

    const journal = await generateGLJournal(env, orgId, period, format);

    if (format === 'csv') {
      const csv = generateCSV(journal);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="gl-journal-${period || 'current'}.csv"`
        }
      });
    }

    return jsonResponse({
      period: journal.period,
      period_start: journal.period_start,
      period_end: journal.period_end,
      entries: journal.entries.map(e => ({
        date: e.date,
        entry_number: e.entry_number,
        account_number: e.account_number,
        account_name: e.account_name,
        description: e.description,
        debit: e.debit ? parseFloat(e.debit.toFixed(2)) : null,
        credit: e.credit ? parseFloat(e.credit.toFixed(2)) : null
      })),
      summary: {
        total_debit: parseFloat(journal.summary.total_debit.toFixed(2)),
        total_credit: parseFloat(journal.summary.total_credit.toFixed(2)),
        total_entries: journal.summary.total_entries,
        balanced: Math.abs(journal.summary.total_debit - journal.summary.total_credit) < 0.01
      }
    });
  } catch (error) {
    console.error('[GL_JOURNAL]', error);
    return errorResponse('INTERNAL_ERROR', error.message);
  }
}

export {
  handleGLJournal,
  generateGLJournal,
  generateCSV,
  parsePeriod
};
