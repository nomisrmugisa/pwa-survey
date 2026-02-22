import { api } from './api';

export const getMetadata = async () => {
    // Bridges to the existing api.js metadata fetcher
    return api.getFormMetadata();
};
