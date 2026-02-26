/**
 * Assessment Snapshot Utility
 * 
 * Creates a deterministic, non-mutated summary of an assessment's results
 * for persistence and auditing.
 * 
 * @param {Object} scoringResult - The output from useAssessmentScoring or calculateOverallScore
 * @returns {Object} Consolidated snapshot for submission
 */
export const createAssessmentSnapshot = (scoringResult) => {
    if (!scoringResult) return null;

    const { overall, sections = [] } = scoringResult;

    return {
        overallPercent: overall?.percent || 0,
        overallTotalScore: overall?.totalScore || 0,
        overallMaxScore: overall?.maxScore || 0,
        criticalFail: Boolean(overall?.criticalFail),
        sectionBreakdown: sections.map(s => ({
            id: s.id,
            percent: s.percent,
            totalScore: s.totalScore,
            maxScore: s.maxScore,
            criticalFail: Boolean(s.criticalFail)
        })),
        timestamp: new Date().toISOString()
    };
};
