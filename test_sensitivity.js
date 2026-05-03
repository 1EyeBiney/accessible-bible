/**
 * test_sensitivity.js
 * Runs the sensitivity.js classifier against the fixtures.
 */

import fs from 'fs';
import { classifySensitivity } from './sensitivity.js';

console.log("⏳ Running Semantic Safety Catch Tests...\n");

try {
    const rawData = fs.readFileSync('./sensitivity_fixtures.json', 'utf8');
    const fixtures = JSON.parse(rawData);
    
    let passed = 0;
    let failed = 0;

    fixtures.forEach((fixture, index) => {
        const result = classifySensitivity(fixture.input);
        if (result.level === fixture.expected) {
            console.log(`✅ [PASS] "${fixture.input}" -> ${result.level}`);
            passed++;
        } else {
            console.log(`❌ [FAIL] "${fixture.input}" | Expected: ${fixture.expected}, Got: ${result.level} (Matched: ${result.matched})`);
            failed++;
        }
    });

    console.log(`\n📊 Test Summary: ${passed} Passed | ${failed} Failed`);
    
} catch (error) {
    console.error("Failed to run tests:", error);
}