/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT PACK TYPES — Pillar 8: Explicit Close Classes
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Each pack type is built from the same primitives but produces different
 * artifact sets. All packs are sealed, immutable, and replayable by Close ID.
 *
 * Pack Types:
 *   1. Invoice Close Pack (FIN-CL-*)
 *   2. URS — Usage Reconciliation Statement (FIN-URS-*)
 *   3. Infra Spend Close Pack (FIN-INFRA-*)
 *   4. Agent Tooling Pack (FIN-AGENT-*)
 *   5. ERP Receipt Pack (FIN-ERP-*)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// PACK TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const PACK_TYPES = {
    invoice_close: {
        id: 'invoice_close',
        prefix: 'FIN-CL',
        displayName: 'Invoice Close Pack',
        description: 'Model API invoice reconciliation and close',
        requiredInputs: ['invoice_files', 'pricing_ruleset'],
        requiredArtifacts: [
            'executive_summary.pdf',
            'journal_entry.csv',
            'close_certificate.pdf',
            'variance_addendum.csv',
            'manifest.json',
            'normalized_totals.csv',
            'drift_summary.csv',
            'fcs.json',
            'history.json'
        ],
        optionalArtifacts: ['anchor_receipt.json', 'usage_exports/'],
        validate(input) {
            if (!input.content && !input.invoiceFiles) {
                return { valid: false, error: 'Invoice files required' };
            }
            return { valid: true };
        }
    },

    urs_close: {
        id: 'urs_close',
        prefix: 'FIN-URS',
        displayName: 'Usage Reconciliation Statement',
        description: 'Raw usage logs reconciled against pricing rules',
        requiredInputs: ['usage_logs', 'pricing_ruleset'],
        requiredArtifacts: [
            'urs_statement.pdf',
            'journal_entry.csv',
            'manifest.json',
            'close_certificate.pdf',
            'normalized_totals.csv',
            'fcs.json'
        ],
        optionalArtifacts: ['anchor_receipt.json', 'drift_summary.csv'],
        validate(input) {
            if (!input.content && !input.usageLogs) {
                return { valid: false, error: 'Usage logs required' };
            }
            return { valid: true };
        }
    },

    infra_spend: {
        id: 'infra_spend',
        prefix: 'FIN-INFRA',
        displayName: 'Infra Spend Close Pack',
        description: 'Vector DB, embeddings, and eval infrastructure costs',
        requiredInputs: ['infra_usage_logs'],
        requiredArtifacts: [
            'reconciliation.csv',
            'drift_summary.csv',
            'variance_addendum.csv',
            'journal_entry.csv',
            'manifest.json',
            'fcs.json'
        ],
        optionalArtifacts: ['anchor_receipt.json', 'eval_results.csv'],
        validate(input) {
            if (!input.content && !input.infraLogs) {
                return { valid: false, error: 'Infrastructure usage logs required' };
            }
            return { valid: true };
        }
    },

    agent_tooling: {
        id: 'agent_tooling',
        prefix: 'FIN-AGENT',
        displayName: 'Agent Tooling Pack',
        description: 'Agent telemetry and tool usage close',
        requiredInputs: ['agent_telemetry'],
        requiredArtifacts: [
            'tooling_close_summary.pdf',
            'normalized_totals.csv',
            'fcs.json',
            'manifest.json',
            'journal_entry.csv'
        ],
        optionalArtifacts: ['anchor_receipt.json', 'tool_usage_detail.csv'],
        validate(input) {
            if (!input.content && !input.agentTelemetry) {
                return { valid: false, error: 'Agent telemetry data required' };
            }
            return { valid: true };
        }
    },

    erp_receipt: {
        id: 'erp_receipt',
        prefix: 'FIN-ERP',
        displayName: 'ERP Receipt Pack',
        description: 'Proof of ERP posting with variance reconciliation',
        requiredInputs: ['erp_document_receipt'],
        requiredArtifacts: [
            'erp_post_receipt.json',
            'erp_variance.csv',
            'manifest.json'
        ],
        optionalArtifacts: ['anchor_receipt.json'],
        validate(input) {
            if (!input.erpReceipt && !input.closeId) {
                return { valid: false, error: 'ERP document receipt or Close ID required' };
            }
            return { valid: true };
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PACK TYPE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export class PackTypeRegistry {
    constructor() {
        this.types = new Map(Object.entries(PACK_TYPES));
    }

    get(packType) {
        const type = this.types.get(packType);
        if (!type) {
            throw new Error(
                `Unknown pack type: "${packType}". ` +
                `Valid types: ${this.listTypes().join(', ')}`
            );
        }
        return type;
    }

    validate(packType, input) {
        const type = this.get(packType);
        return type.validate(input);
    }

    getRequiredArtifacts(packType) {
        return this.get(packType).requiredArtifacts;
    }

    getPrefix(packType) {
        return this.get(packType).prefix;
    }

    listTypes() {
        return Array.from(this.types.keys());
    }

    toJSON() {
        const result = {};
        for (const [key, type] of this.types) {
            result[key] = {
                id: type.id,
                prefix: type.prefix,
                displayName: type.displayName,
                description: type.description,
                requiredInputs: type.requiredInputs,
                requiredArtifacts: type.requiredArtifacts
            };
        }
        return result;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default PackTypeRegistry;
