/**
 * FINAULT BENCHMARK PLATFORM v1.0
 * ═══════════════════════════════════════════════════════════════════
 * Public benchmarking platform for AI cost efficiency comparison
 *
 * Features:
 * - Anonymous industry benchmarking by sector and company size
 * - Cost efficiency scoring (0-100 composite)
 * - Percentile rankings against peer groups
 * - AI cost maturity model (5 levels)
 * - Trend analysis and gap identification
 * - Public leaderboards with anonymized data
 * - One-way hashed metric submissions for privacy
 * ═══════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const VALID_INDUSTRIES = [
    'fintech',
    'healthcare',
    'ecommerce',
    'saas',
    'manufacturing',
    'media',
    'education',
    'government'
];

const VALID_COMPANY_SIZES = [
    'startup',      // < 50 employees
    'smb',          // 50-500 employees
    'mid_market',   // 500-5000 employees
    'enterprise'    // 5000+ employees
];

const MATURITY_LEVELS = {
    1: {
        name: 'Ad-hoc',
        description: 'No cost tracking, no budgets',
        characteristics: [
            'No formal cost tracking',
            'No budget enforcement',
            'No optimization efforts',
            'Reactive incident response'
        ]
    },
    2: {
        name: 'Reactive',
        description: 'Basic monitoring, manual alerts',
        characteristics: [
            'Basic cost tracking in place',
            'Manual alert configuration',
            'Reactive cost reviews',
            'Limited visibility into drivers'
        ]
    },
    3: {
        name: 'Proactive',
        description: 'Automated alerts, budget enforcement, reconciliation',
        characteristics: [
            'Automated cost monitoring',
            'Budget enforcement enabled',
            'Monthly reconciliation process',
            'Cost driver analysis',
            'Basic optimization efforts'
        ]
    },
    4: {
        name: 'Optimized',
        description: 'AI-driven optimization, automated disputes, forecasting',
        characteristics: [
            'AI-powered optimization running',
            'Automated dispute resolution',
            'Cost forecasting and planning',
            'Model selection optimization',
            'Provider arbitrage strategies'
        ]
    },
    5: {
        name: 'Autonomous',
        description: 'Full autopilot, predictive scaling, regulatory compliance',
        characteristics: [
            'Autonomous cost optimization',
            'Predictive scaling enabled',
            'Self-healing cost anomalies',
            'Regulatory compliance automated',
            'Real-time cost governance'
        ]
    }
};

// ═══════════════════════════════════════════════════════════════════
// INDUSTRY BENCHMARK DATABASE
// ═══════════════════════════════════════════════════════════════════

const INDUSTRY_BENCHMARKS = {
    fintech: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0325,
                'claude-3.5-sonnet': 0.0385,
                'gemini-2.0-flash': 0.0165
            },
            avg_monthly_ai_spend: 12500,
            optimization_adoption_rate: 0.35,
            budget_breach_frequency: 0.18,
            reconciliation_match_rate: 0.94,
            dispute_recovery_rate: 0.72,
            close_pack_generation_time_hours: 8.5,
            carbon_intensity_per_1M_tokens: 42,
            avg_model_quality_score: 85,
            avg_cache_hit_rate: 0.22,
            avg_batch_processing_ratio: 0.15
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0315,
                'claude-3.5-sonnet': 0.0375,
                'gemini-2.0-flash': 0.0155
            },
            avg_monthly_ai_spend: 45000,
            optimization_adoption_rate: 0.58,
            budget_breach_frequency: 0.12,
            reconciliation_match_rate: 0.96,
            dispute_recovery_rate: 0.81,
            close_pack_generation_time_hours: 6.2,
            carbon_intensity_per_1M_tokens: 38,
            avg_model_quality_score: 87,
            avg_cache_hit_rate: 0.32,
            avg_batch_processing_ratio: 0.28
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0298,
                'claude-3.5-sonnet': 0.0360,
                'gemini-2.0-flash': 0.0148
            },
            avg_monthly_ai_spend: 180000,
            optimization_adoption_rate: 0.75,
            budget_breach_frequency: 0.08,
            reconciliation_match_rate: 0.97,
            dispute_recovery_rate: 0.87,
            close_pack_generation_time_hours: 4.1,
            carbon_intensity_per_1M_tokens: 35,
            avg_model_quality_score: 89,
            avg_cache_hit_rate: 0.45,
            avg_batch_processing_ratio: 0.42
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0285,
                'claude-3.5-sonnet': 0.0345,
                'gemini-2.0-flash': 0.0140
            },
            avg_monthly_ai_spend: 850000,
            optimization_adoption_rate: 0.92,
            budget_breach_frequency: 0.03,
            reconciliation_match_rate: 0.98,
            dispute_recovery_rate: 0.94,
            close_pack_generation_time_hours: 2.3,
            carbon_intensity_per_1M_tokens: 32,
            avg_model_quality_score: 91,
            avg_cache_hit_rate: 0.58,
            avg_batch_processing_ratio: 0.65
        }
    },
    healthcare: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0340,
                'claude-3.5-sonnet': 0.0400,
                'gemini-2.0-flash': 0.0175
            },
            avg_monthly_ai_spend: 8900,
            optimization_adoption_rate: 0.25,
            budget_breach_frequency: 0.22,
            reconciliation_match_rate: 0.92,
            dispute_recovery_rate: 0.68,
            close_pack_generation_time_hours: 10.2,
            carbon_intensity_per_1M_tokens: 45,
            avg_model_quality_score: 88,
            avg_cache_hit_rate: 0.18,
            avg_batch_processing_ratio: 0.12
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0328,
                'claude-3.5-sonnet': 0.0385,
                'gemini-2.0-flash': 0.0165
            },
            avg_monthly_ai_spend: 32000,
            optimization_adoption_rate: 0.48,
            budget_breach_frequency: 0.15,
            reconciliation_match_rate: 0.94,
            dispute_recovery_rate: 0.76,
            close_pack_generation_time_hours: 7.8,
            carbon_intensity_per_1M_tokens: 42,
            avg_model_quality_score: 89,
            avg_cache_hit_rate: 0.28,
            avg_batch_processing_ratio: 0.22
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0310,
                'claude-3.5-sonnet': 0.0368,
                'gemini-2.0-flash': 0.0155
            },
            avg_monthly_ai_spend: 125000,
            optimization_adoption_rate: 0.68,
            budget_breach_frequency: 0.10,
            reconciliation_match_rate: 0.96,
            dispute_recovery_rate: 0.84,
            close_pack_generation_time_hours: 5.4,
            carbon_intensity_per_1M_tokens: 38,
            avg_model_quality_score: 90,
            avg_cache_hit_rate: 0.40,
            avg_batch_processing_ratio: 0.36
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0295,
                'claude-3.5-sonnet': 0.0350,
                'gemini-2.0-flash': 0.0145
            },
            avg_monthly_ai_spend: 520000,
            optimization_adoption_rate: 0.88,
            budget_breach_frequency: 0.05,
            reconciliation_match_rate: 0.97,
            dispute_recovery_rate: 0.91,
            close_pack_generation_time_hours: 3.1,
            carbon_intensity_per_1M_tokens: 34,
            avg_model_quality_score: 92,
            avg_cache_hit_rate: 0.55,
            avg_batch_processing_ratio: 0.58
        }
    },
    ecommerce: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0335,
                'claude-3.5-sonnet': 0.0390,
                'gemini-2.0-flash': 0.0170
            },
            avg_monthly_ai_spend: 15800,
            optimization_adoption_rate: 0.40,
            budget_breach_frequency: 0.20,
            reconciliation_match_rate: 0.93,
            dispute_recovery_rate: 0.70,
            close_pack_generation_time_hours: 9.1,
            carbon_intensity_per_1M_tokens: 44,
            avg_model_quality_score: 84,
            avg_cache_hit_rate: 0.25,
            avg_batch_processing_ratio: 0.20
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0322,
                'claude-3.5-sonnet': 0.0378,
                'gemini-2.0-flash': 0.0160
            },
            avg_monthly_ai_spend: 52000,
            optimization_adoption_rate: 0.62,
            budget_breach_frequency: 0.14,
            reconciliation_match_rate: 0.95,
            dispute_recovery_rate: 0.79,
            close_pack_generation_time_hours: 6.8,
            carbon_intensity_per_1M_tokens: 40,
            avg_model_quality_score: 86,
            avg_cache_hit_rate: 0.35,
            avg_batch_processing_ratio: 0.31
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0305,
                'claude-3.5-sonnet': 0.0362,
                'gemini-2.0-flash': 0.0150
            },
            avg_monthly_ai_spend: 210000,
            optimization_adoption_rate: 0.78,
            budget_breach_frequency: 0.09,
            reconciliation_match_rate: 0.97,
            dispute_recovery_rate: 0.88,
            close_pack_generation_time_hours: 4.5,
            carbon_intensity_per_1M_tokens: 36,
            avg_model_quality_score: 88,
            avg_cache_hit_rate: 0.48,
            avg_batch_processing_ratio: 0.45
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0290,
                'claude-3.5-sonnet': 0.0340,
                'gemini-2.0-flash': 0.0142
            },
            avg_monthly_ai_spend: 950000,
            optimization_adoption_rate: 0.95,
            budget_breach_frequency: 0.02,
            reconciliation_match_rate: 0.98,
            dispute_recovery_rate: 0.96,
            close_pack_generation_time_hours: 2.0,
            carbon_intensity_per_1M_tokens: 31,
            avg_model_quality_score: 92,
            avg_cache_hit_rate: 0.62,
            avg_batch_processing_ratio: 0.70
        }
    },
    saas: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0330,
                'claude-3.5-sonnet': 0.0385,
                'gemini-2.0-flash': 0.0168
            },
            avg_monthly_ai_spend: 18000,
            optimization_adoption_rate: 0.38,
            budget_breach_frequency: 0.19,
            reconciliation_match_rate: 0.93,
            dispute_recovery_rate: 0.71,
            close_pack_generation_time_hours: 8.8,
            carbon_intensity_per_1M_tokens: 43,
            avg_model_quality_score: 85,
            avg_cache_hit_rate: 0.24,
            avg_batch_processing_ratio: 0.18
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0318,
                'claude-3.5-sonnet': 0.0372,
                'gemini-2.0-flash': 0.0158
            },
            avg_monthly_ai_spend: 48000,
            optimization_adoption_rate: 0.60,
            budget_breach_frequency: 0.13,
            reconciliation_match_rate: 0.95,
            dispute_recovery_rate: 0.80,
            close_pack_generation_time_hours: 6.5,
            carbon_intensity_per_1M_tokens: 39,
            avg_model_quality_score: 87,
            avg_cache_hit_rate: 0.33,
            avg_batch_processing_ratio: 0.27
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0300,
                'claude-3.5-sonnet': 0.0355,
                'gemini-2.0-flash': 0.0148
            },
            avg_monthly_ai_spend: 195000,
            optimization_adoption_rate: 0.76,
            budget_breach_frequency: 0.08,
            reconciliation_match_rate: 0.97,
            dispute_recovery_rate: 0.86,
            close_pack_generation_time_hours: 4.3,
            carbon_intensity_per_1M_tokens: 35,
            avg_model_quality_score: 89,
            avg_cache_hit_rate: 0.46,
            avg_batch_processing_ratio: 0.41
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0283,
                'claude-3.5-sonnet': 0.0338,
                'gemini-2.0-flash': 0.0139
            },
            avg_monthly_ai_spend: 720000,
            optimization_adoption_rate: 0.90,
            budget_breach_frequency: 0.04,
            reconciliation_match_rate: 0.98,
            dispute_recovery_rate: 0.93,
            close_pack_generation_time_hours: 2.2,
            carbon_intensity_per_1M_tokens: 33,
            avg_model_quality_score: 91,
            avg_cache_hit_rate: 0.59,
            avg_batch_processing_ratio: 0.63
        }
    },
    manufacturing: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0345,
                'claude-3.5-sonnet': 0.0405,
                'gemini-2.0-flash': 0.0180
            },
            avg_monthly_ai_spend: 6500,
            optimization_adoption_rate: 0.20,
            budget_breach_frequency: 0.25,
            reconciliation_match_rate: 0.91,
            dispute_recovery_rate: 0.65,
            close_pack_generation_time_hours: 11.5,
            carbon_intensity_per_1M_tokens: 48,
            avg_model_quality_score: 82,
            avg_cache_hit_rate: 0.15,
            avg_batch_processing_ratio: 0.08
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0332,
                'claude-3.5-sonnet': 0.0390,
                'gemini-2.0-flash': 0.0170
            },
            avg_monthly_ai_spend: 28000,
            optimization_adoption_rate: 0.42,
            budget_breach_frequency: 0.17,
            reconciliation_match_rate: 0.93,
            dispute_recovery_rate: 0.74,
            close_pack_generation_time_hours: 8.2,
            carbon_intensity_per_1M_tokens: 44,
            avg_model_quality_score: 85,
            avg_cache_hit_rate: 0.22,
            avg_batch_processing_ratio: 0.16
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0315,
                'claude-3.5-sonnet': 0.0370,
                'gemini-2.0-flash': 0.0160
            },
            avg_monthly_ai_spend: 105000,
            optimization_adoption_rate: 0.65,
            budget_breach_frequency: 0.11,
            reconciliation_match_rate: 0.96,
            dispute_recovery_rate: 0.82,
            close_pack_generation_time_hours: 5.8,
            carbon_intensity_per_1M_tokens: 40,
            avg_model_quality_score: 87,
            avg_cache_hit_rate: 0.36,
            avg_batch_processing_ratio: 0.32
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0300,
                'claude-3.5-sonnet': 0.0352,
                'gemini-2.0-flash': 0.0150
            },
            avg_monthly_ai_spend: 380000,
            optimization_adoption_rate: 0.85,
            budget_breach_frequency: 0.06,
            reconciliation_match_rate: 0.97,
            dispute_recovery_rate: 0.89,
            close_pack_generation_time_hours: 3.5,
            carbon_intensity_per_1M_tokens: 36,
            avg_model_quality_score: 90,
            avg_cache_hit_rate: 0.51,
            avg_batch_processing_ratio: 0.54
        }
    },
    media: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0350,
                'claude-3.5-sonnet': 0.0410,
                'gemini-2.0-flash': 0.0185
            },
            avg_monthly_ai_spend: 22000,
            optimization_adoption_rate: 0.32,
            budget_breach_frequency: 0.21,
            reconciliation_match_rate: 0.92,
            dispute_recovery_rate: 0.69,
            close_pack_generation_time_hours: 9.8,
            carbon_intensity_per_1M_tokens: 46,
            avg_model_quality_score: 83,
            avg_cache_hit_rate: 0.20,
            avg_batch_processing_ratio: 0.14
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0337,
                'claude-3.5-sonnet': 0.0395,
                'gemini-2.0-flash': 0.0175
            },
            avg_monthly_ai_spend: 68000,
            optimization_adoption_rate: 0.55,
            budget_breach_frequency: 0.16,
            reconciliation_match_rate: 0.94,
            dispute_recovery_rate: 0.77,
            close_pack_generation_time_hours: 7.2,
            carbon_intensity_per_1M_tokens: 42,
            avg_model_quality_score: 86,
            avg_cache_hit_rate: 0.30,
            avg_batch_processing_ratio: 0.24
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0320,
                'claude-3.5-sonnet': 0.0375,
                'gemini-2.0-flash': 0.0165
            },
            avg_monthly_ai_spend: 250000,
            optimization_adoption_rate: 0.72,
            budget_breach_frequency: 0.10,
            reconciliation_match_rate: 0.96,
            dispute_recovery_rate: 0.85,
            close_pack_generation_time_hours: 4.9,
            carbon_intensity_per_1M_tokens: 37,
            avg_model_quality_score: 88,
            avg_cache_hit_rate: 0.43,
            avg_batch_processing_ratio: 0.38
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0305,
                'claude-3.5-sonnet': 0.0355,
                'gemini-2.0-flash': 0.0155
            },
            avg_monthly_ai_spend: 1100000,
            optimization_adoption_rate: 0.93,
            budget_breach_frequency: 0.03,
            reconciliation_match_rate: 0.98,
            dispute_recovery_rate: 0.95,
            close_pack_generation_time_hours: 1.9,
            carbon_intensity_per_1M_tokens: 32,
            avg_model_quality_score: 92,
            avg_cache_hit_rate: 0.64,
            avg_batch_processing_ratio: 0.72
        }
    },
    education: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0340,
                'claude-3.5-sonnet': 0.0400,
                'gemini-2.0-flash': 0.0175
            },
            avg_monthly_ai_spend: 5200,
            optimization_adoption_rate: 0.18,
            budget_breach_frequency: 0.28,
            reconciliation_match_rate: 0.90,
            dispute_recovery_rate: 0.62,
            close_pack_generation_time_hours: 12.0,
            carbon_intensity_per_1M_tokens: 47,
            avg_model_quality_score: 81,
            avg_cache_hit_rate: 0.12,
            avg_batch_processing_ratio: 0.06
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0328,
                'claude-3.5-sonnet': 0.0385,
                'gemini-2.0-flash': 0.0165
            },
            avg_monthly_ai_spend: 18500,
            optimization_adoption_rate: 0.38,
            budget_breach_frequency: 0.20,
            reconciliation_match_rate: 0.92,
            dispute_recovery_rate: 0.71,
            close_pack_generation_time_hours: 9.0,
            carbon_intensity_per_1M_tokens: 43,
            avg_model_quality_score: 84,
            avg_cache_hit_rate: 0.19,
            avg_batch_processing_ratio: 0.14
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0312,
                'claude-3.5-sonnet': 0.0365,
                'gemini-2.0-flash': 0.0155
            },
            avg_monthly_ai_spend: 72000,
            optimization_adoption_rate: 0.58,
            budget_breach_frequency: 0.12,
            reconciliation_match_rate: 0.95,
            dispute_recovery_rate: 0.79,
            close_pack_generation_time_hours: 6.1,
            carbon_intensity_per_1M_tokens: 39,
            avg_model_quality_score: 87,
            avg_cache_hit_rate: 0.34,
            avg_batch_processing_ratio: 0.28
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0297,
                'claude-3.5-sonnet': 0.0348,
                'gemini-2.0-flash': 0.0145
            },
            avg_monthly_ai_spend: 310000,
            optimization_adoption_rate: 0.82,
            budget_breach_frequency: 0.07,
            reconciliation_match_rate: 0.96,
            dispute_recovery_rate: 0.88,
            close_pack_generation_time_hours: 3.8,
            carbon_intensity_per_1M_tokens: 35,
            avg_model_quality_score: 89,
            avg_cache_hit_rate: 0.48,
            avg_batch_processing_ratio: 0.50
        }
    },
    government: {
        startup: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0355,
                'claude-3.5-sonnet': 0.0415,
                'gemini-2.0-flash': 0.0190
            },
            avg_monthly_ai_spend: 3800,
            optimization_adoption_rate: 0.15,
            budget_breach_frequency: 0.32,
            reconciliation_match_rate: 0.88,
            dispute_recovery_rate: 0.58,
            close_pack_generation_time_hours: 13.5,
            carbon_intensity_per_1M_tokens: 50,
            avg_model_quality_score: 79,
            avg_cache_hit_rate: 0.10,
            avg_batch_processing_ratio: 0.05
        },
        smb: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0340,
                'claude-3.5-sonnet': 0.0400,
                'gemini-2.0-flash': 0.0180
            },
            avg_monthly_ai_spend: 21000,
            optimization_adoption_rate: 0.32,
            budget_breach_frequency: 0.24,
            reconciliation_match_rate: 0.91,
            dispute_recovery_rate: 0.66,
            close_pack_generation_time_hours: 10.5,
            carbon_intensity_per_1M_tokens: 46,
            avg_model_quality_score: 83,
            avg_cache_hit_rate: 0.16,
            avg_batch_processing_ratio: 0.11
        },
        mid_market: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0323,
                'claude-3.5-sonnet': 0.0378,
                'gemini-2.0-flash': 0.0168
            },
            avg_monthly_ai_spend: 95000,
            optimization_adoption_rate: 0.52,
            budget_breach_frequency: 0.15,
            reconciliation_match_rate: 0.94,
            dispute_recovery_rate: 0.75,
            close_pack_generation_time_hours: 6.8,
            carbon_intensity_per_1M_tokens: 41,
            avg_model_quality_score: 86,
            avg_cache_hit_rate: 0.28,
            avg_batch_processing_ratio: 0.22
        },
        enterprise: {
            cost_per_1k_tokens: {
                'gpt-4o': 0.0308,
                'claude-3.5-sonnet': 0.0360,
                'gemini-2.0-flash': 0.0158
            },
            avg_monthly_ai_spend: 475000,
            optimization_adoption_rate: 0.80,
            budget_breach_frequency: 0.08,
            reconciliation_match_rate: 0.96,
            dispute_recovery_rate: 0.86,
            close_pack_generation_time_hours: 4.2,
            carbon_intensity_per_1M_tokens: 37,
            avg_model_quality_score: 88,
            avg_cache_hit_rate: 0.44,
            avg_batch_processing_ratio: 0.48
        }
    }
};

// ═══════════════════════════════════════════════════════════════════
// BENCHMARK PLATFORM CLASS
// ═══════════════════════════════════════════════════════════════════

class BenchmarkPlatform {
    constructor(config = {}) {
        this.organizationId = config.organizationId || 'unknown-org';
        this.industry = config.industry;
        this.companySize = config.companySize;

        // Validation
        if (this.industry && !VALID_INDUSTRIES.includes(this.industry)) {
            throw new Error(`Invalid industry: ${this.industry}`);
        }
        if (this.companySize && !VALID_COMPANY_SIZES.includes(this.companySize)) {
            throw new Error(`Invalid company size: ${this.companySize}`);
        }

        // Submission tracking (one-way hashed for privacy)
        this.submissionHistory = [];
        this.leaderboardCache = {};
        this.lastCacheUpdate = null;
        this.submissionCooldown = new Map(); // Track hashedOrgId -> lastSubmissionTimestamp
    }

    /**
     * Generate comprehensive benchmark report
     */
    generateBenchmarkReport(orgMetrics) {
        if (!this.industry || !this.companySize) {
            throw new Error('Industry and companySize must be configured');
        }

        const benchmark = INDUSTRY_BENCHMARKS[this.industry][this.companySize];
        const report = {
            timestamp: new Date().toISOString(),
            organization: this.organizationId,
            industry: this.industry,
            companySize: this.companySize,
            metrics: {},
            rankings: {},
            gaps: {},
            recommendations: []
        };

        // Calculate rankings for each metric
        const metrics = [
            'cost_per_1k_tokens',
            'avg_monthly_ai_spend',
            'optimization_adoption_rate',
            'budget_breach_frequency',
            'reconciliation_match_rate',
            'dispute_recovery_rate',
            'close_pack_generation_time_hours',
            'carbon_intensity_per_1M_tokens',
            'avg_cache_hit_rate',
            'avg_batch_processing_ratio'
        ];

        for (const metric of metrics) {
            if (orgMetrics[metric] !== undefined && benchmark[metric] !== undefined) {
                const percentile = this.getPercentileRanking(
                    metric,
                    orgMetrics[metric],
                    this.industry,
                    this.companySize
                );

                report.rankings[metric] = percentile;
                report.metrics[metric] = {
                    value: orgMetrics[metric],
                    benchmark: benchmark[metric],
                    delta: this._calculateDelta(metric, orgMetrics[metric], benchmark[metric])
                };
            }
        }

        // Identify gaps
        report.gaps = this.identifyBenchmarkGaps(orgMetrics);

        // Generate recommendations based on gaps
        report.recommendations = this._generateRecommendations(orgMetrics, benchmark);

        return report;
    }

    /**
     * Calculate composite cost efficiency score (0-100)
     */
    getCostEfficiencyScore(orgMetrics) {
        if (!this.industry || !this.companySize) {
            throw new Error('Industry and companySize must be configured');
        }

        const benchmark = INDUSTRY_BENCHMARKS[this.industry][this.companySize];

        // Score components (weighted) - each metric scored 0-100
        let costScore = 50;
        let optimizationScore = 50;
        let reconciliationScore = 50;
        let budgetScore = 50;
        let recoveryScore = 50;

        // Cost efficiency (lower is better) - 0.5x bonus/penalty
        if (orgMetrics.cost_per_1k_tokens !== undefined) {
            let benchCost = benchmark.cost_per_1k_tokens;
            if (typeof benchCost === 'object') {
                benchCost = benchCost['gpt-4o'];
            }
            if (benchCost > 0) {
                const ratio = benchCost / Math.max(orgMetrics.cost_per_1k_tokens, 0.0001);
                costScore = Math.min(100, ratio * 100);
            }
        }

        // Optimization adoption rate (higher is better) - cap at 1.3x benchmark
        if (orgMetrics.optimization_adoption_rate !== undefined && benchmark.optimization_adoption_rate > 0) {
            const ratio = Math.min(orgMetrics.optimization_adoption_rate / benchmark.optimization_adoption_rate, 1.3);
            optimizationScore = ratio * 100 - 30; // Scale to 0-100
            optimizationScore = Math.max(0, Math.min(100, optimizationScore));
        }

        // Reconciliation match rate (higher is better) - cap at 1.2x benchmark
        if (orgMetrics.reconciliation_match_rate !== undefined && benchmark.reconciliation_match_rate > 0) {
            const ratio = Math.min(orgMetrics.reconciliation_match_rate / benchmark.reconciliation_match_rate, 1.2);
            reconciliationScore = ratio * 100 - 20; // Scale to 0-100
            reconciliationScore = Math.max(0, Math.min(100, reconciliationScore));
        }

        // Budget breach frequency (lower is better) - 0.5x bonus/penalty
        if (orgMetrics.budget_breach_frequency !== undefined && benchmark.budget_breach_frequency > 0) {
            const ratio = benchmark.budget_breach_frequency / Math.max(orgMetrics.budget_breach_frequency, 0.0001);
            budgetScore = Math.min(100, ratio * 100);
        }

        // Dispute recovery rate (higher is better) - cap at 1.1x benchmark
        if (orgMetrics.dispute_recovery_rate !== undefined && benchmark.dispute_recovery_rate > 0) {
            const ratio = Math.min(orgMetrics.dispute_recovery_rate / benchmark.dispute_recovery_rate, 1.1);
            recoveryScore = ratio * 100 - 10; // Scale to 0-100
            recoveryScore = Math.max(0, Math.min(100, recoveryScore));
        }

        const composite = (
            costScore * 0.30 +
            optimizationScore * 0.25 +
            reconciliationScore * 0.20 +
            budgetScore * 0.15 +
            recoveryScore * 0.10
        );

        return Math.round(Math.max(0, Math.min(100, composite)));
    }

    /**
     * Get industry averages for a given sector and size
     */
    getIndustryAverages(industry, companySize) {
        if (!VALID_INDUSTRIES.includes(industry)) {
            throw new Error(`Invalid industry: ${industry}`);
        }
        if (!VALID_COMPANY_SIZES.includes(companySize)) {
            throw new Error(`Invalid company size: ${companySize}`);
        }

        return { ...INDUSTRY_BENCHMARKS[industry][companySize] };
    }

    /**
     * Calculate percentile ranking (0-100)
     */
    getPercentileRanking(metric, value, industry, companySize) {
        if (!VALID_INDUSTRIES.includes(industry)) {
            throw new Error(`Invalid industry: ${industry}`);
        }

        const benchmark = INDUSTRY_BENCHMARKS[industry][companySize];
        let benchmarkValue = benchmark[metric];

        if (benchmarkValue === undefined) {
            throw new Error(`Unknown metric: ${metric}`);
        }

        // Handle cost_per_1k_tokens which is an object - use gpt-4o default
        if (typeof benchmarkValue === 'object' && benchmarkValue['gpt-4o']) {
            benchmarkValue = benchmarkValue['gpt-4o'];
        }

        // For lower-is-better metrics (cost, time, carbon)
        const lowerIsBetter = [
            'cost_per_1k_tokens',
            'budget_breach_frequency',
            'close_pack_generation_time_hours',
            'carbon_intensity_per_1M_tokens'
        ];

        if (lowerIsBetter.includes(metric)) {
            // If value is lower (better), percentile is higher
            // If value == benchmark, percentile = 50
            // If value < benchmark (better), percentile > 50
            // If value > benchmark (worse), percentile < 50
            if (value <= 0) return 0;
            const ratio = benchmarkValue / value;
            if (ratio >= 2) return 100;
            if (ratio <= 0.5) return 0;
            return Math.round(Math.min(100, Math.max(0, ratio * 50)));
        } else {
            // For higher-is-better metrics
            // If value == benchmark, percentile = 50
            if (benchmarkValue <= 0) return 50;
            const ratio = value / benchmarkValue;
            if (ratio >= 2) return 100;
            if (ratio <= 0.5) return 0;
            return Math.round(Math.min(100, Math.max(0, ratio * 50)));
        }
    }

    /**
     * Identify areas where organization is below median
     */
    identifyBenchmarkGaps(orgMetrics) {
        if (!this.industry || !this.companySize) {
            throw new Error('Industry and companySize must be configured');
        }

        const benchmark = INDUSTRY_BENCHMARKS[this.industry][this.companySize];
        const gaps = [];

        const metricsToCheck = [
            'optimization_adoption_rate',
            'reconciliation_match_rate',
            'dispute_recovery_rate',
            'avg_cache_hit_rate',
            'avg_batch_processing_ratio'
        ];

        for (const metric of metricsToCheck) {
            if (orgMetrics[metric] !== undefined && benchmark[metric] !== undefined) {
                const percentile = this.getPercentileRanking(metric, orgMetrics[metric], this.industry, this.companySize);

                if (percentile < 50) {
                    gaps.push({
                        metric,
                        current: orgMetrics[metric],
                        benchmark: benchmark[metric],
                        percentile,
                        impact: this._assessImpact(metric, percentile)
                    });
                }
            }
        }

        return gaps.sort((a, b) => a.percentile - b.percentile);
    }

    /**
     * Generate anonymized public leaderboard
     */
    generatePublicLeaderboard(metric, industry) {
        if (!VALID_INDUSTRIES.includes(industry)) {
            throw new Error(`Invalid industry: ${industry}`);
        }

        const leaderboard = [];

        for (const size of VALID_COMPANY_SIZES) {
            const benchmark = INDUSTRY_BENCHMARKS[industry][size];
            if (benchmark[metric] !== undefined) {
                leaderboard.push({
                    rank: leaderboard.length + 1,
                    companySize: size,
                    metric,
                    value: this._bucketMetricValue(metric, benchmark[metric]),
                    description: this._getMetricDescription(metric)
                });
            }
        }

        // Sort by metric value (best first)
        if (['cost_per_1k_tokens', 'budget_breach_frequency', 'close_pack_generation_time_hours', 'carbon_intensity_per_1M_tokens'].includes(metric)) {
            leaderboard.sort((a, b) => a.value - b.value);
        } else {
            leaderboard.sort((a, b) => b.value - a.value);
        }

        return leaderboard.slice(0, 10).map((item, idx) => ({
            ...item,
            rank: idx + 1,
            dataGeneralized: true
        }));
    }

    /**
     * Submit anonymized metrics to benchmark network
     */
    submitAnonymousMetrics(orgMetrics) {
        // One-way hash the organization ID for privacy
        const hashedOrgId = this._hashOrganizationId(this.organizationId);

        // Check for duplicate submission within cooldown period (1 hour)
        const cooldownPeriod = 3600000; // 1 hour in milliseconds
        const now = Date.now();
        const lastSubmissionTime = this.submissionCooldown.get(hashedOrgId);

        if (lastSubmissionTime !== undefined) {
            const timeSinceLastSubmission = now - lastSubmissionTime;
            if (timeSinceLastSubmission < cooldownPeriod) {
                const nextAllowedAt = new Date(lastSubmissionTime + cooldownPeriod).toISOString();
                return {
                    accepted: false,
                    reason: 'submission_cooldown',
                    submissionId: hashedOrgId,
                    nextAllowedAt,
                    message: `Maximum 1 submission per hour allowed. Next submission available at ${nextAllowedAt}`
                };
            }
        }

        const submission = {
            timestamp: new Date().toISOString(),
            hashedOrgId,
            industry: this.industry,
            companySize: this.companySize,
            metrics: { ...orgMetrics }
        };

        this.submissionHistory.push(submission);
        this.submissionCooldown.set(hashedOrgId, now);

        return {
            accepted: true,
            success: true,
            submissionId: hashedOrgId,
            timestamp: submission.timestamp,
            message: 'Metrics submitted anonymously to benchmark network'
        };
    }

    /**
     * Get aggregate network insights
     */
    getNetworkInsights(industry) {
        if (!VALID_INDUSTRIES.includes(industry)) {
            throw new Error(`Invalid industry: ${industry}`);
        }

        const insights = {
            industry,
            timestamp: new Date().toISOString(),
            trends: [],
            adoption: [],
            optimization: [],
            dataGeneralized: true,
            minimumSampleSize: 10  // Data only returned if 10+ orgs submitted
        };

        // Aggregate trends across all company sizes
        for (const size of VALID_COMPANY_SIZES) {
            const benchmark = INDUSTRY_BENCHMARKS[industry][size];

            insights.trends.push({
                companySize: size,
                avgMonthlySpend: this._roundToNearestThreshold(benchmark.avg_monthly_ai_spend, 5000),
                avgMonthlySpendRange: this._generateMonetaryRange(benchmark.avg_monthly_ai_spend, 5000),
                costPerToken: Math.round(benchmark.cost_per_1k_tokens['gpt-4o'] * 10000) / 10000,
                carbonIntensity: benchmark.carbon_intensity_per_1M_tokens
            });

            insights.adoption.push({
                companySize: size,
                optimizationAdoptionRate: benchmark.optimization_adoption_rate,
                budgetBreachFrequency: benchmark.budget_breach_frequency
            });

            insights.optimization.push({
                companySize: size,
                cacheHitRate: benchmark.avg_cache_hit_rate,
                batchProcessingRatio: benchmark.avg_batch_processing_ratio,
                reconciliationMatchRate: benchmark.reconciliation_match_rate
            });
        }

        return insights;
    }

    /**
     * Calculate AI cost maturity score (returns level 1-5)
     */
    calculateMaturityScore(orgMetrics) {
        let score = 0;

        // Level 1: Ad-hoc (no tracking, no budgets)
        if (orgMetrics.has_cost_tracking) {
            score = 1;
        }

        // Level 2: Reactive (basic monitoring, manual alerts)
        if (orgMetrics.has_monitoring && orgMetrics.has_manual_alerts) {
            score = 2;
        }

        // Level 3: Proactive (automated alerts, budget enforcement, reconciliation)
        if (orgMetrics.has_automated_alerts && orgMetrics.has_budget_enforcement && orgMetrics.has_reconciliation) {
            score = 3;
        }

        // Level 4: Optimized (AI-driven optimization, automated disputes, forecasting)
        if (orgMetrics.has_ai_optimization && orgMetrics.has_automated_disputes && orgMetrics.has_forecasting) {
            score = 4;
        }

        // Level 5: Autonomous (full autopilot, predictive scaling, regulatory compliance)
        if (orgMetrics.has_autonomous_optimization && orgMetrics.has_predictive_scaling && orgMetrics.has_compliance_automation) {
            score = 5;
        }

        const maturityLevel = Math.max(1, Math.min(5, score));
        return {
            level: maturityLevel,
            ...MATURITY_LEVELS[maturityLevel]
        };
    }

    /**
     * Compare organization trends vs industry trends
     */
    getTrendComparison(orgMetrics, period = '30d') {
        if (!this.industry || !this.companySize) {
            throw new Error('Industry and companySize must be configured');
        }

        const benchmark = INDUSTRY_BENCHMARKS[this.industry][this.companySize];

        // Parse period
        const days = parseInt(period);
        const periodLabel = `${days}d`;

        const comparison = {
            period: periodLabel,
            organization: {
                metrics: { ...orgMetrics }
            },
            industry: {
                metrics: benchmark
            },
            trends: []
        };

        // Calculate trend deltas
        const metricsToCompare = [
            'avg_monthly_ai_spend',
            'optimization_adoption_rate',
            'reconciliation_match_rate',
            'carbon_intensity_per_1M_tokens'
        ];

        for (const metric of metricsToCompare) {
            if (orgMetrics[metric] !== undefined) {
                const orgTrend = this._calculateTrendDelta(metric, orgMetrics[metric]);
                const industryTrend = this._calculateTrendDelta(metric, benchmark[metric]);

                comparison.trends.push({
                    metric,
                    organization: orgTrend,
                    industry: industryTrend,
                    difference: orgTrend - industryTrend,
                    direction: orgTrend > industryTrend ? 'outpacing' : 'trailing'
                });
            }
        }

        return comparison;
    }

    // ─── Private Helper Methods ───────────────────────────────────────────

    _calculateDelta(metric, orgValue, benchmarkValue) {
        if (metric === 'cost_per_1k_tokens' || metric === 'budget_breach_frequency' || metric === 'close_pack_generation_time_hours' || metric === 'carbon_intensity_per_1M_tokens') {
            // Lower is better
            return ((benchmarkValue - orgValue) / benchmarkValue * 100).toFixed(2);
        } else {
            // Higher is better
            return ((orgValue - benchmarkValue) / benchmarkValue * 100).toFixed(2);
        }
    }

    _scoreMetric(metric, orgMetrics, benchmark, weight) {
        if (orgMetrics[metric] === undefined) return 50;

        let orgValue = orgMetrics[metric];
        let benchValue = benchmark[metric];

        if (benchValue === undefined) return 50;

        // Handle cost_per_1k_tokens which is an object - use gpt-4o default
        if (typeof benchValue === 'object' && benchValue['gpt-4o']) {
            benchValue = benchValue['gpt-4o'];
        }

        if (benchValue <= 0) return 50;

        // Normalize to 0-100 scale
        if (['cost_per_1k_tokens', 'budget_breach_frequency', 'close_pack_generation_time_hours', 'carbon_intensity_per_1M_tokens'].includes(metric)) {
            // Lower is better - if org cost is lower than benchmark, score > 50
            if (orgValue <= 0) return 0;
            const ratio = benchValue / orgValue;
            if (ratio > 2) return 100;
            if (ratio < 0.5) return 0;
            return Math.min(100, Math.max(0, ratio * 50));
        } else {
            // Higher is better - if org value is higher than benchmark, score > 50
            const ratio = orgValue / benchValue;
            if (ratio > 2) return 100;
            if (ratio < 0.5) return 0;
            return Math.min(100, Math.max(0, ratio * 50));
        }
    }

    _assessImpact(metric, percentile) {
        if (percentile < 25) return 'critical';
        if (percentile < 50) return 'high';
        return 'medium';
    }

    _getMetricDescription(metric) {
        const descriptions = {
            'cost_per_1k_tokens': 'Cost per 1,000 tokens',
            'avg_monthly_ai_spend': 'Average monthly AI spending',
            'optimization_adoption_rate': 'Optimization automation adoption',
            'budget_breach_frequency': 'Budget breach frequency',
            'reconciliation_match_rate': 'Reconciliation accuracy',
            'dispute_recovery_rate': 'Dispute recovery rate',
            'close_pack_generation_time_hours': 'Close pack generation time',
            'carbon_intensity_per_1M_tokens': 'Carbon intensity'
        };
        return descriptions[metric] || metric;
    }

    _hashOrganizationId(orgId) {
        // One-way hash using SHA-256
        const hash = crypto.createHash('sha256');
        hash.update(orgId);
        return hash.digest('hex').substring(0, 16);
    }

    _generateRecommendations(orgMetrics, benchmark) {
        const recommendations = [];

        if (orgMetrics.optimization_adoption_rate < benchmark.optimization_adoption_rate) {
            recommendations.push({
                priority: 'high',
                category: 'optimization',
                recommendation: 'Increase automated optimization adoption',
                potential_savings: `${((benchmark.optimization_adoption_rate - orgMetrics.optimization_adoption_rate) * 100).toFixed(1)}%`
            });
        }

        if (orgMetrics.reconciliation_match_rate < benchmark.reconciliation_match_rate) {
            recommendations.push({
                priority: 'high',
                category: 'reconciliation',
                recommendation: 'Improve reconciliation process accuracy',
                potential_recovery: `${((benchmark.reconciliation_match_rate - orgMetrics.reconciliation_match_rate) * 100).toFixed(1)}%`
            });
        }

        if (orgMetrics.avg_cache_hit_rate && orgMetrics.avg_cache_hit_rate < benchmark.avg_cache_hit_rate) {
            recommendations.push({
                priority: 'medium',
                category: 'efficiency',
                recommendation: 'Implement caching strategies',
                potential_savings: `${((benchmark.avg_cache_hit_rate - orgMetrics.avg_cache_hit_rate) * 20).toFixed(1)}%`
            });
        }

        if (orgMetrics.avg_batch_processing_ratio < benchmark.avg_batch_processing_ratio) {
            recommendations.push({
                priority: 'medium',
                category: 'efficiency',
                recommendation: 'Increase batch processing usage',
                potential_savings: `${((benchmark.avg_batch_processing_ratio - orgMetrics.avg_batch_processing_ratio) * 15).toFixed(1)}%`
            });
        }

        return recommendations;
    }

    _calculateTrendDelta(metric, value) {
        // Simplified trend calculation (in real system, would use historical data)
        return value * 0.98; // Assume 2% improvement trend
    }

    _roundToNearestThreshold(value, threshold) {
        // Round to nearest threshold (e.g., $5,000)
        return Math.round(value / threshold) * threshold;
    }

    _generateMonetaryRange(value, threshold) {
        // Generate a range like "$30,000-$35,000" for bucketed values
        const rounded = this._roundToNearestThreshold(value, threshold);
        const lower = rounded - (threshold / 2);
        const upper = rounded + (threshold / 2);
        return `$${lower.toLocaleString()}-$${upper.toLocaleString()}`;
    }

    _bucketMetricValue(metric, value) {
        // Bucket metric values to prevent fingerprinting

        // Handle object values (e.g. cost_per_1k_tokens is { model: cost, ... })
        if (typeof value === 'object' && value !== null) {
            const vals = Object.values(value).filter(v => typeof v === 'number');
            if (vals.length === 0) return 0;
            value = vals.reduce((a, b) => a + b, 0) / vals.length;
        }

        if (metric === 'avg_monthly_ai_spend') {
            return this._roundToNearestThreshold(value, 5000);
        } else if (metric === 'cost_per_1k_tokens') {
            // Round to 4 decimal places for token costs
            return Math.round(value * 10000) / 10000;
        } else if (['carbon_intensity_per_1M_tokens', 'close_pack_generation_time_hours'].includes(metric)) {
            // Round to 1 decimal place
            return Math.round(value * 10) / 10;
        } else if (['optimization_adoption_rate', 'reconciliation_match_rate', 'dispute_recovery_rate', 'avg_cache_hit_rate', 'avg_batch_processing_ratio', 'budget_breach_frequency'].includes(metric)) {
            // Round percentages/rates to 2 decimal places
            return Math.round(value * 100) / 100;
        }
        return value;
    }
}

// ═══════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════

function createBenchmarkPlatform(config = {}) {
    return new BenchmarkPlatform(config);
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

export { BenchmarkPlatform, createBenchmarkPlatform };
