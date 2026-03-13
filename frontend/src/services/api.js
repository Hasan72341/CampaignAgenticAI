import axios from 'axios';

// When using OrbStack URLs we might be served over HTTPS. We should detect the protocol.
// If using Orbstack e.g. https://frontend.xpecto.orb.local, backend is usually mapped to http(s)://backend.xpecto.orb.local if mapped. 
// If it's pure localhost, port 8000 is used on HTTP.
const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

    const hostname = window.location.hostname;
    const protocol = window.location.protocol; // "http:" or "https:"

    // If we're on OrbStack local domain (like frontend.xpecto.orb.local)
    if (hostname.includes('orb.local')) {
        // Assuming you can access backend on backend.xpecto.orb.local or on the same frontend domain depending on Docker proxy config.
        // Let's use the protocol, replace 'frontend' with 'backend' if that's the setup, or otherwise try to use the generic hostname.
        // Often users expose backend through a different subdomain or port. We'll default to the same domain but with port 8000 over HTTP 
        // OR via relative paths if it's served behind a common reverse proxy.

        // Assuming backend is mapped to backend.xpecto.orb.local without port, or still accessed via port. 
        // Usually, OrbStack exposes services by their container name, e.g., backend.xpecto.orb.local
        const backendHostname = hostname.replace('frontend', 'backend');
        return `${protocol}//${backendHostname}`; // Let OrbStack proxy do the port mapping
    }

    // Fallback for generic localhost
    return `${protocol}//${hostname}:8000`;
};

const API_URL = getApiUrl();

const api = axios.create({
    baseURL: API_URL,
});

export const campaignApi = {
    generateCampaign: async (brief) => {
        const response = await api.post('/api/campaigns/generate', { brief });
        return response.data;
    },

    getCampaignStatus: async (id) => {
        const response = await api.get(`/api/campaigns/${id}/status`);
        return response.data;
    },

    approveCampaign: async (id) => {
        const response = await api.post(`/api/campaigns/${id}/approve`);
        return response.data;
    },

    rejectCampaign: async (id, feedback) => {
        const response = await api.post(`/api/campaigns/${id}/reject`, { feedback });
        return response.data;
    },

    getMetrics: async (id) => {
        const response = await api.get(`/api/campaigns/${id}/metrics`);
        return response.data;
    },

    triggerOptimize: async (id) => {
        const response = await api.post(`/api/campaigns/${id}/optimize`);
        return response.data;
    },

    getSystemStatus: async () => {
        const response = await api.get('/health');
        return response.data;
    }
};
