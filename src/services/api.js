// Use the configured base path from Vite (e.g., '/pwa-survey/') for the proxy
const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL.slice(0, -1) : import.meta.env.BASE_URL;

// In PRODUCTION, we are on the same domain as DHIS2, so we hit /qims directly.
const BASE_URL = import.meta.env.PROD ? '/qims' : '/pwa-survey';

const getHeaders = (username, password) => {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (username && password) {
        headers['Authorization'] = 'Basic ' + btoa(username + ':' + password);
    } else {
        const storedAuth = localStorage.getItem('dhis2_auth');
        if (storedAuth) {
            headers['Authorization'] = storedAuth;
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

        // The original code had a responseClone here, but it's not strictly necessary
        // if we only read the body once for success and once for error.
        // If response.ok, we read response.json(). If it fails, we catch and read response.text().
        // This avoids the "Body already used" error without cloning if done carefully.
        // However, the provided instruction's "Code Edit" snippet was incomplete and syntactically incorrect
        // for fixing a double-read error in this context.
        // The most robust way to handle potential JSON parsing errors after a successful fetch
        // while still being able to get raw text on parse failure is to clone *before*
        // attempting to parse JSON.

        // Re-evaluating the original structure:
        // if (!response.ok) { await response.text(); } // Reads body if not ok
        // const responseClone = response.clone(); // Clones if ok
        // try { await response.json(); } // Reads body from original if ok
        // catch { await responseClone.text(); } // Reads body from clone if json fails

        // This pattern is generally safe. The instruction's "Code Edit" was not a valid fix.
        // Keeping the original logic as it correctly handles body reading.
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

    getAssignments: async (programId = 'wyQbzZAaJJa') => {
        const response = await fetch(`${BASE_URL}/api/enrollments?paging=false&ouMode=ALL&program=${programId}&fields=trackedEntityInstance,orgUnit,orgUnitName,status`, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch assignments');
        const enrollments = await response.json();
        return enrollments.enrollments || [];
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
    }
};
