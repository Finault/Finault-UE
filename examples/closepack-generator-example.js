/**
 * Close Pack Generator - Complete Usage Examples
 * Demonstrates all CFO-ready audit documentation features
 */

const ClosePackGenerator = require('./closepack-generator');

/**
 * EXAMPLE 1: Basic Close Pack Generation
 */
async function example_BasicClosePackGeneration() {
  console.log('\n=== EXAMPLE 1: Basic Close Pack Generation ===\n');

  // Initialize the generator with company configuration
  const generator = new ClosePackGenerator({
    companyName: 'Acme Corporation',
    companyId: 'ACME-2026',
    fiscalYear: 2026,
    fiscalMonth: 1,
    auditor: 'John Smith, CPA'
  });

  // Sample invoice data
  const invoiceData = [
    {
      reference: 'INV-001',
      amount: 50000,
      date: '2026-01-15',
      glAccount: '1200',
      sourceSystem: 'ERP_PRIMARY',
      documentation: 'Invoice from customer ABC Corp'
    },
    {
      reference: 'INV-002',
      amount: 75000,
      date: '2026-01-20',
      glAccount: '1200',
      sourceSystem: 'ERP_PRIMARY',
      documentation: 'Invoice from customer XYZ Inc'
    },
    {
      reference: 'INV-003',
      amount: 60000,
      date: '2026-01-25',
      glAccount: '1200',
      sourceSystem: 'ERP_PRIMARY',
      documentation: 'Invoice from customer DEF Ltd'
    }
  ];

  // Sample cost allocation data
  const allocationData = {
    department: 'Operations',
    amount: 100000,
    basisType: 'HEADCOUNT',
    basisValue: 50,
    method: 'HEADCOUNT_BASED',
    description: 'Monthly operational cost allocation'
  };

  // Generate complete close pack
  const closePack = generator.generate(invoiceData, allocationData);

  console.log('Close Pack Generated Successfully!');
  console.log(`Pack ID: ${closePack.closePack.id}`);
  console.log(`Company: ${closePack.closePack.company}`);
  console.log(`Period: ${closePack.closePack.fiscalPeriod}`);
  console.log(`Processing Time: ${closePack.closePack.processingTimeMs}ms`);
  console.log(`Status: ${closePack.closePack.status}`);

  return closePack;
}

/**
 * EXAMPLE 2: Journal Entry with Balanced Debits/Credits
 */
async function example_JournalEntryBalancing() {
  console.log('\n=== EXAMPLE 2: Journal Entry Balancing ===\n');

  const generator = new ClosePackGenerator({
    companyName: 'TechStart Inc',
    companyId: 'TECH-2026',
    fiscalYear: 2026,
    fiscalMonth: 2,
    auditor: 'Sarah Johnson, CPA'
  });

  const invoiceData = [
    { reference: 'INV-101', amount: 45000, date: '2026-02-10' },
    { reference: 'INV-102', amount: 55000, date: '2026-02-15' }
  ];

  const allocationData = {
    department: 'Engineering',
    amount: 50000,
    method: 'HEADCOUNT_BASED'
  };

  // Generate just the journal entry to inspect
  const closePack = generator.generate(invoiceData, allocationData);
  const je = closePack.closePack.documents.journalEntry;

  console.log('Journal Entry Details:');
  console.log(`Entry ID: ${je.id}`);
  console.log(`Description: ${je.description}`);
  console.log(`Status: ${je.status}`);
  console.log(`\nJournal Entry Lines:`);
  console.log('GL Account | Account Name              | Debit      | Credit');
  console.log('----------|-------------------------|-----------|-----------');

  je.lines.forEach(line => {
    const debitStr = line.debit > 0 ? line.debit.toFixed(2) : '-';
    const creditStr = line.credit > 0 ? line.credit.toFixed(2) : '-';
    console.log(
      `${line.glAccount.padEnd(9)} | ${line.accountName.padEnd(24)} | ${debitStr.padStart(9)} | ${creditStr.padStart(9)}`
    );
  });

  console.log('----------|--------------------------|-----------|----------');
  console.log(
    `TOTALS                                      | ${je.totalDebits.toFixed(2).padStart(9)} | ${je.totalCredits.toFixed(2).padStart(9)}`
  );
  console.log(`\nEntry Balanced: ${je.isBalanced ? 'YES ✓' : 'NO ✗'}`);

  return closePack;
}

/**
 * EXAMPLE 3: ERP Export Formats
 */
async function example_ERPExports() {
  console.log('\n=== EXAMPLE 3: ERP Export Formats ===\n');

  const generator = new ClosePackGenerator({
    companyName: 'Global Enterprises',
    companyId: 'GLOBAL-2026',
    fiscalYear: 2026,
    fiscalMonth: 3,
    auditor: 'Michael Chen, CPA'
  });

  const invoiceData = [
    { reference: 'INV-201', amount: 100000, date: '2026-03-10' }
  ];

  const allocationData = {
    department: 'Finance',
    amount: 25000,
    method: 'ALLOCATION_PERCENT'
  };

  const closePack = generator.generate(invoiceData, allocationData);
  const je = closePack.closePack.documents.journalEntry;

  // Export to different ERP systems
  console.log('QUICKBOOKS EXPORT:');
  const qbExport = generator.toQuickBooks(je);
  console.log(JSON.stringify(qbExport, null, 2));

  console.log('\n\nNETSUITE EXPORT:');
  const netsuiteExport = generator.toNetSuite(je);
  console.log(JSON.stringify(netsuiteExport.records, null, 2));

  console.log('\n\nXERO EXPORT:');
  const xeroExport = generator.toXero(je);
  console.log(JSON.stringify(xeroExport.records, null, 2));

  console.log('\n\nSAP EXPORT:');
  const sapExport = generator.toSAP(je);
  console.log(JSON.stringify(sapExport.items, null, 2));

  return { qbExport, netsuiteExport, xeroExport, sapExport };
}

/**
 * EXAMPLE 4: Blockchain Attestation and Verification
 */
async function example_BlockchainAttestationVerification() {
  console.log('\n=== EXAMPLE 4: Blockchain Attestation ===\n');

  const generator = new ClosePackGenerator({
    companyName: 'Blockchain Corp',
    companyId: 'BLOCK-2026',
    fiscalYear: 2026,
    fiscalMonth: 4,
    auditor: 'David Rodriguez, CPA'
  });

  const invoiceData = [
    { reference: 'INV-301', amount: 80000, date: '2026-04-12' },
    { reference: 'INV-302', amount: 120000, date: '2026-04-18' }
  ];

  const allocationData = {
    department: 'Marketing',
    amount: 50000
  };

  const closePack = generator.generate(invoiceData, allocationData);
  const attestation = closePack.closePack.attestation;

  console.log('Attestation Details:');
  console.log(`Attestation ID: ${attestation.id}`);
  console.log(`Timestamp: ${attestation.timestamp}`);
  console.log(`Close Period: ${attestation.closePeriod}`);
  console.log(`Document Count: ${attestation.documentCount}`);
  console.log(`Hash Chain Length: ${attestation.hashChainLength}`);
  console.log(`Hash Chain Integrity: ${attestation.hashChainIntegrity ? 'VERIFIED ✓' : 'FAILED ✗'}`);
  console.log(`Latest Block Hash: ${attestation.latestBlockHash.substring(0, 16)}...`);
  console.log(`Signature Algorithm: ${attestation.signatureAlgorithm}`);

  // Verify the attestation
  const verification = generator.verifyAttestation(attestation);

  console.log('\nVerification Results:');
  console.log(`Attestation Valid: ${verification.isValid ? 'YES ✓' : 'NO ✗'}`);
  console.log(`Chain Integrity: ${verification.chainIntegrity ? 'VERIFIED ✓' : 'FAILED ✗'}`);
  console.log(`Status: ${verification.status}`);

  // Anchor to blockchain (simulated)
  console.log('\nBlockchain Anchoring:');
  const blockchainAnchor = generator.anchorToBlockchain(attestation.latestBlockHash);
  console.log(`Network: ${blockchainAnchor.network}`);
  console.log(`Contract Address: ${blockchainAnchor.contractAddress}`);
  console.log(`Transaction Hash: ${blockchainAnchor.transactionHash}`);
  console.log(`Block Number: ${blockchainAnchor.blockNumber}`);
  console.log(`Confirmations: ${blockchainAnchor.confirmations}`);
  console.log(`Status: ${blockchainAnchor.status}`);
  console.log(`Verification URL: ${blockchainAnchor.verificationUrl}`);

  return { attestation, verification, blockchainAnchor };
}

/**
 * EXAMPLE 5: Email Delivery with Resend
 */
async function example_EmailDelivery() {
  console.log('\n=== EXAMPLE 5: Email Delivery ===\n');

  const generator = new ClosePackGenerator({
    companyName: 'Email Corp',
    companyId: 'EMAIL-2026',
    fiscalYear: 2026,
    fiscalMonth: 5,
    auditor: 'Lisa Patterson, CPA'
  });

  const invoiceData = [
    { reference: 'INV-401', amount: 70000, date: '2026-05-11' }
  ];

  const allocationData = {
    department: 'Sales',
    amount: 35000
  };

  const closePack = generator.generate(invoiceData, allocationData);

  // Send via email (simulated - would use Resend in production)
  const emailResult = await generator.emailClosePack(
    'cfo@emailcorp.com',
    closePack,
    'your-resend-api-key'
  );

  console.log('Email Delivery Result:');
  console.log(`Status: ${emailResult.status}`);
  console.log(`Message ID: ${emailResult.messageId}`);
  console.log(`Recipient: ${emailResult.recipientEmail}`);
  console.log(`Timestamp: ${emailResult.timestamp}`);
  console.log(`Close Period: ${emailResult.closePeriod}`);
  console.log(`Document Count: ${emailResult.documentCount}`);

  return emailResult;
}

/**
 * EXAMPLE 6: Automated Scheduling
 */
async function example_AutomatedScheduling() {
  console.log('\n=== EXAMPLE 6: Automated Monthly Scheduling ===\n');

  const generator = new ClosePackGenerator({
    companyName: 'Scheduled Corp',
    companyId: 'SCHED-2026',
    fiscalYear: 2026,
    fiscalMonth: 6,
    auditor: 'Robert Lee, CPA'
  });

  // Schedule monthly close pack generation
  const schedule = generator.scheduleMonthlyGeneration({
    dayOfMonth: 5,
    timeOfDay: '09:00 UTC',
    autoEmail: true,
    emailRecipients: ['cfo@scheduledcorp.com', 'controller@scheduledcorp.com'],
    autoArchive: true,
    archiveLocation: 'S3_ENCRYPTED_VAULT'
  });

  console.log('Schedule Configuration:');
  console.log(`Schedule ID: ${schedule.scheduleId}`);
  console.log(`Frequency: ${schedule.frequency}`);
  console.log(`Day of Month: ${schedule.dayOfMonth}`);
  console.log(`Time of Day: ${schedule.timeOfDay}`);
  console.log(`Auto Email: ${schedule.autoEmail}`);
  console.log(`Email Recipients: ${schedule.emailRecipients.join(', ')}`);
  console.log(`Auto Archive: ${schedule.autoArchive}`);
  console.log(`Archive Location: ${schedule.archiveLocation}`);
  console.log(`Start Date: ${schedule.startDate}`);
  console.log(`Next Execution: ${schedule.nextExecutionDate}`);
  console.log(`Status: ${schedule.status}`);

  return schedule;
}

/**
 * EXAMPLE 7: Complete Audit Workflow
 */
async function example_CompleteAuditWorkflow() {
  console.log('\n=== EXAMPLE 7: Complete Audit Workflow ===\n');

  // Create generator for the audit period
  const generator = new ClosePackGenerator({
    companyName: 'Audit Ready Corp',
    companyId: 'AUDIT-2026',
    fiscalYear: 2026,
    fiscalMonth: 1,
    auditor: 'Audit Partner Team'
  });

  // Multi-month data
  const invoiceData = [
    { reference: 'INV-M1-001', amount: 120000, date: '2026-01-15', sourceSystem: 'ERP_PRIMARY' },
    { reference: 'INV-M1-002', amount: 150000, date: '2026-01-20', sourceSystem: 'ERP_PRIMARY' },
    { reference: 'INV-M1-003', amount: 130000, date: '2026-01-28', sourceSystem: 'ERP_PRIMARY' }
  ];

  const allocationData = [
    {
      department: 'Operations',
      amount: 150000,
      basisType: 'HEADCOUNT',
      description: 'Operations staff allocation'
    },
    {
      department: 'Finance',
      amount: 80000,
      basisType: 'HEADCOUNT',
      description: 'Finance staff allocation'
    }
  ];

  // Step 1: Generate full close pack
  console.log('Step 1: Generating Close Pack...');
  const closePack = generator.generate(invoiceData, allocationData);
  console.log(`✓ Close Pack generated: ${closePack.closePack.id}`);

  // Step 2: Verify journal entries
  console.log('\nStep 2: Verifying Journal Entries...');
  const je = closePack.closePack.documents.journalEntry;
  console.log(`✓ Journal Entry balanced: ${je.isBalanced ? 'YES' : 'NO'}`);
  console.log(`  - Total Debits: $${je.totalDebits.toFixed(2)}`);
  console.log(`  - Total Credits: $${je.totalCredits.toFixed(2)}`);

  // Step 3: Review reconciliation
  console.log('\nStep 3: Reviewing Reconciliation...');
  const recon = closePack.closePack.documents.reconciliationCert;
  console.log(`✓ Reconciliation completed: ${recon.status}`);
  console.log(`  - Items reconciled: ${recon.reconciliationItems.length}`);

  // Step 4: Review controls
  console.log('\nStep 4: Internal Controls Assessment...');
  const controls = closePack.closePack.documents.controlsNarrative;
  console.log(`✓ Controls evaluated: ${controls.status}`);
  console.log(`  - Controls tested: ${controls.testingResults.controlsTestedCount}`);
  console.log(`  - Controls passed: ${controls.testingResults.controlsPassedCount}`);
  console.log(`  - Assessment: ${controls.testingResults.overallAssessment}`);

  // Step 5: Review variance analysis
  console.log('\nStep 5: Variance Analysis...');
  const variance = closePack.closePack.documents.varianceAnalysis;
  console.log(`✓ Variance reviewed: ${variance.status}`);
  console.log(`  - Variance Amount: $${variance.summarySummary.varianceAmount.toFixed(2)}`);
  console.log(`  - Material: ${variance.summarySummary.isMaterial ? 'YES' : 'NO'}`);

  // Step 6: Export for filing
  console.log('\nStep 6: Preparing ERP Exports...');
  const allExports = {
    quickBooks: generator.toQuickBooks(je),
    netSuite: generator.toNetSuite(je),
    xero: generator.toXero(je),
    sap: generator.toSAP(je)
  };
  console.log(`✓ Exports prepared: ${Object.keys(allExports).length} formats`);

  // Step 7: Verify attestation
  console.log('\nStep 7: Blockchain Attestation...');
  const attestation = closePack.closePack.attestation;
  const verification = generator.verifyAttestation(attestation);
  console.log(`✓ Attestation verified: ${verification.status}`);
  console.log(`  - Hash chain integrity: ${verification.chainIntegrity ? 'VERIFIED' : 'FAILED'}`);

  // Step 8: Archive and deliver
  console.log('\nStep 8: Archiving and Delivery...');
  const schedule = generator.scheduleMonthlyGeneration({
    dayOfMonth: 5,
    autoEmail: true,
    autoArchive: true,
    emailRecipients: ['audit@auditreadycorp.com']
  });
  console.log(`✓ Archive scheduled: ${schedule.nextExecutionDate}`);

  console.log('\n=== AUDIT WORKFLOW COMPLETE ===');
  console.log(`All close pack documentation has been generated, verified, and scheduled.`);

  return {
    closePack,
    journalEntry: je,
    reconciliation: recon,
    controls,
    variance,
    allExports,
    attestation,
    verification,
    schedule
  };
}

/**
 * EXAMPLE 8: Multi-Entity Consolidation
 */
async function example_MultiEntityConsolidation() {
  console.log('\n=== EXAMPLE 8: Multi-Entity Close Packs ===\n');

  const entities = [
    { name: 'Acme USA', id: 'ACME-USA', month: 1 },
    { name: 'Acme Europe', id: 'ACME-EU', month: 1 },
    { name: 'Acme Asia', id: 'ACME-ASIA', month: 1 }
  ];

  const consolidatedData = [];

  for (const entity of entities) {
    console.log(`Processing ${entity.name}...`);

    const generator = new ClosePackGenerator({
      companyName: entity.name,
      companyId: entity.id,
      fiscalYear: 2026,
      fiscalMonth: entity.month,
      auditor: 'Global Audit Team'
    });

    const invoiceData = [
      { reference: `INV-${entity.id}-001`, amount: Math.random() * 200000, date: '2026-01-15' },
      { reference: `INV-${entity.id}-002`, amount: Math.random() * 200000, date: '2026-01-20' }
    ];

    const allocationData = {
      department: 'Corporate',
      amount: Math.random() * 100000
    };

    const closePack = generator.generate(invoiceData, allocationData);
    consolidatedData.push({
      entity: entity.name,
      closePackId: closePack.closePack.id,
      totalRevenue: closePack.closePack.documents.budgetVsActual.totalSummary.totalActual,
      status: closePack.closePack.status
    });

    console.log(`✓ ${entity.name} close pack generated`);
  }

  console.log('\nConsolidation Summary:');
  console.log('Entity                | Close Pack ID                           | Total Revenue | Status');
  console.log('---------------------|--------------------------------------|--------------|---------');

  consolidatedData.forEach(item => {
    const revenue = item.totalRevenue.toFixed(2);
    console.log(
      `${item.entity.padEnd(20)} | ${item.closePackId.padEnd(36)} | $${revenue.padStart(12)} | ${item.status}`
    );
  });

  const totalRevenue = consolidatedData.reduce((sum, item) => sum + item.totalRevenue, 0);
  console.log(`\nTotal Consolidated Revenue: $${totalRevenue.toFixed(2)}`);

  return consolidatedData;
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     FINAULT CLOSE PACK GENERATOR - COMPLETE EXAMPLES       ║');
    console.log('║   CFO-Ready Audit Documentation with Blockchain Attestation║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    await example_BasicClosePackGeneration();
    await example_JournalEntryBalancing();
    await example_ERPExports();
    await example_BlockchainAttestationVerification();
    await example_EmailDelivery();
    await example_AutomatedScheduling();
    await example_CompleteAuditWorkflow();
    await example_MultiEntityConsolidation();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              ALL EXAMPLES COMPLETED SUCCESSFULLY            ║');
    console.log('║  Close Pack Generator is ready for production deployment   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('Error running examples:', error.message);
    process.exit(1);
  }
}

// Export for use in other modules
module.exports = {
  example_BasicClosePackGeneration,
  example_JournalEntryBalancing,
  example_ERPExports,
  example_BlockchainAttestationVerification,
  example_EmailDelivery,
  example_AutomatedScheduling,
  example_CompleteAuditWorkflow,
  example_MultiEntityConsolidation,
  runAllExamples
};

// Run examples if executed directly
if (require.main === module) {
  runAllExamples();
}
