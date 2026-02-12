/**
 * Finault Savings Intelligence - Complete Usage Examples
 * Demonstrates all features: analysis, recommendations, tracking, and reporting
 */

// ============================================================================
// EXAMPLE 1: Complete Usage Analysis
// ============================================================================

function exampleCompleteAnalysis() {
  const SavingsIntelligence = require('./savings-intelligence.js').SavingsIntelligence;

  // Initialize with company config
  const engine = new SavingsIntelligence({
    companyId: 'acme-corp-001',
    industry: 'saas-scale',
    monthlyBudget: 50000,
    qualityThreshold: 0.82
  });

  // Sample usage data representing a month of AI API usage
  const usageData = {
    period: 'January 2026',
    totalCost: 45230.50,
    totalInputTokens: 2500000000,
    totalOutputTokens: 750000000,
    requestCount: 185000,
    prompts: [
      "Please, could you kindly generate a very comprehensive and detailed summary of the following document. I would like you to include background information, context, and as much detail as possible...",
      "Summarize the document in 3 bullet points",
      "Given the following context: [300 words of context]. Based on this background information, please provide analysis...",
      "Analyze performance metrics"
    ],
    modelBreakdown: {
      'gpt-4-turbo': 45000,
      'gpt-4o': 85000,
      'claude-3.5-sonnet': 32000,
      'gpt-3.5-turbo': 23000
    },
    costByModel: {
      'gpt-4-turbo': 18500.00,
      'gpt-4o': 12750.00,
      'claude-3.5-sonnet': 8640.00,
      'gpt-3.5-turbo': 3450.00
    },
    requests: [
      {
        model: 'gpt-4-turbo',
        inputTokens: 2000,
        outputTokens: 800,
        prompt: 'Generate detailed report',
        priority: 'normal'
      },
      {
        model: 'gpt-4o',
        inputTokens: 500,
        outputTokens: 200,
        prompt: 'Quick analysis',
        priority: 'realtime'
      },
      {
        model: 'claude-3.5-sonnet',
        inputTokens: 1500,
        outputTokens: 600,
        prompt: 'Summarize findings',
        priority: 'normal'
      },
      {
        model: 'gpt-3.5-turbo',
        inputTokens: 300,
        outputTokens: 100,
        prompt: 'Classification task',
        priority: 'batch'
      }
    ]
  };

  // Run comprehensive analysis
  const analysis = engine.analyze(usageData, { period: 'monthly' });

  console.log('=== COMPREHENSIVE USAGE ANALYSIS ===\n');
  console.log('Summary Metrics:');
  console.log(`  Total Cost: $${analysis.summary.totalCost.toLocaleString()}`);
  console.log(`  Total Tokens: ${(analysis.summary.totalInputTokens + analysis.summary.totalOutputTokens).toLocaleString()}`);
  console.log(`  Requests: ${analysis.summary.requestCount.toLocaleString()}`);
  console.log(`  Avg Cost per Request: $${analysis.summary.avgCostPerRequest.toFixed(3)}`);
  console.log(`  Avg Tokens per Request: ${Math.round(analysis.summary.avgInputTokens + analysis.summary.avgOutputTokens)}`);

  console.log('\n=== SAVINGS OPPORTUNITIES ===');
  console.log(`Total Potential Savings: $${analysis.totalPotentialSavings.toLocaleString()}/month`);
  console.log(`Yearly Potential: $${(analysis.totalPotentialSavings * 12).toLocaleString()}\n`);

  // Show top 5 opportunities
  analysis.opportunities.slice(0, 5).forEach((opp, idx) => {
    console.log(`${idx + 1}. ${opp.type.toUpperCase()}`);
    console.log(`   Monthly Savings: $${opp.monthlySavings.toLocaleString()}`);
    console.log(`   Effort: ${opp.effort} | Time: ${opp.implementationTime}`);
    if (opp.recommendedModel) console.log(`   Switch from ${opp.currentModel} to ${opp.recommendedModel}`);
    console.log(`   Reason: ${opp.reason}\n`);
  });

  // Benchmarking
  console.log('=== INDUSTRY BENCHMARKING ===');
  console.log(`Company Spend: $${analysis.benchmarking.company.monthlySpend.toLocaleString()}`);
  console.log(`Benchmark: $${analysis.benchmarking.benchmark.avgMonthlySpend.toLocaleString()}`);
  console.log(`Difference: ${analysis.benchmarking.comparison.spendVsBenchmark > 0 ? '+' : ''}${analysis.benchmarking.comparison.spendVsBenchmark}%`);
  console.log(`Status: ${analysis.benchmarking.recommendation.status}`);

  return analysis;
}

// ============================================================================
// EXAMPLE 2: Token Efficiency Analysis
// ============================================================================

function exampleTokenEfficiency() {
  const TokenEfficiencyAnalyzer = require('./savings-intelligence.js').TokenEfficiencyAnalyzer;

  const analyzer = new TokenEfficiencyAnalyzer();

  const inefficientPrompts = [
    "Please, could you kindly and very carefully analyze the following information. I would really like you to provide a very comprehensive overview with lots of details.",
    "Given the context and background, please provide feedback",
    "Example 1: [long example]. Example 2: [long example]. Example 3: [long example]. Based on the many examples above, analyze..."
  ];

  console.log('=== TOKEN EFFICIENCY ANALYSIS ===\n');

  const efficiency = analyzer.analyzePromptEfficiency(inefficientPrompts);

  console.log(`Analyzed ${efficiency.totalPrompts} prompts`);
  console.log(`Average Efficiency Score: ${efficiency.avgEfficiencyScore.toFixed(1)}/100`);
  console.log(`Estimated Tokens Wasted: ${efficiency.estimatedSavings.toLocaleString()}`);
  console.log(`Estimated Monthly Savings at $0.02/1K tokens: $${(efficiency.estimatedSavings * 0.02 / 1000).toFixed(2)}\n`);

  console.log('Identified Patterns:');
  Object.entries(efficiency.patterns).forEach(([pattern, count]) => {
    if (count > 0) {
      console.log(`  ${pattern}: ${count} prompts`);
    }
  });

  console.log('\nDetailed Suggestions:');
  efficiency.opportunities.slice(0, 5).forEach((sugg, idx) => {
    console.log(`\n${idx + 1}. ${sugg.type.toUpperCase()} (${sugg.severity})`);
    console.log(`   Current: ${sugg.current}`);
    console.log(`   Suggestion: ${sugg.suggestion}`);
    console.log(`   Token Reduction: ${sugg.estimatedTokenReduction} tokens`);
  });

  return efficiency;
}

// ============================================================================
// EXAMPLE 3: Model Comparison and Selection
// ============================================================================

function exampleModelComparison() {
  const ModelSelector = require('./savings-intelligence.js').ModelSelector;

  const selector = new ModelSelector();

  console.log('=== MODEL COMPARISON ===\n');

  // Compare popular models
  const models = ['gpt-4o', 'claude-3.5-sonnet', 'gpt-3.5-turbo', 'gemini-2.0-flash'];

  const comparison = selector.compareModels(models);

  console.log('Cost Per Million Tokens:');
  comparison.models.forEach(model => {
    console.log(`  ${model.name}: $${model.costPerMillionTokens.toFixed(2)}`);
  });

  console.log(`\nBest Value: ${comparison.bestValue.name} (${comparison.bestValue.provider})`);
  console.log(`  Quality: ${comparison.bestValue.qualityScore} | Speed: ${comparison.bestValue.speedScore}`);
  console.log(`  Cost: $${comparison.bestValue.costPerMillionTokens.toFixed(2)}/M tokens`);

  console.log(`\nBest Overall: ${comparison.bestOverall.name}`);
  console.log(`Best Speed: ${comparison.bestSpeed.name}`);

  console.log('\nPotential Savings Switching to Claude:');
  comparison.models.forEach(model => {
    const saving = comparison.savings[model.name];
    console.log(`  vs ${model.name}: $${saving.dollarSavings.toFixed(2)}/M tokens (${saving.percentSavings.toFixed(1)}%)`);
  });

  // Recommend best model for specific task
  console.log('\n=== MODEL RECOMMENDATIONS ===\n');

  const taskTypes = [
    { name: 'Code generation', quality: 0.90, budget: 5000 },
    { name: 'Summarization', quality: 0.75, budget: 1000 },
    { name: 'Customer support', quality: 0.85, budget: 3000 }
  ];

  taskTypes.forEach(task => {
    const rec = selector.recommendModel(task.name, task.quality, task.budget);
    console.log(`${task.name} (Quality: ${task.quality}, Budget: $${task.budget}/mo):`);
    console.log(`  Recommended: ${rec.recommended}`);
    console.log(`  Cost per M tokens: $${rec.costPerMillionTokens.toFixed(2)}`);
    console.log(`  Quality Score: ${rec.qualityScore}`);
    console.log('');
  });

  return comparison;
}

// ============================================================================
// EXAMPLE 4: Savings Tracking and ROI
// ============================================================================

function exampleSavingsTracking() {
  const SavingsIntelligence = require('./savings-intelligence.js').SavingsIntelligence;

  const engine = new SavingsIntelligence({ companyId: 'tech-corp-001' });

  console.log('=== SAVINGS RECOMMENDATION TRACKING ===\n');

  // Add recommendations
  const recommendations = [
    {
      id: 'model_opt_001',
      type: 'model_switch',
      currentModel: 'gpt-4-turbo',
      recommendedModel: 'gpt-4o',
      monthlySavings: 3500,
      effort: 'low',
      implementationTime: '< 1 hour'
    },
    {
      id: 'prompt_opt_001',
      type: 'prompt_optimization',
      monthlySavings: 2200,
      effort: 'medium',
      implementationTime: '4 hours'
    },
    {
      id: 'cache_001',
      type: 'prompt_caching',
      monthlySavings: 1800,
      effort: 'low',
      implementationTime: '2 hours'
    }
  ];

  recommendations.forEach(rec => {
    engine.addRecommendation(rec);
    console.log(`Added: ${rec.id}`);
  });

  console.log('\n=== IMPLEMENTATION TRACKING ===\n');

  // Track implementations
  engine.trackImplementation('model_opt_001', {
    owner: 'engineering-team',
    completionDate: '2026-02-15'
  });

  engine.trackImplementation('cache_001', {
    owner: 'devops-team',
    completionDate: '2026-02-05'
  });

  console.log('2 recommendations marked as in-progress\n');

  // Record actual savings
  console.log('=== ACTUAL SAVINGS MEASUREMENT ===\n');

  engine.measureActualSavings('model_opt_001', 5800, 9300); // actual vs previous
  engine.measureActualSavings('cache_001', 4100, 5900);

  console.log('Model Switch Actual Results:');
  console.log('  Previous Monthly Cost: $9,300');
  console.log('  Current Monthly Cost: $5,800');
  console.log('  Actual Savings: $3,500 (37.6%)');
  console.log('  vs Projected: $3,500 ✓ ON TARGET');

  console.log('\nPrompt Caching Actual Results:');
  console.log('  Previous Monthly Cost: $5,900');
  console.log('  Current Monthly Cost: $4,100');
  console.log('  Actual Savings: $1,800 (30.5%)');
  console.log('  vs Projected: $1,800 ✓ ON TARGET\n');

  // Calculate ROI
  const rec1 = recommendations[0];
  const roi1 = engine.calculateROI(rec1, implementationCost = 0); // Implementation was free

  console.log('=== ROI ANALYSIS ===\n');
  console.log(`Recommendation: ${rec1.id}`);
  console.log(`Monthly Savings: $${roi1.monthlySavings.toLocaleString()}`);
  console.log(`Yearly Savings: $${roi1.yearlySavings.toLocaleString()}`);
  console.log(`Year 1 ROI: ${roi1.yearOneROI}% (FREE IMPLEMENTATION)`);
  console.log(`Profitable: ${roi1.isProfitable ? 'YES' : 'NO'}`);
}

// ============================================================================
// EXAMPLE 5: Executive Summary Report
// ============================================================================

function exampleExecutiveSummary() {
  const SavingsIntelligence = require('./savings-intelligence.js').SavingsIntelligence;

  const engine = new SavingsIntelligence({ companyId: 'fortune500-corp' });

  // Add multiple recommendations
  const recs = [
    { id: 'rec_1', type: 'model_switch', monthlySavings: 5000 },
    { id: 'rec_2', type: 'prompt_opt', monthlySavings: 3200 },
    { id: 'rec_3', type: 'caching', monthlySavings: 2100 },
    { id: 'rec_4', type: 'batching', monthlySavings: 1800 },
    { id: 'rec_5', type: 'provider_arbitrage', monthlySavings: 4500 }
  ];

  recs.forEach(rec => engine.addRecommendation(rec));

  // Track some implementations
  engine.trackImplementation('rec_1', { owner: 'team-a', completionDate: '2026-02-10' });
  engine.trackImplementation('rec_3', { owner: 'team-b', completionDate: '2026-02-05' });

  // Record actual savings
  engine.measureActualSavings('rec_1', 8500, 13500);
  engine.measureActualSavings('rec_3', 4900, 7000);

  const summary = engine.generateExecutiveSummary('fortune500-corp');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         FINAULT AI COST OPTIMIZATION - CFO REPORT         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Organization: ${summary.organizationId}`);
  console.log(`Date: ${new Date(summary.date).toLocaleDateString()}\n`);

  console.log('KEY METRICS');
  console.log('─'.repeat(60));
  console.log(`Current Monthly AI Spend: $${summary.keyMetrics.currentMonthlyAiCost.toLocaleString()}`);
  console.log(`Potential Monthly Savings: $${summary.keyMetrics.potentialMonthlySavings.toLocaleString()}`);
  console.log(`Potential Yearly Savings: $${summary.keyMetrics.potentialYearlySavings.toLocaleString()}`);
  console.log(`Savings as % of Budget: ${summary.keyMetrics.savingsAsPercentOfBudget}%\n`);

  console.log('TOP OPPORTUNITIES');
  console.log('─'.repeat(60));
  summary.topOpportunities.slice(0, 3).forEach((opp, idx) => {
    console.log(`${idx + 1}. ${opp.type.toUpperCase()}`);
    console.log(`   Savings: $${opp.monthlySavings.toLocaleString()}/month`);
    console.log(`   Effort: ${opp.effort}`);
  });

  console.log('\nIMPLEMENTATION STATUS');
  console.log('─'.repeat(60));
  console.log(`✓ Completed: ${summary.implementationStatus.completed}`);
  console.log(`⋯ Pending: ${summary.implementationStatus.pending}`);
  console.log(`Completion Rate: ${summary.implementationStatus.completionRate}`);

  console.log('\nEST. ROI');
  console.log('─'.repeat(60));
  console.log(`One Year Savings: ${summary.estimatedROI.oneYear}`);

  console.log('\nNEXT STEPS');
  console.log('─'.repeat(60));
  summary.nextSteps.forEach((step, idx) => {
    console.log(`${idx + 1}. ${step.action}`);
    console.log(`   Expected Savings: $${step.expectedSavings.toLocaleString()}`);
    console.log(`   Timeframe: ${step.timeframe}`);
  });

  return summary;
}

// ============================================================================
// EXAMPLE 6: Real-world Scenario
// ============================================================================

function exampleRealWorldScenario() {
  const SavingsIntelligence = require('./savings-intelligence.js').SavingsIntelligence;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     REAL-WORLD OPTIMIZATION SCENARIO: TECH STARTUP        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const engine = new SavingsIntelligence({
    companyId: 'startupai-inc',
    industry: 'saas-startup',
    monthlyBudget: 8000,
    qualityThreshold: 0.80
  });

  // Realistic startup usage
  const usageData = {
    totalCost: 7850.25,
    totalInputTokens: 1200000000,
    totalOutputTokens: 350000000,
    requestCount: 125000,
    prompts: [
      "Please, could you very kindly provide a really comprehensive and detailed analysis of our customer feedback? I would like you to include background context and lots of detail.",
      "Analyze sentiment",
      "Generate email templates for customer outreach with detailed personalization instructions and multiple examples for each scenario."
    ],
    modelBreakdown: {
      'gpt-4-turbo': 25000,
      'gpt-4o': 45000,
      'gpt-3.5-turbo': 55000
    },
    costByModel: {
      'gpt-4-turbo': 3200.00,
      'gpt-4o': 2400.00,
      'gpt-3.5-turbo': 2250.25
    },
    requests: [
      { model: 'gpt-4-turbo', inputTokens: 1500, outputTokens: 600 },
      { model: 'gpt-4o', inputTokens: 800, outputTokens: 300 },
      { model: 'gpt-3.5-turbo', inputTokens: 400, outputTokens: 150 }
    ]
  };

  const analysis = engine.analyze(usageData);

  console.log('CURRENT STATE');
  console.log('─'.repeat(60));
  console.log(`Monthly Spend: $${analysis.summary.totalCost.toLocaleString()}`);
  console.log(`Monthly Tokens: ${(analysis.summary.totalInputTokens + analysis.summary.totalOutputTokens).toLocaleString()}`);
  console.log(`Cost per Token: $${((analysis.summary.totalCost / (analysis.summary.totalInputTokens + analysis.summary.totalOutputTokens)) * 1000000).toFixed(4)}/M tokens`);
  console.log(`Average Request Cost: $${analysis.summary.avgCostPerRequest.toFixed(3)}`);

  console.log('\nBENCHMARK COMPARISON');
  console.log('─'.repeat(60));
  const bm = analysis.benchmarking.company;
  const br = analysis.benchmarking.benchmark;
  console.log(`Your Efficiency: ${bm.efficiency.toLocaleString()} tokens/$`);
  console.log(`Benchmark: ${br.efficiency.toLocaleString()} tokens/$`);
  console.log(`Gap: ${Math.round((bm.efficiency - br.efficiency) / br.efficiency * 100)}%`);
  console.log(`Status: ${analysis.benchmarking.recommendation.message}`);

  console.log('\nPRIORITIZED OPPORTUNITIES');
  console.log('─'.repeat(60));

  analysis.opportunities.slice(0, 5).forEach((opp, idx) => {
    const roiScore = opp.monthlySavings / (opp.effort === 'low' ? 1 : opp.effort === 'medium' ? 2 : 3);
    console.log(`\n${idx + 1}. [${opp.category.toUpperCase()}] ${opp.priority.toUpperCase()} PRIORITY`);
    console.log(`   Savings: $${opp.monthlySavings}/month | Effort: ${opp.effort}`);
    console.log(`   ROI Score: ${roiScore.toFixed(1)}`);
    if (opp.recommendedModel) {
      console.log(`   Action: Switch ${opp.currentModel} → ${opp.recommendedModel}`);
    }
    if (opp.issue) {
      console.log(`   Issue: ${opp.issue}`);
    }
  });

  console.log('\n\nPROJECTED IMPACT');
  console.log('─'.repeat(60));
  console.log(`Total Annual Potential: $${(analysis.totalPotentialSavings * 12).toLocaleString()}`);
  console.log(`New Monthly Spend: $${Math.round(analysis.summary.totalCost - analysis.totalPotentialSavings).toLocaleString()}`);
  console.log(`New Annual Spend: $${Math.round((analysis.summary.totalCost - analysis.totalPotentialSavings) * 12).toLocaleString()}`);
  console.log(`Savings %: ${Math.round((analysis.totalPotentialSavings / analysis.summary.totalCost) * 100)}%`);

  return analysis;
}

// ============================================================================
// RUN ALL EXAMPLES
// ============================================================================

if (typeof module !== 'undefined' && require.main === module) {
  console.log('\n\n');
  exampleCompleteAnalysis();

  console.log('\n\n');
  exampleTokenEfficiency();

  console.log('\n\n');
  exampleModelComparison();

  console.log('\n\n');
  exampleSavingsTracking();

  console.log('\n\n');
  exampleExecutiveSummary();

  console.log('\n\n');
  exampleRealWorldScenario();
}

// Export for use as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    exampleCompleteAnalysis,
    exampleTokenEfficiency,
    exampleModelComparison,
    exampleSavingsTracking,
    exampleExecutiveSummary,
    exampleRealWorldScenario
  };
}
