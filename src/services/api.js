// Consistent base URL for DHIS2 AP// Consistent base URL for DHIS2 API (points to the /qims context on the server)
const BASE_URL = '/qims';

const getHeaders = (username, password) => {
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    };
    if (username && password) {
        headers['Authorization'] = 'Basic ' + btoa(username + ':' + password);
    } else {
        const auth = localStorage.getItem('dhis2_auth');
        if (auth) {
            headers['Authorization'] = auth;
        }
    }
    return headers;
};

export const api = {
    login: async (username, password) => {
        const url = `${BASE_URL}/api/me?fields=id,displayName,username,organisationUnits[id,name]`;
        const response = await fetch(url, {
            headers: getHeaders(username, password)
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('Login failed response:', text);
            throw new Error(`Login failed: ${response.status}`);
        }

        const responseClone = response.clone();
        try {
            const data = await response.json();
            // Store credentials for subsequent requests (Basic Auth)
            const authHeader = 'Basic ' + btoa(username + ':' + password);
            localStorage.setItem('dhis2_auth', authHeader);
            localStorage.setItem('dhis2_user', JSON.stringify(data));
            return data;
        } catch (err) {
            const text = await responseClone.text();
            console.error('Failed to parse login JSON. Raw response:', text);
            throw new Error(`Login failed: Invalid JSON response from server. Check console for details.`);
        }
    },

    getCurrentUser: async () => {
        const response = await fetch(`${BASE_URL}/api/me?fields=id,displayName,username,organisationUnits[id,name]`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to get user');
        return await response.json();
    },

    getFormMetadata: async (programStageId = 'HpHD6u6MV37') => {
        const params = [
            // Include program[id] so we can use it when submitting events
            'fields=id,name,displayName,description,sortOrder,repeatable,program[id,displayName]',
            'programStageSections[id,name,displayName,code,sortOrder,dataElements[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,compulsory,allowProvidedElsewhere,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]',
            'programStageDataElements[id,displayName,sortOrder,compulsory,allowProvidedElsewhere,dataElement[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,aggregationType,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]'
        ].join(',');

        const response = await fetch(`${BASE_URL}/api/programStages/${programStageId}?${params}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to load metadata');
        return await response.json();
    },

    getAssignments: async (programId = 'K9O5fdoBmKf', userId = null) => {
        const fields = [
            'enrollment',
            'trackedEntityInstance',
            'orgUnit',
            'orgUnitName',
            'status',
            'enrollmentDate',
            'incidentDate',
            'attributes[attribute,value]',
            'events[event,eventDate,status,dataValues[dataElement,value]]'
        ].join(',');

        // Attribute UIDs
        const INSPECTOR_LIST_ATTR = 'Rh87cVTZ8b6'; // "Inspection Final List" — contains inspector user IDs
        const FACILITY_ID_ATTR = 'R0e1pnpjkaW'; // "Inspection Facility ID"

        // Build the filter: only enrollments where the inspector list contains this user's ID
        const userFilter = userId ? `&filter=${INSPECTOR_LIST_ATTR}:like:${userId}` : '';

        const response = await fetch(
            `${BASE_URL}/api/enrollments?paging=false&ouMode=ALL&program=${programId}&fields=${fields}${userFilter}`,
            { headers: getHeaders() }
        );
        if (!response.ok) throw new Error('Failed to fetch assignments');
        const data = await response.json();
        const enrollments = data.enrollments || [];

        // Extract the facility ID attribute from each enrollment
        return enrollments.map(enrollment => {
            const facilityIdAttr = (enrollment.attributes || []).find(
                a => a.attribute === FACILITY_ID_ATTR
            );
            return {
                ...enrollment,
                facilityId: facilityIdAttr?.value || null,
            };
        });
    },

    getTrackedEntityInstances: async (teiIds) => {
        if (!teiIds || teiIds.length === 0) return [];
        const response = await fetch(`${BASE_URL}/api/trackedEntityInstances?trackedEntityInstance=${teiIds.join(';')}&fields=*`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch TEIs');
        return await response.json();
    },

    getFacilityDetails: async (facilityId) => {
        const response = await fetch(`${BASE_URL}/api/organisationUnits/${facilityId}?fields=id,displayName,openingDate,closedDate,comment,attributeValues`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch facility details');
        return await response.json();
    },

    /**
     * Formats form data into DHIS2 data values.
     */
    formatDataValues: (formData) => {
        return Object.entries(formData)
            .filter(([key, value]) => {
                if (key.startsWith('is_critical_')) return false;
                if (key.endsWith('_internal')) return false;
                return value !== undefined && value !== null && value !== '';
            })
            .map(([dataElement, value]) => ({
                dataElement,
                value: String(value)
            }));
    },

    /**
     * Unified orchestrator for DHIS2 v41 Tracker API.
     * Bundles TEI, Enrollment, and Event in ONE request.
     */
    submitTrackerAssessment: async (formData, configuration, orgUnitId, onIdGenerated) => {
        const PROGRAM_ID = configuration?.program?.id || 'K9O5fdoBmKf';
        const STAGE_ID = configuration?.programStage?.id || 'HpHD6u6MV37';
        const TE_TYPE = 'hTSffimLQiw';
        const ATTR_ID = 'Bw4PZ8NsYFd';
        const ATTR_VALUE = 'Internal Assessment';

        const now = new Date().toISOString().slice(0, 10);

        // DHIS2 v41 Tracker Payload Structure
        const trackerPayload = {
            trackedEntities: [
                {
                    trackedEntityType: TE_TYPE,
                    orgUnit: orgUnitId,
                    attributes: [], // Add TEI attributes here if needed
                    enrollments: [
                        {
                            program: PROGRAM_ID,
                            orgUnit: orgUnitId,
                            status: 'ACTIVE',
                            enrolledAt: now,
                            occurredAt: now,
                            attributes: [
                                { attribute: ATTR_ID, value: ATTR_VALUE }
                            ],
                            events: [
                                {
                                    program: PROGRAM_ID,
                                    programStage: STAGE_ID,
                                    orgUnit: orgUnitId,
                                    status: 'COMPLETED',
                                    occurredAt: now,
                                    dataValues: api.formatDataValues(formData)
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        // If we already have a TEI ID from a previous partial attempt, reuse it
        if (formData.teiId_internal) {
            trackerPayload.trackedEntities[0].trackedEntity = formData.teiId_internal;
        }

        console.log('📤 Submitting to DHIS2 v41 Unified Tracker:', trackerPayload);

        const response = await fetch(`${BASE_URL}/api/tracker?async=false&importStrategy=CREATE_AND_UPDATE`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(trackerPayload)
        });

        const data = await response.json();

        if (!response.ok || data.status !== 'OK') {
            const errorMsg = data.validationReport?.errorReports?.[0]?.message ||
                data.message ||
                'Tracker submission failed';
            console.error('❌ Tracker submission failed:', data);
            throw new Error(errorMsg);
        }

        console.log('✅ Tracker submission successful:', data);

        // Extract IDs for persistence if needed
        const newTeiId = data.bundleReport?.typeReportMap?.TRACKED_ENTITY?.objectReports?.[0]?.uid;
        if (newTeiId && onIdGenerated) {
            onIdGenerated('teiId_internal', newTeiId);
        }

        return data;
    },

    /**
     * Helper to extract the generated Event UID from various DHIS2 response formats.
     */
    extractEventId: (result) => {
        // Tracker API (v41)
        const trackerUid = result?.bundleReport?.typeReportMap?.EVENT?.objectReports?.[0]?.uid;
        if (trackerUid) return trackerUid;

        // Legacy Event API
        const legacyUid = result?.response?.importSummaries?.[0]?.reference;
        if (legacyUid) return legacyUid;

        return 'synced';
    },

    /**
     * Legacy event submission (kept for compatibility if needed).
     */
    submitEvent: async (eventPayload) => {
        console.log('📤 Submitting event to DHIS2 (Legacy):', eventPayload);
        const response = await fetch(`${BASE_URL}/api/events`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ events: [eventPayload] })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data?.message || `Event submission failed: ${response.status}`);
        }

        return await response.json();
    }
};
