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
     * Generate a valid DHIS2 event ID (11 alphanumeric chars, must start with a letter)
     */
    generateDHIS2Id: () => {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        const chars = letters + '0123456789';
        let id = letters[Math.floor(Math.random() * letters.length)];
        for (let i = 1; i < 11; i++) id += chars[Math.floor(Math.random() * chars.length)];
        return id;
    },

    /**
     * Format collected form data into a DHIS2 event payload.
     *
     * @param {object} formData     - key/value map of dataElement IDs to values
     * @param {object} configuration - { programStage: { id }, program: { id } }
     * @param {string} orgUnit      - DHIS2 org unit ID of the selected facility
     * @param {string} [existingEventId] - reuse an existing event ID if provided
     */
    formatEventData: (formData, configuration, orgUnit, existingEventId = null) => {
        const eventId = existingEventId || api.generateDHIS2Id();
        const today = new Date().toISOString().slice(0, 10);

        const payload = {
            event: eventId,
            program: configuration?.program?.id,
            programStage: configuration?.programStage?.id,
            orgUnit: orgUnit,
            eventDate: formData.eventDate || today,
            status: 'COMPLETED',
            dataValues: []
        };

        // Map every formData key that is a data element ID to dataValues
        Object.entries(formData || {}).forEach(([key, value]) => {
            // Skip meta fields
            if (['eventDate', 'orgUnit', 'syncStatus'].includes(key)) return;
            if (value === '' || value === null || value === undefined) return;
            payload.dataValues.push({ dataElement: key, value: String(value) });
        });

        console.log(`📋 Formatted DHIS2 event ${eventId} with ${payload.dataValues.length} data values`);
        return payload;
    },

    /**
     * Submit a formatted event to DHIS2.
     * POST /api/events   { "events": [ payload ] }
     */
    submitEvent: async (eventPayload) => {
        console.log('📤 Submitting event to DHIS2:', eventPayload);
        const response = await fetch(`${BASE_URL}/api/events`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ events: [eventPayload] })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ DHIS2 event submission failed:', data);
            throw new Error(data?.message || `Event submission failed: ${response.status}`);
        }

        console.log('✅ Event submitted successfully to DHIS2:', data);
        return data;
    }
};
