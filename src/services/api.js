// Use the configured base path from Vite (e.g., '/pwa-survey/') for the proxy
const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL.slice(0, -1) : import.meta.env.BASE_URL;

// In PRODUCTION, we are on the same domain as DHIS2, so we hit /qims directly.
const BASE_URL = import.meta.env.PROD ? '/qims' : base;

const getHeaders = (username, password) => {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (username && password) {
        headers['Authorization'] = 'Basic ' + btoa(username + ':' + password);
    } else {
        // Attempt to use session if no credentials provided (relying on cookie)
        // Or simpler: we might store auth header in localStorage
        const storedAuth = localStorage.getItem('dhis2_auth');
        if (storedAuth) {
            headers['Authorization'] = storedAuth;
        }
    }
    return headers;
};

export const api = {
    login: async (username, password) => {
        const response = await fetch(`${BASE_URL}/api/me?fields=id,displayName,username,organisationUnits[id,name]`, {
            headers: getHeaders(username, password)
        });
        if (!response.ok) throw new Error('Login failed');
        const data = await response.json();

        // Store credentials for subsequent requests (Basic Auth)
        // In a real app we might use a session or token, but Basic Auth is requested
        const authHeader = 'Basic ' + btoa(username + ':' + password);
        localStorage.setItem('dhis2_auth', authHeader);
        localStorage.setItem('dhis2_user', JSON.stringify(data));

        return data;
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
            'fields=id,name,displayName,description,sortOrder,repeatable',
            'programStageSections[id,name,displayName,code,sortOrder,dataElements[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,compulsory,allowProvidedElsewhere,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]',
            'programStageDataElements[id,displayName,sortOrder,compulsory,allowProvidedElsewhere,dataElement[id,formName,displayFormName,name,displayName,shortName,code,description,valueType,aggregationType,lastUpdated,optionSet[id,displayName,options[id,displayName,code,sortOrder]]]]'
        ].join(',');

        const response = await fetch(`${BASE_URL}/api/programStages/${programStageId}?${params}`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to load metadata');
        return await response.json();
    },

    // Step 3: Fetch User Assignments (Active Surveys)
    getAssignments: async (programId = 'wyQbzZAaJJa') => {
        // 1. Get Enrollments to see what assignments the user has
        // Note: 'ouMode=ALL' implies we need to be careful about permissions, but requested in prompt.
        // We strictly follow the prompt's outlined steps.
        const response = await fetch(`${BASE_URL}/api/enrollments?paging=false&ouMode=ALL&program=${programId}&fields=trackedEntityInstance,orgUnit,orgUnitName,status`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch assignments');
        const enrollments = await response.json();
        return enrollments.enrollments || [];
    },

    // Helper to get full TEI details if needed, though enrollment usually gives us the TEI ID
    getTrackedEntityInstances: async (teiIds) => {
        if (!teiIds || teiIds.length === 0) return [];
        const response = await fetch(`${BASE_URL}/api/trackedEntityInstances?trackedEntityInstance=${teiIds.join(';')}&fields=*`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch TEIs');
        return await response.json();
    },

    // Step 4: Facility Details
    getFacilityDetails: async (facilityId) => {
        const response = await fetch(`${BASE_URL}/api/organisationUnits/${facilityId}?fields=id,displayName,openingDate,closedDate,comment,attributeValues`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch facility details');
        return await response.json();
    }
};
