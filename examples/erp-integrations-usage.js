/**
 * Finault ERP Integration System - Usage Examples
 * Demonstrates all major features and patterns
 */

const {
  ERPIntegrationManager,
  ERPConnectionError,
  ERPValidationError,
  ERPOperationError
} = require('./erp-integrations');

// ============================================================================
// EXAMPLE 1: QUICKBOOKS ONLINE INTEGRATION
// ============================================================================

async function exampleQuickBooksOnline() {
  console.log('\n=== QuickBooks Online Integration ===\n');

  const manager = new ERPIntegrationManager({
    maxRetries: 3,
    enableCache: true,
    logLevel: 'info'
  });

  try {
    // Connect to QuickBooks Online
    const connectionId = await manager.connect('quickbooks-online', {
      realmId: 'your-realm-id',
      accessToken: 'your-access-token',
      refreshToken: 'your-refresh-token',
      accountName: 'Acme Corporation'
    });

    console.log(`Connected with ID: ${connectionId}`);

    // Test connection
    const status = await manager.testConnection(connectionId);
    console.log('Connection Status:', status);

    // Pull chart of accounts
    const coa = await manager.pullChartOfAccounts(connectionId);
    console.log(`Found ${coa.total} accounts`);

    // Pull vendors
    const vendors = await manager.pullVendors(connectionId);
    console.log(`Found ${vendors.total} vendors`);

    // Create field mapping
    const mappingId = await manager.createFieldMapping(connectionId, {
      lineItems: {
        accountCode: 'AccountRef.value',
        debit: 'DebitAmount',
        credit: 'CreditAmount',
        description: 'Description'
      },
      requiredFields: ['accountCode', 'debit', 'credit'],
      isDefault: true
    });

    console.log(`Field mapping created: ${mappingId.mappingId}`);

    // Create and push a journal entry
    const journalEntry = {
      journalDate: new Date().toISOString().split('T')[0],
      referenceNumber: `JE-${Date.now()}`,
      description: 'Monthly closing entries',
      lineItems: [
        {
          accountCode: '5000',
          description: 'Rent Expense',
          debit: 5000.00,
          credit: 0.00,
          costCenter: 'CC-001'
        },
        {
          accountCode: '2000',
          description: 'Accounts Payable',
          debit: 0.00,
          credit: 5000.00,
          costCenter: 'CC-001'
        }
      ]
    };

    const result = await manager.pushJournalEntry(
      connectionId,
      journalEntry,
      { mappingId: mappingId.mappingId }
    );

    console.log('Journal Entry Posted:', result);

    // Schedule automatic posting (3rd of each month)
    await manager.schedulePush(connectionId, {
      type: 'interval',
      value: 1,
      unit: 'day'
    }, {
      getEntries: async () => {
        // Custom function to fetch entries to post
        return [];
      }
    });

    // Get connection status
    const connectionStatus = manager.getConnectionStatus(connectionId);
    console.log('Connection Status:', connectionStatus);

    // Cleanup
    await manager.disconnect(connectionId);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// EXAMPLE 2: NETSUITE INTEGRATION
// ============================================================================

async function exampleNetSuite() {
  console.log('\n=== NetSuite Integration ===\n');

  const manager = new ERPIntegrationManager({
    requestTimeout: 45000,
    enableCache: true
  });

  try {
    const connectionId = await manager.connect('netsuite', {
      accountId: 'your-account-id',
      accessToken: 'your-access-token',
      consumerId: 'your-consumer-id',
      consumerSecret: 'your-consumer-secret'
    });

    // Pull cost centers
    const costCenters = await manager.pullCostCenters(connectionId);
    console.log('Cost Centers:', costCenters);

    // Pull customers
    const customers = await manager.pullCustomers(connectionId);
    console.log(`Found ${customers.total} customers`);

    // Create mapping with computed fields
    const mapping = await manager.createFieldMapping(connectionId, {
      lineItems: {
        accountCode: 'account',
        debit: 'debitAmount',
        credit: 'creditAmount'
      },
      computedFields: {
        totalDebit: ['lineItems', 'debit'],
        totalCredit: ['lineItems', 'credit']
      },
      requiredFields: ['accountCode'],
      isDefault: true
    });

    console.log('Mapping created:', mapping.mappingId);

    // Multi-line entry
    const entry = {
      journalDate: '2024-01-15',
      referenceNumber: 'JE-2024-001',
      description: 'Consolidated closing entries',
      lineItems: [
        {
          accountCode: '1010',
          description: 'Cash',
          debit: 10000.00,
          costCenter: 'CORP'
        },
        {
          accountCode: '4010',
          description: 'Revenue',
          credit: 10000.00,
          costCenter: 'SALES'
        }
      ]
    };

    const result = await manager.pushJournalEntry(connectionId, entry);
    console.log('Entry posted:', result.id);

    await manager.disconnect(connectionId);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// EXAMPLE 3: XERO INTEGRATION WITH ERROR HANDLING
// ============================================================================

async function exampleXeroWithErrorHandling() {
  console.log('\n=== Xero Integration with Error Handling ===\n');

  const manager = new ERPIntegrationManager({
    maxRetries: 5,
    retryDelay: 500
  });

  try {
    const connectionId = await manager.connect('xero', {
      tenantId: 'your-tenant-id',
      accessToken: 'your-access-token',
      refreshToken: 'your-refresh-token'
    });

    // Validate field mapping
    const mappings = {
      lineItems: {
        accountCode: 'AccountCode',
        debit: 'Amount',
        description: 'Description'
      },
      requiredFields: ['accountCode', 'debit']
    };

    const validation = await manager.validateFieldMapping(connectionId, mappings);

    if (!validation.isValid) {
      console.error('Mapping validation errors:', validation.errors);
      return;
    }

    console.log('Mapping validation passed');

    // Create entry with validation
    const entry = {
      journalDate: '2024-01-20',
      referenceNumber: 'JE-XERO-001',
      description: 'Test entry',
      lineItems: [
        {
          accountCode: '200',
          description: 'Sales Account',
          debit: 500.00
        },
        {
          accountCode: '400',
          description: 'Expense Account',
          credit: 500.00
        }
      ]
    };

    // Push with pre-posting validation
    const result = await manager.pushJournalEntry(
      connectionId,
      entry,
      { validate: true }
    );

    console.log('Entry posted successfully:', result);

    await manager.disconnect(connectionId);

  } catch (error) {
    if (error instanceof ERPValidationError) {
      console.error('Validation failed:', error.message);
    } else if (error instanceof ERPConnectionError) {
      console.error('Connection error:', error.message);
    } else if (error instanceof ERPOperationError) {
      console.error('Operation failed after retries:', error.message);
    } else {
      console.error('Unexpected error:', error.message);
    }
  }
}

// ============================================================================
// EXAMPLE 4: MULTIPLE CONNECTIONS AND HEALTH MONITORING
// ============================================================================

async function exampleMultipleConnections() {
  console.log('\n=== Multiple Connections Management ===\n');

  const manager = new ERPIntegrationManager({
    enableCache: true,
    cacheTTL: 300000 // 5 minutes
  });

  const connections = [];

  try {
    // Connect to multiple ERPs
    connections.push(await manager.connect('quickbooks-online', {
      realmId: 'qbo-realm-1',
      accessToken: 'qbo-token'
    }));

    connections.push(await manager.connect('xero', {
      tenantId: 'xero-tenant-1',
      accessToken: 'xero-token'
    }));

    connections.push(await manager.connect('netsuite', {
      accountId: 'netsuite-account-1',
      accessToken: 'netsuite-token'
    }));

    // List all connections
    const allConnections = manager.listConnections();
    console.log('Active connections:');
    allConnections.forEach(conn => {
      console.log(`  - ${conn.connectionId} (${conn.type})`);
    });

    // Get health report
    const health = await manager.getHealthReport();
    console.log('\nHealth Report:', health);

    // Pull data from all connections in parallel
    const promises = connections.map(connId =>
      manager.pullChartOfAccounts(connId)
        .then(coa => ({ connectionId: connId, accounts: coa.total }))
        .catch(err => ({ connectionId: connId, error: err.message }))
    );

    const results = await Promise.all(promises);
    console.log('\nChart of Accounts Summary:');
    results.forEach(r => {
      if (r.error) {
        console.log(`  ${r.connectionId}: ERROR - ${r.error}`);
      } else {
        console.log(`  ${r.connectionId}: ${r.accounts} accounts`);
      }
    });

    // Cleanup
    for (const connId of connections) {
      await manager.disconnect(connId);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// EXAMPLE 5: CSV/EXCEL EXPORT
// ============================================================================

async function exampleCSVExport() {
  console.log('\n=== CSV/Excel Export ===\n');

  const manager = new ERPIntegrationManager();

  try {
    // Connect to CSV export
    const connectionId = await manager.connect('csv-export', {
      format: 'csv',
      encoding: 'utf-8'
    });

    const entry = {
      journalDate: '2024-01-25',
      referenceNumber: 'JE-CSV-001',
      description: 'Bulk export entry',
      lineItems: [
        {
          accountCode: '1000',
          description: 'Asset Account',
          debit: 25000.00,
          costCenter: 'MAIN'
        },
        {
          accountCode: '3000',
          description: 'Equity Account',
          credit: 25000.00,
          costCenter: 'MAIN'
        }
      ]
    };

    const result = await manager.pushJournalEntry(
      connectionId,
      entry,
      { outputPath: '/exports/finault' }
    );

    console.log('CSV Export Result:', result);

    // Export to Excel
    const excelConnectionId = await manager.connect('excel-export', {
      format: 'excel'
    });

    const excelResult = await manager.pushJournalEntry(
      excelConnectionId,
      entry,
      { outputPath: '/exports/finault' }
    );

    console.log('Excel Export Result:', excelResult);

    await manager.disconnect(connectionId);
    await manager.disconnect(excelConnectionId);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// EXAMPLE 6: SCHEDULED POSTING
// ============================================================================

async function exampleScheduledPosting() {
  console.log('\n=== Scheduled Posting ===\n');

  const manager = new ERPIntegrationManager();

  try {
    const connectionId = await manager.connect('quickbooks-online', {
      realmId: 'qbo-realm',
      accessToken: 'qbo-token'
    });

    // Simulate getting entries from database
    let entryNumber = 1;
    const getEntries = async () => {
      // In production, fetch from database
      const now = new Date();
      if (now.getDate() === 3) { // Only post on 3rd of month
        return [{
          journalDate: now.toISOString().split('T')[0],
          referenceNumber: `AUTO-JE-${entryNumber++}`,
          description: 'Auto-posted closing entry',
          lineItems: [
            {
              accountCode: '9000',
              description: 'Auto-posting',
              debit: 1000.00
            },
            {
              accountCode: '9100',
              description: 'Auto-posting',
              credit: 1000.00
            }
          ]
        }];
      }
      return [];
    };

    // Schedule for daily check (will post on 3rd only)
    const scheduler = await manager.schedulePush(
      connectionId,
      {
        type: 'interval',
        value: 1,
        unit: 'day'
      },
      { getEntries }
    );

    console.log('Scheduler activated:', scheduler.schedulerId);

    // Listen to events
    manager.on('entry-pushed', (event) => {
      console.log(`Entry posted: ${event.entryId}`);
    });

    manager.on('scheduled-push-error', (event) => {
      console.error(`Scheduled push error for ${event.entryId}:`, event.error);
    });

    // Keep running for 10 seconds for demonstration
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Cancel scheduler
    manager.cancelScheduledPush(connectionId);
    console.log('Scheduler cancelled');

    await manager.disconnect(connectionId);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// EXAMPLE 7: SAP INTEGRATION
// ============================================================================

async function exampleSAP() {
  console.log('\n=== SAP Integration ===\n');

  const manager = new ERPIntegrationManager();

  try {
    const connectionId = await manager.connect('sap', {
      systemId: 'ERP',
      client: '100',
      user: 'your-user',
      password: 'your-password',
      host: 'sap-server.example.com'
    });

    // Test connection
    const status = await manager.testConnection(connectionId);
    console.log('SAP Connection Status:', status);

    // Pull accounts from SAP
    const accounts = await manager.pullChartOfAccounts(connectionId);
    console.log(`Found ${accounts.total} accounts in SAP`);

    // Pull cost centers
    const costCenters = await manager.pullCostCenters(connectionId);
    console.log(`Found ${costCenters.costCenters.length} cost centers`);

    // Create SAP-specific mapping
    const mapping = await manager.createFieldMapping(connectionId, {
      lineItems: {
        accountCode: 'ACCNT',
        debit: 'DMBTR',
        credit: 'CMBTR',
        costCenter: 'KOSTL'
      }
    });

    console.log('SAP mapping created:', mapping.mappingId);

    await manager.disconnect(connectionId);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// EXAMPLE 8: ORACLE FINANCIALS INTEGRATION
// ============================================================================

async function exampleOracle() {
  console.log('\n=== Oracle Financials Integration ===\n');

  const manager = new ERPIntegrationManager({
    requestTimeout: 60000
  });

  try {
    const connectionId = await manager.connect('oracle', {
      instance: 'finprod',
      restEndpoint: 'https://finprod.oracle.com/rest/api/v2',
      user: 'your-user',
      password: 'your-password'
    });

    // Pull GL accounts
    const accounts = await manager.pullChartOfAccounts(connectionId);
    console.log('Oracle GL Accounts:', accounts.total);

    // Create entry with Oracle-specific fields
    const entry = {
      journalDate: '2024-01-30',
      referenceNumber: 'JE-ORA-001',
      batchId: 'BATCH-001',
      description: 'Oracle test entry',
      lineItems: [
        {
          accountCode: '01-1010-0000-0000-0000',
          debit: 5000.00,
          description: 'Test debit'
        },
        {
          accountCode: '01-4010-0000-0000-0000',
          credit: 5000.00,
          description: 'Test credit'
        }
      ]
    };

    const result = await manager.pushJournalEntry(connectionId, entry);
    console.log('Oracle entry posted:', result.id);

    await manager.disconnect(connectionId);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAllExamples() {
  try {
    // Note: These are demonstration examples and won't work without actual credentials
    console.log('Finault ERP Integration System - Usage Examples');
    console.log('================================================\n');

    // Uncomment the example you want to run:
    // await exampleQuickBooksOnline();
    // await exampleNetSuite();
    // await exampleXeroWithErrorHandling();
    // await exampleMultipleConnections();
    // await exampleCSVExport();
    // await exampleScheduledPosting();
    // await exampleSAP();
    // await exampleOracle();

    console.log('\nExamples are provided as templates.');
    console.log('Replace credentials and run individual functions as needed.');

  } catch (error) {
    console.error('Fatal error:', error.message);
  }
}

// Export examples for use in other modules
module.exports = {
  exampleQuickBooksOnline,
  exampleNetSuite,
  exampleXeroWithErrorHandling,
  exampleMultipleConnections,
  exampleCSVExport,
  exampleScheduledPosting,
  exampleSAP,
  exampleOracle,
  runAllExamples
};

// Uncomment to run:
// runAllExamples();
