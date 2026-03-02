
import { calculateStandardScore } from './src/utils/scoring.js';
import { normalizeCriterionCode } from './src/utils/normalization.js';

console.log("--- Testing Standard-Follows-Detail Hierarchy ---");

const globalScores = {};

// 1. Evidence Item (High ID) - 1.2.5.1
// It links back to 1.2.1.2 with -root tag.
// It SHOULD remain editable (not auto-calculated).
const evidenceCriteria = [
    {
        id: '1.2.5.1',
        code: '1.2.5.1',
        response: 'PC', // 75 pts (assuming Sev 1 for this test)
        severity: 1,
        isRoot: false, // In App.jsx, this is set based on links. 1.2.5.1 has only -root links, so isRoot=false
        links: ['1.2.1.2-root(1.2.1.2)']
    }
];

const evidenceResult = calculateStandardScore(evidenceCriteria, globalScores);
console.log("Evidence (1.2.5.1) Result:");
console.log(JSON.stringify(evidenceResult.criteriaScores['1.2.5.1'], null, 2));

// 2. Standard (Low ID) - 1.2.1.2
// It links to 1.2.5.1 (no -root tag).
// It SHOULD be auto-calculated.
const standardCriteria = [
    {
        id: '1.2.1.2',
        code: '1.2.1.2',
        response: 'NA',
        severity: 1,
        isRoot: true, // App.jsx sets this to true because it has a pull link
        links: ['1.2.5.1']
    }
];

// Combine all responses for scoring map
const allResponses = {
    '1.2.5.1': 'PC'
};

const standardResult = calculateStandardScore(standardCriteria, globalScores, allResponses);
console.log("\nStandard (1.2.1.2) Result:");
console.log(JSON.stringify(standardResult.criteriaScores['1.2.1.2'], null, 2));

if (standardResult.criteriaScores['1.2.1.2'].points === 75) {
    console.log("\n✅ SUCCESS: Standard (1.2.1.2) correctly pulled 75 pts from Evidence (1.2.5.1).");
} else {
    console.log(`\n❌ FAILURE: Standard expected 75 pts, but got ${standardResult.criteriaScores['1.2.1.2'].points}`);
}
