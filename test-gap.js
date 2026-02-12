import { BenchmarkPlatform } from './platform/benchmark-platform.js';
const platform = new BenchmarkPlatform({
    industry: 'ecommerce',
    companySize: 'mid_market'
});
const benchmark = platform.getIndustryAverages('ecommerce', 'mid_market');

const gaps = platform.identifyBenchmarkGaps({
    optimization_adoption_rate: benchmark.optimization_adoption_rate * 0.1,
    reconciliation_match_rate: benchmark.reconciliation_match_rate * 0.4
});

console.log('Gaps found:', gaps.length);
gaps.forEach(g => {
    console.log('  -', g.metric, 'percentile:', g.percentile, 'impact:', g.impact);
});

const critical = gaps.find(g => g.impact === 'critical');
const high = gaps.find(g => g.impact === 'high');

console.log('Critical:', critical !== undefined);
console.log('High:', high !== undefined);
console.log('Gaps length:', gaps.length);
