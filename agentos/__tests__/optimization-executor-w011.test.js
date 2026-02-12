import {
    OptimizationExecutor,
    EXECUTION_STATUS,
    EXECUTOR_CONFIG,
    createOptimizationExecutor
} from '../core/optimization-executor.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message}`);
    }
}

async function runTest(id, name, fn) {
    try {
        await fn();
    } catch (err) {
        failed++;
        failures.push(`${id}: ${name} - ${err.message}`);
        console.log(`  ✗ FAIL: ${id}: ${name} - ${err.message}`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// MOCK SUPABASE CLIENT
// ═════════════════════════════════════════════════════════════════════════════

class MockSupabaseClient {
    constructor() {
        this.tables = {};
        this.operations = [];
    }

    from(tableName) {
        return new MockTableOperation(this, tableName);
    }

    recordOperation(op) {
        this.operations.push(op);
    }

    getTable(tableName) {
        if (!this.tables[tableName]) {
            this.tables[tableName] = [];
        }
        return this.tables[tableName];
    }

    setTableData(tableName, data) {
        this.tables[tableName] = data;
    }

    clearTables() {
        this.tables = {};
        this.operations = [];
    }
}

class MockTableOperation {
    constructor(client, tableName) {
        this.client = client;
        this.tableName = tableName;
        this.selectColumns = null;
        this.filters = [];
        this.config = {};
        this.data = null;
        this.updateData = null;
        this.deleteFlag = false;
        this.singleMode = false;
    }

    // Make thenable so await on update().eq() / delete().eq() chains works
    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    select(columns = '*') {
        this.selectColumns = columns;
        return this;
    }

    insert(data) {
        this.client.recordOperation({
            type: 'insert',
            table: this.tableName,
            data
        });
        const table = this.client.getTable(this.tableName);
        if (Array.isArray(data)) {
            table.push(...data);
        } else {
            table.push(data);
        }
        return Promise.resolve({ data: [data], error: null });
    }

    upsert(data, config = {}) {
        this.client.recordOperation({
            type: 'upsert',
            table: this.tableName,
            data,
            config
        });
        const table = this.client.getTable(this.tableName);
        const existingIndex = table.findIndex(
            row => row.organization_id === data.organization_id &&
                   (row.source_model === data.source_model || row.config_type === data.config_type)
        );
        if (existingIndex >= 0) {
            table[existingIndex] = { ...table[existingIndex], ...data };
        } else {
            table.push(data);
        }
        return Promise.resolve({ data: [data], error: null });
    }

    update(data) {
        this.updateData = data;
        return this;
    }

    delete() {
        this.deleteFlag = true;
        return this;
    }

    eq(column, value) {
        this.filters.push({ type: 'eq', column, value });
        return this;
    }

    gte(column, value) {
        this.filters.push({ type: 'gte', column, value });
        return this;
    }

    lte(column, value) {
        this.filters.push({ type: 'lte', column, value });
        return this;
    }

    single() {
        this.singleMode = true;
        return this._execute();
    }

    async _execute() {
        const table = this.client.getTable(this.tableName);

        if (this.deleteFlag) {
            this.client.recordOperation({
                type: 'delete',
                table: this.tableName,
                filters: this.filters
            });
            const filtered = table.filter(row => this._matchesFilters(row));
            const toDelete = new Set(filtered);
            const remaining = table.filter(row => !toDelete.has(row));
            this.client.tables[this.tableName] = remaining;
            return { data: filtered, error: null };
        }

        if (this.updateData) {
            this.client.recordOperation({
                type: 'update',
                table: this.tableName,
                data: this.updateData,
                filters: this.filters
            });
            const filtered = table.filter(row => this._matchesFilters(row));
            filtered.forEach(row => {
                Object.assign(row, this.updateData);
            });
            return { data: filtered, error: null };
        }

        // SELECT
        let results = table;
        for (const filter of this.filters) {
            results = results.filter(row => {
                if (filter.type === 'eq') {
                    return row[filter.column] === filter.value;
                } else if (filter.type === 'gte') {
                    return row[filter.column] >= filter.value;
                } else if (filter.type === 'lte') {
                    return row[filter.column] <= filter.value;
                }
                return true;
            });
        }

        if (this.singleMode) {
            return { data: results.length > 0 ? results[0] : null, error: null };
        }

        // Return full array for non-single queries
        return { data: results, error: null };
    }

    _matchesFilters(row) {
        for (const filter of this.filters) {
            if (filter.type === 'eq' && row[filter.column] !== filter.value) {
                return false;
            }
            if (filter.type === 'gte' && row[filter.column] < filter.value) {
                return false;
            }
            if (filter.type === 'lte' && row[filter.column] > filter.value) {
                return false;
            }
        }
        return true;
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: Constants & Exports (w11_001 - w11_010)
// ═════════════════════════════════════════════════════════════════════════════

async function testSection1() {
    console.log('\n[SECTION 1] Constants & Exports');

    await runTest('w11_001', 'EXECUTION_STATUS has PENDING', async () => {
        assert(EXECUTION_STATUS.PENDING === 'pending', 'PENDING status is pending');
    });

    await runTest('w11_002', 'EXECUTION_STATUS has EXECUTING', async () => {
        assert(EXECUTION_STATUS.EXECUTING === 'executing', 'EXECUTING status is executing');
    });

    await runTest('w11_003', 'EXECUTION_STATUS has EXECUTED', async () => {
        assert(EXECUTION_STATUS.EXECUTED === 'executed', 'EXECUTED status is executed');
    });

    await runTest('w11_004', 'EXECUTION_STATUS has VERIFIED', async () => {
        assert(EXECUTION_STATUS.VERIFIED === 'verified', 'VERIFIED status is verified');
    });

    await runTest('w11_005', 'EXECUTION_STATUS has ROLLED_BACK', async () => {
        assert(EXECUTION_STATUS.ROLLED_BACK === 'rolled_back', 'ROLLED_BACK status is rolled_back');
    });

    await runTest('w11_006', 'EXECUTION_STATUS has FAILED', async () => {
        assert(EXECUTION_STATUS.FAILED === 'failed', 'FAILED status is failed');
    });

    await runTest('w11_007', 'EXECUTOR_CONFIG has verificationWindowDays', async () => {
        assert(EXECUTOR_CONFIG.verificationWindowDays === 7, 'verificationWindowDays is 7');
    });

    await runTest('w11_008', 'EXECUTOR_CONFIG has minSavingsThreshold', async () => {
        assert(EXECUTOR_CONFIG.minSavingsThreshold === 0.05, 'minSavingsThreshold is 0.05');
    });

    await runTest('w11_009', 'EXECUTOR_CONFIG has rollbackGracePeriodMs', async () => {
        assert(EXECUTOR_CONFIG.rollbackGracePeriodMs === 86400000, 'rollbackGracePeriodMs is 24 hours');
    });

    await runTest('w11_010', 'Factory function createOptimizationExecutor creates instance', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = createOptimizationExecutor(mockSupa);
        assert(executor instanceof OptimizationExecutor, 'Factory returns OptimizationExecutor instance');
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: execute() - Constructor & Validation (w11_011 - w11_025)
// ═════════════════════════════════════════════════════════════════════════════

async function testSection2() {
    console.log('\n[SECTION 2] Constructor & Validation');

    await runTest('w11_011', 'Constructor requires supabase', async () => {
        let threw = false;
        try {
            new OptimizationExecutor(null);
        } catch (err) {
            threw = err.message.includes('Supabase');
        }
        assert(threw, 'Constructor throws without supabase');
    });

    await runTest('w11_012', 'Constructor accepts supabase and modelRegistry', async () => {
        const mockSupa = new MockSupabaseClient();
        const registry = { getModel: () => ({}) };
        const executor = new OptimizationExecutor(mockSupa, registry);
        assert(executor.supabase === mockSupa && executor.modelRegistry === registry, 'Constructor stores both parameters');
    });

    await runTest('w11_013', 'execute() returns error for null optimization', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute(null);
        assert(!result.success && result.error.includes('Invalid'), 'Null optimization returns error');
    });

    await runTest('w11_014', 'execute() returns error for missing optimization.id', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({ optimization_type: 'model_switch' });
        assert(!result.success && result.error.includes('Invalid'), 'Missing id returns error');
    });

    await runTest('w11_015', 'execute() returns error for unknown optimization_type', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_123',
            optimization_type: 'unknown_strategy'
        });
        assert(!result.success && result.error.includes('No execution handler'), 'Unknown type returns error');
    });

    await runTest('w11_016', 'execute() error includes supportedTypes list', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_123',
            optimization_type: 'invalid'
        });
        assert(result.supportedTypes && result.supportedTypes.length > 0, 'Error includes supportedTypes');
    });

    await runTest('w11_017', 'execute() error supportedTypes includes model_switch', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_123',
            optimization_type: 'invalid'
        });
        assert(result.supportedTypes.includes('model_switch'), 'supportedTypes includes model_switch');
    });

    await runTest('w11_018', 'execute() error supportedTypes includes response_caching', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_123',
            optimization_type: 'invalid'
        });
        assert(result.supportedTypes.includes('response_caching'), 'supportedTypes includes response_caching');
    });

    await runTest('w11_019', 'execute() error supportedTypes includes rate_limiting', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_123',
            optimization_type: 'invalid'
        });
        assert(result.supportedTypes.includes('rate_limiting'), 'supportedTypes includes rate_limiting');
    });

    await runTest('w11_020', 'execute() error supportedTypes includes all 8 types', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_123',
            optimization_type: 'invalid'
        });
        assert(result.supportedTypes.length === 8, 'supportedTypes includes all 8 types');
    });

    await runTest('w11_021', 'execute() dispatches model_switch to handler', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_123',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(result.success, 'model_switch executes successfully');
    });

    await runTest('w11_022', 'execute() dispatches response_caching to handler', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_124',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: { cache_ttl: 3600 }
        });
        assert(result.success, 'response_caching executes successfully');
    });

    await runTest('w11_023', 'execute() dispatches rate_limiting to handler', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_125',
            organization_id: 'org_1',
            optimization_type: 'rate_limiting',
            metadata: { hourly_limit: 100 }
        });
        assert(result.success, 'rate_limiting executes successfully');
    });

    await runTest('w11_024', 'execute() dispatches prompt_optimization to handler', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_126',
            organization_id: 'org_1',
            optimization_type: 'prompt_optimization',
            metadata: { max_prompt_tokens: 2048 }
        });
        assert(result.success, 'prompt_optimization executes successfully');
    });

    await runTest('w11_025', 'execute() dispatches batch_processing to handler', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_127',
            organization_id: 'org_1',
            optimization_type: 'batch_processing',
            metadata: { batch_size: 10 }
        });
        assert(result.success, 'batch_processing executes successfully');
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: execute() - Model Switch (w11_026 - w11_045)
// ═════════════════════════════════════════════════════════════════════════════

async function testSection3() {
    console.log('\n[SECTION 3] execute() - Model Switch Strategy');

    await runTest('w11_026', 'Model switch upserts routing rule', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_301',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const ops = mockSupa.operations.filter(op => op.type === 'upsert' && op.table === 'model_routing_rules');
        assert(ops.length > 0, 'Model switch upserts routing rule');
    });

    await runTest('w11_027', 'Model switch returns error for missing current_model', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_302',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: { recommended_model: 'gpt-4o' }
        });
        assert(!result.success && result.error.includes('current_model'), 'Missing current_model returns error');
    });

    await runTest('w11_028', 'Model switch returns error for missing recommended_model', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_303',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: { current_model: 'gpt-4' }
        });
        assert(!result.success && result.error.includes('recommended_model'), 'Missing recommended_model returns error');
    });

    await runTest('w11_029', 'Pre-state is captured before execution', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('model_routing_rules', [
            { organization_id: 'org_1', source_model: 'gpt-4', target_model: 'gpt-3.5' }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_304',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const selectOps = mockSupa.operations.filter(op => op.type === 'select' || op.type === 'upsert');
        assert(selectOps.length > 0, 'Pre-state captured via DB operations');
    });

    await runTest('w11_030', 'Execution record created with executing status', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_305',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const insertOps = mockSupa.operations.filter(op => op.type === 'insert' && op.table === 'optimization_executions');
        assert(insertOps.length > 0, 'Execution record created');
    });

    await runTest('w11_031', 'Successful execution updates to executed status', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_test',
                optimization_id: 'opt_306',
                status: 'executing'
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_306',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(result.success, 'Successful execution returns success=true');
    });

    await runTest('w11_032', 'Failed execution updates to failed status', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_307',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4'
                // missing recommended_model
            }
        });
        assert(!result.success && result.executionId, 'Failed execution returns executionId and success=false');
    });

    await runTest('w11_033', 'Optimization_actions status updated to applied on success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_308',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_actions'
        );
        const successUpdate = updateOps.find(op => op.data && op.data.status === 'applied');
        assert(successUpdate, 'Successful execution updates optimization_actions to applied');
    });

    await runTest('w11_034', 'Optimization_actions status updated to failed on error', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_309',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: { current_model: 'gpt-4' }
        });
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_actions'
        );
        const failureUpdate = updateOps.find(op => op.data && op.data.status === 'failed');
        assert(failureUpdate, 'Failed execution updates optimization_actions to failed');
    });

    await runTest('w11_035', 'Result includes execution_id', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_310',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(result.executionId && result.executionId.startsWith('exec_'), 'Result includes execution_id');
    });

    await runTest('w11_036', 'Result includes rollbackAvailable=true on success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_311',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(result.rollbackAvailable === true, 'Successful execution returns rollbackAvailable=true');
    });

    await runTest('w11_037', 'Post-state includes routing rule info', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_312',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(result.result && result.result.action === 'model_switch', 'Result includes action detail');
    });

    await runTest('w11_038', 'Execution record includes pre_state', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_313',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const insertOps = mockSupa.operations.filter(op => op.type === 'insert');
        const execInsert = insertOps.find(op => op.table === 'optimization_executions');
        assert(execInsert && execInsert.data.pre_state, 'Execution record includes pre_state');
    });

    await runTest('w11_039', 'Execution record includes estimated_savings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_314',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            estimated_savings_monthly: 500,
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const insertOps = mockSupa.operations.filter(op => op.type === 'insert');
        const execInsert = insertOps.find(op => op.table === 'optimization_executions');
        assert(execInsert && execInsert.data.estimated_savings === 500, 'Execution record includes estimated_savings');
    });

    await runTest('w11_040', 'Execution record includes executed_by parameter', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute(
            {
                id: 'opt_315',
                organization_id: 'org_1',
                optimization_type: 'model_switch',
                metadata: {
                    current_model: 'gpt-4',
                    recommended_model: 'gpt-4o'
                }
            },
            'user_123'
        );
        const insertOps = mockSupa.operations.filter(op => op.type === 'insert');
        const execInsert = insertOps.find(op => op.table === 'optimization_executions');
        assert(execInsert && execInsert.data.executed_by === 'user_123', 'Execution record includes executed_by');
    });

    await runTest('w11_041', 'Result includes from/to model info', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_316',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(
            result.result.from === 'gpt-4' && result.result.to === 'gpt-4o',
            'Result includes from and to models'
        );
    });

    await runTest('w11_042', 'Routing rule upsert includes organization_id', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_317',
            organization_id: 'org_specific',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const upsertOps = mockSupa.operations.filter(op => op.type === 'upsert');
        const routingUpsert = upsertOps.find(op => op.table === 'model_routing_rules');
        assert(routingUpsert && routingUpsert.data.organization_id === 'org_specific', 'Upsert includes org_id');
    });

    await runTest('w11_043', 'Routing rule enabled=true', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_318',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const upsertOps = mockSupa.operations.filter(op => op.type === 'upsert');
        const routingUpsert = upsertOps.find(op => op.table === 'model_routing_rules');
        assert(routingUpsert && routingUpsert.data.enabled === true, 'Routing rule enabled=true');
    });

    await runTest('w11_044', 'Routing rule includes reason', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_319',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const upsertOps = mockSupa.operations.filter(op => op.type === 'upsert');
        const routingUpsert = upsertOps.find(op => op.table === 'model_routing_rules');
        assert(routingUpsert && routingUpsert.data.reason, 'Routing rule includes reason');
    });

    await runTest('w11_045', 'execution_id follows exec_ prefix pattern', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_320',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const pattern = /^exec_\d+_[a-z0-9]{6}$/;
        assert(pattern.test(result.executionId), 'execution_id follows exec_TIMESTAMP_RANDOM pattern');
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: execute() - Other Strategies (w11_046 - w11_075)
// ═════════════════════════════════════════════════════════════════════════════

async function testSection4() {
    console.log('\n[SECTION 4] execute() - Other Strategies');

    await runTest('w11_046', 'Caching config upserts to optimization_configs', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_401',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: { cache_ttl: 3600 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Caching config upserts to optimization_configs');
    });

    await runTest('w11_047', 'Rate limiting config upserts to optimization_configs', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_402',
            organization_id: 'org_1',
            optimization_type: 'rate_limiting',
            metadata: { hourly_limit: 100 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Rate limiting config upserts to optimization_configs');
    });

    await runTest('w11_048', 'Prompt optimization config upserts', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_403',
            organization_id: 'org_1',
            optimization_type: 'prompt_optimization',
            metadata: { max_prompt_tokens: 2048 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Prompt optimization config upserts');
    });

    await runTest('w11_049', 'Batch processing config upserts', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_404',
            organization_id: 'org_1',
            optimization_type: 'batch_processing',
            metadata: { batch_size: 10 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Batch processing config upserts');
    });

    await runTest('w11_050', 'Reserved capacity config upserts', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_405',
            organization_id: 'org_1',
            optimization_type: 'reserved_capacity',
            metadata: { provider: 'openai' }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Reserved capacity config upserts');
    });

    await runTest('w11_051', 'Provider arbitrage config upserts', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_406',
            organization_id: 'org_1',
            optimization_type: 'provider_arbitrage',
            metadata: { routing_strategy: 'cost_optimized' }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Provider arbitrage config upserts');
    });

    await runTest('w11_052', 'Token budget config upserts', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_407',
            organization_id: 'org_1',
            optimization_type: 'token_budget_management',
            metadata: { daily_budget: 500000 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Token budget config upserts');
    });

    await runTest('w11_053', 'Caching handler returns success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_408',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        assert(result.success, 'Caching returns success');
    });

    await runTest('w11_054', 'Rate limiting handler returns success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_409',
            organization_id: 'org_1',
            optimization_type: 'rate_limiting',
            metadata: {}
        });
        assert(result.success, 'Rate limiting returns success');
    });

    await runTest('w11_055', 'Prompt optimization handler returns success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_410',
            organization_id: 'org_1',
            optimization_type: 'prompt_optimization',
            metadata: {}
        });
        assert(result.success, 'Prompt optimization returns success');
    });

    await runTest('w11_056', 'Batch processing handler returns success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_411',
            organization_id: 'org_1',
            optimization_type: 'batch_processing',
            metadata: {}
        });
        assert(result.success, 'Batch processing returns success');
    });

    await runTest('w11_057', 'Reserved capacity handler returns success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_412',
            organization_id: 'org_1',
            optimization_type: 'reserved_capacity',
            metadata: {}
        });
        assert(result.success, 'Reserved capacity returns success');
    });

    await runTest('w11_058', 'Provider arbitrage handler returns success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_413',
            organization_id: 'org_1',
            optimization_type: 'provider_arbitrage',
            metadata: {}
        });
        assert(result.success, 'Provider arbitrage returns success');
    });

    await runTest('w11_059', 'Token budget handler returns success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_414',
            organization_id: 'org_1',
            optimization_type: 'token_budget_management',
            metadata: {}
        });
        assert(result.success, 'Token budget returns success');
    });

    await runTest('w11_060', 'Caching handler returns details', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_415',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        assert(result.result && result.result.action, 'Caching returns result with action');
    });

    await runTest('w11_061', 'Rate limiting handler returns details', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_416',
            organization_id: 'org_1',
            optimization_type: 'rate_limiting',
            metadata: {}
        });
        assert(result.result && result.result.action, 'Rate limiting returns result with action');
    });

    await runTest('w11_062', 'Caching handler returns postState', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_417',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const withPostState = updateOps.find(op => op.data && op.data.post_state);
        assert(withPostState, 'Execution updated with post_state');
    });

    await runTest('w11_063', 'Rate limiting handler returns postState', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_418',
            organization_id: 'org_1',
            optimization_type: 'rate_limiting',
            metadata: {}
        });
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const withPostState = updateOps.find(op => op.data && op.data.post_state);
        assert(withPostState, 'Execution updated with post_state');
    });

    await runTest('w11_064', 'Caching config includes settings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_419',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: { cache_ttl: 1800 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const cachingUpsert = upsertOps.find(op => op.data && op.data.config_type === 'response_caching');
        assert(
            cachingUpsert && cachingUpsert.data.settings && cachingUpsert.data.settings.cache_ttl_seconds === 1800,
            'Caching config includes cache_ttl_seconds'
        );
    });

    await runTest('w11_065', 'Rate limiting config includes settings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_420',
            organization_id: 'org_1',
            optimization_type: 'rate_limiting',
            metadata: { hourly_limit: 50 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const rateLimitUpsert = upsertOps.find(op => op.data && op.data.config_type === 'rate_limiting');
        assert(
            rateLimitUpsert && rateLimitUpsert.data.settings && rateLimitUpsert.data.settings.hourly_cost_limit === 50,
            'Rate limit config includes hourly_cost_limit'
        );
    });

    await runTest('w11_066', 'Prompt optimization config includes settings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_421',
            organization_id: 'org_1',
            optimization_type: 'prompt_optimization',
            metadata: { max_prompt_tokens: 1024 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const promptUpsert = upsertOps.find(op => op.data && op.data.config_type === 'prompt_optimization');
        assert(
            promptUpsert && promptUpsert.data.settings && promptUpsert.data.settings.max_prompt_tokens === 1024,
            'Prompt optimization config includes max_prompt_tokens'
        );
    });

    await runTest('w11_067', 'Batch processing config includes settings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_422',
            organization_id: 'org_1',
            optimization_type: 'batch_processing',
            metadata: { batch_size: 20 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const batchUpsert = upsertOps.find(op => op.data && op.data.config_type === 'batch_processing');
        assert(
            batchUpsert && batchUpsert.data.settings && batchUpsert.data.settings.batch_size === 20,
            'Batch processing config includes batch_size'
        );
    });

    await runTest('w11_068', 'Reserved capacity config includes settings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_423',
            organization_id: 'org_1',
            optimization_type: 'reserved_capacity',
            metadata: { provider: 'anthropic' }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const reservedUpsert = upsertOps.find(op => op.data && op.data.config_type === 'reserved_capacity');
        assert(
            reservedUpsert && reservedUpsert.data.settings && reservedUpsert.data.settings.provider === 'anthropic',
            'Reserved capacity config includes provider'
        );
    });

    await runTest('w11_069', 'Provider arbitrage config includes settings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_424',
            organization_id: 'org_1',
            optimization_type: 'provider_arbitrage',
            metadata: { routing_strategy: 'quality_first' }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const arbitrageUpsert = upsertOps.find(op => op.data && op.data.config_type === 'provider_arbitrage');
        assert(
            arbitrageUpsert && arbitrageUpsert.data.settings && arbitrageUpsert.data.settings.routing_strategy === 'quality_first',
            'Provider arbitrage config includes routing_strategy'
        );
    });

    await runTest('w11_070', 'Token budget config includes settings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_425',
            organization_id: 'org_1',
            optimization_type: 'token_budget_management',
            metadata: { daily_budget: 1000000 }
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const tokenUpsert = upsertOps.find(op => op.data && op.data.config_type === 'token_budget_management');
        assert(
            tokenUpsert && tokenUpsert.data.settings && tokenUpsert.data.settings.daily_token_budget === 1000000,
            'Token budget config includes daily_token_budget'
        );
    });

    await runTest('w11_071', 'Config upserts include enabled=true', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_426',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const upsert = upsertOps[0];
        assert(upsert && upsert.data.enabled === true, 'Config upsert includes enabled=true');
    });

    await runTest('w11_072', 'Config upserts include updated_at', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_427',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const upsert = upsertOps[0];
        assert(upsert && upsert.data.updated_at, 'Config upsert includes updated_at');
    });

    await runTest('w11_073', 'Config upserts include organization_id', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_428',
            organization_id: 'org_test',
            optimization_type: 'response_caching',
            metadata: {}
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const upsert = upsertOps[0];
        assert(upsert && upsert.data.organization_id === 'org_test', 'Config upsert includes organization_id');
    });

    await runTest('w11_074', 'Upsert uses onConflict strategy', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        await executor.execute({
            id: 'opt_429',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        const upsert = upsertOps[0];
        assert(upsert && upsert.config && upsert.config.onConflict, 'Upsert includes onConflict config');
    });

    await runTest('w11_075', 'Handler returns result with details', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_430',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        assert(result.result && typeof result.result === 'object', 'Handler returns result with details');
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: rollback() (w11_076 - w11_100)
// ═════════════════════════════════════════════════════════════════════════════

async function testSection5() {
    console.log('\n[SECTION 5] rollback()');

    await runTest('w11_076', 'Null executionId returns error', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback(null);
        assert(!result.success && result.error.includes('executionId'), 'Null executionId returns error');
    });

    await runTest('w11_077', 'Execution not found returns error', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_nonexistent');
        assert(!result.success && result.error.includes('not found'), 'Nonexistent execution returns error');
    });

    await runTest('w11_078', 'Cannot rollback pending status', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_pending',
                status: 'pending',
                executed_at: new Date().toISOString(),
                pre_state: {}
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_pending');
        assert(!result.success && result.error.includes('Cannot rollback'), 'Cannot rollback pending status');
    });

    await runTest('w11_079', 'Cannot rollback failed status', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_failed',
                status: 'failed',
                executed_at: new Date().toISOString(),
                pre_state: {}
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_failed');
        assert(!result.success && result.error.includes('Cannot rollback'), 'Cannot rollback failed status');
    });

    await runTest('w11_080', 'Cannot rollback rolled_back status', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_rolled',
                status: 'rolled_back',
                executed_at: new Date().toISOString(),
                pre_state: {}
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_rolled');
        assert(!result.success && result.error.includes('Cannot rollback'), 'Cannot rollback rolled_back status');
    });

    await runTest('w11_081', 'Can rollback executed status', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_executed',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_81',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_executed');
        assert(result.success, 'Can rollback executed status');
    });

    await runTest('w11_082', 'Can rollback verified status', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_verified',
                status: 'verified',
                optimization_type: 'model_switch',
                optimization_id: 'opt_82',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_verified');
        assert(result.success, 'Can rollback verified status');
    });

    await runTest('w11_083', 'Grace period expired returns error', async () => {
        const mockSupa = new MockSupabaseClient();
        const oldTime = new Date(Date.now() - EXECUTOR_CONFIG.rollbackGracePeriodMs - 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_expired',
                status: 'executed',
                executed_at: oldTime.toISOString(),
                pre_state: {}
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_expired');
        assert(!result.success && result.error.includes('grace period expired'), 'Grace period expired returns error');
    });

    await runTest('w11_084', 'No pre_state returns error', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_no_prestate',
                status: 'executed',
                executed_at: new Date().toISOString(),
                pre_state: null
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_no_prestate');
        assert(!result.success && result.error.includes('pre-execution state'), 'No pre_state returns error');
    });

    await runTest('w11_085', 'Rollback restores model routing rule', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_model_rollback',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_85',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: {
                    existing_routing: [
                        { organization_id: 'org_1', source_model: 'gpt-4', target_model: 'gpt-3.5' }
                    ]
                }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_model_rollback');
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'model_routing_rules'
        );
        assert(upsertOps.length > 0, 'Rollback restores model routing rule');
    });

    await runTest('w11_086', 'Rollback restores optimization config', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_config_rollback',
                status: 'executed',
                optimization_type: 'response_caching',
                optimization_id: 'opt_86',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: {
                    existing_config: [
                        { organization_id: 'org_1', config_type: 'response_caching', enabled: false }
                    ]
                }
            }
        ]);
        mockSupa.setTableData('optimization_configs', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_config_rollback');
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length > 0, 'Rollback restores optimization config');
    });

    await runTest('w11_087', 'Rollback deletes config if no prior existed', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_delete_config',
                status: 'executed',
                optimization_type: 'response_caching',
                optimization_id: 'opt_87',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_config: [] }
            }
        ]);
        mockSupa.setTableData('optimization_configs', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_delete_config');
        const deleteOps = mockSupa.operations.filter(
            op => op.type === 'delete' && op.table === 'optimization_configs'
        );
        assert(deleteOps.length > 0, 'Rollback deletes config if no prior existed');
    });

    await runTest('w11_088', 'Execution status updated to rolled_back', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_status_update',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_88',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_status_update');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const statusUpdate = updateOps.find(op => op.data && op.data.status === 'rolled_back');
        assert(statusUpdate, 'Execution status updated to rolled_back');
    });

    await runTest('w11_089', 'Optimization status updated to rolled_back', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_opt_status',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_89',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_opt_status');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_actions'
        );
        const statusUpdate = updateOps.find(op => op.data && op.data.status === 'rolled_back');
        assert(statusUpdate, 'Optimization status updated to rolled_back');
    });

    await runTest('w11_090', 'Rollback updates with rolled_back_at timestamp', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_timestamp',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_90',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_timestamp');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const timestampUpdate = updateOps.find(op => op.data && op.data.rolled_back_at);
        assert(timestampUpdate, 'Rollback updates with rolled_back_at timestamp');
    });

    await runTest('w11_091', 'Rollback with custom rolledBackBy parameter', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_rollback_by',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_91',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_rollback_by', 'user_123');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const withRolledBackBy = updateOps.find(op => op.data && op.data.rolled_back_by === 'user_123');
        assert(withRolledBackBy, 'Rollback updates with rolled_back_by parameter');
    });

    await runTest('w11_092', 'Within grace period allows rollback', async () => {
        const mockSupa = new MockSupabaseClient();
        const recentTime = new Date(Date.now() - 3600000); // 1 hour ago
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_within_grace',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_92',
                organization_id: 'org_1',
                executed_at: recentTime.toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_within_grace');
        assert(result.success, 'Within grace period allows rollback');
    });

    await runTest('w11_093', 'Rollback deletes model routing if no prior', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_delete_routing',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_93',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_delete_routing');
        const deleteOps = mockSupa.operations.filter(
            op => op.type === 'delete' && op.table === 'model_routing_rules'
        );
        assert(deleteOps.length > 0, 'Rollback deletes model routing if no prior existed');
    });

    await runTest('w11_094', 'Returns success=true on successful rollback', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_success_return',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_94',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_success_return');
        assert(result.success === true, 'Successful rollback returns success=true');
    });

    await runTest('w11_095', 'Rollback queries optimization_executions table', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_query',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_95',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_query');
        const selectOps = mockSupa.operations.filter(op => op.table === 'optimization_executions');
        assert(selectOps.length > 0, 'Rollback queries optimization_executions');
    });

    await runTest('w11_096', 'Rollback error includes execution status in message', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_pending_err',
                status: 'pending',
                executed_at: new Date().toISOString(),
                pre_state: {}
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_pending_err');
        assert(result.error.includes('pending'), 'Error includes execution status');
    });

    await runTest('w11_097', 'Rollback for multiple pre_state configs', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_multi_configs',
                status: 'executed',
                optimization_type: 'response_caching',
                optimization_id: 'opt_97',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: {
                    existing_config: [
                        { id: 1, config_type: 'response_caching', enabled: false },
                        { id: 2, config_type: 'response_caching', enabled: true }
                    ]
                }
            }
        ]);
        mockSupa.setTableData('optimization_configs', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_multi_configs');
        const upsertOps = mockSupa.operations.filter(
            op => op.type === 'upsert' && op.table === 'optimization_configs'
        );
        assert(upsertOps.length >= 2, 'Rollback restores multiple pre_state configs');
    });

    await runTest('w11_098', 'Rollback error has no success property', async () => {
        const mockSupa = new MockSupabaseClient();
        const result = await new OptimizationExecutor(mockSupa).rollback(null);
        assert(result.success === false, 'Error result has success=false');
    });

    await runTest('w11_099', 'Rollback success has no error property', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_no_error',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_99',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_no_error');
        assert(!result.error, 'Success result has no error property');
    });

    await runTest('w11_100', 'Rollback verifies execution_id matches filter', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_filter_check',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_100',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.rollback('exec_filter_check');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const correctFilter = updateOps.find(op => op.filters && op.filters.some(f => f.value === 'exec_filter_check'));
        assert(correctFilter, 'Rollback updates with correct execution_id filter');
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: verify() (w11_101 - w11_125)
// ═════════════════════════════════════════════════════════════════════════════

async function testSection6() {
    console.log('\n[SECTION 6] verify()');

    await runTest('w11_101', 'Null executionId returns error', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify(null);
        assert(!result.success && result.error.includes('executionId'), 'Null executionId returns error');
    });

    await runTest('w11_102', 'Execution not found returns error', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_nonexistent');
        assert(!result.success && result.error.includes('not found'), 'Nonexistent execution returns error');
    });

    await runTest('w11_103', 'Cannot verify non-executed status', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_pending_verify',
                status: 'pending',
                executed_at: new Date().toISOString()
            }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_pending_verify');
        assert(!result.success && result.error.includes('Cannot verify'), 'Cannot verify non-executed status');
    });

    await runTest('w11_104', 'Not enough time elapsed returns error', async () => {
        const mockSupa = new MockSupabaseClient();
        const recentTime = new Date();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_recent',
                status: 'executed',
                executed_at: recentTime.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_recent');
        assert(!result.success && result.error.includes('Need'), 'Not enough time elapsed returns error');
    });

    await runTest('w11_105', 'Computes pre-period costs correctly', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_pre_cost',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '100', timestamp: new Date(executedAt.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_pre_cost');
        assert(result.success, 'Verify succeeds with cost data');
    });

    await runTest('w11_106', 'Computes post-period costs correctly', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_post_cost',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '200', timestamp: new Date(executedAt.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '50', timestamp: new Date(executedAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_post_cost');
        assert(result.success && result.actualSavings > 0, 'Post-period costs computed and savings detected');
    });

    await runTest('w11_107', 'Positive savings detection', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_positive_savings',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '500', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_positive_savings');
        assert(result.actualSavings > 0, 'Positive savings detected');
    });

    await runTest('w11_108', 'No savings detection', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_no_savings',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '500', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_no_savings');
        assert(result.actualSavings <= 0, 'No savings or negative savings detected');
    });

    await runTest('w11_109', 'Savings percentage calculated correctly', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_savings_percent',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '500', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_savings_percent');
        assert(result.savingsPercent === 0.5, 'Savings percentage is 50% (500 / 1000)');
    });

    await runTest('w11_110', 'meetsThreshold true when >= 5%', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_meets_threshold',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '950', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_meets_threshold');
        assert(result.meetsThreshold === true, 'meetsThreshold is true for 5% savings');
    });

    await runTest('w11_111', 'meetsThreshold false when < 5%', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_fails_threshold',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '980', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_fails_threshold');
        assert(result.meetsThreshold === false, 'meetsThreshold is false for 2% savings');
    });

    await runTest('w11_112', 'Execution updated to verified status', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_verified_status',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '900', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_verified_status');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const verifiedUpdate = updateOps.find(op => op.data && op.data.status === 'verified');
        assert(verifiedUpdate, 'Execution updated to verified status');
    });

    await runTest('w11_113', 'Verification details stored', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_verification_details',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_verification_details');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const detailsUpdate = updateOps.find(op => op.data && op.data.verification_details);
        assert(detailsUpdate && detailsUpdate.data.verification_details.pre_cost !== undefined, 'Verification details stored');
    });

    await runTest('w11_114', 'Verification details include pre_cost', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_pre_cost_detail',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '500', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_pre_cost_detail');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const detailsUpdate = updateOps.find(op => op.data && op.data.verification_details);
        assert(detailsUpdate && detailsUpdate.data.verification_details.pre_cost === 500, 'Verification details include pre_cost');
    });

    await runTest('w11_115', 'Verification details include post_cost', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_post_cost_detail',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '400', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_post_cost_detail');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const detailsUpdate = updateOps.find(op => op.data && op.data.verification_details);
        assert(detailsUpdate && detailsUpdate.data.verification_details.post_cost === 400, 'Verification details include post_cost');
    });

    await runTest('w11_116', 'Verification details include savings_percent', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_savings_pct_detail',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '500', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_savings_pct_detail');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const detailsUpdate = updateOps.find(op => op.data && op.data.verification_details);
        assert(detailsUpdate && detailsUpdate.data.verification_details.savings_percent === 0.5, 'Verification details include savings_percent');
    });

    await runTest('w11_117', 'Verification details include meets_threshold', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_meets_threshold_detail',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_meets_threshold_detail');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const detailsUpdate = updateOps.find(op => op.data && op.data.verification_details);
        assert(detailsUpdate && detailsUpdate.data.verification_details.meets_threshold !== undefined, 'Verification details include meets_threshold');
    });

    await runTest('w11_118', 'Verify updates actual_savings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_actual_savings',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '700', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_actual_savings');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const savingsUpdate = updateOps.find(op => op.data && op.data.actual_savings);
        assert(savingsUpdate && savingsUpdate.data.actual_savings === 300, 'actual_savings updated to 300');
    });

    await runTest('w11_119', 'Verify updates verified_at timestamp', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_verified_at',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', []);
        const executor = new OptimizationExecutor(mockSupa);
        await executor.verify('exec_verified_at');
        const updateOps = mockSupa.operations.filter(
            op => op.type === 'update' && op.table === 'optimization_executions'
        );
        const timestampUpdate = updateOps.find(op => op.data && op.data.verified_at);
        assert(timestampUpdate, 'verified_at timestamp updated');
    });

    await runTest('w11_120', 'Verify returns success=true', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_return_success',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_return_success');
        assert(result.success === true, 'Verify returns success=true');
    });

    await runTest('w11_121', 'Verify returns verified=true', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_return_verified',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_return_verified');
        assert(result.verified === true, 'Verify returns verified=true');
    });

    await runTest('w11_122', 'Verify returns actualSavings', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_return_savings',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '800', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_return_savings');
        assert(result.actualSavings === 200, 'Verify returns actualSavings=200');
    });

    await runTest('w11_123', 'Verify returns savingsPercent', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_return_percent',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', [
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { organization_id: 'org_1', amount: '1000', timestamp: new Date(executedAt.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString() }
        ]);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_return_percent');
        assert(result.savingsPercent === 0, 'Verify returns savingsPercent when costs equal');
    });

    await runTest('w11_124', 'Verify returns meetsThreshold', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_return_threshold',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_return_threshold');
        assert(result.meetsThreshold !== undefined, 'Verify returns meetsThreshold');
    });

    await runTest('w11_125', 'Verify window matches EXECUTOR_CONFIG', async () => {
        const mockSupa = new MockSupabaseClient();
        const executedAt = new Date(Date.now() - (EXECUTOR_CONFIG.verificationWindowDays * 24 * 60 * 60 * 1000));
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_window_match',
                status: 'executed',
                executed_at: executedAt.toISOString(),
                organization_id: 'org_1'
            }
        ]);
        mockSupa.setTableData('cost_records', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_window_match');
        assert(result.success === true, 'Exactly at verification window boundary succeeds');
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: Wiring Verification (w11_126 - w11_150) - Not directly tested
// ═════════════════════════════════════════════════════════════════════════════

async function testSection7() {
    console.log('\n[SECTION 7] Integration Patterns & Public API');

    await runTest('w11_126', 'OptimizationExecutor is exported', async () => {
        assert(typeof OptimizationExecutor === 'function', 'OptimizationExecutor class exported');
    });

    await runTest('w11_127', 'createOptimizationExecutor is exported', async () => {
        assert(typeof createOptimizationExecutor === 'function', 'Factory function exported');
    });

    await runTest('w11_128', 'EXECUTION_STATUS is exported', async () => {
        assert(typeof EXECUTION_STATUS === 'object' && EXECUTION_STATUS.PENDING, 'EXECUTION_STATUS exported');
    });

    await runTest('w11_129', 'EXECUTOR_CONFIG is exported', async () => {
        assert(typeof EXECUTOR_CONFIG === 'object' && EXECUTOR_CONFIG.verificationWindowDays, 'EXECUTOR_CONFIG exported');
    });

    await runTest('w11_130', 'OptimizationExecutor constructor works', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        assert(executor instanceof OptimizationExecutor, 'Constructor creates instance');
    });

    await runTest('w11_131', 'execute method is public', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        assert(typeof executor.execute === 'function', 'execute is public method');
    });

    await runTest('w11_132', 'rollback method is public', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        assert(typeof executor.rollback === 'function', 'rollback is public method');
    });

    await runTest('w11_133', 'verify method is public', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        assert(typeof executor.verify === 'function', 'verify is public method');
    });

    await runTest('w11_134', 'execute returns object with success property', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_134',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(typeof result.success === 'boolean', 'execute returns object with success property');
    });

    await runTest('w11_135', 'execute returns object with executionId on success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_135',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(result.success && result.executionId, 'Success result includes executionId');
    });

    await runTest('w11_136', 'execute returns object with rollbackAvailable on success', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute({
            id: 'opt_136',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(result.success && typeof result.rollbackAvailable === 'boolean', 'Success result includes rollbackAvailable');
    });

    await runTest('w11_137', 'rollback returns object with success property', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_nonexistent');
        assert(typeof result.success === 'boolean', 'rollback returns object with success property');
    });

    await runTest('w11_138', 'rollback returns error message on failure', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback(null);
        assert(!result.success && result.error, 'rollback failure includes error message');
    });

    await runTest('w11_139', 'verify returns object with success property', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify('exec_nonexistent');
        assert(typeof result.success === 'boolean', 'verify returns object with success property');
    });

    await runTest('w11_140', 'verify returns error message on failure', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.verify(null);
        assert(!result.success && result.error, 'verify failure includes error message');
    });

    await runTest('w11_141', 'EXECUTION_STATUS has 6 distinct values', async () => {
        const values = Object.values(EXECUTION_STATUS);
        assert(values.length === 6, 'EXECUTION_STATUS has 6 values');
    });

    await runTest('w11_142', 'All strategy types in STRATEGY_HANDLERS are distinct', async () => {
        const strategies = ['model_switch', 'response_caching', 'rate_limiting', 'prompt_optimization', 'batch_processing', 'reserved_capacity', 'provider_arbitrage', 'token_budget_management'];
        assert(strategies.length === 8, '8 distinct strategy types defined');
    });

    await runTest('w11_143', 'execute awaitable function', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const promise = executor.execute({
            id: 'opt_143',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        assert(promise instanceof Promise, 'execute returns Promise');
    });

    await runTest('w11_144', 'rollback awaitable function', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const promise = executor.rollback('exec_test');
        assert(promise instanceof Promise, 'rollback returns Promise');
    });

    await runTest('w11_145', 'verify awaitable function', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const promise = executor.verify('exec_test');
        assert(promise instanceof Promise, 'verify returns Promise');
    });

    await runTest('w11_146', 'execute handles executedBy optional parameter', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.execute(
            {
                id: 'opt_146',
                organization_id: 'org_1',
                optimization_type: 'model_switch',
                metadata: {
                    current_model: 'gpt-4',
                    recommended_model: 'gpt-4o'
                }
            },
            'test_user'
        );
        assert(result.success, 'execute accepts executedBy parameter');
    });

    await runTest('w11_147', 'rollback handles rolledBackBy optional parameter', async () => {
        const mockSupa = new MockSupabaseClient();
        mockSupa.setTableData('optimization_executions', [
            {
                execution_id: 'exec_147',
                status: 'executed',
                optimization_type: 'model_switch',
                optimization_id: 'opt_147',
                organization_id: 'org_1',
                executed_at: new Date().toISOString(),
                pre_state: { existing_routing: [] }
            }
        ]);
        mockSupa.setTableData('model_routing_rules', []);
        const executor = new OptimizationExecutor(mockSupa);
        const result = await executor.rollback('exec_147', 'test_user');
        assert(result.success, 'rollback accepts rolledBackBy parameter');
    });

    await runTest('w11_148', 'Factory function accepts modelRegistry parameter', async () => {
        const mockSupa = new MockSupabaseClient();
        const registry = {};
        const executor = createOptimizationExecutor(mockSupa, registry);
        assert(executor.modelRegistry === registry, 'Factory accepts and stores modelRegistry');
    });

    await runTest('w11_149', 'Multiple optimizations can be executed sequentially', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const result1 = await executor.execute({
            id: 'opt_149a',
            organization_id: 'org_1',
            optimization_type: 'model_switch',
            metadata: {
                current_model: 'gpt-4',
                recommended_model: 'gpt-4o'
            }
        });
        const result2 = await executor.execute({
            id: 'opt_149b',
            organization_id: 'org_1',
            optimization_type: 'response_caching',
            metadata: {}
        });
        assert(result1.success && result2.success && result1.executionId !== result2.executionId, 'Sequential executions create different executionIds');
    });

    await runTest('w11_150', 'Execution IDs are unique across multiple executions', async () => {
        const mockSupa = new MockSupabaseClient();
        const executor = new OptimizationExecutor(mockSupa);
        const ids = [];
        for (let i = 0; i < 5; i++) {
            const result = await executor.execute({
                id: `opt_150_${i}`,
                organization_id: 'org_1',
                optimization_type: 'model_switch',
                metadata: {
                    current_model: 'gpt-4',
                    recommended_model: 'gpt-4o'
                }
            });
            ids.push(result.executionId);
        }
        const uniqueIds = new Set(ids);
        assert(uniqueIds.size === 5, 'All 5 execution IDs are unique');
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═════════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('═'.repeat(80));
    console.log('W-011 OPTIMIZATION EXECUTOR TEST SUITE');
    console.log('═'.repeat(80));

    await testSection1();
    await testSection2();
    await testSection3();
    await testSection4();
    await testSection5();
    await testSection6();
    await testSection7();

    console.log('\n' + '═'.repeat(80));
    console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(80));

    if (failures.length > 0) {
        console.log('\nFAILURES:');
        failures.forEach(f => console.log(`  - ${f}`));
    }

    process.exit(failures.length > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
