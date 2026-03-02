import { computeGraphScores } from './src/utils/scoring.js';

// Define a test tree: A -> B -> C
// B also needs D. D needs Z.
// Tree:
// A needs B
// B needs C, D
// D needs Z

// Define the criteria map
const criteriaMap = {
    'A': { id: 'a_1', code: 'A', response: 'NA', isRoot: true, links: ['B'], severity: 1, isCritical: false },
    'B': { id: 'b_1', code: 'B', response: 'NA', isRoot: true, links: ['C', 'D'], severity: 1, isCritical: false },
    'C': { id: 'c_1', code: 'C', response: 'NA', isRoot: false, links: [], severity: 1, isCritical: false },
    'D': { id: 'd_1', code: 'D', response: 'NA', isRoot: true, links: ['Z'], severity: 1, isCritical: false },
    'Z': { id: 'z_1', code: 'Z', response: 'NA', isRoot: false, links: [], severity: 1, isCritical: true } // Z is critical
};

console.log("--- TEST 1: EMPTY TREE ---");
const emptyRes = computeGraphScores(criteriaMap);
console.log("A isDraft:", emptyRes['A'].isDraft, " | points:", emptyRes['A'].points);

console.log("\n--- TEST 2: PARTIAL TREE (C=PC, Z=NA) ---");
criteriaMap['C'].response = 'PC';
const partialRes = computeGraphScores(criteriaMap);
console.log("A isDraft:", partialRes['A'].isDraft, " | points:", partialRes['A'].points);
console.log("B isDraft:", partialRes['B'].isDraft, " | response:", partialRes['B'].response);

console.log("\n--- TEST 3: FULL TREE (C=PC, Z=PC) ---");
// Z is critical, so PC should immediately force NC
criteriaMap['Z'].response = 'PC';
const fullRes = computeGraphScores(criteriaMap);
console.log("Z response:", fullRes['Z'].response, "| Z critical fail?", fullRes['Z'].criticalFail);
console.log("D critical fail?", fullRes['D'].criticalFail);
console.log("B critical fail?", fullRes['B'].criticalFail);
console.log("A critical fail?", fullRes['A'].criticalFail);
console.log("A isDraft:", fullRes['A'].isDraft, " | final display response:", fullRes['A'].response);
