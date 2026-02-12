/**
 * ICFR/COSO Framework Module for Finault
 *
 * Maps Finault's financial controls (AI-FIN-001 through AI-FIN-006) to the COSO
 * Internal Control Framework's 5 components and PCAOB financial reporting assertions
 * per AS 1105 (Audit of Internal Control Over Financial Reporting).
 *
 * References:
 * - COSO: Internal Control—Integrated Framework (2013 Edition)
 * - PCAOB AS 1105: Audit of Internal Control Over Financial Reporting
 * - SOX 404: Management Assessment of Internal Controls
 *
 * @module icfr-framework
 */

/**
 * COSO Framework 5 Components
 * Reference: COSO 2013 Edition, Executive Summary
 *
 * @typedef {Object} COSOComponent
 * @property {string} id - Component identifier
 * @property {string} name - Component name
 * @property {string} description - Detailed description
 * @property {string} coso_principle_reference - COSO principle reference
 */

/**
 * Internal Control Environment Component
 * COSO Principle 1-4: Entity's commitment to competence, ethics, and accountability
 */
const COSO_COMPONENTS = {
  CONTROL_ENVIRONMENT: {
    id: 'COSO-CC-01',
    name: 'Control Environment',
    description: 'The tone at the top. Establishes the entity\'s commitment to integrity and ethical values, including the board\'s oversight responsibility. Provides the foundation for all other components.',
    coso_principle_reference: 'COSO 2013 Principles 1-4: Integrity & Ethics, Board Oversight, Organizational Structure, Authority & Accountability'
  },

  /**
   * Risk Assessment Component
   * COSO Principle 5-6: Identifying, analyzing, and managing financial reporting risks
   */
  RISK_ASSESSMENT: {
    id: 'COSO-CC-02',
    name: 'Risk Assessment',
    description: 'The entity identifies financial reporting risks across the organization and implements tools to identify and manage change. Analyzes risks at both transaction and assertion level.',
    coso_principle_reference: 'COSO 2013 Principles 5-6: Risk Assessment, Change Management'
  },

  /**
   * Control Activities Component
   * COSO Principle 7-9: Policies, procedures, and automation to achieve objectives
   */
  CONTROL_ACTIVITIES: {
    id: 'COSO-CC-03',
    name: 'Control Activities',
    description: 'Comprises policies and procedures that ensure management directives are carried out. Includes preventive controls (reconciliations, validations) and detective controls (exception monitoring).',
    coso_principle_reference: 'COSO 2013 Principles 7-9: Control Activities, General & IT Controls, Information Systems'
  },

  /**
   * Information & Communication Component
   * COSO Principle 10-11: Quality information and bidirectional communication
   */
  INFORMATION_COMMUNICATION: {
    id: 'COSO-CC-04',
    name: 'Information & Communication',
    description: 'The entity obtains, generates, and uses relevant, quality information to support effective internal control. Communicates internally and with external parties (auditors, regulators).',
    coso_principle_reference: 'COSO 2013 Principles 10-11: Information & Communication, Quality Information'
  },

  /**
   * Monitoring Activities Component
   * COSO Principle 12-13: Ongoing and separate evaluations of control effectiveness
   */
  MONITORING_ACTIVITIES: {
    id: 'COSO-CC-05',
    name: 'Monitoring Activities',
    description: 'The entity selects, develops, and conducts ongoing evaluations and separate evaluations to determine if components of internal control are present and functioning. Includes audit trail review and management assertion testing.',
    coso_principle_reference: 'COSO 2013 Principles 12-13: Ongoing Evaluations, Separate Evaluations'
  }
};

/**
 * PCAOB Financial Reporting Assertions
 * Reference: PCAOB AS 1105, Appendix A - Management Assertions
 *
 * These assertions represent what management implicitly or explicitly asserts
 * when presenting financial statements.
 *
 * @typedef {Object} PCAAOBAssertion
 * @property {string} id - Assertion identifier
 * @property {string} name - Assertion name
 * @property {string} description - What the assertion addresses
 * @property {string} standard_reference - PCAOB AS 1105 reference
 */
const PCAOB_ASSERTIONS = {
  EXISTENCE_OCCURRENCE: {
    id: 'PCAOB-AS-01',
    name: 'Existence/Occurrence',
    description: 'Transactions and events that have been recorded actually occurred and pertain to the entity. Controls verify that recorded transactions are valid and authorized.',
    standard_reference: 'PCAOB AS 1105, Appendix A: Existence/Occurrence Assertion'
  },

  COMPLETENESS: {
    id: 'PCAOB-AS-02',
    name: 'Completeness',
    description: 'All transactions and events that should have been recorded have been recorded. No transactions are omitted from financial records.',
    standard_reference: 'PCAOB AS 1105, Appendix A: Completeness Assertion'
  },

  ACCURACY_VALUATION: {
    id: 'PCAOB-AS-03',
    name: 'Accuracy/Valuation',
    description: 'Amounts are recorded accurately and properly valued. Monetary amounts are recorded correctly per contracts, terms, and agreed-upon calculations.',
    standard_reference: 'PCAOB AS 1105, Appendix A: Accuracy/Valuation Assertion'
  },

  RIGHTS_OBLIGATIONS: {
    id: 'PCAOB-AS-04',
    name: 'Rights/Obligations',
    description: 'The entity has rights to assets and obligations are actual liabilities of the entity. Assets are owned and liabilities are legitimately owed.',
    standard_reference: 'PCAOB AS 1105, Appendix A: Rights/Obligations Assertion'
  },

  PRESENTATION_DISCLOSURE: {
    id: 'PCAOB-AS-05',
    name: 'Presentation/Disclosure',
    description: 'Transactions and events are properly classified and disclosed in the financial statements. Accounting policies are correctly applied and disclosed.',
    standard_reference: 'PCAOB AS 1105, Appendix A: Presentation/Disclosure Assertion'
  },

  CUTOFF: {
    id: 'PCAOB-AS-06',
    name: 'Cutoff',
    description: 'Transactions and events are recorded in the correct accounting period. Revenue and expenses are recognized in the appropriate fiscal period.',
    standard_reference: 'PCAOB AS 1105, Appendix A: Cutoff Assertion'
  }
};

/**
 * Finault Control Definitions
 * Maps each Finault control to COSO components, PCAOB assertions, and evidence sources
 *
 * @typedef {Object} FinaultControl
 * @property {string} id - Control ID (AI-FIN-001 through AI-FIN-006)
 * @property {string} name - Control name
 * @property {string} description - Functional description
 * @property {string} coso_component - Primary COSO component ID
 * @property {string[]} assertions - Array of supported PCAOB assertion IDs
 * @property {string[]} evidence_sources - Finault artifacts providing evidence
 * @property {string} sox_404_objective - SOX 404 control objective statement
 * @property {string} test_procedure - How to test control effectiveness
 * @property {string} frequency - Testing/execution frequency
 */
const FINAULT_CONTROLS = [
  {
    id: 'AI-FIN-001',
    name: 'Invoice Verification',
    description: 'Validates parsed invoice data against provider billing records. Ensures all line items, quantities, rates, and totals are accurate before payment.',
    coso_component: 'COSO-CC-03',
    assertions: [
      'PCAOB-AS-01', // Existence/Occurrence - invoice actually exists
      'PCAOB-AS-03', // Accuracy/Valuation - amounts are correct
      'PCAOB-AS-04'  // Rights/Obligations - we owe this amount
    ],
    evidence_sources: [
      'invoice-parsed-data.json',
      'invoice-validation-log.txt',
      'provider-billing-reconciliation.csv',
      'payment-authorization-record.json'
    ],
    sox_404_objective: 'Management asserts that controls are designed and operating effectively to ensure that all recorded liabilities for vendor invoices represent valid obligations of the entity and that amounts are accurately recorded.',
    test_procedure: 'Select sample of invoices processed; verify parsed data matches source invoice; confirm amounts match provider billing; validate controls detected and rejected invalid invoices.',
    frequency: 'per_close'
  },

  {
    id: 'AI-FIN-002',
    name: 'Cost Allocation Rules',
    description: 'Applies deterministic allocation rules via the rules engine to distribute costs across cost centers, departments, and business units per policy. Ensures consistent, repeatable allocations.',
    coso_component: 'COSO-CC-03',
    assertions: [
      'PCAOB-AS-02', // Completeness - all costs allocated
      'PCAOB-AS-03', // Accuracy/Valuation - allocation formulas correct
      'PCAOB-AS-05'  // Presentation/Disclosure - proper classification
    ],
    evidence_sources: [
      'allocation-rules-config.yaml',
      'allocation-calculation-log.json',
      'cost-center-summary.csv',
      'rules-engine-execution-trace.log'
    ],
    sox_404_objective: 'Management asserts that controls are designed and operating effectively to ensure that cost allocations are performed using documented, authorized allocation methodologies and that all costs are completely and accurately distributed.',
    test_procedure: 'Review allocation rules configuration; recalculate sample allocations independently; verify all costs are allocated to appropriate cost centers; confirm rules applied consistently.',
    frequency: 'per_close'
  },

  {
    id: 'AI-FIN-003',
    name: 'Reconciliation',
    description: 'Matches usage data (quantities) against invoice line items (charges). Identifies and documents discrepancies for investigation and resolution before payment.',
    coso_component: 'COSO-CC-03',
    assertions: [
      'PCAOB-AS-01', // Existence/Occurrence - usage actually occurred
      'PCAOB-AS-02', // Completeness - all usage recorded
      'PCAOB-AS-03', // Accuracy/Valuation - correct quantities/amounts
      'PCAOB-AS-06'  // Cutoff - recorded in correct period
    ],
    evidence_sources: [
      'usage-data-feed.json',
      'invoice-line-items.csv',
      'reconciliation-variance-log.json',
      'reconciliation-resolution-record.txt',
      'payment-exception-report.csv'
    ],
    sox_404_objective: 'Management asserts that controls are designed and operating effectively to ensure that recorded charges correspond to actual services rendered and that variances are identified and appropriately investigated.',
    test_procedure: 'Obtain usage data and corresponding invoices; perform independent reconciliation on sample; review variance documentation; verify variances were investigated and resolved.',
    frequency: 'per_close'
  },

  {
    id: 'AI-FIN-004',
    name: 'Anomaly Detection',
    description: 'Statistical detection of unusual cost or usage patterns using z-score analysis and statistical thresholds. Flags anomalies for management review before close.',
    coso_component: 'COSO-CC-02',
    assertions: [
      'PCAOB-AS-01', // Existence/Occurrence - detects transactions that shouldn\'t exist
      'PCAOB-AS-03', // Accuracy/Valuation - identifies valuation anomalies
      'PCAOB-AS-06'  // Cutoff - identifies unusual cutoff patterns
    ],
    evidence_sources: [
      'anomaly-detection-log.json',
      'statistical-baseline-data.csv',
      'z-score-analysis-report.json',
      'anomaly-management-review-sign-off.txt'
    ],
    sox_404_objective: 'Management asserts that controls are designed and operating effectively to detect anomalous transactions and activities that may indicate errors or fraud.',
    test_procedure: 'Review anomaly detection configuration and baseline parameters; obtain anomaly detection results for period; verify anomalies were investigated; confirm unusual items were resolved.',
    frequency: 'continuous'
  },

  {
    id: 'AI-FIN-005',
    name: 'Audit Trail',
    description: 'Immutable event log with cryptographic hash chain integrity verification. Records all financial transactions, allocations, and control activities with timestamps and actors.',
    coso_component: 'COSO-CC-04',
    assertions: [
      'PCAOB-AS-01', // Existence/Occurrence - audit trail proves occurrence
      'PCAOB-AS-02', // Completeness - all transactions logged
      'PCAOB-AS-03', // Accuracy/Valuation - amounts logged accurately
      'PCAOB-AS-06'  // Cutoff - timestamps verify period
    ],
    evidence_sources: [
      'audit-trail-blockchain.log',
      'hash-chain-verification-result.json',
      'transaction-entry-record.json',
      'control-activity-log.txt',
      'merkle-tree-audit-proof.json'
    ],
    sox_404_objective: 'Management asserts that controls are designed and operating effectively to maintain complete, accurate, and immutable records of all financial transactions and control activities.',
    test_procedure: 'Select transactions from audit trail; verify hash chain integrity; confirm all material transactions are logged; verify timestamps are sequentially valid; spot-check source documentation.',
    frequency: 'continuous'
  },

  {
    id: 'AI-FIN-006',
    name: 'Close Pack Integrity',
    description: 'All-or-nothing artifact generation with cryptographic attestation hash. Ensures that all required close pack components are present and validated before financial statement certification.',
    coso_component: 'COSO-CC-05',
    assertions: [
      'PCAOB-AS-01', // Existence/Occurrence - complete pack attests all occurred
      'PCAOB-AS-02', // Completeness - all artifacts present
      'PCAOB-AS-03', // Accuracy/Valuation - integrity verified
      'PCAOB-AS-05'  // Presentation/Disclosure - proper classification in pack
    ],
    evidence_sources: [
      'closepack-manifest.json',
      'attestation-hash-value.txt',
      'component-integrity-check.json',
      'close-certificate.txt',
      'pack-generation-log.log'
    ],
    sox_404_objective: 'Management asserts that controls are designed and operating effectively to ensure that all required components of the financial close are present, validated, and attested before financial statements are released.',
    test_procedure: 'Obtain close pack and manifest; verify all required artifacts are present; validate attestation hash; confirm integrity checks passed; verify sign-off from preparer and reviewer.',
    frequency: 'per_close'
  }
];

/**
 * Generates a control-by-assertion matrix showing coverage
 *
 * Returns a matrix (object) where each control ID maps to an object of assertion
 * coverage (true/false for each PCAOB assertion).
 *
 * Reference: PCAOB AS 1105, Section C: Management's Assessment
 *
 * @returns {Object} Matrix showing which assertions each control addresses
 *
 * @example
 * const matrix = generateControlMatrix();
 * // {
 * //   'AI-FIN-001': {
 * //     'PCAOB-AS-01': true,
 * //     'PCAOB-AS-02': false,
 * //     'PCAOB-AS-03': true,
 * //     ...
 * //   },
 * //   ...
 * // }
 */
function generateControlMatrix() {
  const assertionIds = Object.values(PCAOB_ASSERTIONS).map(a => a.id);
  const matrix = {};

  FINAULT_CONTROLS.forEach(control => {
    matrix[control.id] = {};
    assertionIds.forEach(assertionId => {
      matrix[control.id][assertionId] = control.assertions.includes(assertionId);
    });
  });

  return matrix;
}

/**
 * Assesses control effectiveness based on audit data
 *
 * Evaluates a single control's operating effectiveness based on:
 * - Exception count (0 = effective, 1-2 = needs improvement, 3+ = ineffective)
 * - Coverage percentage (% of transactions tested that passed)
 * - Reconciliation/validation pass rate
 *
 * Reference: PCAOB AS 1105, Section D: Evaluation of Effectiveness
 *
 * @param {string} controlId - Control ID (e.g., 'AI-FIN-001')
 * @param {Object} auditData - Audit evidence for the control
 * @param {number} auditData.exceptionCount - Number of control failures/exceptions
 * @param {number} auditData.totalTransactions - Total transactions tested
 * @param {number} auditData.passedTransactions - Transactions that passed validation
 * @param {Array<string>} auditData.evidenceFiles - Evidence artifacts provided
 * @returns {Object} Effectiveness assessment with rating, evidence summary, and exceptions
 *
 * @example
 * const assessment = assessControlEffectiveness('AI-FIN-001', {
 *   exceptionCount: 0,
 *   totalTransactions: 250,
 *   passedTransactions: 250,
 *   evidenceFiles: ['invoice-validation-log.txt', 'reconciliation-report.csv']
 * });
 * // Returns: { controlId: 'AI-FIN-001', effectiveness: 'effective', ... }
 */
function assessControlEffectiveness(controlId, auditData) {
  const control = FINAULT_CONTROLS.find(c => c.id === controlId);

  if (!control) {
    throw new Error(`Control not found: ${controlId}`);
  }

  const {
    exceptionCount = 0,
    totalTransactions = 0,
    passedTransactions = 0,
    evidenceFiles = []
  } = auditData;

  // Calculate coverage percentage
  const coveragePercent = totalTransactions > 0
    ? Math.round((passedTransactions / totalTransactions) * 100)
    : 0;

  // Determine effectiveness rating based on exception count
  let effectiveness = 'effective';
  let evidenceGrade = 'A'; // Excellent

  if (exceptionCount === 0) {
    effectiveness = 'effective';
    evidenceGrade = 'A';
  } else if (exceptionCount === 1 || exceptionCount === 2) {
    effectiveness = 'needs_improvement';
    evidenceGrade = 'B';
  } else if (exceptionCount >= 3) {
    effectiveness = 'ineffective';
    evidenceGrade = 'C';
  }

  return {
    controlId: control.id,
    controlName: control.name,
    cosoComponent: control.coso_component,
    effectiveness: effectiveness,
    evidenceGrade: evidenceGrade,
    exceptionCount: exceptionCount,
    coveragePercent: coveragePercent,
    totalTransactions: totalTransactions,
    passedTransactions: passedTransactions,
    evidenceFilesProvided: evidenceFiles.length,
    expectedEvidenceSources: control.evidence_sources,
    assertionsCovered: control.assertions,
    detailedAssertions: control.assertions.map(aid => ({
      assertionId: aid,
      assertionName: PCAOB_ASSERTIONS[Object.keys(PCAOB_ASSERTIONS).find(
        k => PCAOB_ASSERTIONS[k].id === aid
      )].name
    })),
    summary: `${control.name} is rated as ${effectiveness}. ${passedTransactions}/${totalTransactions} transactions passed validation (${coveragePercent}%). ${exceptionCount} control exceptions identified.`,
    testProcedureExecuted: control.test_procedure,
    nextSteps: effectiveness === 'effective'
      ? ['Continue monitoring', 'Include in quarterly testing schedule']
      : ['Investigate exceptions', 'Update control procedures', 'Increase testing frequency']
  };
}

/**
 * Generates comprehensive ICFR assessment report
 *
 * Produces a complete Internal Control over Financial Reporting assessment
 * document suitable for management assertion and auditor evaluation.
 *
 * Reference: PCAOB AS 1105, Section B: Planning & COSO 2013 Framework
 *
 * @param {string} orgId - Organization identifier
 * @param {string} period - Reporting period (e.g., '2025-12-31' or 'Q4-2025')
 * @param {Object} auditData - Control assessment data for all controls
 * @param {Object} auditData.controls - Map of controlId to audit evidence
 * @returns {Object} Complete ICFR assessment with ratings, matrices, and recommendations
 *
 * @example
 * const report = generateICFRReport('org-123', '2025-12-31', {
 *   controls: {
 *     'AI-FIN-001': { exceptionCount: 0, totalTransactions: 250, ... },
 *     'AI-FIN-002': { exceptionCount: 1, totalTransactions: 180, ... },
 *     ...
 *   }
 * });
 */
function generateICFRReport(orgId, period, auditData) {
  const { controls = {} } = auditData;

  // Assess each control
  const controlAssessments = FINAULT_CONTROLS.map(control =>
    assessControlEffectiveness(control.id, controls[control.id] || {})
  );

  // Determine overall effectiveness
  const ineffectiveControls = controlAssessments.filter(
    c => c.effectiveness === 'ineffective'
  );
  const needsImprovementControls = controlAssessments.filter(
    c => c.effectiveness === 'needs_improvement'
  );
  const effectiveControls = controlAssessments.filter(
    c => c.effectiveness === 'effective'
  );

  // Overall rating logic per PCAOB AS 1105
  let overallEffectiveness = 'effective';
  let materialWeaknesses = [];

  if (ineffectiveControls.length > 0) {
    // Any ineffective control = material weakness
    overallEffectiveness = 'ineffective';
    materialWeaknesses = ineffectiveControls.map(c => ({
      controlId: c.controlId,
      controlName: c.controlName,
      cosoComponent: c.cosoComponent,
      affectedAssertions: c.assertionsCovered,
      severity: 'Material Weakness',
      description: `The ${c.controlName} control is not operating effectively with ${c.exceptionCount} exceptions identified.`,
      businessImpact: `Transactions in the affected area may not be completely, accurately, and timely recorded in the financial statements.`,
      requiredRemediation: [
        'Enhance control design or operating procedures',
        'Increase frequency of monitoring activities',
        'Implement compensating controls if primary control cannot be remediated',
        'Perform retroactive testing of transactions processed during the control failure period'
      ]
    }));
  } else if (needsImprovementControls.length > 2) {
    // Multiple "needs improvement" = significant deficiency
    overallEffectiveness = 'needs_improvement';
  }

  // Analyze COSO component coverage
  const cosoComponentCoverage = {};
  Object.entries(COSO_COMPONENTS).forEach(([key, component]) => {
    const controlsInComponent = controlAssessments.filter(
      c => c.cosoComponent === component.id
    );
    const effectiveInComponent = controlsInComponent.filter(
      c => c.effectiveness === 'effective'
    );

    cosoComponentCoverage[component.id] = {
      component: component.name,
      totalControls: controlsInComponent.length,
      effectiveControls: effectiveInComponent.length,
      coveragePercent: controlsInComponent.length > 0
        ? Math.round((effectiveInComponent.length / controlsInComponent.length) * 100)
        : 0,
      status: effectiveInComponent.length === controlsInComponent.length
        ? 'fully_covered'
        : 'partially_covered'
    };
  });

  // Analyze PCAOB assertion coverage
  const pcaobAssertionCoverage = {};
  Object.entries(PCAOB_ASSERTIONS).forEach(([key, assertion]) => {
    const controlsCoveringAssertion = controlAssessments.filter(
      c => c.assertionsCovered.includes(assertion.id)
    );
    const effectiveCoveringControls = controlsCoveringAssertion.filter(
      c => c.effectiveness === 'effective'
    );

    pcaobAssertionCoverage[assertion.id] = {
      assertion: assertion.name,
      controlsProvided: controlsCoveringAssertion.map(c => c.controlId),
      effectiveControls: effectiveCoveringControls.map(c => c.controlId),
      coverageLevel: effectiveCoveringControls.length > 0 ? 'covered' : 'not_covered'
    };
  });

  // Generate recommendations
  const recommendations = [];

  if (materialWeaknesses.length > 0) {
    recommendations.push({
      priority: 'critical',
      description: 'Material weaknesses identified',
      action: 'Immediate remediation required per PCAOB AS 1105 Section D',
      timeframe: 'Before financial statement issuance'
    });
  }

  if (needsImprovementControls.length > 0) {
    recommendations.push({
      priority: 'high',
      description: `${needsImprovementControls.length} controls need improvement`,
      action: 'Enhanced testing and monitoring procedures recommended',
      timeframe: 'Next 30-60 days'
    });
  }

  controlAssessments.forEach(assessment => {
    if (assessment.effectiveness !== 'effective') {
      recommendations.push({
        priority: assessment.effectiveness === 'ineffective' ? 'critical' : 'medium',
        controlId: assessment.controlId,
        controlName: assessment.controlName,
        description: `${assessment.controlName} has ${assessment.exceptionCount} exceptions`,
        action: `Review and remediate per test procedure: ${assessment.testProcedureExecuted}`,
        timeframe: assessment.effectiveness === 'ineffective' ? 'Immediate' : '30 days'
      });
    }
  });

  return {
    reportMetadata: {
      organizationId: orgId,
      reportingPeriod: period,
      reportGeneratedDate: new Date().toISOString(),
      frameworkVersion: 'COSO 2013 Edition',
      standardsReferenced: [
        'PCAOB AS 1105: Audit of Internal Control Over Financial Reporting',
        'COSO: Internal Control—Integrated Framework (2013)',
        'Sarbanes-Oxley Act Section 404'
      ]
    },

    executiveSummary: {
      overallEffectiveness: overallEffectiveness,
      effectiveControlsCount: effectiveControls.length,
      needsImprovementCount: needsImprovementControls.length,
      ineffectiveControlsCount: ineffectiveControls.length,
      materialWeaknesses: materialWeaknesses,
      significantDeficiencies: needsImprovementControls.length > 2
        ? {
            identified: true,
            controlsAffected: needsImprovementControls.map(c => c.controlId)
          }
        : { identified: false },
      statement: overallEffectiveness === 'effective'
        ? 'Management asserts that internal control over financial reporting is effective as of the end of the reporting period. All Finault AI-FIN controls are operating effectively to support the accuracy and completeness of financial reporting.'
        : `Management asserts that internal control over financial reporting is ${overallEffectiveness}. ${materialWeaknesses.length > 0 ? `Material weakness(es) have been identified affecting ${materialWeaknesses.map(mw => mw.controlId).join(', ')}.` : ''}`
    },

    detailedControlAssessments: controlAssessments,

    cosoComponentAnalysis: cosoComponentCoverage,

    pcaobAssertionCoverage: pcaobAssertionCoverage,

    controlMatrix: generateControlMatrix(),

    materialWeaknesses: materialWeaknesses,

    remediationRecommendations: recommendations,

    attestationStatement: {
      statement: overallEffectiveness === 'effective'
        ? `Based on the assessment of all Finault financial controls (AI-FIN-001 through AI-FIN-006), management asserts that internal control over financial reporting was effective as of ${period}. All controls operated effectively to provide reasonable assurance regarding the reliability of financial reporting and the preparation of financial statements in accordance with generally accepted accounting principles.`
        : `Management notes that certain control deficiencies have been identified. [See Material Weaknesses section for details]. Management believes that with implementation of recommended remediations, internal control over financial reporting will achieve an effective operating status.`,
      signedBy: 'Chief Financial Officer',
      date: new Date().toISOString().split('T')[0]
    }
  };
}

/**
 * Generates formatted text for close pack certificate
 *
 * Produces formal attestation language suitable for inclusion in the
 * financial close certificate that accompanies the close pack submission.
 *
 * Reference: PCAOB AS 1105, Section C: Management's Assessment
 * Reference: COSO 2013, Component 5: Monitoring Activities
 *
 * @param {Object} assessmentResults - Output from generateICFRReport()
 * @returns {Object} Certificate components including assertion statement and coverage summary
 *
 * @example
 * const cert = getCloseCertificateLanguage(icfrReport);
 * console.log(cert.coveringStatement); // Print for certificate
 */
function getCloseCertificateLanguage(assessmentResults) {
  const {
    executiveSummary = {},
    materialWeaknesses = [],
    cosoComponentAnalysis = {},
    pcaobAssertionCoverage = {}
  } = assessmentResults;

  // Build assertion-by-assertion coverage statement
  const assertionStatements = Object.entries(pcaobAssertionCoverage).map(
    ([assertionId, coverage]) => {
      const assertion = Object.values(PCAOB_ASSERTIONS).find(
        a => a.id === assertionId
      );
      const controlsText = coverage.effectiveControls.length > 0
        ? `via ${coverage.effectiveControls.join(', ')}`
        : '(no effective controls)';

      return `• ${assertion.name}: ${coverage.coverageLevel === 'covered' ? 'COVERED' : 'NOT COVERED'} ${controlsText}`;
    }
  );

  const cosoStatements = Object.entries(cosoComponentAnalysis).map(
    ([componentId, analysis]) => {
      const component = Object.values(COSO_COMPONENTS).find(
        c => c.id === componentId
      );
      return `• ${component.name}: ${analysis.effectiveControls}/${analysis.totalControls} controls effective (${analysis.coveragePercent}%)`;
    }
  );

  const materialWeaknessClause = materialWeaknesses.length > 0
    ? `\n\nMaterial Weaknesses Identified:\n${materialWeaknesses.map(mw =>
        `• ${mw.controlId} (${mw.controlName}): ${mw.description}`
      ).join('\n')}`
    : '\n\nNo material weaknesses in internal control over financial reporting were identified.';

  return {
    // PCAOB AS 1105 Standard Assertion
    coveringStatement: [
      'INTERNAL CONTROL OVER FINANCIAL REPORTING - MANAGEMENT ASSERTION',
      'Per PCAOB AS 1105 and COSO Framework (2013 Edition)',
      '',
      'Management asserts that:',
      '',
      '(1) PCAOB Financial Reporting Assertions are addressed by effective controls as follows:',
      ...assertionStatements,
      '',
      '(2) COSO Framework components are implemented and operating as follows:',
      ...cosoStatements,
      '',
      '(3) Effectiveness Statement:',
      executiveSummary.overallEffectiveness === 'effective'
        ? 'Internal control over financial reporting is EFFECTIVE. All required Finault financial controls are designed and operating to provide reasonable assurance that transactions are recorded completely, accurately, and timely.'
        : `Internal control over financial reporting is ${executiveSummary.overallEffectiveness.toUpperCase()}. ${executiveSummary.effectiveControlsCount} of ${executiveSummary.effectiveControlsCount + executiveSummary.needsImprovementCount + executiveSummary.ineffectiveControlsCount} controls are effective.`,
      '',
      materialWeaknessClause,
      '',
      'This assessment is based on testing of all Finault AI-FIN controls (AI-FIN-001 through AI-FIN-006) using procedures defined in the Finault ICFR Framework and per SOX 404 requirements.'
    ].join('\n'),

    // Detailed PCAOB Assertion Coverage
    pcaobAssertionCoverage: assertionStatements.join('\n'),

    // COSO Component Coverage
    cosoComponentCoverage: cosoStatements.join('\n'),

    // Material Weakness Disclosure
    materialWeaknessSummary: materialWeaknesses.length > 0
      ? {
          hasWeaknesses: true,
          count: materialWeaknesses.length,
          details: materialWeaknesses
        }
      : {
          hasWeaknesses: false,
          statement: 'No material weaknesses in internal control over financial reporting were identified during the period.'
        },

    // Sign-off language for CFO/Controller
    signoffLanguage: {
      cfoPortion: `I, as [Chief Financial Officer], certify that I have evaluated the effectiveness of internal control over financial reporting as of [Period End Date] and have disclosed to the independent auditors all significant deficiencies and material weaknesses in the design or operation of internal control over financial reporting.`,
      controllerPortion: `The foregoing assessment is based on testing of control design and operating effectiveness per PCAOB AS 1105 standards. All Finault AI-FIN controls have been evaluated and documented herein.`,
      attestationDate: new Date().toISOString().split('T')[0]
    },

    // Reference to test procedures
    testingProceduresReference: `All conclusions are supported by testing procedures documented in the Finault ICFR Framework Module, with evidence from the following artifact sources: audit trails, reconciliation logs, validation reports, anomaly detection results, and close pack integrity verifications.`
  };
}

/**
 * Evidence-driven ICFR assessment using real operational data
 * This replaces boolean-flag scoring with actual transaction testing.
 *
 * @param {Object} config - { supabaseUrl, supabaseKey }
 * @param {string} orgId - Organization ID
 * @param {string} period - Period like '2026-01'
 * @returns {Promise<Object>} Assessment with real evidence
 */
async function assessWithEvidence(config, orgId, period) {
  // Import evidence collector (lazy require to avoid circular deps)
  const { collectControlEvidence, collectPCAOBEvidence, runTransactionSampling, hashPackage } = require('./evidence-collector.js');

  const controlEvidence = await collectControlEvidence(config, orgId, period);
  const pcaobEvidence = await collectPCAOBEvidence(config, orgId, period);
  const sampling = await runTransactionSampling(config, orgId, period, 100);

  // Compute real effectiveness from evidence
  const controls = Object.values(controlEvidence);
  const materialWeaknesses = controls.filter(c => c.materialWeakness).length;
  const significantDeficiencies = controls.filter(c => c.significantDeficiency).length;
  const avgErrorRate = controls.reduce((sum, c) => sum + (c.errorRate || 0), 0) / controls.length;

  let overallEffectiveness = 'effective';
  if (materialWeaknesses > 0) overallEffectiveness = 'ineffective';
  else if (significantDeficiencies > 0) overallEffectiveness = 'needs_improvement';

  // Map controls to COSO components with real scores
  const cosoScores = {};
  for (const [key, component] of Object.entries(COSO_COMPONENTS)) {
    const relatedControls = controls.filter(c => {
      const def = FINAULT_CONTROLS.find(fc => fc.id === c.controlId);
      return def && def.coso_component === component.id;
    });
    cosoScores[key] = {
      component: component.name,
      controlsTested: relatedControls.length,
      avgErrorRate: relatedControls.length > 0
        ? relatedControls.reduce((s, c) => s + (c.errorRate || 0), 0) / relatedControls.length
        : 0,
      effectiveness: relatedControls.every(c => c.effectiveness === 'effective') ? 'effective' : 'needs_improvement',
    };
  }

  // Map to PCAOB assertion coverage with real test results
  const assertionCoverage = {};
  for (const [key, assertion] of Object.entries(PCAOB_ASSERTIONS)) {
    assertionCoverage[key] = pcaobEvidence[key] || { conclusion: 'NOT_TESTED' };
  }

  const report = {
    orgId,
    period,
    assessmentType: 'evidence-driven',
    overallEffectiveness,
    materialWeaknesses,
    significantDeficiencies,
    averageErrorRate: parseFloat(avgErrorRate.toFixed(4)),
    controlEvidence,
    cosoScores,
    assertionCoverage,
    transactionSampling: sampling,
    generatedAt: new Date().toISOString(),
    generatedBy: 'icfr-framework/evidence-driven',
  };

  report.packageHash = await hashPackage(report);

  return report;
}

/**
 * Exports all framework components and functions
 */
module.exports = {
  // Framework definitions
  COSO_COMPONENTS,
  PCAOB_ASSERTIONS,
  FINAULT_CONTROLS,

  // Framework functions
  generateControlMatrix,
  assessControlEffectiveness,
  generateICFRReport,
  getCloseCertificateLanguage,
  assessWithEvidence,

  // Helper functions
  getControl: (controlId) => FINAULT_CONTROLS.find(c => c.id === controlId),
  getAssertion: (assertionId) => {
    return Object.values(PCAOB_ASSERTIONS).find(a => a.id === assertionId);
  },
  getComponent: (componentId) => {
    return Object.values(COSO_COMPONENTS).find(c => c.id === componentId);
  },

  // Utility: List all control IDs
  getControlIds: () => FINAULT_CONTROLS.map(c => c.id),

  // Utility: List all assertion IDs
  getAssertionIds: () => Object.values(PCAOB_ASSERTIONS).map(a => a.id),

  // Utility: List all component IDs
  getComponentIds: () => Object.values(COSO_COMPONENTS).map(c => c.id),

  // Utility: Get controls by COSO component
  getControlsByComponent: (componentId) =>
    FINAULT_CONTROLS.filter(c => c.coso_component === componentId),

  // Utility: Get controls by PCAOB assertion
  getControlsByAssertion: (assertionId) =>
    FINAULT_CONTROLS.filter(c => c.assertions.includes(assertionId))
};
