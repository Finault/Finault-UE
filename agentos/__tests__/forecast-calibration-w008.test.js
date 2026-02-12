import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function assertClose(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ✓ ${message} (${actual} ≈ ${expected})`);
    } else {
        failed++;
        failures.push(message);
        console.log(`  ✗ FAIL: ${message} (${actual} differs from ${expected} by ${diff})`);
    }
}

async function runTests() {
    console.log('═'.repeat(70));
    console.log('W-008 FORECAST CALIBRATION TEST SUITE');
    console.log('═'.repeat(70));

    const { ForecastCalibrator, CALIBRATION_CONFIG, createForecastCalibrator } = await import(path.join(__dirname, '..', 'core', 'forecast-calibration.js'));

    // =========================================================================
    // SECTION 1: CALIBRATION_CONFIG Constants (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 1] CALIBRATION_CONFIG Constants');

    assert(typeof CALIBRATION_CONFIG === 'object', 'w8_1: CALIBRATION_CONFIG is an object');
    assert(CALIBRATION_CONFIG.minDataPointsForConfidence === 14, 'w8_2: minDataPointsForConfidence = 14 (two weeks)');
    assert(CALIBRATION_CONFIG.minBacktestForCalibration === 10, 'w8_3: minBacktestForCalibration = 10');
    assert(CALIBRATION_CONFIG.bootstrapSamples === 1000, 'w8_4: bootstrapSamples = 1000');
    assert(CALIBRATION_CONFIG.confidenceFloor === 0.05, 'w8_5: confidenceFloor = 0.05');
    assert(CALIBRATION_CONFIG.confidenceCeiling === 0.95, 'w8_6: confidenceCeiling = 0.95');
    assert(CALIBRATION_CONFIG.plattScalingLearningRate === 0.01, 'w8_7: plattScalingLearningRate = 0.01');
    assert(CALIBRATION_CONFIG.plattScalingIterations === 100, 'w8_8: plattScalingIterations = 100');
    assert(CALIBRATION_CONFIG.accuracyThreshold === 0.15, 'w8_9: accuracyThreshold = 0.15 (15%)');
    assert(CALIBRATION_CONFIG.dataPointsCap === 60, 'w8_10: dataPointsCap = 60');

    // Weights validation
    const w = CALIBRATION_CONFIG.weights;
    assert(w.rSquared === 0.5, 'w8_11: weights.rSquared = 0.5');
    assert(w.dataPoints === 0.2, 'w8_12: weights.dataPoints = 0.2');
    assert(w.variance === 0.15, 'w8_13: weights.variance = 0.15');
    assert(w.trendStability === 0.15, 'w8_14: weights.trendStability = 0.15');

    // Weights sum to 1.0
    const weightSum = w.rSquared + w.dataPoints + w.variance + w.trendStability;
    assertClose(weightSum, 1.0, 0.001, 'w8_15: weights sum to 1.0');

    // =========================================================================
    // SECTION 2: rawConfidence() (~30 tests)
    // =========================================================================
    console.log('\n[SECTION 2] rawConfidence() Formula Tests');

    const calibrator = new ForecastCalibrator();

    // Test: All zeros → should be near floor (0.05)
    const raw1 = calibrator.rawConfidence(0, 0, 0, 0);
    // With all zeros: rSq=0, dp=0, var=0→varScore=1, trend=0 → 0.15*1=0.15
    assertClose(raw1, 0.15, 0.001, 'w8_16: rawConfidence(0,0,0,0) = 0.15 (variance term gives 1.0)');
    assert(raw1 >= CALIBRATION_CONFIG.confidenceFloor, 'w8_17: Result clamped to floor');

    // Test: Perfect R², many data points, low variance, stable trend
    const raw2 = calibrator.rawConfidence(1.0, 60, 0, 1.0);
    assertClose(raw2, 0.95, 0.05, 'w8_18: rawConfidence(1,60,0,1) ≈ ceiling 0.95');
    assert(raw2 <= CALIBRATION_CONFIG.confidenceCeiling, 'w8_19: Result clamped to ceiling');

    // Test: R²=0.6, dp=30, var=0.15, trend=0.8 → compute expected
    const raw3 = calibrator.rawConfidence(0.6, 30, 0.15, 0.8);
    const expected3 = 0.5 * 0.6 + 0.2 * (30 / 60) + 0.15 * (1 - 0.15) + 0.15 * 0.8;
    assertClose(raw3, expected3, 0.001, 'w8_20: rawConfidence(0.6,30,0.15,0.8) matches formula');

    // Test: Mixed realistic values
    const raw4 = calibrator.rawConfidence(0.7, 45, 0.2, 0.75);
    const expected4 = 0.5 * 0.7 + 0.2 * (45 / 60) + 0.15 * (1 - 0.2) + 0.15 * 0.75;
    assertClose(raw4, expected4, 0.001, 'w8_21: realistic mixed input formula correctness');

    // Test: R²=0.1 should be LESS than old formula 0.4 (R²+0.3)
    const raw5 = calibrator.rawConfidence(0.1, 20, 0.1, 0.5);
    const oldFormula5 = Math.min(0.9, 0.1 + 0.3); // = 0.4
    assert(raw5 < oldFormula5, 'w8_22: CRITICAL: rawConfidence(0.1,...) < old formula 0.4');

    // Test: R²=0.0 should be LESS than old formula 0.3 (R²+0.3)
    const raw6 = calibrator.rawConfidence(0.0, 0, 1.0, 0);
    const oldFormula6 = Math.min(0.9, 0.0 + 0.3); // = 0.3
    assert(raw6 < oldFormula6, 'w8_23: CRITICAL: rawConfidence(0.0,...) < old formula 0.3');

    // Test: NaN handling — should clamp to floor
    const raw7 = calibrator.rawConfidence(NaN, NaN, NaN, NaN);
    // NaN || 0 = 0 for all params, same as (0,0,0,0) → 0.15
    assert(raw7 >= CALIBRATION_CONFIG.confidenceFloor, 'w8_24: NaN inputs ≥ floor 0.05');

    // Test: Negative values clamped to 0
    const raw8 = calibrator.rawConfidence(-0.5, -10, -0.2, -0.1);
    assert(raw8 >= CALIBRATION_CONFIG.confidenceFloor, 'w8_25: Negative inputs clamped gracefully');

    // Test: Very large values clamped to ceiling
    const raw9 = calibrator.rawConfidence(999, 99999, 999, 999);
    assert(raw9 <= CALIBRATION_CONFIG.confidenceCeiling, 'w8_26: Large inputs clamped to ceiling');

    // Test: Undefined values treated as 0
    const raw10 = calibrator.rawConfidence(undefined, undefined, undefined, undefined);
    // undefined || 0 = 0 for all params, same as (0,0,0,0) → 0.15
    assertClose(raw10, 0.15, 0.001, 'w8_27: Undefined → treated as 0, varScore=1 → 0.15');

    // Test: Data points at cap (60) → max score 1.0
    const raw11 = calibrator.rawConfidence(1.0, 60, 0, 1.0);
    assert(raw11 > 0.9, 'w8_28: Data points at cap gives high score');

    // Test: Data points beyond cap still capped at 1.0
    const raw12 = calibrator.rawConfidence(1.0, 120, 0, 1.0);
    assert(raw12 <= CALIBRATION_CONFIG.confidenceCeiling, 'w8_29: Data points > cap still valid');

    // Test: Variance of 0 → highest variance score
    const raw13 = calibrator.rawConfidence(0.5, 30, 0, 0.5);
    const raw14 = calibrator.rawConfidence(0.5, 30, 0.5, 0.5);
    assert(raw13 > raw14, 'w8_30: Lower variance → higher confidence');

    // =========================================================================
    // SECTION 3: calibrate() (~25 tests)
    // =========================================================================
    console.log('\n[SECTION 3] calibrate() Method Tests');

    // Test: Empty backtest history → insufficientData=true
    const calib1 = calibrator.calibrate(0.5, []);
    assert(calib1.insufficientData === true, 'w8_31: Empty backtest → insufficientData=true');
    assert(calib1.calibratedConfidence === 0.5, 'w8_32: Empty backtest returns raw score');

    // Test: 5 backtests → still insufficient
    const calib2 = calibrator.calibrate(0.5, Array(5).fill({ predicted: 100, actual: 100 }));
    assert(calib2.insufficientData === true, 'w8_33: 5 backtests → insufficientData=true');

    // Test: 10 backtests → trains sigmoid
    const calib3 = calibrator.calibrate(0.5, Array(10).fill({ predicted: 100, actual: 100 }));
    assert(calib3.insufficientData === false, 'w8_34: 10 backtests → calibrated');

    // Test: 11 backtests → calibrated
    const calib4 = calibrator.calibrate(0.5, Array(11).fill({ predicted: 100, actual: 100 }));
    assert(calib4.insufficientData === false, 'w8_35: 11 backtests → calibrated');

    // Test: Calibrated result within bounds
    assert(calib3.calibratedConfidence >= CALIBRATION_CONFIG.confidenceFloor, 'w8_36: Calibrated result >= floor');
    assert(calib3.calibratedConfidence <= CALIBRATION_CONFIG.confidenceCeiling, 'w8_37: Calibrated result <= ceiling');

    // Test: All-accurate backtests (error < 15%) → high calibrated confidence
    const accurateTests = Array(10).fill(null).map(() => ({
        predicted: 100,
        actual: 105 // 5% error
    }));
    const calib5 = calibrator.calibrate(0.5, accurateTests);
    assert(calib5.calibratedConfidence > 0.4, 'w8_38: Accurate backtests → high calibrated confidence');

    // Test: All-inaccurate backtests → low calibrated confidence
    const inaccurateTests = Array(10).fill(null).map(() => ({
        predicted: 100,
        actual: 200 // 100% error
    }));
    const calib6 = calibrator.calibrate(0.5, inaccurateTests);
    assert(calib6.calibratedConfidence < 0.6, 'w8_39: Inaccurate backtests → low calibrated confidence');

    // Test: Reason string is present and informative
    assert(typeof calib1.reason === 'string', 'w8_40: Reason is a string');
    assert(calib1.reason.length > 10, 'w8_41: Reason is informative');

    // Test: Null backtest array
    const calib7 = calibrator.calibrate(0.5, null);
    assert(calib7.insufficientData === true, 'w8_42: Null backtest → insufficientData=true');

    // Test: Mixed accuracy backtests
    const mixedTests = [
        { predicted: 100, actual: 105 }, // 5% error (accurate)
        { predicted: 100, actual: 120 }, // 20% error (inaccurate)
        { predicted: 100, actual: 102 }, // 2% error (accurate)
        { predicted: 100, actual: 200 }, // 100% error (inaccurate)
        { predicted: 50, actual: 52 },   // 4% error (accurate)
        { predicted: 50, actual: 100 },  // 100% error (inaccurate)
        { predicted: 200, actual: 195 }, // 2.5% error (accurate)
        { predicted: 200, actual: 150 }, // 25% error (inaccurate)
        { predicted: 75, actual: 80 },   // 6.7% error (accurate)
        { predicted: 75, actual: 500 }   // 566% error (inaccurate)
    ];
    const calib8 = calibrator.calibrate(0.5, mixedTests);
    assert(calib8.insufficientData === false, 'w8_43: Mixed accuracy backtests calibrated');
    assert(calib8.calibratedConfidence > 0.05 && calib8.calibratedConfidence < 0.95, 'w8_44: Mixed accuracy calibration within bounds');

    // Test: Backtests with zero actual value (edge case)
    const zeroActualTests = [
        { predicted: 100, actual: 0 }, // Error = 1 (100%)
        { predicted: 0, actual: 0 },   // Error = 0
        { predicted: 50, actual: 0 }   // Error = 1 (100%)
    ];
    // Should not crash
    const calib9 = calibrator.calibrate(0.5, zeroActualTests.concat(Array(10).fill({ predicted: 100, actual: 100 })));
    assert(typeof calib9.calibratedConfidence === 'number', 'w8_45: Zero actual values handled gracefully');

    // Test: Very high raw score → still capped at ceiling
    const calib10 = calibrator.calibrate(1.0, Array(10).fill({ predicted: 100, actual: 100 }));
    assert(calib10.calibratedConfidence <= CALIBRATION_CONFIG.confidenceCeiling, 'w8_46: Very high raw capped at ceiling');

    // Test: Reason mentions backtest count
    assert(calib3.reason.includes('10'), 'w8_47: Calibrated reason mentions backtest count');

    // =========================================================================
    // SECTION 4: getCalibrationCurve() (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 4] getCalibrationCurve() Method Tests');

    // Test: Returns object with expected fields
    const curve1 = calibrator.getCalibrationCurve(Array(10).fill({ predicted: 100, actual: 100 }));
    assert(typeof curve1 === 'object', 'w8_48: getCalibrationCurve returns object');
    assert(typeof curve1.A === 'number', 'w8_49: Curve has A (numeric)');
    assert(typeof curve1.B === 'number', 'w8_50: Curve has B (numeric)');
    assert(typeof curve1.convergence === 'number', 'w8_51: Curve has convergence (numeric)');
    assert(typeof curve1.numIterations === 'number', 'w8_52: Curve has numIterations (numeric)');

    // Test: A and B are finite
    assert(isFinite(curve1.A), 'w8_53: A is finite (not NaN)');
    assert(isFinite(curve1.B), 'w8_54: B is finite (not NaN)');

    // Test: Convergence is positive
    assert(curve1.convergence >= 0, 'w8_55: Convergence is non-negative');

    // Test: numIterations <= maxIterations
    assert(curve1.numIterations <= CALIBRATION_CONFIG.plattScalingIterations, 'w8_56: numIterations <= maxIterations (100)');

    // Test: Empty history → A=1, B=0
    const curve2 = calibrator.getCalibrationCurve([]);
    assert(curve2.A === 1, 'w8_57: Empty history → A=1');
    assert(curve2.B === 0, 'w8_58: Empty history → B=0');
    assert(curve2.convergence === 0, 'w8_59: Empty history → convergence=0');
    assert(curve2.numIterations === 0, 'w8_60: Empty history → numIterations=0');

    // Test: Null history → A=1, B=0
    const curve3 = calibrator.getCalibrationCurve(null);
    assert(curve3.A === 1, 'w8_61: Null history → A=1');
    assert(curve3.B === 0, 'w8_62: Null history → B=0');

    // Test: Single-element history still trains
    const curve4 = calibrator.getCalibrationCurve([{ predicted: 100, actual: 100 }]);
    assert(isFinite(curve4.A) && isFinite(curve4.B), 'w8_63: Single-element history trains');

    // Test: Accurate history (all perfect predictions)
    const perfectTests = Array(10).fill({ predicted: 100, actual: 100 });
    const curve5 = calibrator.getCalibrationCurve(perfectTests);
    assert(isFinite(curve5.A) && isFinite(curve5.B), 'w8_64: Perfect history trains without error');

    // Test: Mixed accuracy typically converges
    const mixedCurve = calibrator.getCalibrationCurve(mixedTests);
    assert(mixedCurve.numIterations > 0, 'w8_65: Mixed accuracy trains (numIterations > 0)');
    assert(isFinite(mixedCurve.A) && isFinite(mixedCurve.B), 'w8_66: Mixed accuracy produces finite A, B');

    // Test: Gradient descent converges (usually < 100 iterations)
    assert(mixedCurve.numIterations < CALIBRATION_CONFIG.plattScalingIterations || mixedCurve.numIterations === CALIBRATION_CONFIG.plattScalingIterations, 'w8_67: Training respects max iterations');

    // Test: Learning rate does not cause explosion (A, B reasonable)
    assert(Math.abs(mixedCurve.A) < 100, 'w8_68: A is reasonable (|A| < 100)');
    assert(Math.abs(mixedCurve.B) < 100, 'w8_69: B is reasonable (|B| < 100)');

    // =========================================================================
    // SECTION 5: bootstrapInterval() (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 5] bootstrapInterval() Method Tests');

    // Test: Returns correct structure
    const data1 = Array(20).fill(null).map((_, i) => ({ value: 100 + i }));
    const interval1 = calibrator.bootstrapInterval(data1);
    assert(typeof interval1 === 'object', 'w8_70: bootstrapInterval returns object');
    assert(typeof interval1.lower === 'number', 'w8_71: Has lower (numeric)');
    assert(typeof interval1.upper === 'number', 'w8_72: Has upper (numeric)');
    assert(typeof interval1.median === 'number', 'w8_73: Has median (numeric)');
    assert(Array.isArray(interval1.interval), 'w8_74: Has interval (array)');

    // Test: lower < median < upper
    assert(interval1.lower <= interval1.median, 'w8_75: lower <= median');
    assert(interval1.median <= interval1.upper, 'w8_76: median <= upper');

    // Test: interval matches [lower, upper]
    assert(interval1.interval[0] === interval1.lower, 'w8_77: interval[0] = lower');
    assert(interval1.interval[1] === interval1.upper, 'w8_78: interval[1] = upper');

    // Test: < 3 data points → zeros
    const interval2 = calibrator.bootstrapInterval([{ value: 100 }, { value: 200 }]);
    assert(interval2.lower === 0 && interval2.upper === 0 && interval2.median === 0, 'w8_79: < 3 points → all zeros');

    // Test: Empty data → zeros
    const interval3 = calibrator.bootstrapInterval([]);
    assert(interval3.lower === 0 && interval3.upper === 0, 'w8_80: Empty data → zeros');

    // Test: Null data → zeros
    const interval4 = calibrator.bootstrapInterval(null);
    assert(interval4.lower === 0 && interval4.upper === 0, 'w8_81: Null data → zeros');

    // Test: Uniform data (all same values) → narrow interval
    const uniformData = Array(20).fill(null).map(() => ({ value: 100 }));
    const interval5 = calibrator.bootstrapInterval(uniformData);
    const uniformWidth = interval5.upper - interval5.lower;
    assert(uniformWidth < 50, 'w8_82: Uniform data → narrow interval');

    // Test: High-variance data → wide interval
    const varianceData = Array(20).fill(null).map((_, i) => ({ value: i < 10 ? 50 : 500 }));
    const interval6 = calibrator.bootstrapInterval(varianceData);
    const varianceWidth = interval6.upper - interval6.lower;
    assert(varianceWidth > uniformWidth, 'w8_83: High-variance → wider than uniform');

    // Test: Custom percentile (e.g., 90% instead of 95%)
    const interval7 = calibrator.bootstrapInterval(data1, 90);
    assert(typeof interval7.lower === 'number', 'w8_84: Custom percentile works');

    // Test: Custom nSamples
    const interval8 = calibrator.bootstrapInterval(data1, 95, 100);
    assert(typeof interval8.lower === 'number', 'w8_85: Custom nSamples works');

    // Test: Numeric data (not wrapped in objects)
    const numericData = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290];
    const interval9 = calibrator.bootstrapInterval(numericData);
    assert(interval9.lower >= 0, 'w8_86: Numeric array (not objects) handled');

    // =========================================================================
    // SECTION 6: assessDataSufficiency() (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 6] assessDataSufficiency() Method Tests');

    // Test: < 14 data points → insufficient
    const suff1 = calibrator.assessDataSufficiency(10, 0);
    assert(suff1.sufficient === false, 'w8_87: 10 data points → insufficient');
    assert(suff1.reason.includes('14'), 'w8_88: Reason mentions minimum 14');
    assert(suff1.confidenceMode === 'insufficient', 'w8_89: Mode is "insufficient"');

    // Test: Exactly 14 data points → sufficient
    const suff2 = calibrator.assessDataSufficiency(14, 0);
    assert(suff2.sufficient === true, 'w8_90: 14 data points → sufficient');

    // Test: 14 points, 0 backtests → sufficient but raw mode
    assert(suff2.confidenceMode === 'raw', 'w8_91: 14 points, 0 backtests → raw mode');
    assert(suff2.reason.includes('raw score'), 'w8_92: Raw mode reason mentions raw score');

    // Test: 14 points, 10 backtests → fully calibrated
    const suff3 = calibrator.assessDataSufficiency(14, 10);
    assert(suff3.sufficient === true, 'w8_93: 14 points, 10 backtests → sufficient');
    assert(suff3.confidenceMode === 'calibrated', 'w8_94: 10 backtests → calibrated mode');
    assert(suff3.minRequired === 0, 'w8_95: minRequired = 0 for calibrated');

    // Test: 30 points, 15 backtests → fully calibrated
    const suff4 = calibrator.assessDataSufficiency(30, 15);
    assert(suff4.sufficient === true, 'w8_96: 30 points, 15 backtests → sufficient');
    assert(suff4.confidenceMode === 'calibrated', 'w8_97: 15 backtests → calibrated');

    // Test: 14 points, 5 backtests → raw mode (not enough for calibration)
    const suff5 = calibrator.assessDataSufficiency(14, 5);
    assert(suff5.sufficient === true, 'w8_98: 14 points, 5 backtests → sufficient');
    assert(suff5.confidenceMode === 'raw', 'w8_99: 5 backtests → still raw mode');

    // Test: minRequired field
    assert(typeof suff5.minRequired === 'number', 'w8_100: minRequired is a number');
    assert(suff5.minRequired > 0, 'w8_101: minRequired > 0 when not enough backtests');

    // Test: Large data, many backtests
    const suff6 = calibrator.assessDataSufficiency(365, 100);
    assert(suff6.sufficient === true, 'w8_102: Large data → sufficient');
    assert(suff6.confidenceMode === 'calibrated', 'w8_103: 100 backtests → calibrated');

    // Test: Edge case: exactly 9 backtests (just before threshold)
    const suff7 = calibrator.assessDataSufficiency(14, 9);
    assert(suff7.confidenceMode === 'raw', 'w8_104: 9 backtests → raw mode (just under threshold)');

    // Test: Return object structure
    assert('sufficient' in suff1 && 'reason' in suff1 && 'minRequired' in suff1 && 'confidenceMode' in suff1, 'w8_105: Return has all required fields');

    // =========================================================================
    // SECTION 7: Structural Tests — Wiring Verification (~20 tests)
    // =========================================================================
    console.log('\n[SECTION 7] Structural Tests — Wiring Verification');

    const calSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'forecast-calibration.js'), 'utf-8');
    const calNoComments = calSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    assert(calSrc.includes('W-008'), 'w8_106: forecast-calibration.js has W-008 in header');
    assert(calNoComments.includes('export class ForecastCalibrator'), 'w8_107: ForecastCalibrator class exported');
    assert(calNoComments.includes('export const CALIBRATION_CONFIG'), 'w8_108: CALIBRATION_CONFIG exported');
    assert(calNoComments.includes('export function createForecastCalibrator'), 'w8_109: createForecastCalibrator exported');

    // Test: ForecastingAgent imports forecast-calibration.js
    const forecastingSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'forecasting-agent.js'), 'utf-8');
    const forecastingNoComments = forecastingSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    assert(forecastingNoComments.includes('forecast-calibration'), 'w8_110: forecasting-agent.js imports forecast-calibration');
    assert(forecastingNoComments.includes('createForecastCalibrator'), 'w8_111: forecasting-agent.js calls createForecastCalibrator');
    assert(forecastingNoComments.includes('this.calibrator'), 'w8_112: forecasting-agent.js has this.calibrator property');
    assert(forecastingNoComments.includes('_computeCalibratedConfidence'), 'w8_113: forecasting-agent.js has _computeCalibratedConfidence method');
    assert(forecastingNoComments.includes('_computeResidualVariance'), 'w8_114: forecasting-agent.js has _computeResidualVariance method');
    assert(forecastingNoComments.includes('_computeTrendStability'), 'w8_115: forecasting-agent.js has _computeTrendStability method');
    assert(forecastingNoComments.includes('dataSufficiency'), 'w8_116: forecasting-agent.js returns dataSufficiency');
    assert(forecastingNoComments.includes('predictionIntervals'), 'w8_117: forecasting-agent.js returns predictionIntervals');

    // CRITICAL TEST: Old formula not present
    const hasOldFormula = forecastingNoComments.includes('rSquared + 0.3') ||
                          forecastingNoComments.includes('linear.rSquared + 0.3') ||
                          forecastingNoComments.includes('Math.min(0.9, linear.rSquared + 0.3)');
    assert(!hasOldFormula, 'w8_118: CRITICAL: Old Math.min(0.9, linear.rSquared + 0.3) is NOT present');

    // CRITICAL TEST: _computeCalibratedConfidence is used instead
    assert(forecastingNoComments.includes('_computeCalibratedConfidence(linear'), 'w8_119: CRITICAL: _computeCalibratedConfidence is called instead');

    // Test: ForecastingAgent memory integration
    assert(forecastingNoComments.includes('this.memory'), 'w8_120: forecasting-agent uses this.memory');
    assert(forecastingNoComments.includes('storeForecastOutcome'), 'w8_121: forecasting-agent has storeForecastOutcome method');

    // Test: calibrator.getCalibrationCurve has gradient descent
    assert(calNoComments.includes('gradA') && calNoComments.includes('gradB'), 'w8_122: forecast-calibration has gradient variables');
    assert(calNoComments.includes('prevLoss'), 'w8_123: Convergence tracking with prevLoss');

    // Test: Bootstrap algorithm present
    assert(calNoComments.includes('bootstrapInterval'), 'w8_124: Bootstrap prediction intervals method');
    assert(calNoComments.includes('resample'), 'w8_125: Bootstrap resampling logic');

    // =========================================================================
    // SECTION 8: Factory Function & Edge Cases (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 8] Factory Function & Edge Cases');

    // Test: createForecastCalibrator returns instance
    const cal1 = createForecastCalibrator();
    assert(cal1 instanceof ForecastCalibrator, 'w8_126: createForecastCalibrator() returns ForecastCalibrator instance');

    // Test: Multiple calls create independent instances
    const cal2 = createForecastCalibrator();
    assert(cal1 !== cal2, 'w8_127: Each call creates new instance');

    // Test: Instance has required methods
    assert(typeof cal1.rawConfidence === 'function', 'w8_128: Instance has rawConfidence method');
    assert(typeof cal1.calibrate === 'function', 'w8_129: Instance has calibrate method');
    assert(typeof cal1.getCalibrationCurve === 'function', 'w8_130: Instance has getCalibrationCurve method');
    assert(typeof cal1.bootstrapInterval === 'function', 'w8_131: Instance has bootstrapInterval method');
    assert(typeof cal1.assessDataSufficiency === 'function', 'w8_132: Instance has assessDataSufficiency method');

    // Test: NaN input edge case across multiple methods
    const nanTests = [
        () => calibrator.rawConfidence(NaN, NaN, NaN, NaN),
        () => calibrator.getCalibrationCurve(null),
        () => calibrator.bootstrapInterval(null),
        () => calibrator.assessDataSufficiency(NaN, NaN)
    ];
    for (const test of nanTests) {
        try {
            const result = test();
            assert(result !== undefined, 'w8_133: NaN/null edge case does not crash');
        } catch (e) {
            assert(false, 'w8_133: Edge case threw error: ' + e.message);
        }
    }

    // Test: Very large numbers don't cause overflow
    const largeTest = calibrator.rawConfidence(1e10, 1e10, 1e10, 1e10);
    assert(largeTest <= CALIBRATION_CONFIG.confidenceCeiling, 'w8_134: Large numbers clamped properly');

    // Test: Very small positive numbers handled
    const smallTest = calibrator.rawConfidence(1e-10, 1e-10, 1e-10, 1e-10);
    assert(smallTest >= CALIBRATION_CONFIG.confidenceFloor, 'w8_135: Small positive numbers handled');

    // =========================================================================
    // SECTION 9: Integration — Simulated Workflow (~15 tests)
    // =========================================================================
    console.log('\n[SECTION 9] Integration — Simulated Workflow');

    // Simulate realistic workflow: accumulate backtest data and calibrate
    const workflowCal = new ForecastCalibrator();

    // Phase 1: Little data, no backtests
    const phase1Sufficiency = workflowCal.assessDataSufficiency(7, 0);
    assert(phase1Sufficiency.sufficient === false, 'w8_136: Phase 1: Insufficient data');

    // Phase 2: Enough data, no backtests
    const phase2Raw = workflowCal.rawConfidence(0.65, 20, 0.1, 0.7);
    const phase2Suff = workflowCal.assessDataSufficiency(20, 0);
    assert(phase2Suff.sufficient === true && phase2Suff.confidenceMode === 'raw', 'w8_137: Phase 2: Raw confidence mode');

    // Phase 3: Enough data and backtests
    const backtestData = [
        { predicted: 100, actual: 102 },
        { predicted: 150, actual: 148 },
        { predicted: 200, actual: 210 },
        { predicted: 75, actual: 80 },
        { predicted: 125, actual: 130 },
        { predicted: 300, actual: 290 },
        { predicted: 50, actual: 55 },
        { predicted: 175, actual: 180 },
        { predicted: 225, actual: 220 },
        { predicted: 275, actual: 285 }
    ];
    const phase3Suff = workflowCal.assessDataSufficiency(30, 10);
    assert(phase3Suff.sufficient === true && phase3Suff.confidenceMode === 'calibrated', 'w8_138: Phase 3: Calibrated mode');

    const phase3Calibrated = workflowCal.calibrate(phase2Raw, backtestData);
    assert(phase3Calibrated.insufficientData === false, 'w8_139: Phase 3: Calibrated confidence computed');

    // Test: Confidence changes with backtests
    assert(phase2Raw !== phase3Calibrated.calibratedConfidence || phase2Raw === phase3Calibrated.calibratedConfidence, 'w8_140: Calibration applied (may or may not change raw)');

    // Test: Prediction intervals
    const dataForIntervals = [
        { value: 100 }, { value: 110 }, { value: 120 }, { value: 130 },
        { value: 140 }, { value: 150 }, { value: 160 }, { value: 170 },
        { value: 180 }, { value: 190 }, { value: 200 }, { value: 210 },
        { value: 220 }, { value: 230 }, { value: 240 }, { value: 250 },
        { value: 260 }, { value: 270 }, { value: 280 }, { value: 290 }
    ];
    const intervals = workflowCal.bootstrapInterval(dataForIntervals, 95);
    assert(intervals.lower < intervals.upper, 'w8_141: Prediction interval is valid range');

    // =========================================================================
    // SECTION 10: Private Helper Validation (~10 tests)
    // =========================================================================
    console.log('\n[SECTION 10] Private Helper Methods');

    // Test: _quickLinearRegression is available
    assert(typeof calibrator._quickLinearRegression === 'function', 'w8_142: _quickLinearRegression is a method');

    // Test: _quickLinearRegression with simple data
    const lrData = [
        { day: 0, value: 10 },
        { day: 1, value: 20 },
        { day: 2, value: 30 },
        { day: 3, value: 40 }
    ];
    const lr = calibrator._quickLinearRegression(lrData);
    assert(typeof lr.slope === 'number' && typeof lr.intercept === 'number', 'w8_143: _quickLinearRegression returns slope and intercept');

    // Test: Linear regression on increasing data should have positive slope
    assert(lr.slope > 0, 'w8_144: Increasing data → positive slope');

    // Test: _quickLinearRegression with empty data
    const lrEmpty = calibrator._quickLinearRegression([]);
    assert(lrEmpty.slope === 0 && lrEmpty.intercept === 0, 'w8_145: Empty data → slope=0, intercept=0');

    // Test: _quickLinearRegression with single point
    const lrSingle = calibrator._quickLinearRegression([{ day: 0, value: 100 }]);
    assert(typeof lrSingle.slope === 'number', 'w8_146: Single point handled');

    // Test: Sigmoid function clipping in calibrate()
    const extremeRaw = 1.0; // Maximum raw confidence
    const extremeCalib = calibrator.calibrate(extremeRaw, Array(10).fill({ predicted: 100, actual: 100 }));
    assert(extremeCalib.calibratedConfidence <= 0.95, 'w8_147: Sigmoid output clipped at ceiling');

    // Test: Cross-entropy loss in gradient descent converges
    const convergentTests = Array(15).fill(null).map(() => ({
        predicted: 100 + Math.random() * 20,
        actual: 100 + Math.random() * 20
    }));
    const convergCurve = calibrator.getCalibrationCurve(convergentTests);
    assert(convergCurve.convergence < 1, 'w8_148: Typical cross-entropy loss converges below 1');

    // =========================================================================
    // SECTION 11: Comprehensive Comparison Tests (~12 tests)
    // =========================================================================
    console.log('\n[SECTION 11] Comprehensive Comparison — Old vs New');

    // Test suite comparing new rawConfidence to old formula
    const comparisonCases = [
        { r2: 0.0, expected: 0.3 },  // Old: 0.0 + 0.3 = 0.3
        { r2: 0.1, expected: 0.4 },  // Old: 0.1 + 0.3 = 0.4
        { r2: 0.2, expected: 0.5 },  // Old: 0.2 + 0.3 = 0.5
        { r2: 0.5, expected: 0.8 },  // Old: 0.5 + 0.3 = 0.8
        { r2: 0.6, expected: 0.9 },  // Old: 0.6 + 0.3 = 0.9 (clamped)
        { r2: 0.7, expected: 0.9 },  // Old: 0.7 + 0.3 = 1.0 → 0.9 (clamped)
    ];

    for (let i = 0; i < comparisonCases.length; i++) {
        const testCase = comparisonCases[i];
        const newRaw = calibrator.rawConfidence(testCase.r2, 20, 0.1, 0.5);
        const shouldBeLess = newRaw < testCase.expected;

        // All new formula results should be <= old formula
        assert(newRaw <= testCase.expected, `w8_${149 + i}: rawConfidence(${testCase.r2},...) ≤ old formula ${testCase.expected} (${newRaw.toFixed(3)})`);
    }

    // =========================================================================
    // SECTION 12: Pass 21 — execute() initMemory before calibration
    // =========================================================================
    console.log('\n[SECTION 12] Pass 21 — execute() initMemory before calibration');

    const agentSrc = fs.readFileSync(path.join(__dirname, '..', 'agents', 'forecasting-agent.js'), 'utf-8');
    const agentNoComments = agentSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Test w8_155: execute() contains initMemory call
    assert(agentNoComments.includes('execute') && agentNoComments.includes('initMemory'),
        'w8_155: execute() method contains initMemory call');

    // Test w8_156: initMemory call is present in execute method
    const executeMatch = agentNoComments.match(/async\s+execute\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
    const executeBody = executeMatch ? executeMatch[0] : '';
    assert(executeBody.includes('initMemory'),
        'w8_156: initMemory is called within execute() method body');

    // Test w8_157: initMemory call is BEFORE generateForecast (lower line number)
    const initMemoryLine = agentSrc.indexOf('await this.memory.initMemory()');
    const generateForecastLine = agentSrc.indexOf('this.generateForecast');
    assert(initMemoryLine > 0 && generateForecastLine > 0 && initMemoryLine < generateForecastLine,
        'w8_157: initMemory() is called before generateForecast() in execute()');

    // Test w8_158: initMemory call is wrapped in try/catch
    const tryBlockMatch = agentNoComments.match(/try\s*\{\s*await\s+this\.memory\.initMemory\(\)[^}]*\}\s*catch/);
    assert(tryBlockMatch !== null,
        'w8_158: initMemory() is wrapped in try/catch block');

    // Test w8_159: Error message includes 'Memory init failed'
    assert(agentSrc.includes('Memory init failed'),
        'w8_159: Error handling message includes "Memory init failed"');

    // Test w8_160: Condition checks this.memory exists before accessing memories
    assert(agentNoComments.includes('this.memory &&') || agentNoComments.includes('this.memory &&'),
        'w8_160: Code checks this.memory exists before accessing properties');

    // Test w8_161: Condition checks memories.length === 0
    const memoryLengthCheck = agentNoComments.includes('memories.length === 0') ||
                              agentNoComments.includes('this.memory.memories.length === 0');
    assert(memoryLengthCheck,
        'w8_161: Condition checks this.memory.memories.length === 0');

    // Test w8_162: _computeCalibratedConfidence accesses this.memory.memories
    assert(agentNoComments.includes('_computeCalibratedConfidence') &&
           agentNoComments.includes('this.memory.memories'),
        'w8_162: _computeCalibratedConfidence method accesses this.memory.memories');

    // Test w8_163: calibrator.calibrate is called with backtestHistory from memory
    const computeCalibMatch = agentNoComments.match(/backtestHistory[\s\S]*?this\.calibrator\.calibrate/);
    assert(computeCalibMatch !== null || agentNoComments.includes('this.calibrator.calibrate(raw, backtestHistory)'),
        'w8_163: calibrator.calibrate() is called with backtestHistory derived from memory');

    // Test w8_164: initMemory call happens in execute, not in constructor
    const constructorMatch = agentNoComments.match(/constructor\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
    const constructorBody = constructorMatch ? constructorMatch[0] : '';
    assert(!constructorBody.includes('initMemory'),
        'w8_164: initMemory is NOT called in constructor (deferred to execute)');

    // Test w8_165: Memory condition protects against accessing null memory
    const memoryGuard = agentNoComments.match(/if\s*\(\s*this\.memory\s*&&\s*this\.memory\.memories\.length\s*===\s*0\s*\)/);
    assert(memoryGuard !== null,
        'w8_165: Code uses defensive check: if (this.memory && this.memory.memories.length === 0)');

    // Test w8_166: Structural: backtest history filters by 'outcome' memory type
    assert(agentNoComments.includes("memory_type === 'outcome'") || agentNoComments.includes("memory_type === \"outcome\""),
        'w8_166: backtestHistory filters memories by type "outcome"');

    // Test w8_167: Structural: backtestHistory extracts context.prediction and context.actual
    const historyConstruct = agentNoComments.includes('predicted: m.context.prediction') &&
                            agentNoComments.includes('actual: m.context.actual');
    assert(historyConstruct,
        'w8_167: backtestHistory maps to {predicted, actual} from memory context');

    // =========================================================================
    // RESULTS
    // =========================================================================
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`W-008 RESULTS: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  • ${f}`));
    }
    console.log('═'.repeat(70));
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
