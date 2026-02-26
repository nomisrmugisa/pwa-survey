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
 * Calculates the score for a single standard based on an array of criteria.
 * 
 * @param {Array} criteria - Array of objects: { id, response, isCritical }
 * @returns {Object} { percent, totalScore, maxScore, criticalFail }
 */
export const calculateStandardScore = (criteria) => {
    if (!Array.isArray(criteria) || criteria.length === 0) {
        return { percent: 0, totalScore: 0, maxScore: 0, criticalFail: false };
    }

    let totalScore = 0;
    let maxPossibleScore = 0;
    let criticalFail = false;

    for (const criterion of criteria) {
        const { response, isCritical } = criterion;

        // NA is excluded from calculations
        if (response === 'NA') continue;

        // Each non-NA criterion adds 2 to the potential maximum
        maxPossibleScore += 2;

        if (response === 'FULL' || response === 'FC' || response === 'COMPLIANT') totalScore += 2;
        else if (response === 'PARTIAL' || response === 'PC' || response === 'SUBSTANTIAL') totalScore += 1;
        // NON/NC/NON-COMPLIANT adds 0, so totalScore remains unchanged for these responses.

        // Critical Failure Rule: Any critical criterion with a "NON" response
        if (isCritical && (response === 'NON' || response === 'NC' || response === 'NON-COMPLIANT')) {
            criticalFail = true;
        }
    }

    // Apply Critical Fail override
    if (criticalFail) {
        return {
            percent: 0,
            totalScore: 0,
            maxScore: maxPossibleScore,
            criticalFail: true
        };
    }

    const percent = maxPossibleScore === 0 ? 0 : (totalScore / maxPossibleScore) * 100;

    return {
        percent: parseFloat(percent.toFixed(2)),
        totalScore,
        maxScore: maxPossibleScore,
        criticalFail: false
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
