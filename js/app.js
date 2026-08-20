/**
 * TCL Localisation - Application Principale - Version Optimisée 2026
 */

class TCLApp {
    constructor() {
        this.state = {
            map: null, markers: { bus: [], velov: [], parkings: [] },
            clusters: { bus: null, velov: null, parkings: null },
            activeLayers: { bus: true, velov: true, parkings: true },
            bounds: null, zoom: CONFIG.MAP.zoom, isLoading: true, isControlsCollapsed: false
        };
        this.elements = {};
        this._refreshIntervals = {};
        this._lastZoomUpdate = 0;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._initDOM());
        } else { this._initDOM(); }
    }

    _initDOM() {
        this._cacheElements();
        this._initMap();
        this._initControls();
        this._initEventListeners();
        this._loadInitialData();
        setTimeout(() => this.hideLoading(), 500);
    }

    _cacheElements() {
        this.elements = {
            map: document.getElementById('map'), loadingOverlay: document.getElementById('loading-overlay'),
            controls: document.getElementById('controls'), toggleControls: document.getElementById('toggleControls'),
            toggleBus: document.getElementById('toggleBus'), toggleVelov: document.getElementById('toggleVelov'),
            toggleParkings: document.getElementById('toggleParkings'),
            busCount: document.getElementById('bus-count'), velovCount: document.getElementById('velov-count'),
            parkingCount: document.getElementById('parking-count'),
            locateMe: document.getElementById('locate-me'), resetView: document.getElementById('reset-view'),
            legend: document.getElementById('legend')
        };
    }

    _initMap() {
        if (!this.elements.map) return;
        this.state.map = L.map(this.elements.map, {
            center: CONFIG.MAP.center, zoom: CONFIG.MAP.zoom, minZoom: CONFIG.MAP.minZoom, maxZoom: CONFIG.MAP.maxZoom,
            zoomControl: true, attributionControl: true, preferCanvas: true,
            zoomAnimation: !Utils.isMobile(), fadeAnimation: !Utils.isMobile(), markerZoomAnimation: !Utils.isMobile()
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', 
            maxZoom: 19 
        }).addTo(this.state.map);
        this.state.bounds = this.state.map.getBounds();
        const throttledMove = Utils.throttle(() => this._handleMapMove(), 200);
        this.state.map.on('move', throttledMove); this.state.map.on('zoom', throttledMove);
        this.state.map.on('click', (e) => this.state.map.closePopup());
        this._initLayers();
    }

    _initLayers() {
        const map = this.state.map; if (!map) return;
        this._initClusters();
        this.state.clusters.bus.addTo(map); this.state.clusters.velov.addTo(map); this.state.clusters.parkings.addTo(map);
    }

    _initClusters() {
        const createClusterIcon = (cluster) => {
            const count = cluster.getChildCount();
            const size = count < 100 ? 'small' : count < 1000 ? 'medium' : 'large';
            return L.divIcon({ html: `<div><span>${Utils.formatNumber(count)}</span></div>`, className: `marker-cluster marker-cluster-${size}`, iconSize: [40, 40] });
        };
        this.state.clusters.bus = L.markerClusterGroup({ ...CONFIG.CLUSTER, iconCreateFunction: createClusterIcon });
        this.state.clusters.velov = L.markerClusterGroup({ ...CONFIG.CLUSTER, iconCreateFunction: createClusterIcon });
        this.state.clusters.parkings = L.markerClusterGroup({ ...CONFIG.CLUSTER, iconCreateFunction: createClusterIcon });
    }

    _initControls() { this._updateStats(); }

    _initEventListeners() {
        if (this.elements.toggleBus) this.elements.toggleBus.addEventListener('change', (e) => this.toggleLayer('bus', e.target.checked));
        if (this.elements.toggleVelov) this.elements.toggleVelov.addEventListener('change', (e) => this.toggleLayer('velov', e.target.checked));
        if (this.elements.toggleParkings) this.elements.toggleParkings.addEventListener('change', (e) => this.toggleLayer('parkings', e.target.checked));
        if (this.elements.toggleControls) this.elements.toggleControls.addEventListener('click', () => this.toggleControls());
        if (this.elements.locateMe) this.elements.locateMe.addEventListener('click', () => this.locateUser());
        if (this.elements.resetView) this.elements.resetView.addEventListener('click', () => this.resetView());
        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => this._handleTabClick(btn)));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.state.map?.closePopup(); });
        window.addEventListener('resize', Utils.throttle(() => this._handleResize(), 200));
    }

    _handleTabClick(button) {
        const tabId = button.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn === button));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('hidden', content.id !== `${tabId}-tab`));
    }

    async _loadInitialData() {
        try {
            const [busData, velovData, parkingsData] = await Promise.all([
                apiManager.fetchData('bus'), apiManager.fetchData('velov'), apiManager.fetchData('parkings')
            ]);
            this._processBusData(busData); this._processVelovData(velovData); this._processParkingsData(parkingsData);
            this._updateStats();
        } catch (error) { console.error('Erreur chargement données:', error); this.showError('Impossible de charger les données.'); } finally { this.hideLoading(); }
    }

    _processBusData(busData) {
        if (!busData?.features || !this.state.map) return; this.clearLayer('bus');
        const markers = busData.features.map(feature => {
            const props = feature.properties || {}; const coordinates = feature.geometry?.coordinates;
            if (!coordinates || coordinates.length < 2) return null;
            return this._createBusMarker([coordinates[1], coordinates[0]], props);
        }).filter(Boolean);
        this.state.markers.bus = markers; this.state.clusters.bus.addLayers(markers); this._startAutoRefresh('bus');
    }

    _processVelovData(data) {
        if (!data?.features || !this.state.map) return; this.clearLayer('velov');
        const markers = data.features.map(feature => {
            const props = feature.properties || {}; const coordinates = feature.geometry?.coordinates;
            if (!coordinates || coordinates.length < 2) return null;
            return this._createVelovMarker([coordinates[1], coordinates[0]], props);
        }).filter(Boolean);
        this.state.markers.velov = markers; this.state.clusters.velov.addLayers(markers); this._startAutoRefresh('velov');
    }

    _processParkingsData(data) {
        if (!data?.features || !this.state.map) return; this.clearLayer('parkings');
        const markers = data.features.map(feature => {
            const props = feature.properties || {}; const coordinates = feature.geometry?.coordinates;
            if (!coordinates || coordinates.length < 2) return null;
            return this._createParkingMarker([coordinates[1], coordinates[0]], props);
        }).filter(Boolean);
        this.state.markers.parkings = markers; this.state.clusters.parkings.addLayers(markers); this._startAutoRefresh('parkings');
    }

    _createBusMarker(latlng, properties) {
        const icon = Utils.getIcon(CONFIG.ICONS.bus);
        const marker = L.marker(latlng, { icon: icon, zIndexOffset: 0, riseOnHover: !Utils.isMobile() });
        marker.bindPopup(this._createBusPopup(properties), CONFIG.POPUP);
        marker.on('mouseover', () => { if (!Utils.isMobile()) marker.openPopup(); });
        marker.on('mouseout', () => { if (!Utils.isMobile()) marker.closePopup(); });
        marker.properties = properties; return marker;
    }

    _createBusPopup(properties) {
        const name = Utils.sanitizeString(properties.nom || properties.ligne || 'Bus');
        const line = Utils.sanitizeString(properties.ligne || 'N/A');
        const direction = Utils.sanitizeString(properties.sens || properties.destination || 'N/A');
        const state = Utils.sanitizeString(properties.etat || 'En service');
        let stateClass = 'info';
        if (state.includes('Hors service') || state.includes('Terminé')) stateClass = 'danger';
        else if (state.includes('Retard')) stateClass = 'warning';
        return `<div class="popup-content"><h3>${name}</h3><p><strong>Ligne:</strong> ${line}</p><p><strong>Direction:</strong> ${direction}</p><p><strong>État:</strong> <span class="state ${stateClass}">${state}</span></p></div>`;
    }

    _createVelovMarker(latlng, properties) {
        let iconConfig = { ...CONFIG.ICONS.velov };
        const nbVelos = properties.nbvelosdispo || 0; const nbPlaces = properties.nbplaces || 0;
        const ratio = nbPlaces > 0 ? nbVelos / nbPlaces : 0;
        if (ratio === 0) iconConfig.iconUrl = 'assets/SVG_Icons/Velov_rouge.svg';
        else if (ratio < 0.3) iconConfig.iconUrl = 'assets/SVG_Icons/Velov_orange.svg';
        else if (ratio < 0.7) iconConfig.iconUrl = 'assets/SVG_Icons/Velov_vert.svg';
        else iconConfig.iconUrl = 'assets/SVG_Icons/Velov_bleu.svg';
        const icon = Utils.getIcon(iconConfig);
        const marker = L.marker(latlng, { icon: icon, zIndexOffset: 50, riseOnHover: !Utils.isMobile() });
        marker.bindPopup(this._createVelovPopup(properties), CONFIG.POPUP);
        marker.on('mouseover', () => { if (!Utils.isMobile()) marker.openPopup(); });
        marker.on('mouseout', () => { if (!Utils.isMobile()) marker.closePopup(); });
        marker.properties = properties; return marker;
    }

    _createVelovPopup(properties) {
        const name = Utils.sanitizeString(properties.nom || 'Station Vélov');
        const address = Utils.sanitizeString(properties.adresse || 'Adresse non disponible');
        const nbVelos = properties.nbvelosdispo || 0; const nbPlaces = properties.nbplaces || 0;
        const isOpen = properties.ouvert === 'Oui' || properties.ouvert === true;
        const availability = nbPlaces > 0 ? Math.round((nbVelos / nbPlaces) * 100) : 0;
        const statusClass = availability > 50 ? 'success' : availability > 20 ? 'warning' : 'danger';
        return `<div class="popup-content"><h3>🚲 ${name}</h3><p><strong>Adresse:</strong> ${address}</p><p><strong>Statut:</strong> <span class="state ${isOpen ? 'success' : 'danger'}">${isOpen ? 'Ouverte' : 'Fermée'}</span></p><div class="progress-bar" style="margin-top: 10px;"><div class="progress-fill ${statusClass}" style="width: ${availability}%"></div></div><p style="margin-top: 5px; font-size: 12px;"><strong>${nbVelos}</strong> vélos disponibles sur <strong>${nbPlaces}</strong> places</p></div>`;
    }

    _createParkingMarker(latlng, properties) {
        const icon = Utils.getIcon(CONFIG.ICONS.parking);
        const marker = L.marker(latlng, { icon: icon, zIndexOffset: 25, riseOnHover: !Utils.isMobile() });
        marker.bindPopup(this._createParkingPopup(properties), CONFIG.POPUP);
        marker.on('mouseover', () => { if (!Utils.isMobile()) marker.openPopup(); });
        marker.on('mouseout', () => { if (!Utils.isMobile()) marker.closePopup(); });
        marker.properties = properties; return marker;
    }

    _createParkingPopup(properties) {
        const name = Utils.sanitizeString(properties.nom || 'Parking');
        const address = Utils.sanitizeString(properties.adresse || 'Adresse non disponible');
        const nbPlaces = properties.nbplaces || properties.nbplacesdispo || 0;
        const nbDispo = properties.nbplacesdispo || 0;
        const isOpen = properties.ouvert === 'Oui' || properties.ouvert === true;
        const availability = nbPlaces > 0 ? Math.round((nbDispo / nbPlaces) * 100) : 0;
        const statusClass = availability > 50 ? 'success' : availability > 20 ? 'warning' : 'danger';
        return `<div class="popup-content"><h3>🚗 ${name}</h3><p><strong>Adresse:</strong> ${address}</p><p><strong>Statut:</strong> <span class="state ${isOpen ? 'success' : 'danger'}">${isOpen ? 'Ouvert' : 'Fermé'}</span></p><div class="progress-bar" style="margin-top: 10px;"><div class="progress-fill ${statusClass}" style="width: ${availability}%"></div></div><p style="margin-top: 5px; font-size: 12px;"><strong>${nbDispo}</strong> places disponibles sur <strong>${nbPlaces}</strong></p></div>`;
    }

    toggleLayer(type, active) {
        this.state.activeLayers[type] = active;
        if (active) this.state.clusters[type].addTo(this.state.map);
        else this.state.map?.removeLayer(this.state.clusters[type]);
        this._updateStats();
    }

    toggleControls() {
        this.state.isControlsCollapsed = !this.state.isControlsCollapsed;
        this.elements.controls?.classList.toggle('collapsed', this.state.isControlsCollapsed);
    }

    locateUser() {
        if (!this.state.map) return;
        const onSuccess = (position) => {
            const { latitude, longitude } = position.coords;
            this.state.map.flyTo([latitude, longitude], 15, { animate: true, duration: 1.5 });
            const userMarker = L.marker([latitude, longitude], {
                icon: L.divIcon({ html: '<i class="fas fa-map-marker-alt" style="color: #e74c3c; font-size: 24px;"></i>', className: 'user-marker', iconSize: [32, 32] }),
                zIndexOffset: 1000
            }).addTo(this.state.map);
            setTimeout(() => this.state.map.removeLayer(userMarker), 5000);
            this.showToast('📍 Position trouvée !', 'success');
        };
        const onError = (error) => {
            let message = 'Impossible de vous localiser';
            switch (error.code) {
                case error.PERMISSION_DENIED: message = 'Autorisation de géolocalisation refusée'; break;
                case error.POSITION_UNAVAILABLE: message = 'Position indisponible'; break;
                case error.TIMEOUT: message = 'Délai de géolocalisation dépassé'; break;
            }
            this.showToast(message, 'danger');
        };
        if (navigator.geolocation) navigator.geolocation.getCurrentPosition(onSuccess, onError, { timeout: 10000, maximumAge: 0, enableHighAccuracy: true });
        else this.showToast('Géolocalisation non supportée', 'danger');
    }

    resetView() {
        if (!this.state.map) return;
        this.state.map.flyTo(CONFIG.MAP.center, CONFIG.MAP.zoom, { animate: true, duration: 1.5 });
        this.showToast('🗺️ Vue réinitialisée', 'info');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i><span>${message}</span>`;
        toast.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); background: var(--glass-bg); backdrop-filter: blur(10px); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: var(--spacing-md) var(--spacing-lg); color: var(--text-primary); display: flex; align-items: center; gap: var(--spacing-sm); z-index: 10000; opacity: 0; transition: all 0.3s ease; box-shadow: var(--glass-shadow);`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; }, 10);
        setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(100px)'; toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    showError(message) { this.showToast(message, 'danger'); }
    hideLoading() { this.state.isLoading = false; if (this.elements.loadingOverlay) this.elements.loadingOverlay.classList.add('hidden'); }

    async _updateStats() {
        try {
            const [busStats, velovStats, parkingStats] = await Promise.all([apiManager.getStats('bus'), apiManager.getStats('velov'), apiManager.getStats('parkings')]);
            if (this.elements.busCount) this.elements.busCount.textContent = Utils.formatNumber(this.state.activeLayers.bus ? busStats.total : 0);
            if (this.elements.velovCount) this.elements.velovCount.textContent = Utils.formatNumber(this.state.activeLayers.velov ? velovStats.totalBikes : 0);
            if (this.elements.parkingCount) this.elements.parkingCount.textContent = Utils.formatNumber(this.state.activeLayers.parkings ? parkingStats.totalSpots : 0);
        } catch (error) { console.error('Erreur mise à jour stats:', error); }
    }

    _handleMapMove() {
        if (!this.state.map) return;
        this.state.bounds = this.state.map.getBounds(); this.state.zoom = this.state.map.getZoom();
    }

    _handleResize() { if (this.state.map) setTimeout(() => this.state.map.invalidateSize(), 100); }

    _startAutoRefresh(type) {
        if (this._refreshIntervals?.[type]) clearInterval(this._refreshIntervals[type]);
        this._refreshIntervals[type] = setInterval(async () => { try { await this._refreshLayer(type); } catch (error) { console.error(`Erreur rafraîchissement ${type}:`, error); } }, CONFIG.PERFORMANCE.updateInterval);
    }

    async _refreshLayer(type) {
        try {
            const data = await apiManager.fetchData(type, { forceRefresh: true });
            if (type === 'bus') this._processBusData(data);
            else if (type === 'velov') this._processVelovData(data);
            else if (type === 'parkings') this._processParkingsData(data);
            this._updateStats();
        } catch (error) { console.error(`Erreur rafraîchissement ${type}:`, error); }
    }

    clearLayer(type) { if (this.state.clusters[type]) this.state.clusters[type].clearLayers(); this.state.markers[type] = []; }

    cleanup() {
        for (const type in this._refreshIntervals) clearInterval(this._refreshIntervals[type]);
        apiManager.cancelAllRequests();
        for (const type in this.state.clusters) this.clearLayer(type);
        Utils.clearIconCache();
    }

    destroy() { this.cleanup(); if (this.state.map) { this.state.map.off(); this.state.map.remove(); } }
}

let app;
document.addEventListener('DOMContentLoaded', () => { app = new TCLApp(); });
window.addEventListener('beforeunload', () => { if (app) app.destroy(); });
