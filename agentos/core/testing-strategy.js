/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT TESTING STRATEGY & QUALITY GATES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Gap #1: Testing & Evaluation Strategy — CRITICAL / P0
 * Gap #11: Quality Gates & Regression Prevention — CRITICAL / P0
 *
 * Problem: Finault has no systematic testing or quality assurance framework.
 * Agents are deployed without evaluation against golden datasets. No regression
 * detection means updates can silently degrade performance. Thresholds are
 * hardcoded and cannot be tuned. The platform lacks confidence metrics for
 * production deployment.
 *
 * This module provides:
 * - Agent evaluation framework with golden datasets per agent type
 * - Benchmark-driven quality gates (accuracy, latency, cost, error rates)
 * - Regression detection by comparing against baseline test results
 * - Test orchestration and discovery across the codebase
 * - Configurable enforcement levels (strict, standard, relaxed)
 * - Comprehensive metrics computation (precision, recall, F1, percentiles)
 * - Automated comparison of successive evaluation runs
 * - Report generation for CI/CD visibility
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from './structured-logger.js';

const logger = createLogger('testing-strategy');

// ─── Evaluation Metrics ───────────────────────────────────────────────────────

export const EVALUATION_METRICS = {
    ACCURACY: 'accuracy',
    PRECISION: 'precision',
    RECALL: 'recall',
    F1_SCORE: 'f1_score',
    LATENCY_P50: 'latency_p50',
    LATENCY_P95: 'latency_p95',
    LATENCY_P99: 'latency_p99',
    COST_PER_EVALUATION: 'cost_per_evaluation',
    ERROR_RATE: 'error_rate',
    FALSE_POSITIVE_RATE: 'false_positive_rate',
    FALSE_NEGATIVE_RATE: 'false_negative_rate'
};

// ─── Quality Gate Levels ──────────────────────────────────────────────────────

export const QUALITY_GATE_LEVELS = {
    STRICT: 'strict',      // All gates must pass
    STANDARD: 'standard',  // Critical gates must pass, warnings on non-critical
    RELAXED: 'relaxed'     // Only blocking gates enforced
};

// ─── Test Categories ─────────────────────────────────────────────────────────

export const TEST_CATEGORIES = {
    UNIT: 'unit',
    INTEGRATION: 'integration',
    E2E: 'e2e',
    PERFORMANCE: 'performance',
    SECURITY: 'security',
    EVALUATION: 'evaluation',
    REGRESSION: 'regression',
    SMOKE: 'smoke'
};

// ─── Agent Benchmarks ─────────────────────────────────────────────────────────

export const AGENT_BENCHMARKS = {
    anomaly_detection: {
        accuracy: 0.92,
        precision: 0.88,
        recall: 0.90,
        latency_p95: 2000,
        f1_score: 0.89,
        cost_per_evaluation: 0.05,
        error_rate: 0.01,
        false_positive_rate: 0.08,
        false_negative_rate: 0.05
    },
    invoice_reconciliation: {
        accuracy: 0.97,
        precision: 0.95,
        recall: 0.96,
        latency_p95: 5000,
        f1_score: 0.955,
        cost_per_evaluation: 0.08,
        error_rate: 0.005,
        false_positive_rate: 0.03,
        false_negative_rate: 0.02
    },
    budget_enforcement: {
        accuracy: 0.99,
        precision: 0.98,
        recall: 0.97,
        latency_p95: 1000,
        f1_score: 0.975,
        cost_per_evaluation: 0.02,
        error_rate: 0.002,
        false_positive_rate: 0.01,
        false_negative_rate: 0.01
    },
    optimization_executor: {
        accuracy: 0.85,
        precision: 0.82,
        recall: 0.80,
        latency_p95: 10000,
        f1_score: 0.81,
        cost_per_evaluation: 0.12,
        error_rate: 0.03,
        false_positive_rate: 0.12,
        false_negative_rate: 0.15
    },
    dispute_resolver: {
        accuracy: 0.90,
        precision: 0.88,
        recall: 0.87,
        latency_p95: 3000,
        f1_score: 0.875,
        cost_per_evaluation: 0.06,
        error_rate: 0.015,
        false_positive_rate: 0.10,
        false_negative_rate: 0.08
    },
    forecast_engine: {
        accuracy: 0.80,
        precision: 0.78,
        recall: 0.75,
        latency_p95: 8000,
        f1_score: 0.765,
        cost_per_evaluation: 0.10,
        error_rate: 0.04,
        false_positive_rate: 0.15,
        false_negative_rate: 0.20
    },
    close_pack_generator: {
        accuracy: 0.99,
        precision: 0.99,
        recall: 0.98,
        latency_p95: 15000,
        f1_score: 0.985,
        cost_per_evaluation: 0.15,
        error_rate: 0.001,
        false_positive_rate: 0.005,
        false_negative_rate: 0.01
    }
};

// ─── Default Quality Gates ────────────────────────────────────────────────────

export const DEFAULT_QUALITY_GATES = {
    testPassRate: {
        threshold: 1.0,
        blocking: true,
        description: 'All tests must pass'
    },
    coverageMinimum: {
        threshold: 0.80,
        blocking: true,
        description: 'Minimum 80% code coverage'
    },
    evaluationAccuracy: {
        threshold: 0.85,
        blocking: true,
        description: 'Agent accuracy above 85%'
    },
    performanceBudget: {
        threshold: 1.0,
        blocking: false,
        description: 'All perf tests within budget'
    },
    securityScan: {
        threshold: 1.0,
        blocking: true,
        description: 'Zero high/critical vulnerabilities'
    },
    noRegressions: {
        threshold: 1.0,
        blocking: true,
        description: 'No test regressions from baseline'
    }
};

// ─── Golden Datasets ──────────────────────────────────────────────────────────

export const GOLDEN_DATASETS = {
    anomaly_detection: [
        {
            id: 'ANOM-001',
            description: 'Sudden 300% cost spike detection',
            input: {
                historicalCosts: [1000, 1050, 1020, 980, 1100],
                currentCost: 4200,
                provider: 'aws',
                service: 'compute',
                timestamp: Date.now()
            },
            expectedOutput: {
                isAnomaly: true,
                severity: 'critical',
                anomalyType: 'spike',
                confidence: 0.95,
                deviation: 3.0
            },
            tags: ['edge_case', 'high_priority', 'critical']
        },
        {
            id: 'ANOM-002',
            description: 'Gradual 20% drift over time',
            input: {
                historicalCosts: [1000, 1100, 1210, 1331, 1464],
                currentCost: 1610,
                provider: 'gcp',
                service: 'storage',
                timestamp: Date.now()
            },
            expectedOutput: {
                isAnomaly: true,
                severity: 'warning',
                anomalyType: 'drift',
                confidence: 0.82,
                deviation: 0.20
            },
            tags: ['drift', 'medium_priority']
        },
        {
            id: 'ANOM-003',
            description: 'Seasonal pattern recognition',
            input: {
                historicalCosts: [1000, 2000, 1100, 2050, 1150, 2100, 1200, 2150],
                currentCost: 2200,
                provider: 'aws',
                service: 'data_transfer',
                isSeasonalPeriod: true,
                timestamp: Date.now()
            },
            expectedOutput: {
                isAnomaly: false,
                severity: 'info',
                anomalyType: 'seasonal',
                confidence: 0.88,
                deviation: 0.05
            },
            tags: ['seasonal', 'low_priority']
        },
        {
            id: 'ANOM-004',
            description: 'False positive with scheduled scale-up',
            input: {
                historicalCosts: [1000, 1020, 1010, 1030, 1015],
                currentCost: 3000,
                provider: 'azure',
                service: 'compute',
                scheduledScaleUp: true,
                scaleFactor: 3.0,
                timestamp: Date.now()
            },
            expectedOutput: {
                isAnomaly: false,
                severity: 'info',
                anomalyType: 'scheduled',
                confidence: 0.90,
                deviation: 0.0
            },
            tags: ['false_positive', 'medium_priority']
        },
        {
            id: 'ANOM-005',
            description: 'Multi-provider cost correlation',
            input: {
                costs: [
                    { provider: 'aws', cost: 3000, historicalAvg: 1000 },
                    { provider: 'gcp', cost: 2000, historicalAvg: 500 },
                    { provider: 'azure', cost: 1500, historicalAvg: 600 }
                ],
                timestamp: Date.now(),
                correlationPeriod: 3600000
            },
            expectedOutput: {
                isAnomaly: true,
                severity: 'critical',
                anomalyType: 'correlated_spike',
                confidence: 0.93,
                affectedProviders: ['aws', 'gcp', 'azure']
            },
            tags: ['correlation', 'critical', 'high_priority']
        }
    ],
    invoice_reconciliation: [
        {
            id: 'INV-001',
            description: 'Perfect 3-way match',
            input: {
                invoice: { amount: 5000, lineItems: 10, currency: 'USD' },
                purchase_order: { amount: 5000, lineItems: 10 },
                receipt: { amount: 5000, lineItems: 10 },
                vendor: 'AWS',
                timestamp: Date.now()
            },
            expectedOutput: {
                status: 'matched',
                matchType: 'three_way_match',
                discrepancies: [],
                confidence: 1.0,
                approved: true
            },
            tags: ['happy_path', 'high_priority']
        },
        {
            id: 'INV-002',
            description: 'Amount mismatch by $0.01',
            input: {
                invoice: { amount: 5000.01, lineItems: 10, currency: 'USD' },
                purchase_order: { amount: 5000.00, lineItems: 10 },
                receipt: { amount: 5000.00, lineItems: 10 },
                vendor: 'GCP',
                timestamp: Date.now()
            },
            expectedOutput: {
                status: 'matched_with_tolerance',
                matchType: 'two_way_match',
                discrepancies: [{ field: 'amount', variance: 0.01, percentVariance: 0.0002 }],
                confidence: 0.98,
                approved: true
            },
            tags: ['tolerance', 'edge_case']
        },
        {
            id: 'INV-003',
            description: 'Duplicate invoice detection',
            input: {
                invoice: { invoiceId: 'INV-2024-001', amount: 5000, timestamp: Date.now() },
                previousInvoices: [
                    { invoiceId: 'INV-2024-001', amount: 5000, timestamp: Date.now() - 86400000 }
                ],
                vendor: 'Azure',
                timestamp: Date.now()
            },
            expectedOutput: {
                status: 'rejected',
                matchType: 'duplicate',
                discrepancies: [{ field: 'duplicate_invoice', previousId: 'INV-2024-001' }],
                confidence: 0.99,
                approved: false,
                reason: 'Exact duplicate detected'
            },
            tags: ['fraud_detection', 'critical']
        },
        {
            id: 'INV-004',
            description: 'Missing purchase order',
            input: {
                invoice: { amount: 3000, lineItems: 5, currency: 'USD' },
                purchase_order: null,
                receipt: { amount: 3000, lineItems: 5 },
                vendor: 'Datadog',
                timestamp: Date.now()
            },
            expectedOutput: {
                status: 'requires_review',
                matchType: 'two_way_match',
                discrepancies: [{ field: 'purchase_order', type: 'missing' }],
                confidence: 0.75,
                approved: false,
                reason: 'Purchase order not found; manual review required'
            },
            tags: ['missing_document', 'medium_priority']
        },
        {
            id: 'INV-005',
            description: 'Currency conversion edge case',
            input: {
                invoice: { amount: 4500, currency: 'EUR' },
                purchase_order: { amount: 5000, currency: 'USD' },
                receipt: { amount: 4500, currency: 'EUR' },
                exchangeRate: 0.92,
                vendor: 'European Software Provider',
                timestamp: Date.now()
            },
            expectedOutput: {
                status: 'matched',
                matchType: 'three_way_match',
                discrepancies: [],
                confidence: 0.95,
                approved: true,
                appliedExchangeRate: 0.92,
                convertedAmount: 5000
            },
            tags: ['currency_conversion', 'edge_case']
        }
    ],
    budget_enforcement: [
        {
            id: 'BUDGET-001',
            description: 'Budget at 75% warning threshold',
            input: {
                budgetLimit: 10000,
                currentSpend: 7500,
                remainingBudget: 2500,
                period: '2024-Q1',
                organization: 'acme-corp'
            },
            expectedOutput: {
                status: 'warning',
                percentageUsed: 0.75,
                action: 'notify_stakeholders',
                severity: 'warning',
                alert: true,
                enforcement: false
            },
            tags: ['threshold', 'warning']
        },
        {
            id: 'BUDGET-002',
            description: 'Budget at 90% critical threshold',
            input: {
                budgetLimit: 10000,
                currentSpend: 9000,
                remainingBudget: 1000,
                period: '2024-Q1',
                organization: 'acme-corp'
            },
            expectedOutput: {
                status: 'critical',
                percentageUsed: 0.90,
                action: 'escalate_and_restrict',
                severity: 'critical',
                alert: true,
                enforcement: true,
                recommendedAction: 'reduce_workload_or_request_increase'
            },
            tags: ['critical', 'high_priority']
        },
        {
            id: 'BUDGET-003',
            description: 'Budget exceeded',
            input: {
                budgetLimit: 10000,
                currentSpend: 10500,
                remainingBudget: -500,
                period: '2024-Q1',
                organization: 'acme-corp'
            },
            expectedOutput: {
                status: 'exceeded',
                percentageUsed: 1.05,
                action: 'hard_stop',
                severity: 'critical',
                alert: true,
                enforcement: true,
                recommendedAction: 'investigate_overspend_immediately'
            },
            tags: ['exceeded', 'critical', 'high_priority']
        },
        {
            id: 'BUDGET-004',
            description: 'Projected overshoot within period',
            input: {
                budgetLimit: 10000,
                currentSpend: 6000,
                daysElapsed: 15,
                totalDaysInPeriod: 30,
                dailyTrendSpend: 400,
                organization: 'acme-corp'
            },
            expectedOutput: {
                status: 'projected_overshoot',
                projectedTotal: 12000,
                projectedExcess: 2000,
                action: 'recommend_immediate_optimization',
                severity: 'warning',
                alert: true,
                enforcement: false,
                daysUntilExhaustion: 25
            },
            tags: ['projection', 'warning', 'medium_priority']
        },
        {
            id: 'BUDGET-005',
            description: 'Zero usage budget',
            input: {
                budgetLimit: 100,
                currentSpend: 0,
                remainingBudget: 100,
                period: '2024-Q1',
                organization: 'test-org',
                daysElapsed: 5,
                totalDaysInPeriod: 30
            },
            expectedOutput: {
                status: 'healthy',
                percentageUsed: 0.0,
                action: 'continue_monitoring',
                severity: 'info',
                alert: false,
                enforcement: false
            },
            tags: ['edge_case', 'low_priority']
        }
    ],
    optimization_executor: [
        {
            id: 'OPT-001',
            description: 'Reserved instance recommendation for sustained compute',
            input: {
                instanceType: 'compute',
                usagePattern: {
                    week1: 90,
                    week2: 92,
                    week3: 88,
                    week4: 91,
                    averageUtilization: 0.90
                },
                currentHourlyRate: 0.50,
                reservationPeriod: '1-year',
                provider: 'aws',
                timestamp: Date.now()
            },
            expectedOutput: {
                recommendationType: 'reserved_instance',
                reasoning: 'Sustained high utilization indicates stable workload',
                estimatedSavings: 0.35,
                savingsPercentage: 0.70,
                confidence: 0.92,
                paybackPeriod: '4.2 months'
            },
            tags: ['cost_optimization', 'high_confidence', 'high_priority']
        },
        {
            id: 'OPT-002',
            description: 'Rightsizing recommendation for underutilized instances',
            input: {
                instanceType: 't3.2xlarge',
                cpuUtilization: 0.15,
                memoryUtilization: 0.12,
                networkUtilization: 0.08,
                currentMonthlyCost: 500,
                provider: 'aws',
                timestamp: Date.now()
            },
            expectedOutput: {
                recommendationType: 'rightsize',
                targetInstanceType: 't3.medium',
                reasoning: 'Instance significantly over-provisioned',
                estimatedSavings: 450,
                savingsPercentage: 0.90,
                confidence: 0.87,
                riskLevel: 'low'
            },
            tags: ['rightsize', 'high_savings', 'medium_priority']
        },
        {
            id: 'OPT-003',
            description: 'Spot instance opportunity for batch workload',
            input: {
                workloadType: 'batch_processing',
                faultTolerant: true,
                estimatedDuration: '4 hours',
                onDemandHourlyRate: 1.20,
                provider: 'aws',
                timestamp: Date.now()
            },
            expectedOutput: {
                recommendationType: 'spot_instance',
                reasoning: 'Fault-tolerant batch workload ideal for spot pricing',
                estimatedSpotRate: 0.36,
                savingsPercentage: 0.70,
                interruptionRisk: 'acceptable',
                confidence: 0.89
            },
            tags: ['spot_instance', 'batch_workload', 'high_savings']
        },
        {
            id: 'OPT-004',
            description: 'License optimization - unused software licenses',
            input: {
                licenseType: 'commercial_software',
                totalLicenses: 100,
                activeLicenses: 25,
                unusedLicenses: 75,
                licenseAnnualCost: 50000,
                provider: 'vendor_licensing',
                timestamp: Date.now()
            },
            expectedOutput: {
                recommendationType: 'license_termination',
                reasoning: 'Significant unused license capacity',
                licensesToTerminate: 75,
                estimatedSavings: 37500,
                savingsPercentage: 0.75,
                confidence: 0.98,
                action: 'terminate_excess_licenses'
            },
            tags: ['license_optimization', 'high_confidence', 'critical']
        },
        {
            id: 'OPT-005',
            description: 'Cross-region cost optimization based on data transfer',
            input: {
                regions: [
                    { name: 'us-east-1', cost: 2000, transferOut: 500 },
                    { name: 'eu-west-1', cost: 1500, transferOut: 400 },
                    { name: 'ap-southeast-1', cost: 1200, transferOut: 150 }
                ],
                currentDataTransferCost: 450,
                provider: 'aws',
                timestamp: Date.now()
            },
            expectedOutput: {
                recommendationType: 'region_consolidation',
                reasoning: 'High cross-region data transfer costs can be reduced',
                targetRegion: 'us-east-1',
                estimatedSavings: 250,
                savingsPercentage: 0.55,
                confidence: 0.81,
                migrationComplexity: 'medium'
            },
            tags: ['region_optimization', 'data_transfer', 'medium_priority']
        }
    ],
    dispute_resolver: [
        {
            id: 'DISP-001',
            description: 'Duplicate charge detection',
            input: {
                chargeA: { invoiceId: 'INV-001', lineItem: 'Compute', amount: 500, date: '2024-01-15' },
                chargeB: { invoiceId: 'INV-002', lineItem: 'Compute', amount: 500, date: '2024-01-15' },
                vendor: 'AWS',
                timestamp: Date.now()
            },
            expectedOutput: {
                disputeRecommended: true,
                disputeType: 'duplicate_charge',
                confidence: 0.98,
                evidence: ['identical_amount', 'same_line_item', 'same_date'],
                draftDispute: {
                    title: 'Duplicate Charge Detected',
                    severity: 'critical',
                    amountDisputed: 500
                }
            },
            tags: ['duplicate_detection', 'high_confidence', 'critical']
        },
        {
            id: 'DISP-002',
            description: 'Rate discrepancy - contracted vs billed rate',
            input: {
                contractedRate: 0.10,
                billedRate: 0.12,
                billedAmount: 1200,
                usage: 10000,
                vendor: 'GCP',
                contractStartDate: '2023-01-01',
                timestamp: Date.now()
            },
            expectedOutput: {
                disputeRecommended: true,
                disputeType: 'rate_discrepancy',
                confidence: 0.94,
                discrepancyPercentage: 0.20,
                expectedAmount: 1000,
                overchargeAmount: 200,
                evidence: ['contract_on_file', 'rate_mismatch']
            },
            tags: ['rate_discrepancy', 'high_priority', 'high_confidence']
        },
        {
            id: 'DISP-003',
            description: 'Service not provisioned but charged',
            input: {
                chargedService: 'Premium_Support',
                chargedAmount: 300,
                serviceProvisioned: false,
                provisioningRecords: [],
                vendor: 'Azure',
                billingPeriod: '2024-01',
                timestamp: Date.now()
            },
            expectedOutput: {
                disputeRecommended: true,
                disputeType: 'service_not_provisioned',
                confidence: 0.96,
                evidence: ['no_provisioning_record', 'service_inactive'],
                draftDispute: {
                    title: 'Charge for Unprovisioned Service',
                    severity: 'high',
                    amountDisputed: 300
                },
                action: 'request_full_credit'
            },
            tags: ['service_verification', 'critical', 'high_confidence']
        },
        {
            id: 'DISP-004',
            description: 'Volume discount not applied',
            input: {
                monthlyUsage: 150000,
                discountThreshold: 100000,
                discountTier: 0.10,
                chargedAmount: 1500,
                expectedDiscountedAmount: 1350,
                vendor: 'Datadog',
                timestamp: Date.now()
            },
            expectedOutput: {
                disputeRecommended: true,
                disputeType: 'discount_not_applied',
                confidence: 0.99,
                usageExceedsThreshold: true,
                eligibleDiscount: 0.10,
                shortfall: 150,
                evidence: ['usage_exceeds_tier', 'discount_tier_qualified']
            },
            tags: ['discount_verification', 'high_confidence', 'medium_priority']
        },
        {
            id: 'DISP-005',
            description: 'False positive - legitimate charge',
            input: {
                chargeAmount: 250,
                service: 'Standard_Compute',
                vendor: 'AWS',
                contractIncludes: ['Standard_Compute'],
                rateMatches: true,
                serviceProvisioned: true,
                timestamp: Date.now()
            },
            expectedOutput: {
                disputeRecommended: false,
                confidence: 0.97,
                verdict: 'legitimate_charge',
                reasoning: 'Charge matches contract terms and service usage',
                action: 'accept_charge'
            },
            tags: ['false_positive', 'legitimate_charge', 'validation']
        }
    ],
    forecast_engine: [
        {
            id: 'FORECAST-001',
            description: 'Linear growth forecast over 12 months',
            input: {
                historicalData: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100],
                monthsBack: 12,
                trendType: 'linear',
                growthRate: 0.091,
                provider: 'aws',
                timestamp: Date.now()
            },
            expectedOutput: {
                forecastType: 'linear_growth',
                projectedNextMonth: 2200,
                projectedNextQuarter: 2500,
                confidence: 0.91,
                trendStrength: 'strong',
                growthContinued: true
            },
            tags: ['linear_trend', 'high_confidence', 'standard']
        },
        {
            id: 'FORECAST-002',
            description: 'Seasonal pattern with Q4 spikes',
            input: {
                historicalData: [1000, 1050, 1100, 2000, 1100, 1150, 1200, 2100, 1200, 1250, 1300, 2200],
                monthsBack: 24,
                seasonality: true,
                peakMonths: [4, 8, 12],
                timestamp: Date.now()
            },
            expectedOutput: {
                forecastType: 'seasonal_pattern',
                projectedNextMonth: 1350,
                projectedQ4Spike: 2300,
                confidence: 0.88,
                seasonalPattern: 'strong_q4_spikes',
                seasonalityFactor: 1.85
            },
            tags: ['seasonal_forecast', 'high_confidence', 'pattern_detection']
        },
        {
            id: 'FORECAST-003',
            description: 'Anomalous spike handling in data',
            input: {
                historicalData: [1000, 1050, 1100, 1150, 5000, 1200, 1250, 1300, 1350, 1400],
                monthsBack: 10,
                outlierDetected: true,
                anomalyIndex: 4,
                anomalyValue: 5000,
                timestamp: Date.now()
            },
            expectedOutput: {
                forecastType: 'spike_corrected',
                projectedNextMonth: 1450,
                confidence: 0.87,
                outliersRemoved: 1,
                baselineTrend: 'linear',
                excludedOutliers: [{ index: 4, value: 5000 }]
            },
            tags: ['outlier_handling', 'correction', 'medium_priority']
        },
        {
            id: 'FORECAST-004',
            description: 'New service projection with limited data',
            input: {
                historicalData: [500, 600, 700],
                monthsBack: 3,
                newService: true,
                minimalHistoricalData: true,
                timestamp: Date.now()
            },
            expectedOutput: {
                forecastType: 'low_confidence_projection',
                projectedNextMonth: 800,
                confidence: 0.45,
                dataWarning: 'Insufficient historical data for high-confidence forecast',
                disclaimer: 'Projection based on only 3 months of data; revise after 6-12 months',
                recommendedAction: 'monitor_closely_and_update'
            },
            tags: ['new_service', 'low_confidence', 'caution']
        },
        {
            id: 'FORECAST-005',
            description: 'Cost reduction trend post-optimization',
            input: {
                historicalData: [3000, 2900, 2700, 2500, 2300, 2100, 1900, 1800, 1700, 1600],
                monthsBack: 10,
                optimizationDate: 'month_3',
                declineRate: -0.15,
                timestamp: Date.now()
            },
            expectedOutput: {
                forecastType: 'declining_spend',
                projectedNextMonth: 1500,
                confidence: 0.90,
                trendDirection: 'downward',
                declineRate: 0.15,
                projectedAnnualSavings: 14000,
                optimizationImpact: 'significant'
            },
            tags: ['cost_reduction', 'positive_trend', 'high_confidence']
        }
    ],
    close_pack_generator: [
        {
            id: 'CLOSE-001',
            description: 'Standard monthly close pack generation',
            input: {
                month: '2024-01',
                invoices: [
                    { id: 'INV-001', amount: 5000, provider: 'AWS', status: 'reconciled' },
                    { id: 'INV-002', amount: 3000, provider: 'GCP', status: 'reconciled' },
                    { id: 'INV-003', amount: 2000, provider: 'Azure', status: 'reconciled' }
                ],
                allocations: { costCenter1: 5000, costCenter2: 5000 },
                anomalies: [],
                disputes: [],
                timestamp: Date.now()
            },
            expectedOutput: {
                closePackId: 'CLOSE-2024-01-001',
                status: 'complete',
                totalAmount: 10000,
                invoicesIncluded: 3,
                allocationsVerified: true,
                allSectionsComplete: true,
                generationDate: Date.now(),
                readyForApproval: true
            },
            tags: ['standard_close', 'happy_path', 'complete']
        },
        {
            id: 'CLOSE-002',
            description: 'Close pack with active disputes',
            input: {
                month: '2024-01',
                invoices: [
                    { id: 'INV-001', amount: 5000, provider: 'AWS', status: 'reconciled' },
                    { id: 'INV-004', amount: 500, provider: 'GCP', status: 'disputed' }
                ],
                allocations: { costCenter1: 4500, costCenter2: 1000 },
                disputes: [
                    { disputeId: 'DISP-001', invoiceId: 'INV-004', amount: 500, status: 'pending' }
                ],
                timestamp: Date.now()
            },
            expectedOutput: {
                closePackId: 'CLOSE-2024-01-002',
                status: 'complete_with_disputes',
                totalAmount: 5500,
                recordedAmount: 5000,
                disputedAmount: 500,
                disputesIncluded: 1,
                addendumRequired: true,
                disputeAddendum: {
                    section: 'Pending Disputes',
                    count: 1,
                    totalDisputed: 500
                }
            },
            tags: ['disputes', 'addendum', 'medium_priority']
        },
        {
            id: 'CLOSE-003',
            description: 'Multi-provider close pack',
            input: {
                month: '2024-01',
                providers: ['AWS', 'GCP', 'Azure', 'Datadog', 'New Relic', 'Cloudflare'],
                invoices: [
                    { id: 'INV-001', amount: 5000, provider: 'AWS', status: 'reconciled' },
                    { id: 'INV-002', amount: 3000, provider: 'GCP', status: 'reconciled' },
                    { id: 'INV-003', amount: 2000, provider: 'Azure', status: 'reconciled' },
                    { id: 'INV-004', amount: 800, provider: 'Datadog', status: 'reconciled' },
                    { id: 'INV-005', amount: 600, provider: 'New Relic', status: 'reconciled' },
                    { id: 'INV-006', amount: 300, provider: 'Cloudflare', status: 'reconciled' }
                ],
                allocations: { costCenter1: 7500, costCenter2: 4200 },
                timestamp: Date.now()
            },
            expectedOutput: {
                closePackId: 'CLOSE-2024-01-003',
                status: 'complete',
                totalAmount: 11700,
                providersIncluded: 6,
                providerSegmentation: true,
                sections: [
                    { provider: 'AWS', amount: 5000 },
                    { provider: 'GCP', amount: 3000 },
                    { provider: 'Azure', amount: 2000 },
                    { provider: 'SaaS_Tools', amount: 1700 }
                ]
            },
            tags: ['multi_provider', 'segmentation', 'standard']
        },
        {
            id: 'CLOSE-004',
            description: 'Minimal activity month close pack',
            input: {
                month: '2024-01',
                invoices: [
                    { id: 'INV-001', amount: 100, provider: 'AWS', status: 'reconciled' }
                ],
                allocations: { costCenter1: 100 },
                anomalies: [],
                disputes: [],
                timestamp: Date.now()
            },
            expectedOutput: {
                closePackId: 'CLOSE-2024-01-004',
                status: 'complete',
                totalAmount: 100,
                invoicesIncluded: 1,
                format: 'simplified',
                skipSections: ['detailed_breakdowns', 'trend_analysis'],
                readyForApproval: true
            },
            tags: ['minimal_activity', 'simplified', 'low_complexity']
        },
        {
            id: 'CLOSE-005',
            description: 'Close pack with attestation seal',
            input: {
                month: '2024-01',
                invoices: [
                    { id: 'INV-001', amount: 5000, provider: 'AWS', status: 'reconciled' },
                    { id: 'INV-002', amount: 3000, provider: 'GCP', status: 'reconciled' }
                ],
                allocations: { costCenter1: 8000 },
                closePack: {
                    id: 'CLOSE-2024-01-005',
                    totalAmount: 8000,
                    sections: [],
                    complete: true
                },
                timestamp: Date.now()
            },
            expectedOutput: {
                closePackId: 'CLOSE-2024-01-005',
                status: 'complete',
                attestationGenerated: true,
                attestationHash: true,
                sealGenerated: true,
                signatureRequired: false,
                certificationDetails: {
                    certified: true,
                    certificationDate: Date.now(),
                    auditTrail: 'available'
                }
            },
            tags: ['attestation', 'seal', 'compliance']
        }
    ]
};

// ─── Agent Evaluator Class ───────────────────────────────────────────────────

export class AgentEvaluator {
    /**
     * @param {Object} [config] - Override default configuration
     * @param {Object} [config.benchmarks] - Custom benchmarks per agent type
     * @param {Object} [config.goldenDatasets] - Custom golden datasets
     * @param {Object} [config.metrics] - Metrics configuration
     */
    constructor(config = {}) {
        this.benchmarks = { ...AGENT_BENCHMARKS, ...config.benchmarks };
        this.goldenDatasets = { ...GOLDEN_DATASETS, ...config.goldenDatasets };
        this.metrics = config.metrics || {};
    }

    /**
     * Evaluate an agent against its golden dataset
     * @param {Function} agentFn - The agent function to evaluate
     * @param {string} agentType - Type of agent (anomaly_detection, etc.)
     * @param {Object} [options] - Additional options
     * @returns {Object} Evaluation results with summary and benchmark comparison
     */
    async evaluate(agentFn, agentType, options = {}) {
        if (!this.goldenDatasets[agentType]) {
            throw new Error(`No golden dataset for agent type: ${agentType}`);
        }

        const scenarios = this.goldenDatasets[agentType];
        const results = [];
        const startTime = Date.now();

        logger.info('Starting agent evaluation', {
            agentType,
            scenarioCount: scenarios.length
        });

        for (const scenario of scenarios) {
            const scenarioStart = Date.now();
            let passed = false;
            let actual = null;
            let error = null;

            try {
                actual = await agentFn(scenario.input);
                passed = this._compareResults(actual, scenario.expectedOutput);
            } catch (err) {
                error = err.message;
                passed = false;
            }

            const latency = Date.now() - scenarioStart;
            results.push({
                scenarioId: scenario.id,
                input: scenario.input,
                expected: scenario.expectedOutput,
                actual,
                passed,
                latency,
                error,
                tags: scenario.tags
            });
        }

        const totalDuration = Date.now() - startTime;
        const metrics = this._computeMetrics(results);
        const benchmarkCheck = this._checkBenchmark(agentType, metrics);

        logger.info('Agent evaluation completed', {
            agentType,
            totalScenarios: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length,
            accuracy: metrics.accuracy,
            avgLatency: metrics.avgLatency,
            benchmarkPassed: benchmarkCheck.passed,
            durationMs: totalDuration
        });

        return {
            agentType,
            timestamp: new Date().toISOString(),
            results,
            summary: {
                total: results.length,
                passed: results.filter(r => r.passed).length,
                failed: results.filter(r => !r.passed).length,
                accuracy: metrics.accuracy,
                precision: metrics.precision,
                recall: metrics.recall,
                f1: metrics.f1_score,
                avgLatency: metrics.avgLatency,
                p50Latency: metrics.p50Latency,
                p95Latency: metrics.p95Latency,
                p99Latency: metrics.p99Latency,
                totalDuration
            },
            passedBenchmark: benchmarkCheck.passed,
            benchmarkDetails: benchmarkCheck.details
        };
    }

    /**
     * Compute metrics from evaluation results
     * @private
     */
    _computeMetrics(results) {
        const latencies = results.map(r => r.latency).sort((a, b) => a - b);
        const passed = results.filter(r => r.passed).length;

        let truePositives = 0, falsePositives = 0, falseNegatives = 0, trueNegatives = 0;

        for (const result of results) {
            if (result.passed) {
                truePositives++;
            } else {
                falsePositives++;
                // If expected was false but actual was true, it's a false positive
                // If expected was true but actual was false, it's a false negative
                if (result.expected?.isAnomaly === false && result.actual?.isAnomaly === true) {
                    falsePositives++;
                    truePositives--;
                } else if (result.expected?.isAnomaly === true && result.actual?.isAnomaly === false) {
                    falseNegatives++;
                    falsePositives--;
                }
            }
        }

        const accuracy = passed / results.length;
        const precision = truePositives / (truePositives + falsePositives) || 0;
        const recall = truePositives / (truePositives + falseNegatives) || 0;
        const f1_score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

        return {
            accuracy,
            precision: Math.min(1.0, precision),
            recall: Math.min(1.0, recall),
            f1_score: Math.min(1.0, f1_score),
            avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
            p50Latency: latencies[Math.floor(latencies.length * 0.5)] || 0,
            p95Latency: latencies[Math.floor(latencies.length * 0.95)] || 0,
            p99Latency: latencies[Math.floor(latencies.length * 0.99)] || 0,
            error_rate: (results.filter(r => r.error).length / results.length),
            false_positive_rate: falsePositives / results.length,
            false_negative_rate: falseNegatives / results.length
        };
    }

    /**
     * Compare actual against expected output
     * @private
     */
    _compareResults(actual, expected) {
        if (!actual || !expected) return false;

        // Check main boolean fields
        if (actual.isAnomaly !== undefined && expected.isAnomaly !== undefined) {
            return actual.isAnomaly === expected.isAnomaly;
        }

        // Check status fields
        if (actual.status && expected.status) {
            return actual.status === expected.status ||
                   (actual.status.includes(expected.status) || expected.status.includes(actual.status));
        }

        // Deep comparison for objects
        return JSON.stringify(actual) === JSON.stringify(expected);
    }

    /**
     * Check if metrics pass benchmarks
     * @private
     */
    _checkBenchmark(agentType, metrics) {
        const benchmark = this.benchmarks[agentType];
        if (!benchmark) {
            return { passed: false, details: {} };
        }

        const details = {};
        let passed = true;

        for (const [metricKey, threshold] of Object.entries(benchmark)) {
            const actual = metrics[metricKey];
            const thresholdValue = typeof threshold === 'object' ? threshold.value : threshold;
            const metricPassed = actual !== undefined ? actual >= thresholdValue : true;

            details[metricKey] = {
                threshold: thresholdValue,
                actual: actual !== undefined ? Number(actual.toFixed(4)) : null,
                passed: metricPassed
            };

            if (!metricPassed && metricKey !== 'cost_per_evaluation') {
                passed = false;
            }
        }

        return { passed, details };
    }

    /**
     * Add or extend golden dataset for an agent type
     */
    addGoldenDataset(agentType, scenarios) {
        if (!Array.isArray(scenarios)) {
            throw new Error('Scenarios must be an array');
        }
        if (!this.goldenDatasets[agentType]) {
            this.goldenDatasets[agentType] = [];
        }
        this.goldenDatasets[agentType].push(...scenarios);
    }

    /**
     * Compare two evaluation runs
     */
    compareRuns(runA, runB) {
        const improved = [];
        const regressed = [];
        const unchanged = [];

        const metricsToCompare = [
            'accuracy', 'precision', 'recall', 'f1', 'avgLatency', 'p95Latency'
        ];

        for (const metric of metricsToCompare) {
            const valueA = runA.summary[metric];
            const valueB = runB.summary[metric];

            if (valueA === undefined || valueB === undefined) continue;

            const threshold = metric.includes('Latency') ? -10 : 0.001; // Latency lower is better
            const diff = metric.includes('Latency') ? valueA - valueB : valueB - valueA;

            if (diff > Math.abs(threshold)) {
                improved.push({ metric, before: valueA, after: valueB, diff });
            } else if (diff < -Math.abs(threshold)) {
                regressed.push({ metric, before: valueA, after: valueB, diff });
            } else {
                unchanged.push({ metric, before: valueA, after: valueB });
            }
        }

        return { improved, regressed, unchanged };
    }

    /**
     * Generate evaluation report
     */
    generateReport(evaluationResult) {
        const { summary, benchmarkDetails, agentType } = evaluationResult;
        const recommendations = [];

        // Identify improvement areas
        if (summary.accuracy < 0.90) {
            recommendations.push({
                area: 'accuracy',
                priority: 'high',
                suggestion: 'Review and expand golden dataset; retrain model'
            });
        }

        if (summary.p95Latency > (this.benchmarks[agentType]?.latency_p95 || 5000)) {
            recommendations.push({
                area: 'performance',
                priority: 'medium',
                suggestion: 'Profile agent function; optimize hot paths'
            });
        }

        if (summary.failed > 0) {
            const failedTags = evaluationResult.results
                .filter(r => !r.passed)
                .flatMap(r => r.tags);
            recommendations.push({
                area: 'correctness',
                priority: 'high',
                suggestion: `Fix failing scenarios: ${[...new Set(failedTags)].join(', ')}`
            });
        }

        return {
            agentType,
            timestamp: evaluationResult.timestamp,
            summary,
            benchmarkStatus: {
                passed: evaluationResult.passedBenchmark,
                metrics: benchmarkDetails
            },
            recommendations,
            evaluationUrl: `benchmarks/${agentType}/${new Date(evaluationResult.timestamp).toISOString()}`
        };
    }
}

// ─── Quality Gates Class ──────────────────────────────────────────────────────

export class QualityGates {
    /**
     * @param {Object} [config] - Override default configuration
     * @param {Object} [config.gates] - Custom gate definitions
     * @param {string} [config.level] - Enforcement level (strict, standard, relaxed)
     */
    constructor(config = {}) {
        this.gates = { ...DEFAULT_QUALITY_GATES, ...config.gates };
        this.level = config.level || QUALITY_GATE_LEVELS.STANDARD;
    }

    /**
     * Evaluate test results against quality gates
     * @param {Object} testResults - Test results object
     * @returns {Object} Evaluation result with blocked gates and warnings
     */
    evaluate(testResults) {
        const {
            passRate = 0,
            coverage = 0,
            evaluationAccuracy = 0,
            perfTestsInBudget = true,
            securityIssues = [],
            regressions = []
        } = testResults;

        const gateResults = {};
        const blockers = [];
        const warnings = [];

        // Evaluate each gate
        gateResults.testPassRate = {
            threshold: this.gates.testPassRate.threshold,
            actual: passRate,
            passed: passRate >= this.gates.testPassRate.threshold,
            blocking: this.gates.testPassRate.blocking
        };

        gateResults.coverageMinimum = {
            threshold: this.gates.coverageMinimum.threshold,
            actual: coverage,
            passed: coverage >= this.gates.coverageMinimum.threshold,
            blocking: this.gates.coverageMinimum.blocking
        };

        gateResults.evaluationAccuracy = {
            threshold: this.gates.evaluationAccuracy.threshold,
            actual: evaluationAccuracy,
            passed: evaluationAccuracy >= this.gates.evaluationAccuracy.threshold,
            blocking: this.gates.evaluationAccuracy.blocking
        };

        gateResults.performanceBudget = {
            threshold: this.gates.performanceBudget.threshold,
            actual: perfTestsInBudget ? 1.0 : 0.0,
            passed: perfTestsInBudget,
            blocking: this.gates.performanceBudget.blocking
        };

        const criticalSecurityIssues = securityIssues.filter(
            issue => issue.severity === 'critical' || issue.severity === 'high'
        );

        gateResults.securityScan = {
            threshold: this.gates.securityScan.threshold,
            actual: criticalSecurityIssues.length === 0 ? 1.0 : 0.0,
            passed: criticalSecurityIssues.length === 0,
            blocking: this.gates.securityScan.blocking,
            issues: criticalSecurityIssues
        };

        gateResults.noRegressions = {
            threshold: this.gates.noRegressions.threshold,
            actual: regressions.length === 0 ? 1.0 : 0.0,
            passed: regressions.length === 0,
            blocking: this.gates.noRegressions.blocking,
            regressions: regressions
        };

        // Categorize gate failures based on enforcement level
        for (const [gateName, gateResult] of Object.entries(gateResults)) {
            if (!gateResult.passed) {
                if (gateResult.blocking || this.level === QUALITY_GATE_LEVELS.STRICT) {
                    blockers.push({
                        gate: gateName,
                        threshold: gateResult.threshold,
                        actual: gateResult.actual,
                        description: this.gates[gateName].description
                    });
                } else if (this.level === QUALITY_GATE_LEVELS.STANDARD) {
                    warnings.push({
                        gate: gateName,
                        threshold: gateResult.threshold,
                        actual: gateResult.actual,
                        description: this.gates[gateName].description
                    });
                }
            }
        }

        const passed = blockers.length === 0;

        return {
            passed,
            level: this.level,
            gates: gateResults,
            blockers,
            warnings,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Add a custom quality gate
     */
    addGate(name, config) {
        if (!config.threshold || config.blocking === undefined) {
            throw new Error('Gate config must have threshold and blocking properties');
        }
        this.gates[name] = {
            threshold: config.threshold,
            blocking: config.blocking,
            description: config.description || `Custom gate: ${name}`
        };
    }

    /**
     * Remove a quality gate
     */
    removeGate(name) {
        delete this.gates[name];
    }

    /**
     * Change enforcement level
     */
    setLevel(level) {
        if (!Object.values(QUALITY_GATE_LEVELS).includes(level)) {
            throw new Error(`Invalid level: ${level}`);
        }
        this.level = level;
    }

    /**
     * Get description of all gates and thresholds
     */
    describe() {
        const description = {
            level: this.level,
            gates: {}
        };

        for (const [name, gate] of Object.entries(this.gates)) {
            description.gates[name] = {
                threshold: gate.threshold,
                blocking: gate.blocking,
                description: gate.description
            };
        }

        return description;
    }
}

// ─── Test Orchestrator Class ──────────────────────────────────────────────────

export class TestOrchestrator {
    /**
     * @param {Object} [config] - Override default configuration
     * @param {string[]} [config.suitePatterns] - Glob patterns for test files
     * @param {number} [config.timeout] - Timeout per suite in ms
     * @param {number} [config.parallel] - Number of parallel suite runners
     */
    constructor(config = {}) {
        this.suitePatterns = config.suitePatterns || [
            '**/*.test.js',
            '**/*.spec.js',
            '**/tests/**/*.js'
        ];
        this.timeout = config.timeout || 300000; // 5 minutes
        this.parallel = config.parallel || 4;
        this.suites = new Map();
        this.baseline = null;
    }

    /**
     * Discover test suites on filesystem
     * @param {string} basePath - Base directory to scan
     * @returns {Array} Array of discovered test suites
     */
    async discoverSuites(basePath) {
        const { globSync } = await import('glob');
        const discovered = [];

        for (const pattern of this.suitePatterns) {
            try {
                const files = globSync(pattern, { cwd: basePath, absolute: true });
                for (const file of files) {
                    const name = file.split('/').pop().replace(/\.(test|spec)\.js$/, '');
                    const categoryMatch = file.match(/\/(unit|integration|e2e|performance|security)\//);
                    const category = categoryMatch ? categoryMatch[1] : 'unit';

                    discovered.push({
                        path: file,
                        name,
                        category,
                        estimatedDuration: category === 'e2e' ? 60000 : 10000
                    });
                }
            } catch (err) {
                // Pattern didn't match anything, continue
            }
        }

        return discovered;
    }

    /**
     * Register a test suite manually
     */
    registerSuite(suite) {
        if (!suite.name || !suite.path || !suite.runner) {
            throw new Error('Suite must have name, path, and runner');
        }
        this.suites.set(suite.name, {
            ...suite,
            category: suite.category || TEST_CATEGORIES.UNIT
        });
    }

    /**
     * Run a single test suite
     * @param {string} suitePath - Path to test suite
     * @returns {Object} Test results
     */
    async runSuite(suitePath) {
        const { spawn } = await import('child_process');
        const name = suitePath.split('/').pop();

        return new Promise((resolve) => {
            let output = '';
            let passed = 0, failed = 0, total = 0;

            const proc = spawn('node', ['--test', suitePath], {
                timeout: this.timeout,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            proc.stdout.on('data', (data) => {
                output += data.toString();
                // Parse test output for pass/fail counts
                const passMatch = output.match(/(\d+)\s+pass/);
                const failMatch = output.match(/(\d+)\s+fail/);
                if (passMatch) passed = parseInt(passMatch[1]);
                if (failMatch) failed = parseInt(failMatch[1]);
                total = passed + failed;
            });

            proc.stderr.on('data', (data) => {
                output += data.toString();
            });

            proc.on('close', (code) => {
                resolve({
                    name,
                    path: suitePath,
                    passed: code === 0,
                    tests: { passed, failed, total },
                    duration: 0,
                    output,
                    exitCode: code
                });
            });

            proc.on('error', (err) => {
                resolve({
                    name,
                    path: suitePath,
                    passed: false,
                    tests: { passed, failed, total },
                    duration: 0,
                    output: output + err.message,
                    exitCode: 1
                });
            });
        });
    }

    /**
     * Run all discovered or registered suites
     * @param {Object} [options] - Run options
     * @returns {Object} Aggregated results
     */
    async runAll(options = {}) {
        const { sequential = false } = options;
        const suites = Array.from(this.suites.values());
        const results = [];

        const startTime = Date.now();

        if (sequential) {
            for (const suite of suites) {
                const result = await this.runSuite(suite.path);
                results.push(result);
            }
        } else {
            const batches = [];
            for (let i = 0; i < suites.length; i += this.parallel) {
                const batch = suites.slice(i, i + this.parallel);
                const batchResults = await Promise.all(
                    batch.map(suite => this.runSuite(suite.path))
                );
                results.push(...batchResults);
            }
        }

        const totalDuration = Date.now() - startTime;
        const totalSuites = results.length;
        const totalTests = results.reduce((sum, r) => sum + (r.tests?.total || 0), 0);
        const totalPassed = results.reduce((sum, r) => sum + (r.tests?.passed || 0), 0);
        const totalFailed = results.reduce((sum, r) => sum + (r.tests?.failed || 0), 0);
        const passRate = totalTests > 0 ? totalPassed / totalTests : 1.0;

        return {
            suites: results,
            summary: {
                totalSuites,
                totalTests,
                totalPassed,
                totalFailed,
                duration: totalDuration,
                passRate
            }
        };
    }

    /**
     * Get current test baseline
     */
    getBaseline() {
        return this.baseline;
    }

    /**
     * Save results as new baseline
     */
    saveBaseline(results) {
        this.baseline = {
            timestamp: new Date().toISOString(),
            summary: results.summary,
            suites: results.suites.map(suite => ({
                name: suite.name,
                path: suite.path,
                passed: suite.passed,
                tests: suite.tests
            }))
        };
    }

    /**
     * Detect regressions by comparing current to baseline
     */
    detectRegressions(current, baseline) {
        if (!baseline) {
            return { regressions: [], info: 'No baseline to compare against' };
        }

        const regressions = [];

        // Create maps for easy comparison
        const baselineMap = new Map();
        for (const suite of baseline.suites) {
            baselineMap.set(suite.name, suite);
        }

        for (const currentSuite of current.suites) {
            const baselineSuite = baselineMap.get(currentSuite.name);
            if (!baselineSuite) {
                continue; // New suite, not a regression
            }

            if (baselineSuite.passed && !currentSuite.passed) {
                regressions.push({
                    suite: currentSuite.name,
                    type: 'test_failure',
                    description: `Suite ${currentSuite.name} passed in baseline but failed in current run`,
                    before: { passed: baselineSuite.tests.passed, failed: baselineSuite.tests.failed },
                    after: { passed: currentSuite.tests.passed, failed: currentSuite.tests.failed }
                });
            } else if (baselineSuite.tests.failed < currentSuite.tests.failed) {
                regressions.push({
                    suite: currentSuite.name,
                    type: 'test_count_increase',
                    description: `Failed test count increased from ${baselineSuite.tests.failed} to ${currentSuite.tests.failed}`,
                    before: baselineSuite.tests.failed,
                    after: currentSuite.tests.failed
                });
            }
        }

        return { regressions };
    }
}

// ─── Factory Functions ────────────────────────────────────────────────────────

/**
 * Factory function to create an AgentEvaluator
 */
export function createAgentEvaluator(config = {}) {
    return new AgentEvaluator(config);
}

/**
 * Factory function to create QualityGates
 */
export function createQualityGates(config = {}) {
    return new QualityGates(config);
}

/**
 * Factory function to create TestOrchestrator
 */
export function createTestOrchestrator(config = {}) {
    return new TestOrchestrator(config);
}

// ─── Default Export ───────────────────────────────────────────────────────────

export default {
    // Constants
    EVALUATION_METRICS,
    QUALITY_GATE_LEVELS,
    TEST_CATEGORIES,
    AGENT_BENCHMARKS,
    DEFAULT_QUALITY_GATES,
    GOLDEN_DATASETS,

    // Classes
    AgentEvaluator,
    QualityGates,
    TestOrchestrator,

    // Factories
    createAgentEvaluator,
    createQualityGates,
    createTestOrchestrator
};
