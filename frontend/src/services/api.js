import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
        const response = await api.get('/status');
        return response.data;
    }
};
