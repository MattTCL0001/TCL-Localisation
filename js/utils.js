/**
 * Utilitaires pour TCL Localisation - Version Optimisée 2026
 */

class Utils {
    static debounce(func, wait) {
        let timeout;
        return function(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    static formatNumber(num) {
        if (num === null || num === undefined) return 'N/A';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    static haversineDistance(point1, point2) {
        const [lat1, lon1] = point1;
        const [lat2, lon2] = point2;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    static getColorFromValue(value) {
        if (value === null || value === undefined) return '#999999';
        const hue = 120 - (value * 120);
        return `hsl(${hue}, 100%, 50%)`;
    }

    static iconCache = new Map();
    static getIcon(iconConfig) {
        const key = JSON.stringify(iconConfig);
        if (this.iconCache.has(key)) return this.iconCache.get(key);
        const icon = L.icon({
            iconUrl: iconConfig.iconUrl,
            iconSize: iconConfig.iconSize,
            iconAnchor: iconConfig.iconAnchor,
            popupAnchor: iconConfig.popupAnchor,
            className: iconConfig.className || ''
        });
        this.iconCache.set(key, icon);
        return icon;
    }
    static clearIconCache() { this.iconCache.clear(); }

    static generateId() { return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36); }

    static async retryWithDelay(fn, maxRetries = 3, delay = 1000) {
        try { return await fn(); }
        catch (error) { 
            if (maxRetries <= 0) throw error; 
            await new Promise(resolve => setTimeout(resolve, delay)); 
            return this.retryWithDelay(fn, maxRetries - 1, delay * 2); 
        }
    }

    static filterFeaturesByBounds(features, bounds) {
        if (!bounds || !features) return features;
        const [sw, ne] = [bounds.getSouthWest(), bounds.getNorthEast()];
        return features.filter(feature => {
            if (!feature.geometry || !feature.geometry.coordinates) return false;
            const [lng, lat] = feature.geometry.coordinates;
            return lat >= sw.lat && lat <= ne.lat && lng >= sw.lng && lng <= ne.lng;
        });
    }

    static timeAgo(date) {
        if (!date) return 'N/A';
        const now = new Date(); const then = new Date(date); const diff = Math.floor((now - then) / 1000);
        const intervals = { année: 31536000, mois: 2592000, semaine: 604800, jour: 86400, heure: 3600, minute: 60, seconde: 1 };
        for (const [unit, seconds] of Object.entries(intervals)) {
            const interval = Math.floor(diff / seconds);
            if (interval >= 1) return interval === 1 ? `il y a 1 ${unit}` : `il y a ${interval} ${unit}s`;
        }
        return 'à l'instant';
    }

    static capitalize(str) { if (!str) return ''; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); }
    static sanitizeString(str) { if (!str) return ''; return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;'); }
    static isMobile() { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent); }
}