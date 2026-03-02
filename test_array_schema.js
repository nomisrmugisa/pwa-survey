
import { calculateStandardScore } from './src/utils/scoring.js';
import fs from 'fs';

// Load our new schema
const emsLinks = JSON.parse(fs.readFileSync('./src/assets/ems_links.json', 'utf8'));

// Replicate App.jsx loading logic
const linksDataLookup = {};
emsLinks.forEach(linkObj => {
    linksDataLookup[linkObj.criteria] = {
        roots: linkObj.root || [],
        linked_criteria: linkObj.linked_criteria || []
    };
});

// A -> B -> C test
// Let's use real IDs from the generated ems_links.json 
// E.g. A = 1.2.1.2 (Target), B = 1.2.5.1
// Wait, in our schema:
// 1.2.1.2 has linked_criteria: [1.2.5.1]
// 1.2.5.1 has root: [1.2.1.2], linked_criteria: []

// Let's create dummy criteria matching this
const criteriaC = {
    id: 'C_ID', code: '1.2.5.1', response: 'PC', isCritical: false, severity: 2,
    isRoot: linksDataLookup['1.2.5.1'].linked_criteria.length > 0,
    links: linksDataLookup['1.2.5.1'].linked_criteria,
    roots: linksDataLookup['1.2.5.1'].roots
};

const criteriaA = {
    id: 'A_ID', code: '1.2.1.2', response: 'NA', isCritical: false, severity: 2,
    isRoot: linksDataLookup['1.2.1.2'].linked_criteria.length > 0,
    links: linksDataLookup['1.2.1.2'].linked_criteria,
    roots: linksDataLookup['1.2.1.2'].roots
};

console.log("Criteria C (Data Entry):", criteriaC.code, "| isRoot:", criteriaC.isRoot, "| roots:", criteriaC.roots);
console.log("Criteria A (Target):", criteriaA.code, "| isRoot:", criteriaA.isRoot, "| links:", criteriaA.links);

// We need an allResponses map 
const allResponses = {
    '1.2.5.1': 'PC' // User answered PC for C
};

// Global accumulator
const globalScores = {};

// 1. Score C (the editable one)
console.log("\n--- Scoring C ---");
const resC = calculateStandardScore([criteriaC], globalScores, allResponses);
Object.assign(globalScores, resC);
console.log(resC);

// 2. Score A (the target that pulls from C)
console.log("\n--- Scoring A ---");
const resA = calculateStandardScore([criteriaA], globalScores, allResponses);
console.log(resA);

