import { normalizeCriterionCode, compareCriterionCodes } from './normalization.js';

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
export const calculatePointsForLink = (response, severity) => {
    if (!response || response === 'NA') return null;

    const res = String(response).toUpperCase().trim();

    // C is a flat 80 points regardless of severity (Standard Botswana Rule)
    if (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(res) && !res.includes('NON') || (res.includes('COMPLIANT') && !res.includes('NON') && !res.includes('PARTIAL'))) {
        return 80;
    }

    // PC scales based on severity (1=75, 2=65, 3=55, 4=45)
    // Matches PC, PARTIAL, SUBSTANTIAL, EMS_PC, Q_PC, etc.
    if (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(res) || res.includes('PARTIAL')) {
        let severityNum = parseInt(severity, 10);
        if (isNaN(severityNum)) severityNum = 1;
        return 75 - ((severityNum - 1) * 10);
    }

    // NC scales based on severity (1=35, 2=25, 3=15, 4=5)
    // Matches NC, NON, NON_COMPLIANT, NON-COMPLIANT, NOT_MET, etc.
    if (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(res) || res.includes('NON') || res.includes('FAIL')) {
        let severityNum = parseInt(severity, 10);
        if (isNaN(severityNum)) severityNum = 1;
        return 35 - ((severityNum - 1) * 10);
    }

    return null; // NA or unhandled
};

/**
 * Computes deep recursive graph scores for all criteria.
 * 
 * @param {Object} criteriaMap - Map of normalizedCode -> criterion object
 * @returns {Object} Computed global scores map
 */
export const computeGraphScores = (criteriaMap) => {
    const globalScores = {};
    const currentlyResolving = new Set(); // To detect circular dependencies

    const computeCriterion = (code) => {
        if (globalScores[code]) return globalScores[code];

        const criterion = criteriaMap[code];
        if (!criterion) {
            return { points: null, response: 'NA', rawResponse: 'NA', isRoot: false, isDraft: true, criticalFail: false, isScored: false };
        }

        if (currentlyResolving.has(code)) {
            console.warn(`Circular dependency detected involving ${code}. Breaking loop.`);
            return { points: null, response: 'NA', rawResponse: 'NA', isRoot: false, isDraft: true, criticalFail: false, isScored: false };
        }

        currentlyResolving.add(code);

        const rootSourcesInfo = []; // To store details of linked children for traceability

        const { id, response, isRoot, links, severity, isCritical, roots } = criterion;

        let points = null;
        let isScored = false;
        let isDraft = false;
        let criticalFail = false;
        let calculatedResponse = response;
        let sumLinkedPoints = 0;
        let countScoredLinks = 0;

        // NA check entirely ignores non-roots
        if (response === 'NA' && !isRoot) {
            const res = { points: null, response: 'NA', rawResponse: response, normalizedValue: 'NA', isRoot, isDraft: false, criticalFail: false, isScored: false, rootSources: [] };
            globalScores[code] = res;
            currentlyResolving.delete(code);
            return res;
        }

        // --- Critical Risk Veto Rule (PC -> NC if safety risk) ---
        const resForVeto = String(response).toUpperCase().trim();
        if (isCritical && (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(resForVeto) || resForVeto.includes('PARTIAL'))) {
            calculatedResponse = 'NC'; // Force to NC logic
        }

        // --- Standard Failure Rule ---
        const calcResStr = String(calculatedResponse).toUpperCase().trim();
        if (isCritical && (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(calcResStr) || calcResStr.includes('NON') || calcResStr.includes('FAIL'))) {
            criticalFail = true;
        }

        if (links && links.length > 0) {
            // ROOT CRITERION LOGIC (Recursive)
            let ncPcCount = 0;
            let anyChildCriticalFail = false;

            for (const linkCode of links) {
                const normalizedLink = normalizeCriterionCode(linkCode);
                const childRes = computeCriterion(normalizedLink);

                rootSourcesInfo.push({
                    code: linkCode,
                    points: childRes.points,
                    response: childRes.response,
                    isScored: childRes.isScored,
                    isCritical: childRes.isCritical
                });

                if (childRes.criticalFail || (childRes.isCritical && String(childRes.response).toUpperCase().includes('NC'))) {
                    anyChildCriticalFail = true;
                }

                if (childRes.isDraft || !childRes.isScored) {
                    isDraft = true; // Still missing 100% full assessment
                }

                if (childRes.isScored && childRes.points !== null) {
                    countScoredLinks++;
                    sumLinkedPoints += childRes.points;

                    const lRes = String(childRes.response).toUpperCase();
                    const isC = /^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(lRes) && !lRes.includes('NON') || (lRes.includes('COMPLIANT') && !lRes.includes('NON') && !lRes.includes('PARTIAL'));
                    if (!isC) {
                        ncPcCount++;
                    }
                }
            }

            if (isRoot) {
                isScored = !isDraft; // Strict: Root is ONLY scored if all children are finalized
            }

            if (countScoredLinks > 0) {
                const draftAvg = sumLinkedPoints / countScoredLinks;

                // --- Majority Rule Override (Dynamic live evaluation based on scored links) ---
                let finalPoints = draftAvg;
                if (countScoredLinks > 1 && ncPcCount > (countScoredLinks / 2)) {
                    const cThreshold = calculatePointsForLink('C', severity) || 80;
                    const pcThreshold = calculatePointsForLink('PC', severity) || 55;

                    // If more than 75% are failing (NC/PC), force score into NC range
                    if (ncPcCount > (countScoredLinks * 0.75)) {
                        finalPoints = Math.min(finalPoints, pcThreshold - 1);
                    } else {
                        // If >50% are failing, force score into PC range (at most)
                        finalPoints = Math.min(finalPoints, cThreshold - 1);
                    }
                }

                // If not draft (all links assessed), set the official points
                if (!isDraft) {
                    points = finalPoints;
                }
            }

            // Safety override
            if (anyChildCriticalFail) {
                criticalFail = true;
                points = 0;
                isScored = true;
                isDraft = false; // Critical failure terminates the draft state
            }

        } else {
            // INDIVIDUAL (LEAF) CRITERION LOGIC
            const calculatedPoints = calculatePointsForLink(calculatedResponse, severity);
            if (calculatedPoints !== null) {
                points = calculatedPoints;
                isScored = true;
            }
        }

        let displayRes = isScored ? calculatedResponse : 'NA';

        // Derive response for roots or critical fails
        if (isScored && (isRoot || criticalFail)) {
            const cThreshold = calculatePointsForLink('C', severity);
            const pcThreshold = calculatePointsForLink('PC', severity);
            const ncThreshold = calculatePointsForLink('NC', severity);

            if (criticalFail) {
                displayRes = 'NC';
            } else if (isRoot && isDraft) {
                displayRes = 'Pending';
            } else if (points >= cThreshold) {
                displayRes = 'C';
            } else if (points >= pcThreshold) {
                displayRes = 'PC';
            } else {
                displayRes = 'NC';
            }
        } else if (isScored) {
            // Normalize leaf response
            const dispStr = String(displayRes).toUpperCase();
            if (/^([A-Z]+_)?(C|FC|FULL|COMPLIANT)$/.test(dispStr) && !dispStr.includes('NON') || (dispStr.includes('COMPLIANT') && !dispStr.includes('NON') && !dispStr.includes('PARTIAL'))) displayRes = 'C';
            else if (/^([A-Z]+_)?(PC|PARTIAL|SUBSTANTIAL)$/.test(dispStr) || dispStr.includes('PARTIAL')) displayRes = 'PC';
            else if (/^([A-Z]+_)?(NC|NON|NON_COMPLIANT|NON-COMPLIANT|NOT_MET|FAIL)$/.test(dispStr) || dispStr.includes('NON') || dispStr.includes('FAIL')) displayRes = 'NC';
        }

        const res = {
            points: (isScored && points !== null) ? points : null,
            response: displayRes,
            rawResponse: response, // Keep original response for UI logic fallback
            normalizedValue: displayRes,
            isRoot,
            isDraft,
            criticalFail,
            isScored,
            isCritical,
            draftAvg: countScoredLinks > 0 ? (sumLinkedPoints / countScoredLinks) : null,
            countScoredLinks,
            rootSources: rootSourcesInfo
        };

        globalScores[code] = res;
        currentlyResolving.delete(code);
        return res;
    };

    // Trigger recursive computation for every criteria in the map
    Object.keys(criteriaMap).forEach(code => {
        computeCriterion(code);
    });

    return globalScores;
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

    let percent = maxScoreSum === 0 ? 0 : (totalScoreSum / maxScoreSum) * 100;
    if (criticalFail) {
        percent = 0;
        totalScoreSum = 0;
    }

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
