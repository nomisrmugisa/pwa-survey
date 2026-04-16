import { api } from '../api';

class AssessmentSchedulingService {
    constructor() {
        this.metadata = null;
    }

    async init({ metadata }) {
        this.metadata = metadata;
        return true;
    }

    /**
     * Fetch full TEI data for a list of schedule IDs
     */
    async getTeisByIds(ids, options = {}) {
        if (!ids || ids.length === 0) return [];

        try {
            // Leverage existing api.js implementation
            const data = await api.getTrackedEntityInstances(ids);

            // Transform back to expected structure if necessary
            // The hook expects schedule.id to match assignment.scheduleTeiId
            return (data.trackedEntityInstances || []).map(tei => ({
                ...tei,
                id: tei.trackedEntityInstance
            }));
	        } catch (error) {
	            // This enrichment call is optional. When `silent` is true we
	            // don't want to spam the console with hard errors or block the
	            // rest of the scheduling/assignment pipeline.
	            if (options.silent) {
	                console.warn('Error fetching schedule TEIs (non-fatal):', error);
	                return [];
	            }
	            console.error('Error fetching schedule TEIs:', error);
	            throw error;
	        }
    }
}

export default new AssessmentSchedulingService();
