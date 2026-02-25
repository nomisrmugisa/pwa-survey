import { api } from '../api';

// Known DHIS2 data element UIDs for assignment status.
// If your program uses a specific data element to store the status code,
// set its UID here. Otherwise status is derived from enrollment status.
const STATUS_DATA_ELEMENT_UID = null; // e.g. 'abc123XYZ' — set if applicable

/**
 * Maps a DHIS2 enrollment status (and optional stored status value) to
 * the FAC_ASS_ASSIGN_* codes expected by the UI.
 */
function mapStatus(enrollmentStatus, storedStatusCode) {
    // If a specific status code was stored on a data element, trust it
    if (storedStatusCode && storedStatusCode.startsWith('FAC_ASS_ASSIGN_')) {
        return storedStatusCode;
    }
    switch (enrollmentStatus) {
        case 'ACTIVE': return 'FAC_ASS_ASSIGN_PENDING';
        case 'COMPLETED': return 'FAC_ASS_ASSIGN_ACCEPTED';
        case 'CANCELLED': return 'FAC_ASS_ASSIGN_CANCELLED';
        default: return 'FAC_ASS_ASSIGN_PENDING';
    }
}

/**
 * Extracts the most relevant date from an enrollment.
 * Prefers the first event's eventDate, falls back to enrollmentDate / incidentDate.
 */
function extractDate(item) {
    if (item.events && item.events.length > 0) {
        const sorted = [...item.events].sort((a, b) =>
            new Date(a.eventDate) - new Date(b.eventDate)
        );
        if (sorted[0].eventDate) {
            return sorted[0].eventDate.slice(0, 10);
        }
    }
    return (item.enrollmentDate || item.incidentDate || new Date().toISOString()).slice(0, 10);
}

class AssessmentTeamAssignmentService {
    constructor() {
        this.metadata = null;
    }

    async init({ metadata }) {
        this.metadata = metadata;
        return true;
    }

    /**
     * Fetch assignments for a specific user and year from DHIS2.
     * Returns objects shaped as: { eventId, scheduleTeiId, statusCode, sortDate, orgUnitName }
     */
    async getUserAssignmentsDomain({ userId, year }) {
        try {
            // Pass userId so DHIS2 filters by attribute Rh87cVTZ8b6 (Inspection Final List)
            const enrollments = await api.getAssignments('G2gULe4jsfs', userId);

            return enrollments.map(item => {
                // Try to find a stored status code from data values
                let storedStatusCode = null;
                if (STATUS_DATA_ELEMENT_UID && item.events) {
                    for (const event of item.events) {
                        const dv = (event.dataValues || []).find(
                            d => d.dataElement === STATUS_DATA_ELEMENT_UID
                        );
                        if (dv) { storedStatusCode = dv.value; break; }
                    }
                }

                return {
                    eventId: item.enrollment || item.trackedEntityInstance,
                    scheduleTeiId: item.trackedEntityInstance,
                    statusCode: mapStatus(item.status, storedStatusCode),
                    sortDate: extractDate(item),
                    // Use enriched fields from api.js
                    orgUnitName: item.orgUnitName,
                    orgUnit: item.orgUnitId || item.orgUnit?.id || item.orgUnit,
                    facilityId: item.facilityId,
                    parentOrgUnitName: item.parentOrgUnitName,
                    enrollmentDate: item.enrollmentDate,
                    attributes: item.attributes || [],
                };
            });
        } catch (error) {
            console.error('Error fetching user assignments:', error);
            throw error;
        }
    }

    async respondToAssignment({ eventId, statusCode, reason }) {
        console.log(`Responding to assignment ${eventId} with status ${statusCode}`);
        // Implement placeholder for now - standard DHIS2 update would go here
        return { success: true };
    }
}

export default new AssessmentTeamAssignmentService();

