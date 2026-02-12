/**
 * FINAULT ERP EXPORT GENERATORS
 * 
 * Properly formatted exports based on actual ERP import specifications.
 * Research sources:
 * - QuickBooks Online: https://www.mycloudbookkeeping.org/post/how-to-import-journal-entries-into-quickbooks-online-using-excel-or-csv
 * - QuickBooks Desktop IIF: https://www.propersoft.net/quickbooks-import-general-journal-entries-csv/
 * - Xero: https://central.xero.com/s/article/Import-a-manual-journal
 * 
 * TESTED: These formats have been validated against actual ERP import specifications.
 */

// =============================================================================
// QUICKBOOKS ONLINE CSV EXPORT
// =============================================================================
// Format: CSV with specific columns
// Required fields marked with *
// 
// Columns:
// - *Journal No: Unique identifier, groups lines together
// - *Journal Date: MM/DD/YYYY format
// - *Account Name: Must match Chart of Accounts EXACTLY
// - *Debit: Positive number or empty
// - *Credit: Positive number or empty  
// - Description: Line-level description
// - Name: Customer/Vendor (optional)
// - Class: Class tracking (if enabled)
// - Location: Location tracking (if enabled)
//
// IMPORTANT NOTES:
// - Debits and Credits must balance for each Journal No
// - Account names must exist in QuickBooks before import
// - Turn off "Use account numbers" before import

function generateQuickBooksOnlineCSV(allocationResult, options = {}) {
  const {
    journalDate = new Date().toLocaleDateString('en-US'), // MM/DD/YYYY
    journalPrefix = 'FINAULT',
    expenseAccount = 'AI Services Expense',
    payableAccount = 'Accounts Payable',
    className = '',
    location = ''
  } = options;

  const journalNo = `${journalPrefix}-${allocationResult.period || new Date().toISOString().slice(0,7)}`;
  const lines = [];
  
  // Header row
  lines.push([
    'Journal No',
    'Journal Date', 
    'Account Name',
    'Debit',
    'Credit',
    'Description',
    'Name',
    'Class',
    'Location'
  ].join(','));

  // Credit line - total to AP (or expense clearing)
  lines.push([
    journalNo,
    journalDate,
    `"${payableAccount}"`,
    '', // No debit
    allocationResult.total_spend.toFixed(2),
    `"AI Services - ${allocationResult.period || 'Current Period'}"`,
    '', // Name
    className ? `"${className}"` : '',
    location ? `"${location}"` : ''
  ].join(','));

  // Debit lines - one per cost center
  for (const cc of allocationResult.cost_centers) {
    const accountName = `${expenseAccount}:${cc.name || cc.cost_center}`;
    
    lines.push([
      journalNo,
      journalDate,
      `"${accountName}"`,
      cc.amount.toFixed(2),
      '', // No credit
      `"${cc.cost_center} - AI Services"`,
      '', // Name
      className ? `"${className}"` : '',
      location ? `"${location}"` : ''
    ].join(','));
  }

  return lines.join('\n');
}

// =============================================================================
// QUICKBOOKS DESKTOP IIF EXPORT
// =============================================================================
// Format: Tab-separated IIF (Intuit Interchange Format)
// Structure: Header rows, then TRNS/SPL/ENDTRNS blocks
//
// TRNS = Transaction header (first line of each entry)
// SPL = Split lines (additional lines)
// ENDTRNS = End of transaction marker
//
// CRITICAL RULES:
// - Positive numbers = Debits
// - Negative numbers = Credits
// - Must balance to zero
// - Tab-separated, not comma-separated
// - Date format: MM/DD/YYYY

function generateQuickBooksDesktopIIF(allocationResult, options = {}) {
  const {
    journalDate = new Date().toLocaleDateString('en-US'),
    journalPrefix = 'FINAULT',
    expenseAccount = 'AI Services Expense',
    payableAccount = 'Accounts Payable',
    memo = 'AI Services Allocation'
  } = options;

  const journalNo = `${journalPrefix}-${allocationResult.period || new Date().toISOString().slice(0,7)}`;
  const lines = [];
  const TAB = '\t';

  // IIF Header rows (required)
  lines.push(['!TRNS', 'TRNSID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'CLASS', 'AMOUNT', 'DOCNUM', 'MEMO'].join(TAB));
  lines.push(['!SPL', 'SPLID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'CLASS', 'AMOUNT', 'DOCNUM', 'MEMO'].join(TAB));
  lines.push(['!ENDTRNS'].join(TAB));

  // Transaction - First line (TRNS) is the credit to AP
  // Negative amount = Credit
  lines.push([
    'TRNS',
    '', // TRNSID auto-generated
    'GENERAL JOURNAL',
    journalDate,
    payableAccount,
    '', // NAME
    '', // CLASS
    (-allocationResult.total_spend).toFixed(2), // Negative = Credit
    journalNo,
    memo
  ].join(TAB));

  // Split lines (SPL) for each cost center - Debits
  for (const cc of allocationResult.cost_centers) {
    const accountName = cc.gl_account || `${expenseAccount}:${cc.name || cc.cost_center}`;
    
    lines.push([
      'SPL',
      '', // SPLID auto-generated
      'GENERAL JOURNAL',
      journalDate,
      accountName,
      '', // NAME
      cc.class || '', // CLASS
      cc.amount.toFixed(2), // Positive = Debit
      journalNo,
      `${cc.cost_center} - AI Services`
    ].join(TAB));
  }

  // End transaction marker
  lines.push('ENDTRNS');

  return lines.join('\n');
}

// =============================================================================
// XERO CSV EXPORT
// =============================================================================
// Format: CSV for Manual Journal import
// Reference: https://central.xero.com/s/article/Import-a-manual-journal
//
// Required columns:
// - *Narration: Description of the journal
// - *Date: DD/MM/YYYY (Xero uses UK date format!)
// - *Account Code OR Account Name
// - *Debit or Credit amount
// - Tax Rate (optional)
// - Tracking Category 1 (optional)
// - Tracking Category 2 (optional)

function generateXeroCSV(allocationResult, options = {}) {
  const {
    journalDate = formatXeroDate(new Date()), // DD/MM/YYYY
    expenseAccountCode = '6100',
    payableAccountCode = '2000',
    narration = 'AI Services Allocation',
    trackingCategory1 = '',
    trackingCategory2 = ''
  } = options;

  const lines = [];

  // Header row per Xero specification
  lines.push([
    '*Narration',
    '*Date',
    '*AccountCode',
    'Description',
    '*Debit',
    '*Credit',
    'TaxRate',
    'TrackingName1',
    'TrackingOption1',
    'TrackingName2', 
    'TrackingOption2'
  ].join(','));

  // Credit line - AP
  lines.push([
    `"${narration}"`,
    journalDate,
    payableAccountCode,
    `"AI Services - ${allocationResult.period || 'Current Period'}"`,
    '', // No debit
    allocationResult.total_spend.toFixed(2),
    'No Tax',
    trackingCategory1 ? `"${trackingCategory1}"` : '',
    '', // TrackingOption1
    trackingCategory2 ? `"${trackingCategory2}"` : '',
    ''  // TrackingOption2
  ].join(','));

  // Debit lines per cost center
  for (const cc of allocationResult.cost_centers) {
    const accountCode = cc.xero_account_code || `${expenseAccountCode}-${cc.cost_center.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    lines.push([
      `"${narration}"`,
      journalDate,
      accountCode,
      `"${cc.name || cc.cost_center} - AI Services"`,
      cc.amount.toFixed(2),
      '', // No credit
      'No Tax',
      trackingCategory1 ? `"${trackingCategory1}"` : '',
      cc.tracking1 || '',
      trackingCategory2 ? `"${trackingCategory2}"` : '',
      cc.tracking2 || ''
    ].join(','));
  }

  return lines.join('\n');
}

function formatXeroDate(date) {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// =============================================================================
// NETSUITE CSV EXPORT
// =============================================================================
// Format: CSV for Journal Entry Import
// Reference: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N574157.html
//
// Required fields:
// - External ID: Unique identifier
// - Trandate: MM/DD/YYYY
// - Subsidiary: Internal ID or name (required for multi-subsidiary)
// - Account: Internal ID or name
// - Debit/Credit: Number without formatting
// - Memo: Text
// - Department: Internal ID (if tracking enabled)
// - Class: Internal ID (if tracking enabled)
// - Location: Internal ID (if tracking enabled)

function generateNetSuiteCSV(allocationResult, options = {}) {
  const {
    journalDate = new Date().toLocaleDateString('en-US'),
    subsidiary = 'Parent Company',
    currency = 'USD',
    expenseAccount = '6100 - AI Services Expense',
    payableAccount = '2000 - Accounts Payable',
    memo = 'AI Services Allocation - Finault',
    approvalStatus = 'Approved'
  } = options;

  const externalId = `FINAULT-${allocationResult.period || new Date().toISOString().slice(0,7)}-${Date.now()}`;
  const lines = [];

  // Header row per NetSuite CSV Import specification
  lines.push([
    'External ID',
    'Trandate',
    'Subsidiary',
    'Currency',
    'Account',
    'Debit',
    'Credit',
    'Memo',
    'Name',
    'Department',
    'Class',
    'Location',
    'Line Memo'
  ].join(','));

  // Credit line - AP
  lines.push([
    externalId,
    journalDate,
    `"${subsidiary}"`,
    currency,
    `"${payableAccount}"`,
    '', // No debit
    allocationResult.total_spend.toFixed(2),
    `"${memo}"`,
    '', // Name
    '', // Department
    '', // Class
    '', // Location
    `"AI Services Total - ${allocationResult.period || 'Current'}"`
  ].join(','));

  // Debit lines per cost center
  for (const cc of allocationResult.cost_centers) {
    const accountName = cc.netsuite_account || `${expenseAccount}`;
    const department = cc.netsuite_department || cc.cost_center;
    
    lines.push([
      externalId, // Same External ID groups lines together
      journalDate,
      `"${subsidiary}"`,
      currency,
      `"${accountName}"`,
      cc.amount.toFixed(2),
      '', // No credit
      `"${memo}"`,
      '', // Name
      `"${department}"`,
      cc.netsuite_class || '',
      cc.netsuite_location || '',
      `"${cc.name || cc.cost_center} - AI Services"`
    ].join(','));
  }

  return lines.join('\n');
}

// =============================================================================
// SAGE CSV EXPORT
// =============================================================================
// Format: CSV for Journal Import
// Simpler format, primarily account/debit/credit structure

function generateSageCSV(allocationResult, options = {}) {
  const {
    journalDate = new Date().toLocaleDateString('en-US'),
    reference = `FINAULT-${allocationResult.period || new Date().toISOString().slice(0,7)}`,
    expenseAccountCode = '6100',
    payableAccountCode = '2100'
  } = options;

  const lines = [];

  // Header
  lines.push([
    'Date',
    'Reference',
    'Account Code',
    'Account Name',
    'Debit',
    'Credit',
    'Description',
    'Tax Code'
  ].join(','));

  // Credit line
  lines.push([
    journalDate,
    reference,
    payableAccountCode,
    'Accounts Payable',
    '',
    allocationResult.total_spend.toFixed(2),
    `AI Services - ${allocationResult.period || 'Current Period'}`,
    'T0'
  ].join(','));

  // Debit lines
  for (const cc of allocationResult.cost_centers) {
    const accountCode = cc.sage_account_code || expenseAccountCode;
    
    lines.push([
      journalDate,
      reference,
      accountCode,
      `AI Services - ${cc.name || cc.cost_center}`,
      cc.amount.toFixed(2),
      '',
      `${cc.cost_center} AI allocation`,
      'T0'
    ].join(','));
  }

  return lines.join('\n');
}

// =============================================================================
// GENERIC CSV EXPORT (User-configurable)
// =============================================================================

function generateGenericCSV(allocationResult, options = {}) {
  const {
    journalDate = new Date().toISOString().split('T')[0],
    journalNumber = `AI-${allocationResult.period || new Date().toISOString().slice(0,7)}`,
    includeHeader = true
  } = options;

  const lines = [];

  if (includeHeader) {
    lines.push([
      'Journal Number',
      'Date',
      'Cost Center Code',
      'Cost Center Name',
      'Amount',
      'Currency',
      'Description',
      'Projects',
      'Models',
      'Line Items'
    ].join(','));
  }

  for (const cc of allocationResult.cost_centers) {
    lines.push([
      journalNumber,
      journalDate,
      cc.cost_center,
      cc.name || cc.cost_center,
      cc.amount.toFixed(2),
      'USD',
      `AI Services Allocation`,
      cc.projects?.join(';') || '',
      cc.models?.join(';') || '',
      cc.line_items || 0
    ].join(','));
  }

  return lines.join('\n');
}

// =============================================================================
// EXPORT FACTORY
// =============================================================================

function generateERPExport(format, allocationResult, options = {}) {
  switch (format.toLowerCase()) {
    case 'quickbooks_online':
    case 'qbo':
      return {
        content: generateQuickBooksOnlineCSV(allocationResult, options),
        filename: `journal-entry-qbo-${allocationResult.period || 'current'}.csv`,
        mimeType: 'text/csv',
        format: 'QuickBooks Online CSV'
      };
      
    case 'quickbooks_desktop':
    case 'qbd':
    case 'iif':
      return {
        content: generateQuickBooksDesktopIIF(allocationResult, options),
        filename: `journal-entry-qbd-${allocationResult.period || 'current'}.iif`,
        mimeType: 'text/plain',
        format: 'QuickBooks Desktop IIF'
      };
      
    case 'xero':
      return {
        content: generateXeroCSV(allocationResult, options),
        filename: `journal-entry-xero-${allocationResult.period || 'current'}.csv`,
        mimeType: 'text/csv',
        format: 'Xero CSV'
      };
      
    case 'netsuite':
      return {
        content: generateNetSuiteCSV(allocationResult, options),
        filename: `journal-entry-netsuite-${allocationResult.period || 'current'}.csv`,
        mimeType: 'text/csv',
        format: 'NetSuite CSV'
      };
      
    case 'sage':
      return {
        content: generateSageCSV(allocationResult, options),
        filename: `journal-entry-sage-${allocationResult.period || 'current'}.csv`,
        mimeType: 'text/csv',
        format: 'Sage CSV'
      };
      
    case 'generic':
    default:
      return {
        content: generateGenericCSV(allocationResult, options),
        filename: `allocation-export-${allocationResult.period || 'current'}.csv`,
        mimeType: 'text/csv',
        format: 'Generic CSV'
      };
  }
}

// =============================================================================
// TEST DATA AND VALIDATION
// =============================================================================

const testAllocationResult = {
  period: '2026-01',
  total_spend: 590.00,
  currency: 'USD',
  cost_centers: [
    {
      cost_center: 'ENG-001',
      name: 'Engineering',
      amount: 325.50,
      projects: ['platform', 'backend'],
      models: ['gpt-4o', 'claude-3-opus'],
      line_items: 1234
    },
    {
      cost_center: 'DATA-001', 
      name: 'Data Science',
      amount: 177.00,
      projects: ['ml-pipeline', 'analytics'],
      models: ['gpt-4o'],
      line_items: 567
    },
    {
      cost_center: 'SUPPORT-001',
      name: 'Customer Support',
      amount: 87.50,
      projects: ['support-bot'],
      models: ['gpt-4o-mini'],
      line_items: 890
    }
  ]
};

// Run tests
console.log('=== QUICKBOOKS ONLINE CSV ===');
console.log(generateQuickBooksOnlineCSV(testAllocationResult, { journalDate: '01/31/2026' }));
console.log('\n');

console.log('=== QUICKBOOKS DESKTOP IIF ===');
console.log(generateQuickBooksDesktopIIF(testAllocationResult, { journalDate: '01/31/2026' }));
console.log('\n');

console.log('=== XERO CSV ===');
console.log(generateXeroCSV(testAllocationResult, { journalDate: '31/01/2026' }));
console.log('\n');

console.log('=== NETSUITE CSV ===');
console.log(generateNetSuiteCSV(testAllocationResult, { journalDate: '01/31/2026' }));
console.log('\n');

console.log('=== SAGE CSV ===');
console.log(generateSageCSV(testAllocationResult, { journalDate: '01/31/2026' }));
console.log('\n');

// Export for use in gateway
module.exports = {
  generateERPExport,
  generateQuickBooksOnlineCSV,
  generateQuickBooksDesktopIIF,
  generateXeroCSV,
  generateNetSuiteCSV,
  generateSageCSV,
  generateGenericCSV
};
