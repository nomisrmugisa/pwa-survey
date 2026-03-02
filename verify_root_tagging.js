
import { calculateStandardScore } from './src/utils/scoring.js';
import { normalizeCriterionCode, compareCriterionCodes } from './src/utils/normalization.js';

const testCriteria = [
    {
        id: '1.2.1.4',
        code: '1.2.1.4',
        response: 'NA',
        isCritical: false,
        severity: 2,
        isRoot: true,
        links: ['1.2.1.1', '2.2.2.2'] // 1.2.1.1 is earlier (ROOT), 2.2.2.2 is later
    },
    {
        id: '1.2.1.1',
        code: '1.2.1.1',
        response: 'C',
        isCritical: false,
        severity: 2,
        isRoot: false,
        links: []
    },
    {
        id: '2.2.2.2',
        code: '2.2.2.2',
        response: 'C',
        isCritical: false,
        severity: 2,
        isRoot: false,
        links: []
    }
];

console.log("--- Testing Root Source Identification ---");
const result = calculateStandardScore(testCriteria);
const score1214 = result.criteriaScores['1.2.1.4'];

console.log("Criterion 1.2.1.4 Results:");
console.log(JSON.stringify(score1214, null, 2));

if (score1214.rootSources.includes('1.2.1.1') && !score1214.rootSources.includes('2.2.2.2')) {
    console.log("✅ SUCCESS: 1.2.1.1 correctly identified as root, 2.2.2.2 ignored as root.");
} else {
    console.log("❌ FAILURE: Root source identification incorrect.");
    console.log("Detected roots:", score1214.rootSources);
}
