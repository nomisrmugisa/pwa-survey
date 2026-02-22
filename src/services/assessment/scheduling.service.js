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
            console.error('Error fetching schedule TEIs:', error);
            if (options.silent) return [];
            throw error;
        }
    }
}

export default new AssessmentSchedulingService();
