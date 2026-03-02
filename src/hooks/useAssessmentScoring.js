import { useMemo } from 'react';
import {
    calculateSectionScore,
    calculateOverallScore,
    computeGraphScores
} from '../utils/scoring';
import { normalizeCriterionCode } from '../utils/normalization';

/**
 * Hook for calculating hierarchical assessment scores.
 * 
 * Takes a full assessment object and returns a computed tree of results.
 * Optimized with useMemo to handle 500+ criteria efficiently.
 * 
 * @param {Object} assessment - { sections: [{ id, standards: [{ id, criteria: [] }] }] }
 * @returns {Object} Computed scores for overall, sections, and standards.
 */
export const useAssessmentScoring = (assessment) => {
    return useMemo(() => {
        // 1. Build a full criteria map
        const criteriaMap = {};
        (assessment.sections || []).forEach(section => {
            (section.standards || []).forEach(standard => {
                (standard.criteria || []).forEach(criterion => {
                    const code = criterion.code || criterion.id;
                    if (code) {
                        const norm = normalizeCriterionCode(code);
                        criteriaMap[norm] = criterion;
                    }
                });
            });
        });

        // 2. Perform deep recursive graph resolution for all criteria
        const globalScores = computeGraphScores(criteriaMap);

        // 3. Aggregate into standard, section, and overall results
        const sectionResults = (assessment.sections || []).map(section => {
            const standardResults = (section.standards || []).map(standard => {

                let totalScore = 0;
                let maxScore = 0;
                let criticalFail = false;
                const criteriaScores = {};

                (standard.criteria || []).forEach(criterion => {
                    const code = criterion.code || criterion.id;
                    const norm = normalizeCriterionCode(code);
                    const score = globalScores[norm];

                    if (score) {
                        criteriaScores[criterion.id] = score;

                        // Add to standard totals if it was scored
                        if (score.isScored && score.points !== null) {
                            totalScore += score.points;
                            maxScore += 100;
                        }
                        if (score.criticalFail) {
                            criticalFail = true;
                        }
                    }
                });

                if (criticalFail) {
                    totalScore = 0;
                }
                const percent = maxScore === 0 ? 0 : (totalScore / maxScore) * 100;

                return {
                    id: standard.id,
                    totalScore,
                    maxScore,
                    percent,
                    criticalFail,
                    criteriaScores
                };
            });

            const sectionResult = calculateSectionScore(standardResults);

            return {
                id: section.id,
                ...sectionResult,
                standards: standardResults
            };
        });

        const overallResult = calculateOverallScore(sectionResults);

        return {
            overall: overallResult,
            sections: sectionResults,
            globalScores // Expose for debugging if needed
        };
    }, [assessment?.sections]);
};
