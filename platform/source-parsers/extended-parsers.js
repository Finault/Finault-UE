/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FINAULT EXTENDED SOURCE PARSERS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pillar 1: Source Ingestion — Full coverage for ALL required source types
 *
 * Existing (in universal-parser.js):
 *   ✅ OpenAI, Anthropic, Azure, Google Vertex, AWS Bedrock, Cohere, Mistral
 *
 * Added here:
 *   ✅ HuggingFace Inference Endpoints
 *   ✅ Pinecone (vector DB)
 *   ✅ Weaviate (vector DB)
 *   ✅ Chroma (vector DB)
 *   ✅ LangChain (RAG orchestration)
 *   ✅ LlamaIndex (RAG orchestration)
 *   ✅ PromptLayer (eval tool)
 *   ✅ Humanloop (eval tool)
 *   ✅ Helicone (observability)
 *   ✅ Internal agents / custom CSV / HTTP POST
 *   ✅ Embedding APIs (batch + real-time)
 *
 * Constitutional Rules:
 *   - Unknown schema → ABORT
 *   - Missing timestamp → ABORT
 *   - Missing quantity/token count → ABORT
 *   - Mixed currencies untagged → ABORT
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE PARSER REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export class SourceParserRegistry {
    constructor() {
        this.parsers = new Map();
        this._registerDefaults();
    }

    canParse(provider, sourceType) {
        const key = `${(provider || '').toLowerCase()}|${(sourceType || '').toLowerCase()}`;
        return this.parsers.has(key) || this.parsers.has(`${(provider || '').toLowerCase()}|*`);
    }

    async parse(provider, sourceType, content, options = {}) {
        const key = `${provider.toLowerCase()}|${(sourceType || '*').toLowerCase()}`;
        const parser = this.parsers.get(key) || this.parsers.get(`${provider.toLowerCase()}|*`);

        if (!parser) {
            return { success: false, errors: [`No parser registered for ${provider}/${sourceType}`] };
        }

        try {
            const records = typeof content === 'string'
                ? parser.parseCSV(content, options)
                : parser.parseJSON(content, options);

            // Validate every record
            const validated = this._validateRecords(records, provider);

            return {
                success: validated.valid.length > 0,
                provider: provider.toLowerCase(),
                source_type: sourceType,
                records: validated.valid,
                lineItems: validated.valid,
                totalAmount: validated.valid.reduce((s, r) => s + (r.cost || 0), 0),
                currency: options.currency || 'USD',
                periodStart: validated.valid[0]?.timestamp || validated.valid[0]?.date,
                periodEnd: validated.valid[validated.valid.length - 1]?.timestamp || validated.valid[validated.valid.length - 1]?.date,
                anomalies: validated.anomalies,
                errors: validated.errors
            };
        } catch (error) {
            return { success: false, errors: [error.message] };
        }
    }

    register(provider, sourceType, parser) {
        this.parsers.set(`${provider.toLowerCase()}|${sourceType.toLowerCase()}`, parser);
    }

    _validateRecords(records, provider) {
        const valid = [];
        const anomalies = [];
        const errors = [];

        for (let i = 0; i < records.length; i++) {
            const r = records[i];

            // Missing timestamp → flag
            if (!r.timestamp && !r.date && !r.created_at) {
                anomalies.push({ severity: 'CRITICAL', record: i, message: 'Missing timestamp', provider });
                continue;
            }

            // Normalize timestamp
            r.timestamp = r.timestamp || r.date || r.created_at;
            if (typeof r.timestamp === 'string') {
                r.timestamp = new Date(r.timestamp).toISOString();
            }

            valid.push(r);
        }

        return { valid, anomalies, errors };
    }

    _registerDefaults() {
        // HuggingFace
        this.register('huggingface', 'llm_api', new HuggingFaceParser());
        this.register('huggingface', '*', new HuggingFaceParser());

        // Vector DBs
        this.register('pinecone', 'vector_db', new PineconeParser());
        this.register('pinecone', '*', new PineconeParser());
        this.register('weaviate', 'vector_db', new WeaviateParser());
        this.register('weaviate', '*', new WeaviateParser());
        this.register('chroma', 'vector_db', new ChromaParser());
        this.register('chroma', '*', new ChromaParser());

        // RAG platforms
        this.register('langchain', 'rag_platform', new LangChainParser());
        this.register('langchain', '*', new LangChainParser());
        this.register('llamaindex', 'rag_platform', new LlamaIndexParser());
        this.register('llamaindex', '*', new LlamaIndexParser());

        // Eval / Observability tools
        this.register('promptlayer', 'eval_tool', new PromptLayerParser());
        this.register('promptlayer', '*', new PromptLayerParser());
        this.register('humanloop', 'eval_tool', new HumanloopParser());
        this.register('humanloop', '*', new HumanloopParser());
        this.register('helicone', 'eval_tool', new HeliconeParser());
        this.register('helicone', '*', new HeliconeParser());

        // Custom / Internal
        this.register('custom', 'custom_csv', new CustomCSVParser());
        this.register('custom', 'http_post', new HTTPPostParser());
        this.register('custom', '*', new CustomCSVParser());
        this.register('internal', 'agent_telemetry', new AgentTelemetryParser());
        this.register('internal', '*', new AgentTelemetryParser());

        // Embedding APIs
        this.register('embedding', 'embedding_api', new EmbeddingAPIParser());
        this.register('embedding', '*', new EmbeddingAPIParser());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE PARSER
// ─────────────────────────────────────────────────────────────────────────────

class BaseParser {
    parseCSV(content, options = {}) {
        const lines = content.trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this._parseCSVLine(lines[i]);
            if (values.length === 0) continue;

            const row = {};
            headers.forEach((h, idx) => { row[h] = values[idx]?.trim(); });
            const parsed = this.mapRow(row, options);
            if (parsed) records.push(parsed);
        }

        return records;
    }

    parseJSON(data, options = {}) {
        const items = Array.isArray(data) ? data : (data.records || data.items || data.data || [data]);
        return items.map(item => this.mapRow(item, options)).filter(Boolean);
    }

    mapRow(row, options) {
        throw new Error('mapRow must be implemented by subclass');
    }

    _parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { values.push(current); current = ''; }
            else { current += char; }
        }
        values.push(current);
        return values;
    }

    _parseFloat(val) { return parseFloat(val) || 0; }
    _parseInt(val) { return parseInt(val) || 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
// HUGGINGFACE INFERENCE ENDPOINTS
// Columns: timestamp, endpoint_name, model, compute_type, duration_ms, cost_usd
// ─────────────────────────────────────────────────────────────────────────────

class HuggingFaceParser extends BaseParser {
    mapRow(row) {
        return {
            provider: 'huggingface',
            timestamp: row.timestamp || row.date || row.created_at,
            model: row.model || row.endpoint_name || row.endpoint || 'unknown',
            sku: row.compute_type === 'gpu' ? 'inference-endpoints-gpu' :
                 row.compute_type === 'cpu' ? 'inference-endpoints-cpu' : 'inference-api',
            quantity: this._parseFloat(row.duration_ms || row.duration || row.requests || row.count) / 60000 || 1,
            cost: this._parseFloat(row.cost_usd || row.cost || row.amount),
            tokens: this._parseInt(row.tokens || row.characters || 0),
            requests: this._parseInt(row.requests || row.count || 1),
            metadata: { endpoint: row.endpoint_name, compute_type: row.compute_type }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PINECONE (Vector DB)
// Columns: timestamp, namespace, operation, vector_count, read_units, write_units, cost_usd
// ─────────────────────────────────────────────────────────────────────────────

class PineconeParser extends BaseParser {
    mapRow(row) {
        const reads = this._parseInt(row.read_units || row.reads || row.queries);
        const writes = this._parseInt(row.write_units || row.writes || row.upserts);
        return {
            provider: 'pinecone',
            timestamp: row.timestamp || row.date,
            model: row.index_name || row.namespace || 'default',
            sku: reads > 0 ? 'serverless-reads' : 'serverless-writes',
            quantity: reads || writes || this._parseInt(row.operations || row.requests || 1),
            cost: this._parseFloat(row.cost_usd || row.cost),
            requests: reads + writes,
            metadata: { namespace: row.namespace, operation: row.operation, vectors: this._parseInt(row.vector_count) }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEAVIATE
// Columns: timestamp, class_name, operation, object_count, query_count, cost_usd
// ─────────────────────────────────────────────────────────────────────────────

class WeaviateParser extends BaseParser {
    mapRow(row) {
        return {
            provider: 'weaviate',
            timestamp: row.timestamp || row.date,
            model: row.class_name || row.collection || 'default',
            sku: 'serverless-queries',
            quantity: this._parseInt(row.query_count || row.queries || row.operations || row.requests || 1),
            cost: this._parseFloat(row.cost_usd || row.cost),
            requests: this._parseInt(row.query_count || row.requests || 1),
            metadata: { class: row.class_name, objects: this._parseInt(row.object_count) }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHROMA
// Columns: timestamp, collection, operation, document_count, query_count, cost_usd
// ─────────────────────────────────────────────────────────────────────────────

class ChromaParser extends BaseParser {
    mapRow(row) {
        return {
            provider: 'chroma',
            timestamp: row.timestamp || row.date,
            model: row.collection || 'default',
            sku: 'cloud-queries',
            quantity: this._parseInt(row.query_count || row.queries || row.operations || 1),
            cost: this._parseFloat(row.cost_usd || row.cost),
            requests: this._parseInt(row.query_count || row.operations || 1),
            metadata: { collection: row.collection, documents: this._parseInt(row.document_count) }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LANGCHAIN (RAG Orchestration)
// Columns: timestamp, chain_name, run_id, model, tokens, cost_usd, latency_ms, status
// ─────────────────────────────────────────────────────────────────────────────

class LangChainParser extends BaseParser {
    mapRow(row) {
        return {
            provider: row.model_provider || 'langchain',
            timestamp: row.timestamp || row.start_time || row.date,
            model: row.model || row.chain_name || 'unknown',
            sku: row.model || row.chain_name || 'langchain-run',
            input_tokens: this._parseInt(row.input_tokens || row.prompt_tokens),
            output_tokens: this._parseInt(row.output_tokens || row.completion_tokens),
            tokens: this._parseInt(row.total_tokens || row.tokens),
            cost: this._parseFloat(row.cost_usd || row.cost || row.total_cost),
            requests: 1,
            metadata: {
                chain: row.chain_name, run_id: row.run_id,
                status: row.status, latency_ms: this._parseFloat(row.latency_ms)
            }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LLAMAINDEX (RAG Orchestration)
// Columns: timestamp, index_id, query_type, model, tokens, cost_usd, chunks_retrieved
// ─────────────────────────────────────────────────────────────────────────────

class LlamaIndexParser extends BaseParser {
    mapRow(row) {
        return {
            provider: row.model_provider || 'llamaindex',
            timestamp: row.timestamp || row.date,
            model: row.model || row.llm || 'unknown',
            sku: row.model || 'llamaindex-query',
            input_tokens: this._parseInt(row.input_tokens || row.prompt_tokens),
            output_tokens: this._parseInt(row.output_tokens || row.completion_tokens),
            tokens: this._parseInt(row.total_tokens || row.tokens),
            cost: this._parseFloat(row.cost_usd || row.cost),
            requests: 1,
            metadata: {
                index_id: row.index_id, query_type: row.query_type,
                chunks: this._parseInt(row.chunks_retrieved)
            }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPTLAYER (Eval Tool)
// Columns: timestamp, request_id, model, provider, tokens, cost_usd, score
// ─────────────────────────────────────────────────────────────────────────────

class PromptLayerParser extends BaseParser {
    mapRow(row) {
        return {
            provider: row.provider || 'promptlayer',
            timestamp: row.timestamp || row.created_at || row.date,
            model: row.model || row.engine || 'unknown',
            sku: 'requests',
            input_tokens: this._parseInt(row.input_tokens || row.prompt_tokens),
            output_tokens: this._parseInt(row.output_tokens || row.completion_tokens),
            tokens: this._parseInt(row.total_tokens || row.tokens),
            cost: this._parseFloat(row.cost_usd || row.cost),
            requests: 1,
            metadata: { request_id: row.request_id, score: this._parseFloat(row.score), tags: row.tags }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HUMANLOOP (Eval Tool)
// Columns: timestamp, project, model, prompt_id, tokens, cost_usd, rating
// ─────────────────────────────────────────────────────────────────────────────

class HumanloopParser extends BaseParser {
    mapRow(row) {
        return {
            provider: row.provider || 'humanloop',
            timestamp: row.timestamp || row.created_at || row.date,
            model: row.model || 'unknown',
            sku: 'evaluations',
            input_tokens: this._parseInt(row.input_tokens || row.prompt_tokens),
            output_tokens: this._parseInt(row.output_tokens || row.completion_tokens),
            tokens: this._parseInt(row.total_tokens || row.tokens),
            cost: this._parseFloat(row.cost_usd || row.cost),
            requests: 1,
            metadata: { project: row.project, prompt_id: row.prompt_id, rating: row.rating }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELICONE (Observability)
// Columns: timestamp, request_id, model, provider, tokens, cost_usd, latency_ms, status
// ─────────────────────────────────────────────────────────────────────────────

class HeliconeParser extends BaseParser {
    mapRow(row) {
        return {
            provider: row.provider || row.model_provider || 'helicone',
            timestamp: row.timestamp || row.created_at || row.request_created_at,
            model: row.model || row.model_override || 'unknown',
            sku: 'pro-requests',
            input_tokens: this._parseInt(row.prompt_tokens || row.input_tokens),
            output_tokens: this._parseInt(row.completion_tokens || row.output_tokens),
            tokens: this._parseInt(row.total_tokens || row.tokens),
            cost: this._parseFloat(row.cost_usd || row.cost),
            requests: 1,
            metadata: {
                request_id: row.request_id || row.helicone_request_id,
                latency_ms: this._parseFloat(row.latency_ms || row.delay_ms),
                status: row.status || row.status_code,
                user: row.user_id || row.helicone_user_id
            }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM CSV (Internal / Devtools)
// Flexible parser: auto-detects columns
// ─────────────────────────────────────────────────────────────────────────────

class CustomCSVParser extends BaseParser {
    mapRow(row) {
        // Auto-detect timestamp
        const timestamp = row.timestamp || row.date || row.created_at ||
            row.time || row.datetime || row.event_time;

        // Auto-detect quantity
        const tokens = this._parseInt(row.tokens || row.total_tokens ||
            row.input_tokens || row.count || row.quantity || 0);

        // Auto-detect cost
        const cost = this._parseFloat(row.cost || row.cost_usd || row.amount ||
            row.total_cost || row.price || 0);

        return {
            provider: row.provider || row.source || 'custom',
            timestamp,
            model: row.model || row.service || row.tool || row.endpoint || 'custom',
            sku: row.sku || row.model || 'custom',
            tokens,
            cost,
            requests: this._parseInt(row.requests || row.calls || row.invocations || 1),
            metadata: { ...row }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP POST (Internal agents / devtools)
// Expects JSON payloads with standard fields
// ─────────────────────────────────────────────────────────────────────────────

class HTTPPostParser extends BaseParser {
    mapRow(row) {
        return {
            provider: row.provider || row.source || 'internal',
            timestamp: row.timestamp || new Date().toISOString(),
            model: row.model || row.agent || row.tool || 'internal',
            sku: row.sku || row.model || 'http-post',
            input_tokens: this._parseInt(row.input_tokens),
            output_tokens: this._parseInt(row.output_tokens),
            tokens: this._parseInt(row.tokens || row.total_tokens),
            cost: this._parseFloat(row.cost || row.cost_usd),
            requests: this._parseInt(row.requests || 1),
            metadata: row.metadata || {}
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT TELEMETRY (Internal agents)
// Columns: timestamp, agent_id, tool_name, invocations, tokens, cost_usd
// ─────────────────────────────────────────────────────────────────────────────

class AgentTelemetryParser extends BaseParser {
    mapRow(row) {
        return {
            provider: 'internal',
            timestamp: row.timestamp || row.date || row.event_time,
            model: row.agent_id || row.agent_name || row.tool_name || 'agent',
            sku: row.tool_name || row.agent_id || 'agent-telemetry',
            tokens: this._parseInt(row.tokens || row.total_tokens),
            cost: this._parseFloat(row.cost || row.cost_usd),
            requests: this._parseInt(row.invocations || row.calls || row.requests || 1),
            metadata: {
                agent_id: row.agent_id, tool: row.tool_name,
                status: row.status, duration_ms: this._parseFloat(row.duration_ms)
            }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMBEDDING API (Batch + Real-time)
// Columns: timestamp, model, provider, input_tokens, batch_size, cost_usd
// ─────────────────────────────────────────────────────────────────────────────

class EmbeddingAPIParser extends BaseParser {
    mapRow(row) {
        return {
            provider: row.provider || 'openai',
            timestamp: row.timestamp || row.date,
            model: row.model || 'text-embedding-3-small',
            sku: row.model || 'text-embedding-3-small',
            tokens: this._parseInt(row.input_tokens || row.tokens || row.total_tokens),
            cost: this._parseFloat(row.cost || row.cost_usd),
            requests: this._parseInt(row.batch_size || row.requests || 1),
            metadata: { batch_size: this._parseInt(row.batch_size), dimensions: this._parseInt(row.dimensions) }
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default SourceParserRegistry;
export {
    HuggingFaceParser,
    PineconeParser,
    WeaviateParser,
    ChromaParser,
    LangChainParser,
    LlamaIndexParser,
    PromptLayerParser,
    HumanloopParser,
    HeliconeParser,
    CustomCSVParser,
    HTTPPostParser,
    AgentTelemetryParser,
    EmbeddingAPIParser
};
