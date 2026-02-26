/**
 * Healthcare Accreditation Scoring Module
 * 
 * Provides deterministic, side-effect-free functions for calculating scores
 * at the standard, section, and overall assessment levels.
 * 
 * Scoring Model:
 * FULL = 2
 * PARTIAL = 1
 * NON = 0
 * NA = Excluded from maxScore
 */

/**
 * Helper to calculate points for a single Linked criterion based on severity and response
 */
const calculatePointsForLink = (response, severity) => {
    if (!response || response === 'NA') return null;

    const res = String(response).toUpperCase();

    // C is always 100
    // Matches C, FC, FULL, COMPLIANT, EMS_C, Q_FC, etc.
    if (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(res) || res.includes('COMPLIANT') && !res.includes('NON') && !res.includes('PARTIAL')) {
        return 100;
    }

    // PC scales based on severity (1=75, 2=65, 3=55, 4=45)
    // Matches PC, PARTIAL, SUBSTANTIAL, EMS_PC, Q_PC, etc.
    if (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(res) || res.includes('PARTIAL')) {
        const severityNum = parseInt(severity, 10) || 1;
        return 75 - ((severityNum - 1) * 10);
    }

    // NC scales based on severity (1=35, 2=25, 3=15, 4=5)
    // Matches NC, NON, NON_COMPLIANT, NON-COMPLIANT, EMS_NC, Q_NC, etc.
    if (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT)$/.test(res) || res.includes('NON')) {
        const severityNum = parseInt(severity, 10) || 1;
        return 35 - ((severityNum - 1) * 10);
    }

    return null; // NA or unhandled
};

/**
 * Calculates the score for a single standard based on an array of criteria.
 * 
 * @param {Array} criteria - Array of objects: { id, code, response, isCritical, severity, links, isRoot }
 * @returns {Object} { percent, totalScore, maxScore, criticalFail }
 */
export const calculateStandardScore = (criteria) => {
    if (!Array.isArray(criteria) || criteria.length === 0) {
        return { percent: 0, totalScore: 0, maxScore: 0, criticalFail: false, criteriaScores: {} };
    }

    let totalPoints = 0;
    let maxPossiblePoints = 0;
    let criticalFail = false;
    const criteriaScores = {}; // Store individual scores for UI display

    // 1. First pass: Fast lookup map of all linked criteria responses
    const responsesMap = {};
    for (const criterion of criteria) {
        if (criterion.code) {
            responsesMap[criterion.code] = criterion.response;
        }
    }

    // 2. Main pass: Calculate points
    for (const criterion of criteria) {
        const { id, code, response, isCritical, severity, isRoot, links } = criterion;

        let points = 0;
        let isScored = false;
        let calculatedResponse = response;

        // NA is completely ignored for overall calculations
        if (response === 'NA') {
            criteriaScores[id] = { points: null, response: 'NA', isRoot };
            continue;
        }

        // --- Critical Risk Veto Rule (PC -> NC if safety risk) ---
        // Assuming all Critical items carry a safety/legal risk as per doc
        const resForVeto = String(response).toUpperCase();
        if (isCritical && (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(resForVeto) || resForVeto.includes('PARTIAL'))) {
            calculatedResponse = 'NC'; // Force to NC logic
        }

        // --- Standard Failure Rule ---
        const calcResStr = String(calculatedResponse).toUpperCase();
        if (isCritical && (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT)$/.test(calcResStr) || calcResStr.includes('NON'))) {
            criticalFail = true;
        }

        if (isRoot && links && links.length > 0) {
            // --- ROOT CRITERION LOGIC (The Average Rule) ---
            let sumLinkedPoints = 0;
            let countScoredLinks = 0;
            let ncPcCount = 0;

            for (const linkCode of links) {
                const linkResponse = responsesMap[linkCode];
                if (!linkResponse || linkResponse === 'NA') continue;

                countScoredLinks++;

                // Track PC/NC for majority rule
                const lRes = String(linkResponse).toUpperCase();
                const isC = /^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(lRes) || (lRes.includes('COMPLIANT') && !lRes.includes('NON') && !lRes.includes('PARTIAL'));

                if (!isC) {
                    ncPcCount++;
                }

                // Assume linked items have the same severity as the root for simplicity in aggregation
                // unless explicitly provided in a more complex map later
                const linkPoints = calculatePointsForLink(linkResponse, severity);
                if (linkPoints !== null) sumLinkedPoints += linkPoints;
            }

            if (countScoredLinks > 0) {
                points = sumLinkedPoints / countScoredLinks;
                isScored = true;

                // --- Majority Rule Override ---
                if (ncPcCount > (countScoredLinks / 2)) {
                    // Force average down to PC equivalent if > 50% fail
                    // Or NC equivalent if > 75% fail (rough heuristic based on doc)
                    const pcThreshold = calculatePointsForLink('PC', severity);
                    const ncThreshold = calculatePointsForLink('NC', severity);

                    if (ncPcCount > (countScoredLinks * 0.75)) {
                        points = Math.min(points, ncThreshold);
                    } else {
                        points = Math.min(points, pcThreshold);
                    }
                }
            }

        } else {
            // --- LINKED (INDIVIDUAL) CRITERION LOGIC ---
            const calculatedPoints = calculatePointsForLink(calculatedResponse, severity);
            if (calculatedPoints !== null) {
                points = calculatedPoints;
                isScored = true;
            }
        }

        // Add to standard totals if it was scored
        if (isScored) {
            totalPoints += points;
            maxPossiblePoints += 100; // Max points per criterion is 100 in new system

            // Normalize response for display
            let displayRes = calculatedResponse;
            const dispStr = String(calculatedResponse).toUpperCase();
            if (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(dispStr) || (dispStr.includes('COMPLIANT') && !dispStr.includes('NON') && !dispStr.includes('PARTIAL'))) displayRes = 'C';
            if (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(dispStr) || dispStr.includes('PARTIAL')) displayRes = 'PC';
            if (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT)$/.test(dispStr) || dispStr.includes('NON')) displayRes = 'NC';

            criteriaScores[id] = { points: parseFloat(points.toFixed(2)), response: displayRes, isRoot };
        } else {
            criteriaScores[id] = { points: null, response, isRoot };
        }
    }

    // Apply Critical Fail override
    if (criticalFail) {
        return {
            percent: 0,
            totalScore: 0,
            maxScore: maxPossiblePoints,
            criticalFail: true,
            criteriaScores
        };
    }

    const percent = maxPossiblePoints === 0 ? 0 : (totalPoints / maxPossiblePoints) * 100;

    return {
        percent: parseFloat(percent.toFixed(2)),
        totalScore: parseFloat(totalPoints.toFixed(2)),
        maxScore: maxPossiblePoints,
        criticalFail: false,
        criteriaScores
    };
};

/**
 * Aggregates scores for a section based on an array of standard results.
 * 
 * @param {Array} standards - Array of results: { totalScore, maxScore, criticalFail }
 * @returns {Object} { percent, totalScore, maxScore, criticalFail }
 */
export const calculateSectionScore = (standards) => {
    if (!Array.isArray(standards) || standards.length === 0) {
        return { percent: 0, totalScore: 0, maxScore: 0, criticalFail: false };
    }

    let totalScoreSum = 0;
    let maxScoreSum = 0;
    let criticalFail = false;

    for (const standard of standards) {
        if (!standard) continue;

        totalScoreSum += (standard.totalScore || 0);
        maxScoreSum += (standard.maxScore || 0);

        if (standard.criticalFail) {
            criticalFail = true;
        }
    }

    const percent = maxScoreSum === 0 ? 0 : (totalScoreSum / maxScoreSum) * 100;

    return {
        percent: parseFloat(percent.toFixed(2)),
        totalScore: totalScoreSum,
        maxScore: maxScoreSum,
        criticalFail
    };
};

/**
 * Aggregates scores for the entire assessment based on an array of section results.
 * 
 * @param {Array} sections - Array of results: { totalScore, maxScore, criticalFail }
 * @returns {Object} { percent, totalScore, maxScore, criticalFail }
 */
export const calculateOverallScore = (sections) => {
    // Logic is identical to section aggregation
    return calculateSectionScore(sections);
};
