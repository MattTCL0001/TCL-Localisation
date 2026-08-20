/**
 * API Manager pour TCL Localisation - Version Optimisée 2026
 */

class APIManager {
    constructor() {
        this.cache = new Map();
        this.pendingRequests = new Map();
        this.lastUpdated = new Map();
        this.abortControllers = new Map();
    }

    async fetchData(endpoint, options = {}) {
        const { forceRefresh = false, cacheTTL = CONFIG.PERFORMANCE.updateInterval, signal } = options;
        const cacheKey = `api_${endpoint}`;

        if (!forceRefresh && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            const lastUpdate = this.lastUpdated.get(cacheKey) || 0;
            if (Date.now() - lastUpdate < cacheTTL) return cached;
        }

        if (this.pendingRequests.has(cacheKey)) return this.pendingRequests.get(cacheKey);

        const controller = signal ? null : new AbortController();
        const requestSignal = signal || controller?.signal;

        const requestPromise = this._makeRequest(endpoint, requestSignal)
            .then(data => {
                this.cache.set(cacheKey, data);
                this.lastUpdated.set(cacheKey, Date.now());
                this.pendingRequests.delete(cacheKey);
                if (controller) this.abortControllers.delete(cacheKey);
                return data;
            })
            .catch(error => {
                this.pendingRequests.delete(cacheKey);
                if (controller) this.abortControllers.delete(cacheKey);
                throw error;
            });

        this.pendingRequests.set(cacheKey, requestPromise);
        if (controller) this.abortControllers.set(cacheKey, controller);
        return requestPromise;
    }

    async _makeRequest(endpoint, signal) {
        const url = CONFIG.API[endpoint];
        if (!url) throw new Error(`Endpoint non trouvé: ${endpoint}`);

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Timeout pour ${endpoint}`)), CONFIG.ERRORS.apiTimeout)
            );
            const responsePromise = fetch(url, { signal });
            const response = await Promise.race([responsePromise, timeoutPromise]);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const data = await response.json();
            return this._cleanData(data, endpoint);
        } catch (error) {
            if (CONFIG.ERRORS.fallbackData) {
                try { return await this._loadFallbackData(endpoint); }
                catch (fallbackError) { console.error(`Erreur API et fallback pour ${endpoint}:`, error, fallbackError); throw error; }
            }
            throw error;
        }
    }

    _cleanData(data, endpoint) {
        if (!data) return { features: [], type: 'FeatureCollection' };
        if (data.type === 'FeatureCollection') return { ...data, features: data.features.filter(f => f && f.geometry && f.geometry.coordinates) };
        if (Array.isArray(data)) return { type: 'FeatureCollection', features: data.filter(f => f && f.geometry && f.geometry.coordinates) };
        if (endpoint === 'busPositions' && data.features) {
            return { 
                type: 'FeatureCollection', 
                features: data.features.map(f => ({
                    type: 'Feature', 
                    geometry: { type: 'Point', coordinates: f.geometry?.coordinates || [0, 0] }, 
                    properties: { ...f.properties, id: f.properties?.id || Utils.generateId(), timestamp: Date.now() }
                }))
            };
        }
        return data;
    }

    async _loadFallbackData(endpoint) {
        try {
            const response = await fetch(`data/${endpoint}.json`);
            if (response.ok) return await response.json();
        } catch (e) {}
        return { type: 'FeatureCollection', features: [] };
    }

    async getStats(type) {
        try {
            const data = await this.fetchData(type);
            if (type === 'bus') return { total: data.features?.length || 0, active: data.features?.filter(f => f.properties?.etat === 'En service').length || 0 };
            if (type === 'velov') {
                const total = data.features?.length || 0;
                const available = data.features?.filter(f => f.properties?.nbvelosdispo > 0).length || 0;
                const totalBikes = data.features?.reduce((sum, f) => sum + (f.properties?.nbvelosdispo || 0), 0) || 0;
                return { total, available, totalBikes };
            }
            if (type === 'parkings') {
                const total = data.features?.length || 0;
                const available = data.features?.filter(f => f.properties?.nbplacesdispo > 0).length || 0;
                const totalSpots = data.features?.reduce((sum, f) => sum + (f.properties?.nbplacesdispo || 0), 0) || 0;
                return { total, available, totalSpots };
            }
            return { total: data.features?.length || 0 };
        } catch (error) { console.error(`Erreur stats ${type}:`, error); return { total: 0, available: 0, totalBikes: 0, totalSpots: 0 }; }
    }

    cancelAllRequests() {
        for (const [key, controller] of this.abortControllers) controller.abort();
        this.abortControllers.clear();
        this.pendingRequests.clear();
    }
    clearCache() { this.cache.clear(); this.lastUpdated.clear(); }
}

const apiManager = new APIManager();
