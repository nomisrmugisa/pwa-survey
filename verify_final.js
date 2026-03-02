
import { calculateStandardScore } from './src/utils/scoring.js';
import { normalizeCriterionCode, compareCriterionCodes } from './src/utils/normalization.js';

// Mock data representing a criteria that has a tagged link from our new JSON
const testCriteria = [
    {
        id: '1.2.3.1',
        code: '1.2.3.1',
        response: 'NA',
        isCritical: false,
        severity: 2,
        isRoot: true,
        links: ['1.2.1.6-root(1.2.1.6)', '1.2.4.1'] // Tagged link and normal link
    },
    {
        id: '1.2.1.6',
        code: '1.2.1.6',
        response: 'C',
        isCritical: false,
        severity: 2,
        isRoot: false
    },
    {
        id: '1.2.4.1',
        code: '1.2.4.1',
        response: 'C',
        isCritical: false,
        severity: 2,
        isRoot: false
    }
];

console.log("--- Testing Root Detection with Tagged Configuration ---");
const result = calculateStandardScore(testCriteria);
const score1231 = result.criteriaScores['1.2.3.1'];

console.log("Criterion 1.2.3.1 Result:");
console.log(JSON.stringify(score1231, null, 2));

const expectedRoot = '1.2.1.6';
if (score1231.rootSources && score1231.rootSources.includes(expectedRoot)) {
    console.log(`✅ SUCCESS: ${expectedRoot} correctly identified as root even with -root tag in config.`);
} else {
    console.log("❌ FAILURE: Root detection failed with tagged config.");
}

if (score1231.points === 100) {
    console.log("✅ SUCCESS: Points calculated correctly (100 pts) despite tagged links.");
} else {
    console.log(`❌ FAILURE: Points calculation error. Got ${score1231.points} expected 100.`);
}
