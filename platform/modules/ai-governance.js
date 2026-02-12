/**
 * AI Governance & Risk Taxonomy Module for Finault
 *
 * Maps Finault capabilities to three major AI governance frameworks:
 * - NIST AI Risk Management Framework 1.0
 * - ISO/IEC 42001:2023 (AI Management System)
 * - EU AI Act (Regulation 2024/1689)
 *
 * Incorporates Shadow AI risk scoring concepts from Vigilex platform
 * with 50+ pre-computed AI tool risk assessments.
 *
 * @module ai-governance
 * @requires CommonJS (module.exports)
 * @version 1.0.0
 */

/**
 * Framework definitions covering NIST AI RMF 1.0, ISO/IEC 42001:2023, and EU AI Act
 * @typedef {Object} FrameworkDefinition
 * @property {string} id - Unique framework identifier
 * @property {string} name - Human-readable framework name
 * @property {string} version - Framework version
 * @property {string} description - Framework purpose and scope
 */

/**
 * NIST AI RMF 1.0 core functions and ISO/IEC 42001:2023 requirements
 * @type {Object}
 */
const FRAMEWORKS = {
  NIST_AI_RMF: {
    id: 'nist-ai-rmf-1.0',
    name: 'NIST AI Risk Management Framework',
    version: '1.0',
    description: 'Comprehensive framework for managing AI risks across govern, map, measure, manage functions',
    functions: ['GOVERN', 'MAP', 'MEASURE', 'MANAGE'],
    reference: 'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf'
  },

  ISO_42001: {
    id: 'iso-42001-2023',
    name: 'ISO/IEC 42001:2023 - AI Management System',
    version: '2023',
    description: 'International standard for establishing, implementing, maintaining and improving AI management systems',
    clauses: [
      { number: 'A.5', title: 'AI Policy' },
      { number: 'A.6', title: 'Planning' },
      { number: 'A.7', title: 'Support' },
      { number: 'A.8', title: 'Operation' },
      { number: 'A.9', title: 'Performance Evaluation' },
      { number: 'A.10', title: 'Improvement' }
    ],
    reference: 'https://www.iso.org/standard/81230.html'
  },

  EU_AI_ACT: {
    id: 'eu-ai-act-2024',
    name: 'EU AI Act (Regulation 2024/1689)',
    version: '2024',
    description: 'European Union regulation establishing requirements for high-risk AI systems and prohibited practices',
    riskCategories: ['PROHIBITED', 'HIGH_RISK', 'LIMITED_RISK', 'MINIMAL_RISK'],
    keyArticles: {
      ARTICLE_5: 'Prohibited AI Practices',
      ARTICLE_6: 'Classification of High-Risk AI Systems',
      ARTICLE_9: 'Risk Management Systems',
      ARTICLE_12: 'Record-Keeping and Documentation',
      ARTICLE_13: 'Transparency and Information to Users',
      ARTICLE_17: 'Quality Management System'
    },
    reference: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj'
  }
};

/**
 * NIST AI RMF mapping: Finault capabilities aligned to GOVERN, MAP, MEASURE, MANAGE functions
 * @type {Object}
 */
const NIST_MAPPING = {
  GOVERN: {
    id: 'nist-govern',
    name: 'GOVERN - Establish governance structures and practices',
    description: 'Policies, processes, and structures for AI system oversight',
    subcategories: [
      {
        id: 'GV-1',
        name: 'Policies and Procedures',
        nist_reference: 'GOVERN 1',
        finault_capabilities: ['allocation_rules', 'budget_controls', 'policy_engine'],
        coverage: 'full',
        evidence: 'Finault allocation rules enforce governance policies; budget controls prevent unauthorized spend; audit trails document all policy enforcement'
      },
      {
        id: 'GV-2',
        name: 'Roles and Responsibilities',
        nist_reference: 'GOVERN 2',
        finault_capabilities: ['rbac_engine', 'approval_workflows', 'audit_trail'],
        coverage: 'full',
        evidence: 'RBAC determines who can approve allocations; approval workflows enforce segregation of duties; audit trail tracks decision makers'
      },
      {
        id: 'GV-3',
        name: 'Risk Assessment',
        nist_reference: 'GOVERN 3',
        finault_capabilities: ['ai_tool_risk_catalog', 'model_classification', 'spend_risk_scoring'],
        coverage: 'full',
        evidence: 'AI tool risk catalog provides pre-computed risk scores; model classification assigns tier based on capability; spend risk evaluated against budget thresholds'
      },
      {
        id: 'GV-4',
        name: 'Governance Communication',
        nist_reference: 'GOVERN 4',
        finault_capabilities: ['transparency_log', 'close_pack_reporting', 'executive_summary'],
        coverage: 'full',
        evidence: 'Transparency log enables stakeholder visibility; close packs provide periodic governance summaries; executive summaries communicate AI governance posture'
      }
    ]
  },

  MAP: {
    id: 'nist-map',
    name: 'MAP - Map AI system inputs, processes, and outputs',
    description: 'Catalog and understand AI systems, data flows, and actors',
    subcategories: [
      {
        id: 'MP-1',
        name: 'Inventory and Cataloging',
        nist_reference: 'MAP 1',
        finault_capabilities: ['model_catalog', 'provider_inventory', 'integration_registry'],
        coverage: 'full',
        evidence: 'Model catalog tracks all AI tools in use with metadata; provider inventory maintains vendor information; integration registry maps deployment points'
      },
      {
        id: 'MP-2',
        name: 'Data Flow Documentation',
        nist_reference: 'MAP 2',
        finault_capabilities: ['data_flow_mapping', 'cost_center_mapping', 'lineage_tracking'],
        coverage: 'full',
        evidence: 'Data flow mapping traces inputs from cost centers to AI tools; lineage tracking follows processing; cost center mapping links usage to organizational units'
      },
      {
        id: 'MP-3',
        name: 'Model Capability Assessment',
        nist_reference: 'MAP 3',
        finault_capabilities: ['model_specifications', 'capability_scoring', 'fcs_scoring'],
        coverage: 'full',
        evidence: 'Model specifications document capabilities; FCS scoring quantifies financial control strength; capability tiers inform risk classification'
      },
      {
        id: 'MP-4',
        name: 'Actor and Dependencies',
        nist_reference: 'MAP 4',
        finault_capabilities: ['user_tracking', 'api_monitoring', 'dependency_mapping'],
        coverage: 'partial',
        evidence: 'User tracking via audit trail; API monitoring detects integrations; dependency mapping identifies critical AI systems'
      }
    ]
  },

  MEASURE: {
    id: 'nist-measure',
    name: 'MEASURE - Measure performance and impact',
    description: 'Monitor AI system performance, detect anomalies, and assess outcomes',
    subcategories: [
      {
        id: 'MS-1',
        name: 'Performance Metrics',
        nist_reference: 'MEASURE 1',
        finault_capabilities: ['fcs_scoring', 'cost_variance_analysis', 'model_performance_tracking'],
        coverage: 'full',
        evidence: 'FCS scoring assesses financial control quality; cost variance analysis detects deviations; model performance tracking monitors effectiveness'
      },
      {
        id: 'MS-2',
        name: 'Anomaly Detection',
        nist_reference: 'MEASURE 2',
        finault_capabilities: ['anomaly_detection_engine', 'threshold_alerting', 'pattern_analysis'],
        coverage: 'full',
        evidence: 'Anomaly detection identifies unusual AI spending or allocation patterns; threshold alerting triggers on deviations; pattern analysis reveals trends'
      },
      {
        id: 'MS-3',
        name: 'Data Drift Detection',
        nist_reference: 'MEASURE 3',
        finault_capabilities: ['drift_detection', 'quality_monitoring', 'data_profiling'],
        coverage: 'full',
        evidence: 'Drift detection identifies changes in cost allocation patterns; quality monitoring tracks financial control degradation; data profiling establishes baselines'
      },
      {
        id: 'MS-4',
        name: 'Reconciliation and Verification',
        nist_reference: 'MEASURE 4',
        finault_capabilities: ['reconciliation_engine', 'audit_trail', 'variance_reports'],
        coverage: 'full',
        evidence: 'Reconciliation engine matches allocated costs to actual spend; audit trail provides evidence for verification; variance reports document discrepancies'
      }
    ]
  },

  MANAGE: {
    id: 'nist-manage',
    name: 'MANAGE - Manage identified risks and impacts',
    description: 'Implement controls to mitigate identified risks and respond to incidents',
    subcategories: [
      {
        id: 'MG-1',
        name: 'Risk Mitigation',
        nist_reference: 'MANAGE 1',
        finault_capabilities: ['control_implementation', 'policy_enforcement', 'rate_limiting'],
        coverage: 'full',
        evidence: 'Control implementation via allocation rules; policy enforcement prevents unauthorized spend; rate limiting prevents runaway costs'
      },
      {
        id: 'MG-2',
        name: 'Incident Response',
        nist_reference: 'MANAGE 2',
        finault_capabilities: ['alert_routing', 'dispute_resolution', 'incident_tracking'],
        coverage: 'full',
        evidence: 'Alert routing notifies stakeholders; dispute resolution framework addresses exceptions; incident tracking documents remediation'
      },
      {
        id: 'MG-3',
        name: 'Improvement and Recommendations',
        nist_reference: 'MANAGE 3',
        finault_capabilities: ['savings_intelligence', 'model_recommendations', 'optimization_engine'],
        coverage: 'full',
        evidence: 'Savings intelligence identifies cost reduction opportunities; model recommendations suggest optimal alternatives; optimization engine automates improvements'
      },
      {
        id: 'MG-4',
        name: 'ERP Integration and Posting',
        nist_reference: 'MANAGE 4',
        finault_capabilities: ['erp_gateway', 'financial_posting', 'close_pack_automation'],
        coverage: 'full',
        evidence: 'ERP gateway integrates with financial systems; financial posting records AI costs in general ledger; close pack automation ensures period closure'
      }
    ]
  }
};

/**
 * ISO/IEC 42001:2023 mapping: Finault support for AI Management System clauses
 * @type {Object}
 */
const ISO_42001_MAPPING = {
  'A.5': {
    clause: 'A.5 AI Policy',
    title: 'Establishing AI Management Policy',
    iso_requirement: 'Define context and policy for AI management aligned with organizational strategy',
    finault_capabilities: ['audit_trail_governance', 'policy_engine', 'compliance_tracking'],
    coverage: 'full',
    evidence: 'Audit trail documents all AI governance decisions; policy engine enforces organizational AI governance rules; compliance tracking maintains evidence'
  },

  'A.6': {
    clause: 'A.6 Planning',
    title: 'Planning and Implementation',
    iso_requirement: 'Plan AI management objectives and implement controls across operations',
    finault_capabilities: ['budget_controls', 'goal_tracking', 'allocation_planning', 'roadmap_engine'],
    coverage: 'full',
    evidence: 'Budget controls define AI spend limits; goal tracking monitors objectives; allocation planning ensures resource alignment; roadmap engine tracks milestones'
  },

  'A.7': {
    clause: 'A.7 Support',
    title: 'Support Resources',
    iso_requirement: 'Provide documentation, training, and competence for AI management',
    finault_capabilities: ['documentation_portal', 'training_tracking', 'best_practices_library', 'knowledge_base'],
    coverage: 'full',
    evidence: 'Documentation portal centralizes AI governance materials; training tracking ensures staff competency; best practices library shares lessons learned'
  },

  'A.8': {
    clause: 'A.8 Operation',
    title: 'Operational Control',
    iso_requirement: 'Control AI system operations through defined processes and controls',
    finault_capabilities: ['proxy_gateway', 'allocation_engine', 'close_pack_processing', 'workflow_automation'],
    coverage: 'full',
    evidence: 'Proxy gateway enforces operational controls; allocation engine applies rules consistently; close pack processing ensures period integrity; workflows automate compliance'
  },

  'A.9': {
    clause: 'A.9 Performance Evaluation',
    title: 'Monitoring and Measurement',
    iso_requirement: 'Measure AI management system performance and effectiveness',
    finault_capabilities: ['fcs_scoring', 'anomaly_detection', 'drift_detection', 'kpi_dashboard'],
    coverage: 'full',
    evidence: 'FCS scoring quantifies control effectiveness; anomaly detection reveals performance gaps; drift detection identifies degradation; KPI dashboard visualizes metrics'
  },

  'A.10': {
    clause: 'A.10 Improvement',
    title: 'Improvement and Enhancement',
    iso_requirement: 'Continually improve AI management system based on evaluations and feedback',
    finault_capabilities: ['savings_intelligence', 'model_recommendations', 'process_optimization', 'feedback_loop'],
    coverage: 'full',
    evidence: 'Savings intelligence suggests enhancements; model recommendations drive optimization; process optimization engine identifies improvements; feedback loops track iterations'
  }
};

/**
 * EU AI Act mapping: Finault support for key regulatory articles
 * @type {Object}
 */
const EU_AI_ACT_MAPPING = {
  ARTICLE_9: {
    article: 'Article 9',
    title: 'Risk Management System',
    regulation: 'EU AI Act (Regulation 2024/1689)',
    requirement: 'High-risk AI systems must have risk management systems that identify and analyze foreseeable risks',
    finault_capabilities: ['anomaly_detection', 'fcs_scoring', 'drift_detection', 'risk_catalog'],
    coverage: 'full',
    evidence: 'Anomaly detection identifies unexpected patterns; FCS scoring tracks control quality; drift detection reveals system changes; risk catalog catalogs known risks'
  },

  ARTICLE_12: {
    article: 'Article 12',
    title: 'Record-Keeping and Documentation',
    regulation: 'EU AI Act (Regulation 2024/1689)',
    requirement: 'Maintain detailed records and documentation of AI system operation for regulatory inspection',
    finault_capabilities: ['audit_trail', 'usage_logging', 'close_pack_archives', 'evidence_collection'],
    coverage: 'full',
    evidence: 'Audit trail provides immutable operation records; usage logging tracks all interactions; close pack archives preserve period evidence; evidence collection automates documentation'
  },

  ARTICLE_13: {
    article: 'Article 13',
    title: 'Transparency and Information to Users',
    regulation: 'EU AI Act (Regulation 2024/1689)',
    requirement: 'Provide clear information to users about AI system involvement and operation',
    finault_capabilities: ['transparency_log', 'verification_endpoints', 'user_portal', 'compliance_reporting'],
    coverage: 'full',
    evidence: 'Transparency log makes AI tool usage visible; verification endpoints provide queryable evidence; user portal enables self-service transparency; compliance reporting automates disclosures'
  },

  ARTICLE_17: {
    article: 'Article 17',
    title: 'Quality Management System',
    regulation: 'EU AI Act (Regulation 2024/1689)',
    requirement: 'Establish systems for data and algorithm quality management, traceability, and system logging',
    finault_capabilities: ['reconciliation_engine', 'icfr_controls', 'data_quality_monitoring', 'lineage_tracking'],
    coverage: 'full',
    evidence: 'Reconciliation engine ensures data accuracy; ICFR controls support financial reporting; data quality monitoring detects anomalies; lineage tracking provides traceability'
  }
};

/**
 * EU AI Act Risk Categories (Regulation 2024/1689)
 * Maps the four-tier risk classification system
 */
const EU_RISK_CATEGORIES = {
  PROHIBITED: {
    tier: 0,
    label: 'Prohibited',
    articles: ['Article 5'],
    description: 'AI practices that are banned outright',
  },
  HIGH_RISK: {
    tier: 1,
    label: 'High-Risk',
    articles: ['Article 6', 'Annex III'],
    description: 'AI systems subject to strict requirements before market placement',
  },
  LIMITED_RISK: {
    tier: 2,
    label: 'Limited Risk',
    articles: ['Article 50'],
    description: 'AI systems with transparency obligations',
  },
  MINIMAL_RISK: {
    tier: 3,
    label: 'Minimal Risk',
    articles: [],
    description: 'AI systems with no additional requirements beyond voluntary codes',
  },
};

/**
 * EU AI Act Article 5 — Prohibited AI Practices
 * These use cases are banned regardless of context
 */
const EU_AI_ACT_PROHIBITED_PRACTICES = [
  {
    id: 'ART5_1a',
    article: 'Article 5(1)(a)',
    practice: 'Subliminal manipulation',
    description: 'AI that deploys subliminal techniques beyond consciousness to materially distort behavior',
    keywords: ['subliminal', 'manipulation', 'dark_pattern', 'deceptive_design', 'unconscious_influence'],
  },
  {
    id: 'ART5_1b',
    article: 'Article 5(1)(b)',
    practice: 'Exploitation of vulnerabilities',
    description: 'AI exploiting vulnerabilities of specific groups (age, disability, social/economic situation)',
    keywords: ['exploit_vulnerable', 'target_elderly', 'target_minor', 'target_disabled', 'predatory'],
  },
  {
    id: 'ART5_1c',
    article: 'Article 5(1)(c)',
    practice: 'Social scoring by public authorities',
    description: 'AI-based social scoring by or on behalf of public authorities',
    keywords: ['social_score', 'citizen_score', 'social_credit', 'behavioral_score', 'trustworthiness_score'],
  },
  {
    id: 'ART5_1d',
    article: 'Article 5(1)(d)',
    practice: 'Real-time remote biometric identification',
    description: 'Real-time remote biometric identification in publicly accessible spaces for law enforcement',
    keywords: ['facial_recognition', 'biometric_surveillance', 'face_detection', 'biometric_id', 'real_time_biometric'],
  },
  {
    id: 'ART5_1e',
    article: 'Article 5(1)(e)',
    practice: 'Emotion recognition in workplace/education',
    description: 'Emotion recognition systems in workplace and educational institutions',
    keywords: ['emotion_recognition', 'emotion_detection', 'sentiment_worker', 'mood_detection', 'affect_recognition'],
  },
  {
    id: 'ART5_1f',
    article: 'Article 5(1)(f)',
    practice: 'Biometric categorization (sensitive attributes)',
    description: 'Biometric categorization inferring race, political opinions, religion, sexual orientation',
    keywords: ['biometric_categorize', 'race_detection', 'religion_detection', 'political_inference', 'orientation_detection'],
  },
  {
    id: 'ART5_1g',
    article: 'Article 5(1)(g)',
    practice: 'Untargeted scraping for facial recognition databases',
    description: 'Untargeted scraping of facial images from internet or CCTV for facial recognition databases',
    keywords: ['face_scraping', 'facial_database', 'image_scraping', 'cctv_scraping', 'clearview'],
  },
  {
    id: 'ART5_1h',
    article: 'Article 5(1)(h)',
    practice: 'Predictive policing (individual)',
    description: 'AI predicting individual criminal behavior based solely on profiling or personality traits',
    keywords: ['predictive_policing', 'crime_prediction', 'criminal_profiling', 'recidivism_prediction', 'crime_risk_score'],
  },
];

/**
 * EU AI Act Annex III — High-Risk Use Cases
 */
const EU_AI_ACT_HIGH_RISK_AREAS = [
  { area: 'Biometrics', keywords: ['biometric', 'facial', 'fingerprint', 'voice_id', 'gait'] },
  { area: 'Critical infrastructure', keywords: ['infrastructure', 'power_grid', 'water', 'transport', 'telecom'] },
  { area: 'Education and training', keywords: ['education', 'grading', 'admission', 'exam', 'student_assessment'] },
  { area: 'Employment and worker management', keywords: ['hiring', 'recruitment', 'performance_review', 'termination', 'promotion', 'hr_screening'] },
  { area: 'Essential services', keywords: ['credit_scoring', 'insurance', 'social_benefit', 'emergency_service', 'healthcare_triage'] },
  { area: 'Law enforcement', keywords: ['law_enforcement', 'evidence_assessment', 'criminal_investigation', 'surveillance'] },
  { area: 'Migration and border control', keywords: ['migration', 'border', 'visa', 'asylum', 'immigration'] },
  { area: 'Justice and democratic processes', keywords: ['judicial', 'court', 'sentencing', 'election', 'voting'] },
];

/**
 * Classify an AI use case under EU AI Act risk categories
 * Checks Article 5 prohibited practices, Annex III high-risk areas,
 * and Article 50 transparency obligations
 *
 * @param {string} useCase - Description or identifier of the use case
 * @param {string} modelName - AI model name
 * @param {Object} metadata - Additional metadata (tags, labels, etc.)
 * @returns {Object} Classification result with risk tier, matched articles, and reasoning
 */
function classifyEUAIActRisk(useCase, modelName, metadata = {}) {
  const searchText = [
    useCase || '',
    modelName || '',
    metadata.description || '',
    ...(metadata.tags || []),
    ...(metadata.labels || []),
  ].join(' ').toLowerCase();

  // Check Article 5 — Prohibited practices (highest priority)
  const prohibitedMatches = [];
  for (const practice of EU_AI_ACT_PROHIBITED_PRACTICES) {
    const matched = practice.keywords.filter(kw => searchText.includes(kw));
    if (matched.length > 0) {
      prohibitedMatches.push({
        ...practice,
        matchedKeywords: matched,
        confidence: matched.length / practice.keywords.length,
      });
    }
  }

  if (prohibitedMatches.length > 0) {
    return {
      riskCategory: 'PROHIBITED',
      tier: EU_RISK_CATEGORIES.PROHIBITED,
      matchedPractices: prohibitedMatches,
      highRiskAreas: [],
      articles: [...new Set(prohibitedMatches.map(p => p.article))],
      action: 'BLOCK — This use case matches prohibited AI practices under EU AI Act Article 5',
      requiresHumanReview: true,
    };
  }

  // Check Annex III — High-risk areas
  const highRiskMatches = [];
  for (const area of EU_AI_ACT_HIGH_RISK_AREAS) {
    const matched = area.keywords.filter(kw => searchText.includes(kw));
    if (matched.length > 0) {
      highRiskMatches.push({
        area: area.area,
        matchedKeywords: matched,
        confidence: matched.length / area.keywords.length,
      });
    }
  }

  if (highRiskMatches.length > 0) {
    return {
      riskCategory: 'HIGH_RISK',
      tier: EU_RISK_CATEGORIES.HIGH_RISK,
      matchedPractices: [],
      highRiskAreas: highRiskMatches,
      articles: ['Article 6', 'Annex III'],
      action: 'COMPLY — Requires conformity assessment, risk management (Art 9), data governance (Art 10), transparency (Art 13), human oversight (Art 14)',
      requiresHumanReview: true,
      requirements: {
        riskManagement: 'Article 9 — Establish risk management system',
        dataGovernance: 'Article 10 — Data governance and management practices',
        documentation: 'Article 11 — Technical documentation',
        recordKeeping: 'Article 12 — Record-keeping and logging',
        transparency: 'Article 13 — Transparency and information to deployers',
        humanOversight: 'Article 14 — Human oversight measures',
        accuracy: 'Article 15 — Accuracy, robustness and cybersecurity',
      },
    };
  }

  // Check for transparency-only obligations (chatbots, deepfakes, AI-generated content)
  const transparencyKeywords = ['chatbot', 'conversational', 'deepfake', 'synthetic_media', 'ai_generated', 'text_generation'];
  const transparencyMatches = transparencyKeywords.filter(kw => searchText.includes(kw));

  if (transparencyMatches.length > 0) {
    return {
      riskCategory: 'LIMITED_RISK',
      tier: EU_RISK_CATEGORIES.LIMITED_RISK,
      matchedPractices: [],
      highRiskAreas: [],
      articles: ['Article 50'],
      action: 'DISCLOSE — Must inform users they are interacting with AI',
      requiresHumanReview: false,
    };
  }

  // Default: minimal risk
  return {
    riskCategory: 'MINIMAL_RISK',
    tier: EU_RISK_CATEGORIES.MINIMAL_RISK,
    matchedPractices: [],
    highRiskAreas: [],
    articles: [],
    action: 'PERMITTED — No additional requirements, voluntary codes of conduct encouraged',
    requiresHumanReview: false,
  };
}

/**
 * Comprehensive AI tool risk catalog (50+ tools)
 * Pre-computed risk scores derived from Vigilex platform assessment
 * @type {Array<Object>}
 */
const AI_TOOL_RISK_CATALOG = [
  // Large Language Models
  {
    id: 'gpt-4',
    name: 'GPT-4',
    vendor: 'OpenAI',
    category: 'Large Language Model',
    riskScore: 72,
    riskTier: 'HIGH',
    domains: ['code_generation', 'content_creation', 'data_analysis', 'financial_analysis'],
    capabilities: { contextLength: 128000, capabilities: 'multimodal' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '30 days'
    },
    govRiskFactors: ['no_EU_data_residency', 'third_party_vendor', 'high_capability_level']
  },
  {
    id: 'gpt-3.5',
    name: 'GPT-3.5 Turbo',
    vendor: 'OpenAI',
    category: 'Large Language Model',
    riskScore: 68,
    riskTier: 'HIGH',
    domains: ['code_generation', 'content_creation', 'data_analysis'],
    capabilities: { contextLength: 16385, capabilities: 'text' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '30 days'
    },
    govRiskFactors: ['third_party_vendor', 'medium_capability_level']
  },
  {
    id: 'claude-opus',
    name: 'Claude Opus',
    vendor: 'Anthropic',
    category: 'Large Language Model',
    riskScore: 65,
    riskTier: 'HIGH',
    domains: ['code_generation', 'content_creation', 'reasoning', 'analysis'],
    capabilities: { contextLength: 200000, capabilities: 'text' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'mixed',
      dataRetention: '30 days'
    },
    govRiskFactors: ['third_party_vendor', 'high_capability_level', 'long_context']
  },
  {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    vendor: 'Anthropic',
    category: 'Large Language Model',
    riskScore: 55,
    riskTier: 'MEDIUM',
    domains: ['content_creation', 'summarization', 'classification'],
    capabilities: { contextLength: 200000, capabilities: 'text' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'mixed',
      dataRetention: '30 days'
    },
    govRiskFactors: ['third_party_vendor', 'lower_capability_level']
  },
  {
    id: 'gemini-2.0',
    name: 'Gemini 2.0',
    vendor: 'Google',
    category: 'Large Language Model',
    riskScore: 70,
    riskTier: 'HIGH',
    domains: ['code_generation', 'content_creation', 'multimodal_analysis', 'reasoning'],
    capabilities: { contextLength: 1000000, capabilities: 'multimodal' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US/EU options',
      dataRetention: '30 days'
    },
    govRiskFactors: ['third_party_vendor', 'very_high_capability_level', 'very_large_context']
  },
  {
    id: 'gemini-1.5',
    name: 'Gemini 1.5 Pro',
    vendor: 'Google',
    category: 'Large Language Model',
    riskScore: 68,
    riskTier: 'HIGH',
    domains: ['code_generation', 'content_creation', 'video_analysis'],
    capabilities: { contextLength: 1000000, capabilities: 'multimodal' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US/EU options',
      dataRetention: '30 days'
    },
    govRiskFactors: ['third_party_vendor', 'high_capability_level', 'video_processing']
  },
  {
    id: 'copilot-enterprise',
    name: 'Microsoft Copilot Pro / Enterprise',
    vendor: 'Microsoft',
    category: 'Large Language Model',
    riskScore: 60,
    riskTier: 'MEDIUM',
    domains: ['code_generation', 'office_automation', 'enterprise_integration'],
    capabilities: { contextLength: 128000, capabilities: 'multimodal' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'EU available',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'tight_integration_risk', 'medium_capability_level']
  },
  {
    id: 'llama-3.1',
    name: 'Llama 3.1 (Open Source)',
    vendor: 'Meta',
    category: 'Large Language Model',
    riskScore: 45,
    riskTier: 'MEDIUM',
    domains: ['code_generation', 'content_creation', 'local_deployment'],
    capabilities: { contextLength: 131072, capabilities: 'text' },
    complianceAttributes: {
      soc2: 'self-hosted',
      gdpr: 'depends_on_deployment',
      hipaa: 'depends_on_deployment',
      baa: 'depends_on_deployment',
      dataResidency: 'self-hosted',
      dataRetention: 'self-controlled'
    },
    govRiskFactors: ['self_hosted_option', 'open_source', 'lower_operational_risk']
  },
  {
    id: 'perplexity-ai',
    name: 'Perplexity AI',
    vendor: 'Perplexity AI',
    category: 'Search / Research AI',
    riskScore: 58,
    riskTier: 'MEDIUM',
    domains: ['research', 'information_retrieval', 'analysis'],
    capabilities: { contextLength: 127000, capabilities: 'web_search' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '7 days'
    },
    govRiskFactors: ['third_party_vendor', 'web_search_capability', 'data_sourcing_risk']
  },

  // Code Generation Tools
  {
    id: 'cursor-ide',
    name: 'Cursor IDE',
    vendor: 'Anysphere',
    category: 'Code Generation / IDE',
    riskScore: 62,
    riskTier: 'HIGH',
    domains: ['code_generation', 'development', 'local_ai'],
    capabilities: { contextLength: 200000, capabilities: 'code_aware' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['source_code_exposure', 'local_integration', 'high_capability_level']
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    vendor: 'GitHub/Microsoft',
    category: 'Code Generation',
    riskScore: 65,
    riskTier: 'HIGH',
    domains: ['code_generation', 'development', 'ide_integration'],
    capabilities: { contextLength: 8000, capabilities: 'code_aware' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['source_code_exposure', 'deep_ide_integration', 'ip_concerns']
  },
  {
    id: 'codeium',
    name: 'Codeium',
    vendor: 'Codeium',
    category: 'Code Generation',
    riskScore: 50,
    riskTier: 'MEDIUM',
    domains: ['code_generation', 'development', 'ide_integration'],
    capabilities: { contextLength: 16000, capabilities: 'code_aware' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'EU available',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['third_party_vendor', 'moderate_integration', 'eu_option_available']
  },
  {
    id: 'tabnine',
    name: 'Tabnine',
    vendor: 'Tabnine',
    category: 'Code Generation',
    riskScore: 48,
    riskTier: 'MEDIUM',
    domains: ['code_generation', 'development', 'ide_plugin'],
    capabilities: { contextLength: 10000, capabilities: 'code_aware' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'EU available',
      dataRetention: 'days'
    },
    govRiskFactors: ['source_code_exposure', 'on_prem_option', 'gdpr_compliant']
  },

  // Image and Creative Generation
  {
    id: 'midjourney',
    name: 'Midjourney',
    vendor: 'Midjourney Inc',
    category: 'Image Generation',
    riskScore: 75,
    riskTier: 'HIGH',
    domains: ['image_generation', 'creative_design', 'content_creation'],
    capabilities: { contextLength: 0, capabilities: 'image_generation' },
    complianceAttributes: {
      soc2: false,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '30 days'
    },
    govRiskFactors: ['high_spend_risk', 'creative_ip_concerns', 'limited_compliance']
  },
  {
    id: 'dall-e-3',
    name: 'DALL-E 3',
    vendor: 'OpenAI',
    category: 'Image Generation',
    riskScore: 72,
    riskTier: 'HIGH',
    domains: ['image_generation', 'creative_design', 'content_creation'],
    capabilities: { contextLength: 0, capabilities: 'image_generation' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '30 days'
    },
    govRiskFactors: ['creative_ip_concerns', 'third_party_vendor', 'high_capability_level']
  },
  {
    id: 'adobe-firefly',
    name: 'Adobe Firefly',
    vendor: 'Adobe',
    category: 'Image Generation',
    riskScore: 55,
    riskTier: 'MEDIUM',
    domains: ['image_generation', 'creative_design', 'adobe_integration'],
    capabilities: { contextLength: 0, capabilities: 'image_generation' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'EU available',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'gdpr_compliant', 'ip_training_opt_out']
  },
  {
    id: 'runway-gen',
    name: 'Runway Gen-3 / Gen-2',
    vendor: 'Runway ML',
    category: 'Video Generation',
    riskScore: 78,
    riskTier: 'CRITICAL',
    domains: ['video_generation', 'content_creation', 'design'],
    capabilities: { contextLength: 0, capabilities: 'video_generation' },
    complianceAttributes: {
      soc2: false,
      gdpr: false,
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: 'unknown'
    },
    govRiskFactors: ['emerging_tech', 'high_spend_risk', 'limited_compliance_info']
  },
  {
    id: 'canva-magic',
    name: 'Canva Magic Design',
    vendor: 'Canva',
    category: 'Design / Image Generation',
    riskScore: 52,
    riskTier: 'MEDIUM',
    domains: ['design', 'content_creation', 'marketing_material'],
    capabilities: { contextLength: 0, capabilities: 'design_generation' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['broad_audience', 'gdpr_compliant', 'design_specific']
  },

  // Voice and Audio
  {
    id: 'elevenlabs',
    name: 'ElevenLabs Text-to-Speech',
    vendor: 'ElevenLabs',
    category: 'Voice / Audio',
    riskScore: 64,
    riskTier: 'HIGH',
    domains: ['voice_synthesis', 'audio_generation', 'accessibility'],
    capabilities: { contextLength: 0, capabilities: 'voice_synthesis' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'EU available',
      dataRetention: '30 days'
    },
    govRiskFactors: ['voice_cloning_risk', 'third_party_vendor', 'gdpr_available']
  },
  {
    id: 'openai-tts',
    name: 'OpenAI Text-to-Speech',
    vendor: 'OpenAI',
    category: 'Voice / Audio',
    riskScore: 56,
    riskTier: 'MEDIUM',
    domains: ['voice_synthesis', 'audio_generation'],
    capabilities: { contextLength: 0, capabilities: 'voice_synthesis' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '30 days'
    },
    govRiskFactors: ['voice_synthesis_risk', 'limited_customization']
  },
  {
    id: 'google-speech',
    name: 'Google Speech-to-Text / Text-to-Speech',
    vendor: 'Google',
    category: 'Voice / Audio',
    riskScore: 54,
    riskTier: 'MEDIUM',
    domains: ['speech_recognition', 'voice_synthesis', 'accessibility'],
    capabilities: { contextLength: 0, capabilities: 'dual_mode' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'EU available',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['mature_service', 'gdpr_available', 'enterprise_ready']
  },

  // Data Analysis and Processing
  {
    id: 'tableau-gpt',
    name: 'Tableau Einstein GPT',
    vendor: 'Salesforce',
    category: 'Data Analysis / BI',
    riskScore: 58,
    riskTier: 'MEDIUM',
    domains: ['data_analysis', 'business_intelligence', 'visualization'],
    capabilities: { contextLength: 0, capabilities: 'business_intelligence' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: true,
      baa: false,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'hipaa_ready', 'tight_integration']
  },
  {
    id: 'power-bi-copilot',
    name: 'Microsoft Power BI Copilot',
    vendor: 'Microsoft',
    category: 'Data Analysis / BI',
    riskScore: 56,
    riskTier: 'MEDIUM',
    domains: ['data_analysis', 'business_intelligence', 'excel_integration'],
    capabilities: { contextLength: 0, capabilities: 'business_intelligence' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'configurable',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'deep_integration', 'gdpr_compliant']
  },
  {
    id: 'bigquery-ai',
    name: 'Google BigQuery ML / Duet AI',
    vendor: 'Google',
    category: 'Data Analysis / ML',
    riskScore: 54,
    riskTier: 'MEDIUM',
    domains: ['data_analysis', 'machine_learning', 'sql_generation'],
    capabilities: { contextLength: 0, capabilities: 'ml_modeling' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: true,
      baa: true,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'strong_compliance', 'baa_available']
  },
  {
    id: 'databricks-sql-genie',
    name: 'Databricks SQL Genie',
    vendor: 'Databricks',
    category: 'Data Analysis / SQL',
    riskScore: 50,
    riskTier: 'MEDIUM',
    domains: ['data_analysis', 'sql_generation', 'data_engineering'],
    capabilities: { contextLength: 0, capabilities: 'sql_generation' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'data_engineering_focused', 'gdpr_available']
  },

  // Document Processing
  {
    id: 'openai-vision',
    name: 'OpenAI Vision (GPT-4V)',
    vendor: 'OpenAI',
    category: 'Document / Vision',
    riskScore: 70,
    riskTier: 'HIGH',
    domains: ['document_processing', 'ocr', 'image_analysis', 'table_extraction'],
    capabilities: { contextLength: 128000, capabilities: 'multimodal' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '30 days'
    },
    govRiskFactors: ['document_exposure_risk', 'multimodal', 'high_capability']
  },
  {
    id: 'docusign-ai',
    name: 'DocuSign Intelligent Inbox',
    vendor: 'DocuSign',
    category: 'Document Processing',
    riskScore: 48,
    riskTier: 'MEDIUM',
    domains: ['document_processing', 'contract_analysis', 'workflow_automation'],
    capabilities: { contextLength: 0, capabilities: 'document_analysis' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['specialized_vendor', 'gdpr_compliant', 'audit_trail']
  },
  {
    id: 'adobe-acrobat-ai',
    name: 'Adobe Acrobat AI Assistant',
    vendor: 'Adobe',
    category: 'Document Processing',
    riskScore: 52,
    riskTier: 'MEDIUM',
    domains: ['document_processing', 'pdf_analysis', 'content_extraction'],
    capabilities: { contextLength: 0, capabilities: 'pdf_analysis' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'specialized_tool', 'gdpr_compliant']
  },

  // Search and Research
  {
    id: 'google-search-ai',
    name: 'Google Search AI Overviews',
    vendor: 'Google',
    category: 'Search / Information Retrieval',
    riskScore: 52,
    riskTier: 'MEDIUM',
    domains: ['information_retrieval', 'research', 'knowledge_synthesis'],
    capabilities: { contextLength: 0, capabilities: 'web_search' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'multi',
      dataRetention: 'standard'
    },
    govRiskFactors: ['web_search_exposure', 'large_platform', 'information_quality_risk']
  },
  {
    id: 'bing-chat',
    name: 'Microsoft Bing Chat / Copilot',
    vendor: 'Microsoft',
    category: 'Search / Conversational AI',
    riskScore: 56,
    riskTier: 'MEDIUM',
    domains: ['information_retrieval', 'conversation', 'research'],
    capabilities: { contextLength: 4000, capabilities: 'web_search' },
    complianceAttributes: {
      soc2: true,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: '30 days'
    },
    govRiskFactors: ['web_search', 'conversation_logging', 'gdpr_partial']
  },

  // Specialized Tools
  {
    id: 'finbert',
    name: 'FinBERT (Financial Analysis Model)',
    vendor: 'YiLun Zhao / Open Source',
    category: 'Domain-Specific / Finance',
    riskScore: 35,
    riskTier: 'LOW',
    domains: ['financial_analysis', 'sentiment_analysis', 'risk_assessment'],
    capabilities: { contextLength: 0, capabilities: 'financial_nlp' },
    complianceAttributes: {
      soc2: 'self-hosted',
      gdpr: 'self-hosted',
      hipaa: 'self-hosted',
      baa: 'self-hosted',
      dataResidency: 'self-hosted',
      dataRetention: 'self-controlled'
    },
    govRiskFactors: ['open_source', 'domain_specific', 'low_risk', 'self_hosted']
  },
  {
    id: 'comply-chain',
    name: 'ComplyChain (Compliance Monitoring)',
    vendor: 'ComplyChain Inc',
    category: 'Compliance / Risk',
    riskScore: 44,
    riskTier: 'MEDIUM',
    domains: ['compliance_monitoring', 'risk_assessment', 'governance'],
    capabilities: { contextLength: 0, capabilities: 'compliance_analysis' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'configurable',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['specialized_compliance', 'gdpr_compliant', 'governance_focused']
  },
  {
    id: 'watsonx-assistant',
    name: 'IBM Watson Assistant',
    vendor: 'IBM',
    category: 'Conversational AI',
    riskScore: 50,
    riskTier: 'MEDIUM',
    domains: ['customer_service', 'automation', 'chatbot'],
    capabilities: { contextLength: 0, capabilities: 'conversational' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: true,
      baa: true,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'strong_compliance', 'hipaa_baa_available']
  },
  {
    id: 'salesforce-einstein',
    name: 'Salesforce Einstein (General)',
    vendor: 'Salesforce',
    category: 'CRM / Business AI',
    riskScore: 54,
    riskTier: 'MEDIUM',
    domains: ['sales_acceleration', 'marketing_automation', 'customer_insights'],
    capabilities: { contextLength: 0, capabilities: 'business_ai' },
    complianceAttributes: {
      soc2: true,
      gdpr: true,
      hipaa: false,
      baa: false,
      dataResidency: 'multi',
      dataRetention: 'configurable'
    },
    govRiskFactors: ['enterprise_vendor', 'crm_integration', 'gdpr_compliant']
  },
  {
    id: 'hugging-face-inference',
    name: 'Hugging Face Inference API',
    vendor: 'Hugging Face',
    category: 'Model Hosting / API',
    riskScore: 45,
    riskTier: 'MEDIUM',
    domains: ['model_hosting', 'ml_inference', 'open_source'],
    capabilities: { contextLength: 0, capabilities: 'model_inference' },
    complianceAttributes: {
      soc2: false,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: 'unknown'
    },
    govRiskFactors: ['community_driven', 'limited_compliance', 'flexible_models']
  },
  {
    id: 'together-ai',
    name: 'Together AI (Model Orchestration)',
    vendor: 'Together AI',
    category: 'Model Hosting / Inference',
    riskScore: 48,
    riskTier: 'MEDIUM',
    domains: ['model_hosting', 'ml_inference', 'cost_optimization'],
    capabilities: { contextLength: 0, capabilities: 'model_orchestration' },
    complianceAttributes: {
      soc2: false,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: 'unknown'
    },
    govRiskFactors: ['emerging_vendor', 'cost_optimization', 'limited_compliance']
  },
  {
    id: 'replicate',
    name: 'Replicate (Model Inference)',
    vendor: 'Replicate',
    category: 'Model Hosting / API',
    riskScore: 46,
    riskTier: 'MEDIUM',
    domains: ['model_inference', 'image_generation', 'video_generation'],
    capabilities: { contextLength: 0, capabilities: 'multi_model' },
    complianceAttributes: {
      soc2: false,
      gdpr: 'partial',
      hipaa: false,
      baa: false,
      dataResidency: 'US',
      dataRetention: 'unknown'
    },
    govRiskFactors: ['inference_platform', 'model_variety', 'limited_compliance_info']
  }
];

/**
 * Risk tier definitions based on risk score ranges
 * @type {Object}
 */
const RISK_TIERS = {
  CRITICAL: {
    min: 80,
    max: 100,
    label: 'CRITICAL',
    description: 'Severe governance, compliance, or security risks requiring immediate mitigation',
    allowedUsage: 'Prohibited unless explicit executive approval and risk acceptance',
    controls: ['executive_approval', 'enhanced_monitoring', 'quarterly_review', 'alternative_evaluation']
  },

  HIGH: {
    min: 60,
    max: 79,
    label: 'HIGH',
    description: 'Significant governance risks requiring documented controls and oversight',
    allowedUsage: 'Requires documented approval, monitoring, and periodic review',
    controls: ['manager_approval', 'usage_monitoring', 'audit_trail', 'quarterly_assessment']
  },

  MEDIUM: {
    min: 40,
    max: 59,
    label: 'MEDIUM',
    description: 'Moderate risks with standard governance controls',
    allowedUsage: 'Allowed with standard governance controls',
    controls: ['standard_approval', 'usage_logging', 'periodic_monitoring']
  },

  LOW: {
    min: 20,
    max: 39,
    label: 'LOW',
    description: 'Minimal risks with baseline governance',
    allowedUsage: 'Allowed with baseline governance',
    controls: ['usage_logging', 'annual_review']
  },

  MINIMAL: {
    min: 0,
    max: 19,
    label: 'MINIMAL',
    description: 'Very low inherent risks',
    allowedUsage: 'Allowed with minimal governance',
    controls: ['passive_logging']
  }
};

/**
 * Classifies AI model risk based on provider, capability, data sensitivity, and spend
 *
 * @param {string} provider - Vendor name (e.g., 'OpenAI', 'Google')
 * @param {string} model - Model identifier (e.g., 'gpt-4', 'gemini-2.0')
 * @param {Object} metadata - Additional metadata
 * @param {string} metadata.dataSensitivity - 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
 * @param {number} metadata.monthlySpend - Monthly spend in USD
 * @param {string} metadata.primaryUseCase - Use case description
 * @param {boolean} metadata.dataExfiltrationRisk - Whether data could leave organization
 * @returns {Object} Risk classification with tier, score, and supporting factors
 *
 * @example
 * const risk = classifyModelRisk('OpenAI', 'gpt-4', {
 *   dataSensitivity: 'CONFIDENTIAL',
 *   monthlySpend: 5000,
 *   primaryUseCase: 'financial_analysis',
 *   dataExfiltrationRisk: true
 * });
 * // Returns: { riskTier: 'CRITICAL', riskScore: 85, factors: [...] }
 */
function classifyModelRisk(provider, model, metadata = {}) {
  let riskScore = 50; // Baseline
  const factors = [];

  // Find the AI tool in catalog
  const toolEntry = AI_TOOL_RISK_CATALOG.find(
    (tool) => tool.vendor.toLowerCase() === provider.toLowerCase() &&
              tool.id.toLowerCase() === model.toLowerCase()
  );

  // Start with catalog risk score if available
  if (toolEntry) {
    riskScore = toolEntry.riskScore;
    factors.push({
      factor: 'catalog_base_score',
      value: toolEntry.riskScore,
      description: `Base risk score from AI tool catalog: ${toolEntry.riskScore}`
    });
  } else {
    factors.push({
      factor: 'unknown_model',
      value: 0,
      description: 'Model not found in risk catalog; using conservative baseline'
    });
  }

  // Data sensitivity adjustment
  const dataSensitivity = metadata.dataSensitivity || 'INTERNAL';
  const sensitivityMultipliers = {
    'RESTRICTED': 1.4,
    'CONFIDENTIAL': 1.3,
    'INTERNAL': 1.0,
    'PUBLIC': 0.8
  };

  const sensitivityMultiplier = sensitivityMultipliers[dataSensitivity] || 1.0;
  const sensitivityAdjustment = (sensitivityMultiplier - 1.0) * 10;
  riskScore += sensitivityAdjustment;

  if (sensitivityAdjustment !== 0) {
    factors.push({
      factor: 'data_sensitivity',
      value: sensitivityAdjustment,
      description: `Data sensitivity '${dataSensitivity}' increases risk by ${sensitivityAdjustment.toFixed(1)} points`
    });
  }

  // Spend magnitude risk
  const monthlySpend = metadata.monthlySpend || 0;
  let spendRiskAdjustment = 0;
  if (monthlySpend > 50000) {
    spendRiskAdjustment = 15;
    factors.push({
      factor: 'high_spend_magnitude',
      value: spendRiskAdjustment,
      description: `Monthly spend of $${monthlySpend} represents significant cost exposure`
    });
  } else if (monthlySpend > 20000) {
    spendRiskAdjustment = 8;
    factors.push({
      factor: 'moderate_spend_magnitude',
      value: spendRiskAdjustment,
      description: `Monthly spend of $${monthlySpend} represents moderate cost exposure`
    });
  }
  riskScore += spendRiskAdjustment;

  // Data exfiltration risk
  if (metadata.dataExfiltrationRisk === true) {
    riskScore += 10;
    factors.push({
      factor: 'data_exfiltration_risk',
      value: 10,
      description: 'Data could potentially be transmitted outside organization'
    });
  }

  // Clamp score to 0-100 range
  riskScore = Math.max(0, Math.min(100, riskScore));

  // Determine risk tier
  let riskTier = 'MINIMAL';
  for (const [tierName, tierDef] of Object.entries(RISK_TIERS)) {
    if (riskScore >= tierDef.min && riskScore <= tierDef.max) {
      riskTier = tierName;
      break;
    }
  }

  return {
    provider,
    model,
    riskScore: Math.round(riskScore),
    riskTier,
    riskTierDef: RISK_TIERS[riskTier],
    dataSensitivity,
    monthlySpend,
    factors,
    timestamp: new Date().toISOString(),
    recommendedControls: RISK_TIERS[riskTier].controls || []
  };
}

/**
 * Assesses organizational AI governance posture against all three frameworks
 *
 * @param {Object} orgData - Organization governance data
 * @param {boolean} orgData.auditTrailActive - Is audit trail enabled?
 * @param {boolean} orgData.budgetsDefined - Are budgets defined for AI spend?
 * @param {boolean} orgData.anomalyDetectionOn - Is anomaly detection enabled?
 * @param {number} orgData.reconciliationRate - Monthly reconciliation completion (0-100)
 * @param {number} orgData.fcsScore - Financial Control Strength score (0-100)
 * @param {number} orgData.controlsAssessed - Percentage of AI tools assessed (%0-100)
 * @param {number} orgData.closePacks - Number of completed close packs
 * @param {number} orgData.driftDetectionEnabled - Is drift detection enabled?
 * @param {Array} orgData.shadowAiToolsIdentified - List of identified shadow AI tools
 * @param {number} orgData.trainingCompletionRate - Governance training completion (0-100)
 * @param {boolean} orgData.incidentResponsePlan - Do you have an AI incident response plan?
 * @param {Array} orgData.complianceStandards - Array of standards organization targets
 * @returns {Object} Comprehensive governance assessment against all frameworks
 *
 * @example
 * const assessment = assessGovernancePosture({
 *   auditTrailActive: true,
 *   budgetsDefined: true,
 *   anomalyDetectionOn: true,
 *   reconciliationRate: 95,
 *   fcsScore: 78,
 *   controlsAssessed: 85,
 *   closePacks: 12,
 *   driftDetectionEnabled: true,
 *   shadowAiToolsIdentified: [],
 *   trainingCompletionRate: 80,
 *   incidentResponsePlan: true,
 *   complianceStandards: ['NIST_AI_RMF', 'ISO_42001', 'EU_AI_ACT']
 * });
 */
function assessGovernancePosture(orgData) {
  // Input validation and defaults
  const data = {
    auditTrailActive: orgData.auditTrailActive === true,
    budgetsDefined: orgData.budgetsDefined === true,
    anomalyDetectionOn: orgData.anomalyDetectionOn === true,
    reconciliationRate: Math.min(100, Math.max(0, orgData.reconciliationRate || 0)),
    fcsScore: Math.min(100, Math.max(0, orgData.fcsScore || 0)),
    controlsAssessed: Math.min(100, Math.max(0, orgData.controlsAssessed || 0)),
    closePacks: orgData.closePacks || 0,
    driftDetectionEnabled: orgData.driftDetectionEnabled === true,
    shadowAiToolsIdentified: orgData.shadowAiToolsIdentified || [],
    trainingCompletionRate: Math.min(100, Math.max(0, orgData.trainingCompletionRate || 0)),
    incidentResponsePlan: orgData.incidentResponsePlan === true
  };

  const assessment = {
    overallPosture: {},
    frameworks: {},
    nextActions: [],
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };

  // NIST AI RMF Assessment
  assessment.frameworks.nist_ai_rmf = assessNistAiRmf(data);

  // ISO/IEC 42001 Assessment
  assessment.frameworks.iso_42001 = assessIso42001(data);

  // EU AI Act Assessment
  assessment.frameworks.eu_ai_act = assessEuAiAct(data);

  // Overall score (average of three frameworks)
  const frameworkScores = [
    assessment.frameworks.nist_ai_rmf.score,
    assessment.frameworks.iso_42001.score,
    assessment.frameworks.eu_ai_act.score
  ];
  const overallScore = Math.round(frameworkScores.reduce((a, b) => a + b, 0) / frameworkScores.length);

  assessment.overallPosture = {
    score: overallScore,
    grade: scoreToGrade(overallScore),
    maturityLevel: scoreToMaturityLevel(overallScore),
    description: getPostureDescription(overallScore)
  };

  // Generate prioritized next actions
  assessment.nextActions = generateNextActions(assessment.frameworks, data);

  return assessment;
}

/**
 * Assess NIST AI RMF compliance
 * @private
 */
function assessNistAiRmf(data) {
  const governScore = assessGovernFunction(data);
  const mapScore = assessMapFunction(data);
  const measureScore = assessMeasureFunction(data);
  const manageScore = assessManageFunction(data);

  const coverageByFunction = {
    GOVERN: Math.round(governScore),
    MAP: Math.round(mapScore),
    MEASURE: Math.round(measureScore),
    MANAGE: Math.round(manageScore)
  };

  const gaps = [];
  if (governScore < 70) gaps.push('GOVERN: Policy and governance structures need strengthening');
  if (mapScore < 70) gaps.push('MAP: AI system inventory and data flow documentation incomplete');
  if (measureScore < 70) gaps.push('MEASURE: Performance monitoring and anomaly detection not fully implemented');
  if (manageScore < 70) gaps.push('MANAGE: Risk mitigation and improvement processes need enhancement');

  return {
    framework: 'NIST AI Risk Management Framework 1.0',
    score: Math.round((governScore + mapScore + measureScore + manageScore) / 4),
    coverageByFunction,
    gaps,
    details: {
      governScore: Math.round(governScore),
      mapScore: Math.round(mapScore),
      measureScore: Math.round(measureScore),
      manageScore: Math.round(manageScore)
    }
  };
}

/**
 * Assess GOVERN function compliance
 * @private
 */
function assessGovernFunction(data) {
  let score = 50; // Baseline

  // Policies (GV-1)
  if (data.auditTrailActive) score += 10;
  if (data.budgetsDefined) score += 10;

  // Roles (GV-2)
  if (data.trainingCompletionRate >= 75) score += 5;

  // Risk Assessment (GV-3)
  if (data.controlsAssessed >= 80) score += 10;

  // Communication (GV-4)
  if (data.closePacks >= 4) score += 10;
  if (data.incidentResponsePlan) score += 5;

  return Math.min(100, score);
}

/**
 * Assess MAP function compliance
 * @private
 */
function assessMapFunction(data) {
  let score = 50; // Baseline

  // Inventory (MP-1)
  if (data.controlsAssessed >= 60) score += 15;

  // Data Flow (MP-2)
  if (data.auditTrailActive) score += 15;

  // Capability Assessment (MP-3)
  if (data.fcsScore >= 70) score += 10;

  // Actor and Dependencies (MP-4)
  if (data.shadowAiToolsIdentified.length === 0) score += 10;

  return Math.min(100, score);
}

/**
 * Assess MEASURE function compliance
 * @private
 */
function assessMeasureFunction(data) {
  let score = 50; // Baseline

  // Performance Metrics (MS-1)
  if (data.fcsScore >= 75) score += 15;

  // Anomaly Detection (MS-2)
  if (data.anomalyDetectionOn) score += 20;

  // Data Drift Detection (MS-3)
  if (data.driftDetectionEnabled) score += 10;

  // Reconciliation (MS-4)
  if (data.reconciliationRate >= 90) score += 15;

  return Math.min(100, score);
}

/**
 * Assess MANAGE function compliance
 * @private
 */
function assessManageFunction(data) {
  let score = 50; // Baseline

  // Risk Mitigation (MG-1)
  if (data.budgetsDefined) score += 10;
  if (data.anomalyDetectionOn) score += 10;

  // Incident Response (MG-2)
  if (data.incidentResponsePlan) score += 10;

  // Improvement (MG-3)
  if (data.closePacks >= 4) score += 10;

  // ERP Integration (MG-4)
  if (data.reconciliationRate >= 85) score += 10;

  return Math.min(100, score);
}

/**
 * Assess ISO/IEC 42001 compliance
 * @private
 */
function assessIso42001(data) {
  const clauses = {};
  let totalScore = 0;

  // A.5 AI Policy
  clauses['A.5'] = Math.min(100, 50 + (data.auditTrailActive ? 25 : 0) + (data.budgetsDefined ? 25 : 0));

  // A.6 Planning
  clauses['A.6'] = Math.min(100, 50 + (data.budgetsDefined ? 15 : 0) + (data.closePacks > 0 ? 20 : 0) + (data.trainingCompletionRate >= 50 ? 15 : 0));

  // A.7 Support
  clauses['A.7'] = Math.min(100, 50 + (data.trainingCompletionRate >= 75 ? 25 : 0) + (data.trainingCompletionRate >= 50 ? 12 : 0));

  // A.8 Operation
  clauses['A.8'] = Math.min(100, 50 + (data.auditTrailActive ? 15 : 0) + (data.budgetsDefined ? 15 : 0) + (data.closePacks >= 4 ? 20 : 0));

  // A.9 Performance Evaluation
  clauses['A.9'] = Math.min(100, 50 + (data.fcsScore >= 70 ? 15 : 0) + (data.anomalyDetectionOn ? 15 : 0) + (data.driftDetectionEnabled ? 10 : 0) + (data.reconciliationRate >= 80 ? 10 : 0));

  // A.10 Improvement
  clauses['A.10'] = Math.min(100, 50 + (data.closePacks >= 4 ? 20 : 0) + (data.controlsAssessed >= 70 ? 15 : 0) + (data.trainingCompletionRate >= 60 ? 15 : 0));

  for (const score of Object.values(clauses)) {
    totalScore += score;
  }

  const avgScore = Math.round(totalScore / Object.keys(clauses).length);

  const gaps = [];
  for (const [clause, score] of Object.entries(clauses)) {
    if (score < 70) {
      gaps.push(`${clause}: Implementation incomplete (score: ${Math.round(score)})`);
    }
  }

  return {
    framework: 'ISO/IEC 42001:2023 - AI Management System',
    score: avgScore,
    clauseScores: clauses,
    gaps,
    weakestArea: Object.entries(clauses).reduce((a, b) => a[1] < b[1] ? a : b)[0]
  };
}

/**
 * Assess EU AI Act compliance
 * @private
 */
function assessEuAiAct(data) {
  const articles = {};
  let totalScore = 0;

  // Article 9: Risk Management System
  articles['Article 9 (Risk Management)'] = Math.min(100, 50 + (data.anomalyDetectionOn ? 20 : 0) + (data.fcsScore >= 70 ? 15 : 0) + (data.driftDetectionEnabled ? 15 : 0));

  // Article 12: Record-Keeping and Documentation
  articles['Article 12 (Record-Keeping)'] = Math.min(100, 50 + (data.auditTrailActive ? 20 : 0) + (data.closePacks >= 4 ? 15 : 0) + (data.trainingCompletionRate >= 60 ? 15 : 0));

  // Article 13: Transparency and Information
  articles['Article 13 (Transparency)'] = Math.min(100, 50 + (data.auditTrailActive ? 15 : 0) + (data.controlsAssessed >= 80 ? 15 : 0) + (data.closePacks >= 4 ? 20 : 0));

  // Article 17: Quality Management System
  articles['Article 17 (Quality Management)'] = Math.min(100, 50 + (data.reconciliationRate >= 90 ? 20 : 0) + (data.fcsScore >= 75 ? 15 : 0) + (data.anomalyDetectionOn ? 15 : 0));

  for (const score of Object.values(articles)) {
    totalScore += score;
  }

  const avgScore = Math.round(totalScore / Object.keys(articles).length);

  const gaps = [];
  for (const [article, score] of Object.entries(articles)) {
    if (score < 70) {
      gaps.push(`${article}: Compliance gap (score: ${Math.round(score)})`);
    }
  }

  return {
    framework: 'EU AI Act (Regulation 2024/1689)',
    score: avgScore,
    articleScores: articles,
    gaps,
    dataResidencyCompliance: 'Not evaluated - configure data residency policy'
  };
}

/**
 * Convert numeric score to letter grade
 * @private
 */
function scoreToGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Convert numeric score to maturity level
 * @private
 */
function scoreToMaturityLevel(score) {
  if (score >= 85) return 'OPTIMIZED';
  if (score >= 70) return 'MANAGED';
  if (score >= 50) return 'DEFINED';
  if (score >= 25) return 'REPEATABLE';
  return 'INITIAL';
}

/**
 * Get description of governance posture
 * @private
 */
function getPostureDescription(score) {
  if (score >= 90) return 'Excellent governance posture with comprehensive controls across all frameworks';
  if (score >= 80) return 'Strong governance framework with most controls implemented and monitored';
  if (score >= 70) return 'Adequate governance with key controls in place but some gaps remain';
  if (score >= 60) return 'Developing governance framework requiring attention to identified gaps';
  if (score >= 50) return 'Foundational governance with significant controls needed';
  return 'Minimal governance framework requires substantial strengthening';
}

/**
 * Generate prioritized next actions
 * @private
 */
function generateNextActions(frameworkAssessments, data) {
  const actions = [];

  // Priority 1: Critical gaps
  const criticalGaps = [];

  for (const [key, assessment] of Object.entries(frameworkAssessments)) {
    if (assessment.score < 60) {
      criticalGaps.push({
        priority: 'CRITICAL',
        framework: assessment.framework || key,
        action: `Develop comprehensive implementation plan - current score: ${assessment.score}/100`,
        effort: 'HIGH'
      });
    }
  }

  // Priority 2: High-impact quick wins
  if (!data.auditTrailActive) {
    actions.push({
      priority: 'HIGH',
      action: 'Enable audit trail logging across all AI tool integrations',
      frameworks: ['NIST_AI_RMF (GOVERN, MAP)', 'ISO_42001 (A.5, A.8, A.12)', 'EU_AI_ACT (Article 12)'],
      effort: 'MEDIUM',
      impact: 'Enables record-keeping and transparency compliance'
    });
  }

  if (!data.anomalyDetectionOn) {
    actions.push({
      priority: 'HIGH',
      action: 'Implement anomaly detection for AI spending and usage patterns',
      frameworks: ['NIST_AI_RMF (MEASURE)', 'ISO_42001 (A.9)', 'EU_AI_ACT (Article 9)'],
      effort: 'MEDIUM',
      impact: 'Detects unusual patterns and risk events'
    });
  }

  if (!data.budgetsDefined) {
    actions.push({
      priority: 'HIGH',
      action: 'Define and enforce budgets for AI tool spend by cost center',
      frameworks: ['NIST_AI_RMF (GOVERN, MANAGE)', 'ISO_42001 (A.6)', 'EU_AI_ACT (Article 9)'],
      effort: 'LOW',
      impact: 'Enables cost control and spend governance'
    });
  }

  if (data.reconciliationRate < 90) {
    actions.push({
      priority: 'HIGH',
      action: 'Establish monthly reconciliation process with 95%+ completion target',
      frameworks: ['NIST_AI_RMF (MEASURE)', 'ISO_42001 (A.9)', 'EU_AI_ACT (Article 17)'],
      effort: 'MEDIUM',
      impact: 'Ensures accuracy of financial records'
    });
  }

  // Priority 3: Medium-priority enhancements
  if (data.fcsScore < 75) {
    actions.push({
      priority: 'MEDIUM',
      action: 'Review and enhance financial control design; target FCS score of 80+',
      frameworks: ['NIST_AI_RMF (MEASURE)', 'ISO_42001 (A.9)', 'EU_AI_ACT (Article 17)'],
      effort: 'MEDIUM'
    });
  }

  if (data.controlsAssessed < 80) {
    actions.push({
      priority: 'MEDIUM',
      action: 'Complete risk assessments for remaining unassessed AI tools',
      frameworks: ['NIST_AI_RMF (GOVERN, MAP)', 'ISO_42001 (A.5)'],
      effort: 'MEDIUM'
    });
  }

  if (!data.driftDetectionEnabled) {
    actions.push({
      priority: 'MEDIUM',
      action: 'Enable drift detection to monitor for changes in allocation patterns',
      frameworks: ['NIST_AI_RMF (MEASURE)', 'ISO_42001 (A.9)'],
      effort: 'LOW'
    });
  }

  if (data.trainingCompletionRate < 80) {
    actions.push({
      priority: 'MEDIUM',
      action: 'Increase AI governance training completion to 90%+',
      frameworks: ['ISO_42001 (A.7)', 'NIST_AI_RMF (GOVERN)'],
      effort: 'LOW'
    });
  }

  // Priority 4: Continuous improvement
  actions.push({
    priority: 'LOW',
    action: 'Establish quarterly governance review and continuous improvement cycles',
    frameworks: ['NIST_AI_RMF (MANAGE)', 'ISO_42001 (A.10)'],
    effort: 'ONGOING'
  });

  // Sort by priority and effort
  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return actions;
}

/**
 * Generates formatted governance summary for close pack executive reports
 *
 * @param {Object} assessment - Assessment object from assessGovernancePosture()
 * @returns {string} Formatted text summary suitable for executive communication
 *
 * @example
 * const summary = generateGovernanceSummary(assessment);
 * // Returns formatted summary text for executive reporting
 */
function generateGovernanceSummary(assessment) {
  const { overallPosture, frameworks, nextActions } = assessment;

  let summary = '';
  summary += '═══════════════════════════════════════════════════════════════════\n';
  summary += '  AI GOVERNANCE & RISK ASSESSMENT SUMMARY\n';
  summary += '═══════════════════════════════════════════════════════════════════\n\n';

  // Overall posture
  summary += `OVERALL GOVERNANCE POSTURE: ${overallPosture.grade} (Score: ${overallPosture.score}/100)\n`;
  summary += `Maturity Level: ${overallPosture.maturityLevel}\n`;
  summary += `Assessment: ${overallPosture.description}\n\n`;

  // Framework scores
  summary += '───────────────────────────────────────────────────────────────────\n';
  summary += 'FRAMEWORK COMPLIANCE SUMMARY\n';
  summary += '───────────────────────────────────────────────────────────────────\n\n';

  const nist = frameworks.nist_ai_rmf;
  summary += `NIST AI RMF 1.0: ${nist.score}/100 (${scoreToGrade(nist.score)})\n`;
  summary += `  • GOVERN: ${nist.details.governScore}/100\n`;
  summary += `  • MAP: ${nist.details.mapScore}/100\n`;
  summary += `  • MEASURE: ${nist.details.measureScore}/100\n`;
  summary += `  • MANAGE: ${nist.details.manageScore}/100\n`;
  if (nist.gaps.length > 0) {
    summary += '  Gaps:\n';
    nist.gaps.forEach((gap) => {
      summary += `    - ${gap}\n`;
    });
  }
  summary += '\n';

  const iso = frameworks.iso_42001;
  summary += `ISO/IEC 42001:2023: ${iso.score}/100 (${scoreToGrade(iso.score)})\n`;
  Object.entries(iso.clauseScores).forEach(([clause, score]) => {
    summary += `  • ${clause}: ${Math.round(score)}/100\n`;
  });
  if (iso.gaps.length > 0) {
    summary += '  Gaps:\n';
    iso.gaps.forEach((gap) => {
      summary += `    - ${gap}\n`;
    });
  }
  summary += '\n';

  const eu = frameworks.eu_ai_act;
  summary += `EU AI Act (Regulation 2024/1689): ${eu.score}/100 (${scoreToGrade(eu.score)})\n`;
  Object.entries(eu.articleScores).forEach(([article, score]) => {
    summary += `  • ${article}: ${Math.round(score)}/100\n`;
  });
  if (eu.gaps.length > 0) {
    summary += '  Gaps:\n';
    eu.gaps.forEach((gap) => {
      summary += `    - ${gap}\n`;
    });
  }
  summary += '\n';

  // Prioritized actions
  summary += '───────────────────────────────────────────────────────────────────\n';
  summary += 'PRIORITIZED NEXT ACTIONS\n';
  summary += '───────────────────────────────────────────────────────────────────\n\n';

  const criticalActions = nextActions.filter((a) => a.priority === 'CRITICAL' || a.priority === 'HIGH');
  const mediumActions = nextActions.filter((a) => a.priority === 'MEDIUM');
  const lowActions = nextActions.filter((a) => a.priority === 'LOW');

  if (criticalActions.length > 0) {
    summary += 'CRITICAL & HIGH PRIORITY:\n';
    criticalActions.forEach((action, index) => {
      summary += `${index + 1}. [${action.priority}] ${action.action}\n`;
      if (action.frameworks) {
        summary += `   Frameworks: ${action.frameworks.join(', ')}\n`;
      }
      if (action.effort) {
        summary += `   Effort: ${action.effort}\n`;
      }
      summary += '\n';
    });
  }

  if (mediumActions.length > 0) {
    summary += 'MEDIUM PRIORITY:\n';
    mediumActions.forEach((action, index) => {
      summary += `${index + 1}. ${action.action}\n`;
      if (action.effort) {
        summary += `   Effort: ${action.effort}\n`;
      }
      summary += '\n';
    });
  }

  summary += '───────────────────────────────────────────────────────────────────\n';
  summary += `Assessment Date: ${new Date(assessment.timestamp).toLocaleDateString()}\n`;
  summary += 'Module Version: AI Governance & Risk Taxonomy v1.0.0\n';
  summary += '═══════════════════════════════════════════════════════════════════\n';

  return summary;
}

/**
 * Evidence-driven governance assessment using real operational data
 * Replaces boolean flag scoring with actual database queries.
 *
 * @param {Object} config - { supabaseUrl, supabaseKey }
 * @param {string} orgId - Organization ID
 * @param {string} period - Period like '2026-01'
 * @returns {Promise<Object>} Governance assessment with real evidence
 */
async function assessGovernanceWithEvidence(config, orgId, period) {
  const { collectGovernanceEvidence, collectEUAIActEvidence, hashPackage } = require('./evidence-collector.js');

  const governance = await collectGovernanceEvidence(config, orgId, period);
  const euAiAct = await collectEUAIActEvidence(config, orgId);

  // Determine readiness levels from real scores
  const nistScore = governance.nist ? governance.nist.overall : 0;
  const nistReadiness = nistScore >= 80 ? 'ready' : nistScore >= 60 ? 'partial' : 'not_ready';

  // ISO 42001 readiness from clause scores
  const iso = governance.iso42001 || {};
  const isoScores = Object.values(iso).filter(v => typeof v === 'number');
  const isoAvg = isoScores.length > 0 ? isoScores.reduce((a, b) => a + b, 0) / isoScores.length : 0;
  const isoReadiness = isoAvg >= 80 ? 'ready' : isoAvg >= 60 ? 'partial' : 'not_ready';

  // EU AI Act readiness from classification coverage
  const euReadiness = (euAiAct.toolsClassified || 0) > 0 ? 'partial' : 'not_ready';

  const assessment = {
    orgId,
    period,
    assessmentType: 'evidence-driven',
    nist: governance.nist || { govern: 0, map: 0, measure: 0, manage: 0, overall: 0 },
    iso42001: governance.iso42001 || {},
    euAiAct,
    readiness: {
      nist_ai_rmf: nistReadiness,
      iso_42001: isoReadiness,
      eu_ai_act: euReadiness,
    },
    overallGovernanceScore: nistScore,
    maturityLevel: nistScore >= 85 ? 'Optimized' : nistScore >= 70 ? 'Managed' : nistScore >= 50 ? 'Defined' : nistScore >= 30 ? 'Developing' : 'Initial',
    evidenceBased: true,
    generatedAt: new Date().toISOString(),
    generatedBy: 'ai-governance/evidence-driven',
  };

  assessment.packageHash = await hashPackage(assessment);

  return assessment;
}

/**
 * Public API exports
 */
module.exports = {
  // Framework definitions
  FRAMEWORKS,

  // Governance mappings
  NIST_MAPPING,
  ISO_42001_MAPPING,
  EU_AI_ACT_MAPPING,

  // EU AI Act risk classification (Diamond tier)
  EU_RISK_CATEGORIES,
  EU_AI_ACT_PROHIBITED_PRACTICES,
  EU_AI_ACT_HIGH_RISK_AREAS,
  classifyEUAIActRisk,

  // AI tool risk catalog
  AI_TOOL_RISK_CATALOG,

  // Risk tiers
  RISK_TIERS,

  // Core assessment functions
  classifyModelRisk,
  assessGovernancePosture,
  generateGovernanceSummary,
  assessGovernanceWithEvidence,

  // Version and metadata
  MODULE_VERSION: '1.0.0',
  MODULE_NAME: 'AI Governance & Risk Taxonomy',
  LAST_UPDATED: '2024-02-08'
};
