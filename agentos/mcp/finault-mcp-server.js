/**
 * FINAULT MCP SERVER
 * Model Context Protocol server exposing all Finault capabilities
 *
 * This allows any MCP-compatible AI agent (Claude, GPT, etc.)
 * to use Finault as a tool.
 *
 * Run with: node finault-mcp-server.js
 * Connect via: mcp://localhost:3001
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import * as finaultTools from '../tools/finault-tools.js';

// Create MCP Server
const server = new Server(
    {
        name: 'finault-mcp-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Define available tools
const FINAULT_TOOLS = [
    {
        name: 'finault_analyze_costs',
        description: 'Analyze AI costs for a specific time period. Returns spending breakdown by provider, model, project, or team. Use this when the user asks about their AI spending, costs, or wants to see a breakdown.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                start_date: {
                    type: 'string',
                    description: 'Start date (YYYY-MM-DD)'
                },
                end_date: {
                    type: 'string',
                    description: 'End date (YYYY-MM-DD)'
                },
                group_by: {
                    type: 'string',
                    enum: ['provider', 'model', 'project', 'team', 'day'],
                    description: 'How to group the results',
                    default: 'provider'
                }
            },
            required: ['organization_id', 'start_date', 'end_date']
        }
    },
    {
        name: 'finault_detect_anomalies',
        description: 'Detect spending anomalies using statistical analysis (Z-score, IQR, EWMA, CUSUM). Use this when the user asks about unusual spending, spikes, or wants to find cost issues.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                lookback_days: {
                    type: 'number',
                    description: 'Number of days to analyze',
                    default: 30
                },
                sensitivity: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Anomaly detection sensitivity',
                    default: 'medium'
                }
            },
            required: ['organization_id']
        }
    },
    {
        name: 'finault_find_optimizations',
        description: 'Find cost optimization opportunities. Use this when the user wants to reduce costs, find savings, or optimize their AI spending.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                min_savings: {
                    type: 'number',
                    description: 'Minimum monthly savings to consider ($)',
                    default: 100
                },
                categories: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optimization categories: model_switch, caching, rate_limiting, reserved_capacity'
                }
            },
            required: ['organization_id']
        }
    },
    {
        name: 'finault_apply_optimization',
        description: 'Apply a specific cost optimization. Requires user confirmation.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                user_id: {
                    type: 'string',
                    description: 'User ID applying the optimization'
                },
                optimization_id: {
                    type: 'string',
                    description: 'ID of the optimization to apply'
                },
                confirmed: {
                    type: 'boolean',
                    description: 'User has confirmed this action'
                }
            },
            required: ['organization_id', 'optimization_id', 'confirmed']
        }
    },
    {
        name: 'finault_forecast_costs',
        description: 'Predict future AI costs based on historical patterns. Use this when the user asks about future spending, budget planning, or cost projections.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                months_ahead: {
                    type: 'number',
                    description: 'Number of months to forecast',
                    default: 3
                },
                scenario: {
                    type: 'string',
                    enum: ['baseline', 'growth', 'optimized'],
                    description: 'Forecast scenario',
                    default: 'baseline'
                }
            },
            required: ['organization_id']
        }
    },
    {
        name: 'finault_generate_report',
        description: 'Generate a Close Pack executive report. Use this when the user needs a comprehensive cost report, executive summary, or CFO-ready documentation.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                report_type: {
                    type: 'string',
                    enum: ['monthly', 'quarterly', 'annual', 'custom'],
                    description: 'Type of report'
                },
                start_date: {
                    type: 'string',
                    description: 'Custom report start date (YYYY-MM-DD)'
                },
                end_date: {
                    type: 'string',
                    description: 'Custom report end date (YYYY-MM-DD)'
                },
                include_sections: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Sections to include: summary, breakdown, anomalies, optimizations, forecast, recommendations'
                }
            },
            required: ['organization_id', 'report_type']
        }
    },
    {
        name: 'finault_allocate_costs',
        description: 'Allocate costs according to policy rules. Use this when the user needs to distribute costs across teams, projects, or cost centers.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                period: {
                    type: 'string',
                    description: 'Period to allocate (YYYY-MM)'
                },
                policy_id: {
                    type: 'string',
                    description: 'Allocation policy ID to use'
                },
                preview: {
                    type: 'boolean',
                    description: 'Preview only, dont apply',
                    default: true
                }
            },
            required: ['organization_id', 'period']
        }
    },
    {
        name: 'finault_check_policies',
        description: 'Check for policy violations and compliance status. Use this when the user asks about budget compliance, policy violations, or governance status.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                policy_types: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Policy types to check: budget, model_usage, rate_limit, approval_required'
                }
            },
            required: ['organization_id']
        }
    },
    {
        name: 'finault_search_knowledge',
        description: 'Search the knowledge base for AI pricing, best practices, or industry benchmarks. Use this when the user asks about pricing, optimization strategies, or wants to compare against benchmarks.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query'
                },
                knowledge_type: {
                    type: 'string',
                    enum: ['pricing', 'best_practice', 'benchmark', 'all'],
                    description: 'Type of knowledge to search',
                    default: 'all'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'finault_parse_invoice',
        description: 'Parse and process an AI invoice or bill from any provider. Use this when the user uploads or shares an invoice document.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: {
                    type: 'string',
                    description: 'Organization ID'
                },
                invoice_data: {
                    type: 'string',
                    description: 'Invoice data (base64 encoded or raw text)'
                },
                provider: {
                    type: 'string',
                    description: 'Provider name (optional, will auto-detect)'
                }
            },
            required: ['organization_id', 'invoice_data']
        }
    },
    {
        name: 'finault_time_machine_sync',
        description: 'Pull complete historical AI usage data from providers (OpenAI, Anthropic). This reconstructs the full financial history going back up to 12 months. Use when the user wants to see their historical AI spend or run a Time Machine analysis.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: { type: 'string', description: 'Organization ID' },
                providers: {
                    type: 'object',
                    description: 'Map of provider name to {api_key}. E.g. {"openai": {"api_key": "sk-admin-..."}}'
                },
                stripe_key: { type: 'string', description: 'Stripe API key for revenue matching (optional)' }
            },
            required: ['organization_id', 'providers']
        }
    },
    {
        name: 'finault_time_machine_analyze',
        description: 'Run the AI Financial Time Machine analysis. Computes what the company SHOULD have spent using optimal models, batch processing, caching, and cross-provider arbitrage. Returns alternate timeline, savings breakdown, customer impact, and Finault Score. Use when the user asks "how much could I have saved?" or "what should I have spent?"',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: { type: 'string', description: 'Organization ID' },
                period_start: { type: 'string', description: 'Analysis start date (YYYY-MM-DD, optional)' },
                period_end: { type: 'string', description: 'Analysis end date (YYYY-MM-DD, optional)' },
                cross_provider: { type: 'boolean', description: 'Include cross-provider arbitrage analysis', default: false }
            },
            required: ['organization_id']
        }
    },
    {
        name: 'finault_time_machine_customer_impact',
        description: 'Get per-customer margin impact from Time Machine analysis. Shows which customers are profitable, which are underwater, and how margins would improve with optimization. Use when the user asks about customer profitability or AI cost per customer.',
        inputSchema: {
            type: 'object',
            properties: {
                organization_id: { type: 'string', description: 'Organization ID' },
                analysis_id: { type: 'string', description: 'Specific analysis ID (optional, uses latest)' }
            },
            required: ['organization_id']
        }
    }
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: FINAULT_TOOLS
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        let result;

        switch (name) {
            case 'finault_analyze_costs':
                result = await finaultTools.analyzeCosts(args.organization_id, {
                    start_date: args.start_date,
                    end_date: args.end_date,
                    group_by: args.group_by
                });
                break;

            case 'finault_detect_anomalies':
                result = await finaultTools.detectAnomalies(args.organization_id, {
                    lookback_days: args.lookback_days,
                    sensitivity: args.sensitivity
                });
                break;

            case 'finault_find_optimizations':
                result = await finaultTools.findOptimizations(args.organization_id, {
                    min_savings: args.min_savings,
                    categories: args.categories
                });
                break;

            case 'finault_apply_optimization':
                result = await finaultTools.applyOptimization(
                    args.organization_id,
                    args.user_id,
                    {
                        optimization_id: args.optimization_id,
                        confirmed: args.confirmed
                    }
                );
                break;

            case 'finault_forecast_costs':
                result = await finaultTools.forecastCosts(args.organization_id, {
                    months_ahead: args.months_ahead,
                    scenario: args.scenario
                });
                break;

            case 'finault_generate_report':
                result = await finaultTools.generateReport(args.organization_id, {
                    report_type: args.report_type,
                    start_date: args.start_date,
                    end_date: args.end_date,
                    include_sections: args.include_sections
                });
                break;

            case 'finault_allocate_costs':
                result = await finaultTools.allocateCosts(args.organization_id, {
                    period: args.period,
                    policy_id: args.policy_id,
                    preview: args.preview
                });
                break;

            case 'finault_check_policies':
                result = await finaultTools.checkPolicies(args.organization_id, {
                    policy_types: args.policy_types
                });
                break;

            case 'finault_search_knowledge':
                result = await finaultTools.searchKnowledge({
                    query: args.query,
                    knowledge_type: args.knowledge_type
                });
                break;

            case 'finault_parse_invoice':
                // TODO: Implement invoice parsing
                result = {
                    success: true,
                    message: 'Invoice parsing would process the uploaded document',
                    parsed_data: {
                        provider: args.provider || 'auto-detected',
                        status: 'pending_implementation'
                    }
                };
                break;

            case 'finault_time_machine_sync':
                result = await finaultTools.timeMachineSync(args.organization_id, {
                    providers: args.providers,
                    stripe_key: args.stripe_key
                });
                break;

            case 'finault_time_machine_analyze':
                result = await finaultTools.timeMachineAnalyze(args.organization_id, {
                    period_start: args.period_start,
                    period_end: args.period_end,
                    cross_provider: args.cross_provider
                });
                break;

            case 'finault_time_machine_customer_impact':
                result = await finaultTools.timeMachineCustomerImpact(args.organization_id, {
                    analysis_id: args.analysis_id
                });
                break;

            default:
                throw new Error(`Unknown tool: ${name}`);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };

    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        error: true,
                        message: error.message
                    })
                }
            ],
            isError: true
        };
    }
});

// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Finault MCP Server running on stdio');
}

main().catch(console.error);

export default server;
