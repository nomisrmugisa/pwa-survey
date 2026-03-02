import { computeGraphScores } from './src/utils/scoring.js';

const criteriaMap = {
    '2.5.1.1': {
        id: 'c1',
        code: '2.5.1.1',
        response: 'NA',
        isRoot: true,
        links: ['2.4.1.4', '2.4.1.5'],
        severity: 3,
        isCritical: false
    },
    '2.4.1.4': {
        id: 'c2',
        code: '2.4.1.4',
        response: 'C',
        severity: 3,
        isCritical: false,
        links: []
    },
    '2.4.1.5': {
        id: 'c3',
        code: '2.4.1.5',
        response: 'NC',
        severity: 3,
        isCritical: false,
        links: []
    }
};

console.log("--- EMS SCORING TEST (2.5.1.1) ---");
const scores = computeGraphScores(criteriaMap);

const root = scores['2.5.1.1'];
const l1 = scores['2.4.1.4'];
const l2 = scores['2.4.1.5'];

console.log(`2.4.1.4 (C, Sev 3): ${l1.points} pts, Response: ${l1.response}`);
console.log(`2.4.1.5 (NC, Sev 3): ${l2.points} pts, Response: ${l2.response}`);
console.log(`2.5.1.1 (Root, Sev 3): ${root.points} pts, Response: ${root.response}`);

// Expected: 47.5 pts, NC
if (root.points === 47.5 && root.response === 'NC') {
    console.log("\n✅ SUCCESS: Root score and status derived correctly.");
} else {
    console.log("\n❌ FAILURE: Unexpected root score or status.");
}

console.log("\n--- SEQUENCE ENFORCEMENT TEST ---");
criteriaMap['2.4.1.5'].response = 'NA'; // Make it incomplete
const pendingScores = computeGraphScores(criteriaMap);
const pendingRoot = pendingScores['2.5.1.1'];
console.log(`Root isDraft: ${pendingRoot.isDraft}`);
console.log(`Root Response: ${pendingRoot.response}`);

if (pendingRoot.response === 'Pending') {
    console.log("✅ SUCCESS: Root shows 'Pending' when assessment is incomplete.");
} else {
    console.log("❌ FAILURE: Root did not show 'Pending' for partial data.");
}
