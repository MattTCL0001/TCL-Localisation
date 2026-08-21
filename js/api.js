// ============================================
// CONSTANTES GLOBALES (API)
// ============================================
window.API_BASE_URL = window.CONFIG.API_BASE_URL;
window.API_FETCH_TIMEOUT = window.CONFIG.API_FETCH_TIMEOUT;
window._fetchBackoff = 1000;

// ============================================
// FONCTIONS D'APPEL API
// ============================================

window.apiFetch = async function(path, attempt = 1) {
    window.showSpinner();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), window.API_FETCH_TIMEOUT);

    try {
        const res = await fetch(window.API_BASE_URL + path, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        window.hideSpinner();

        if (res.status === 429) {
            const wait = Math.min(window._fetchBackoff * attempt * 2, 30000);
            await new Promise(r => setTimeout(r, wait));
            if (attempt < 3) return window.apiFetch(path, attempt + 1);
            window.showNotification("Trop de requêtes. Réessayez plus tard.", "error");
            return { is_loading: true };
        }

        if (res.status === 503) {
            window.showNotification("Service temporairement indisponible.", "error");
            return { is_loading: true };
        }

        window._fetchBackoff = 1000;

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (e) {
        clearTimeout(timeoutId);
        window._fetchBackoff = Math.min(window._fetchBackoff * 2, 30000);
        if (attempt < 2) {
            await new Promise(r => setTimeout(r, window._fetchBackoff));
            return window.apiFetch(path, attempt + 1);
        }
        throw e;
    }
};

// ============================================
// CHARGEMENT DES DONNÉES INITIALES
// ============================================

window.loadInitialData = async function() {
    try {
        await Promise.all([
            window.loadStopsMapping(),
            window.updateBus(),
            window.loadParkings(),
            window.loadParkAndRideLots(),
            window.updateVelov(),
            window.updateTraffic(),
            window.updateAccessibility(),
            window.updateStopsData(),
            window.loadAgencies()
        ]);
        window.showNotification("Données chargées avec succès !", "success");
        window.hideLoadingWhenReady();
    } catch (e) {
        window.showNotification("Erreur lors du chargement initial.", "error");
        console.error("Erreur loadInitialData:", e);
        window.hideLoadingWhenReady();
    }
};

window.hideLoadingWhenReady = function() {
    const allDataLoaded =
        window.allStops.length > 0 &&
        window.parkingsLoaded &&
        window.parcsRelaisLoaded &&
        window.allVelovStations.length > 0;

    if (allDataLoaded) {
        window.hideSpinner();
    } else {
        setTimeout(window.hideLoadingWhenReady, 1000);
    }
};

// ============================================
// CHARGEMENT DES ARRÊTS
// ============================================

window.loadStopsMapping = async function() {
    try {
        const data = await window.apiFetch('api/stops');
        if (data.is_loading) {
            setTimeout(window.loadStopsMapping, 10000);
            return;
        }
        (data.values || []).forEach(s => {
            if (s.id && s.nom) window.stopsMapping[s.id] = s.nom;
            if (s.code_station && s.nom) window.stopsMapping[s.code_station] = s.nom;
        });
    } catch (e) {
        setTimeout(window.loadStopsMapping, 10000);
    }
};

window.updateStopsData = async function() {
    try {
        const data = await window.apiFetch('api/stops');
        if (data.is_loading) {
            setTimeout(window.updateStopsData, 10000);
            return;
        }
        window.allStops = data.values || [];
        window.extractAllLines();
        window.renderStopList('');
        window.renderStopsOnMap();
    } catch (e) {
        document.getElementById('stops-list').innerHTML = `<div class="info-empty">Erreur de chargement (réessai...)</div>`;
        setTimeout(window.updateStopsData, 10000);
    }
};

window.extractAllLines = function() {
    const set = new Set();
    window.allStops.forEach(s => {
        if (s.desserte) s.desserte.split(',').forEach(x => set.add(window.getNewLineNumber(x.trim().split(':')[0].trim())));
    });
    window.allLines = [...set].sort(window.sortLinesByType);
    window.filterLines();
};

// ============================================
// CHARGEMENT DES BUS
// ============================================

window.updateBus = async function() {
    try {
        const buses = await window.apiFetch('api/buses');
        if (buses.is_loading) {
            setTimeout(window.updateBus, 10000);
            return;
        }

        const zoom = window.map.getZoom();
        const seen = new Set();
        for (const bus of buses) {
            const lat = parseFloat(bus.lat);
            const lon = parseFloat(bus.lon);
            if (isNaN(lat) || isNaN(lon)) continue;

            seen.add(bus.id);
            const h = window.busHash(bus);
            const existing = window.busMarkers.get(bus.id);

            if (existing) {
                const popupOpen = existing.marker.isPopupOpen();
                if (popupOpen) {
                    existing.marker.setLatLng([lat, lon]);
                    existing.hash = h;
                    continue;
                }
                if (existing.hash === h) continue;
                window.busLayer.removeLayer(existing.marker);
                window.busMarkers.delete(bus.id);
            }

            const line = bus.line;
            const color = bus.color || window.getLineColor(line);
            const lineRemapped = window.getNewLineNumber(line);

            let modeFile = 'Mode_Bus.svg';
            if (line.startsWith('BR')) modeFile = 'Mode_BR.svg';
            else if (line === 'C7' || line === 'C19') modeFile = 'Mode_Bus.svg';
            else if (line.startsWith('C')) modeFile = 'Mode_C.svg';
            else if (line.startsWith('TB')) modeFile = 'Mode_TB.svg';
            else if (line.startsWith('RX')) modeFile = 'RX.svg';
            else if (line.startsWith('T')) modeFile = 'Mode_T.svg';
            else if (line.startsWith('7601') || line.toUpperCase().startsWith('NAVI')) modeFile = 'Mode_NAVI.svg';

            const dest = window.getStopName(bus.dest_code) || bus.dest_name || 'Destination inconnue';
            const delayOk = bus.delay === '0s';
            const bearing = parseFloat(bus.bearing);
            const hasValidBearing = Number.isFinite(bearing) && Math.abs(bearing) >= 0.5 && Math.abs(bearing) < 360;
            const iconSize = zoom < 14 ? 24 : 38;

            const arrowPath = hasValidBearing ? (() => {
                const angle = bearing * Math.PI / 180, L = iconSize * 0.7, W = iconSize * 0.3;
                const tipX = iconSize / 2 + Math.sin(angle) * L;
                const tipY = iconSize / 2 - Math.cos(angle) * L;
                const leftX = iconSize / 2 + Math.sin(angle + Math.PI / 2) * W;
                const leftY = iconSize / 2 - Math.cos(angle + Math.PI / 2) * W;
                const rightX = iconSize / 2 + Math.sin(angle - Math.PI / 2) * W;
                const rightY = iconSize / 2 - Math.cos(angle - Math.PI / 2) * W;
                return `<polygon points="${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}" fill="${color}" opacity="0.95"/>`;
            })() : "";

            const iconHtml = `
                <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" style="overflow:visible;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                    ${arrowPath}
                    <rect x="3" y="3" width="${iconSize - 6}" height="${iconSize - 6}" rx="8" fill="rgba(13,15,24,0.9)" stroke="${color}" stroke-width="2"/>
                    <image href="assets/Lignes/${modeFile}" x="9" y="9" width="${iconSize - 18}" height="${iconSize - 18}"/>
                </svg>`;

            const marker = L.marker([lat, lon], {
                pane: 'vehiclePane',
                icon: L.divIcon({
                    html: iconHtml,
                    className: '',
                    iconSize: [iconSize, iconSize],
                    iconAnchor: [iconSize / 2, iconSize / 2]
                })
            });

            const busSnap = { ...bus, line, color, dest, delayOk, modeFile, lineRemapped, hasValidBearing, bearing };
            marker.bindPopup(window.buildBusPopup(busSnap), {
                maxWidth: 270,
                className: '',
                closeButton: true
            });

            if (!window.busLineFilter || lineRemapped === window.busLineFilter || line === window.busLineFilter) {
                marker.addTo(window.busLayer);
            }
            window.busMarkers.set(bus.id, { marker, hash: h, line, modeFile, hasValidBearing, bearing });
        }

        for (const [id, e] of window.busMarkers) {
            if (!seen.has(id) && !e.marker.isPopupOpen()) {
                window.busLayer.removeLayer(e.marker);
                window.busMarkers.delete(id);
            }
        }
        window.applyBusLineFilter();
    } catch (e) {
        setTimeout(window.updateBus, 10000);
    }
};

window.applyBusLineFilter = function() {
    for (const [, e] of window.busMarkers) {
        const lineRemapped = window.getNewLineNumber(e.line);
        const keep = !window.busLineFilter || lineRemapped === window.busLineFilter || e.line === window.busLineFilter;
        if (keep && !window.busLayer.hasLayer(e.marker)) {
            window.busLayer.addLayer(e.marker);
        } else if (!keep && window.busLayer.hasLayer(e.marker)) {
            window.busLayer.removeLayer(e.marker);
        }
    }
};

window.updateBusIcons = function() {
    const zoom = window.map.getZoom();
    const iconSize = zoom < 14 ? 24 : 38;

    window.busMarkers.forEach((value) => {
        const line = value.line;
        const color = value.marker.options.icon.options.color || window.getLineColor(line);
        const modeFile = value.modeFile || 'Mode_Bus.svg';
        const hasValidBearing = value.hasValidBearing || false;
        const bearing = value.bearing || 0;

        const arrowPath = hasValidBearing ? (() => {
            const angle = bearing * Math.PI / 180, L = iconSize * 0.7, W = iconSize * 0.3;
            const tipX = iconSize / 2 + Math.sin(angle) * L;
            const tipY = iconSize / 2 - Math.cos(angle) * L;
            return `<polygon points="${tipX},${tipY}" fill="${color}" opacity="0.95"/>`;
        })() : "";

        const iconHtml = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}" style="overflow:visible;">
                ${arrowPath}
                <rect x="3" y="3" width="${iconSize - 6}" height="${iconSize - 6}" rx="8" fill="rgba(13,15,24,0.9)" stroke="${color}" stroke-width="2"/>
                <image href="assets/Lignes/${modeFile}" x="9" y="9" width="${iconSize - 18}" height="${iconSize - 18}"/>
            </svg>`;

        value.marker.setIcon(L.divIcon({
            html: iconHtml,
            className: '',
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2]
        }));
    });
};

// ============================================
// CHARGEMENT DES PARKINGS
// ============================================

window.loadParkings = async function() {
    if (window.parkingsLoaded) return;
    try {
        const parkingsData = await window.apiFetch('api/parkings');
        if (parkingsData.is_loading) {
            setTimeout(window.loadParkings, 10000);
            return;
        }
        window.allParkings = Array.isArray(parkingsData) ? parkingsData : [];
        window.parkingsLoaded = true;
        window.updateVisibleParkings();
    } catch (e) {
        setTimeout(window.loadParkings, 10000);
    }
};

window.updateVisibleParkings = function() {
    if (!window.layerVisibility.parking) {
        window.parkingLayer.clearLayers();
        window.parkingMarkerMap.clear();
        return;
    }
    if (!window.parkingsLoaded) {
        window.loadParkings();
        return;
    }

    const zoom = window.map.getZoom();
    if (zoom < 12) {
        window.parkingMarkerMap.forEach(m => window.parkingLayer.removeLayer(m));
        window.parkingMarkerMap.clear();
        return;
    }

    const bounds = window.map.getBounds();
    const visible = window.allParkings.filter(p => {
        const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
        return !isNaN(lat) && !isNaN(lon) && bounds.contains([lat, lon]);
    }).slice(0, window.CONFIG.MAX_PARKINGS_ON_MAP);

    const seen = new Set();
    visible.forEach(p => {
        const key = `${p.lat},${p.lon}`;
        seen.add(key);
        if (window.parkingMarkerMap.has(key)) return;

        const iconSize = zoom < 14 ? 20 : 28;
        const dispoInfo = window.getDispoColor(p._nb_dispo ?? 0, p.capacite || 1);

        const m = L.marker([parseFloat(p.lat), parseFloat(p.lon)], {
            pane: 'parkingPane',
            icon: L.divIcon({
                html: `
                    <div style="position:relative;width:${iconSize}px;height:${iconSize}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                        <span style="font-size:${iconSize * 0.8}px;display:flex;align-items:center;justify-content:center;width:${iconSize}px;height:${iconSize}px;background:rgba(13,15,24,0.9);border-radius:6px;">🅿️</span>
                    </div>`,
                className: '',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
            })
        }).bindPopup(window.buildParkingPopup(p), { maxWidth: 240 }).addTo(window.parkingLayer);
        window.parkingMarkerMap.set(key, m);
    });

    for (const [k, m] of window.parkingMarkerMap) {
        if (!seen.has(k)) {
            window.parkingLayer.removeLayer(m);
            window.parkingMarkerMap.delete(k);
        }
    }
};

// ============================================
// CHARGEMENT DES PARCS RELAIS
// ============================================

window.loadParkAndRideLots = async function() {
    if (window.parcsRelaisLoaded) return;
    try {
        const data = await window.apiFetch('api/park-and-ride');
        if (data.is_loading) {
            setTimeout(window.loadParkAndRideLots, 10000);
            return;
        }
        window.allParcsRelais = Array.isArray(data) ? data : [];
        window.parcsRelaisLoaded = true;
        window.updateVisibleParkAndRideLots();
    } catch (e) {
        setTimeout(window.loadParkAndRideLots, 10000);
    }
};

window.updateVisibleParkAndRideLots = function() {
    if (!window.layerVisibility.parking) {
        window.parcsRelaisLayer.clearLayers();
        window.parcsRelaisMarkerMap.clear();
        return;
    }
    if (!window.parcsRelaisLoaded) {
        window.loadParkAndRideLots();
        return;
    }
    if (window.map.getZoom() < 11) {
        window.parcsRelaisMarkerMap.forEach(m => window.parcsRelaisLayer.removeLayer(m));
        window.parcsRelaisMarkerMap.clear();
        return;
    }

    const bounds = window.map.getBounds();
    const visible = window.allParcsRelais.filter(p => {
        const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
        return !isNaN(lat) && !isNaN(lon) && bounds.contains([lat, lon]);
    }).slice(0, window.CONFIG.MAX_PARKINGS_ON_MAP);

    const seen = new Set();
    visible.forEach(p => {
        const key = `${p.lat},${p.lon}`;
        seen.add(key);
        if (window.parcsRelaisMarkerMap.has(key)) return;

        const iconSize = 24;
        const m = L.marker([parseFloat(p.lat), parseFloat(p.lon)], {
            pane: 'parkingPane',
            icon: L.divIcon({
                html: `<div style="width:${iconSize}px;height:${iconSize}px;background:rgba(13,15,24,0.9);border-radius:50%;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));"><span style="font-size:${iconSize * 0.7}px;">🚗</span></div>`,
                className: '',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
            })
        }).bindPopup(`<div style="padding:10px;background:var(--glass-bg-heavy);border-radius:10px;"><b>${p.nom || 'Parking Relais'}</b></div>`).addTo(window.parcsRelaisLayer);
        window.parcsRelaisMarkerMap.set(key, m);
    });

    for (const [k, m] of window.parcsRelaisMarkerMap) {
        if (!seen.has(k)) {
            window.parcsRelaisLayer.removeLayer(m);
            window.parcsRelaisMarkerMap.delete(k);
        }
    }
};

// ============================================
// CHARGEMENT DES VÉLO'V
// ============================================

window.updateVelov = async function() {
    try {
        const velovData = await window.apiFetch('api/velov');
        if (velovData.is_loading) {
            setTimeout(window.updateVelov, 10000);
            return;
        }
        window.allVelovStations = Array.isArray(velovData) ? velovData : [];
        window.updateVisibleVelov();
    } catch (e) {
        setTimeout(window.updateVelov, 10000);
    }
};

window.updateVisibleVelov = function() {
    if (!window.layerVisibility.velov) {
        window.velovLayer.clearLayers();
        window.velovMarkerMap.clear();
        return;
    }

    const zoom = window.map.getZoom();
    if (zoom < 11) {
        window.velovMarkerMap.forEach(m => window.velovLayer.removeLayer(m));
        window.velovMarkerMap.clear();
        return;
    }

    const bounds = window.map.getBounds();
    const visible = window.allVelovStations.filter(s => {
        const lat = parseFloat(s.lat), lon = parseFloat(s.lon);
        return !isNaN(lat) && !isNaN(lon) && bounds.contains([lat, lon]);
    }).slice(0, window.CONFIG.MAX_VELOV_ON_MAP);

    const seen = new Set();
    visible.forEach(s => {
        const key = `${s.lat},${s.lon}`;
        seen.add(key);
        if (window.velovMarkerMap.has(key)) return;

        const bikes = s.available_bikes || 0;
        const stands = s.available_bike_stands || 0;
        const total = s.bike_stands || (bikes + stands) || 0;
        const dispoInfo = window.getVelovDispoColor(bikes, stands, total);
        const iconSize = zoom < 14 ? 20 : 28;

        const m = L.marker([parseFloat(s.lat), parseFloat(s.lon)], {
            pane: 'velovPane',
            icon: L.divIcon({
                html: `
                    <div style="position:relative;width:${iconSize}px;height:${iconSize}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                        <span style="font-size:${iconSize * 0.8}px;display:flex;align-items:center;justify-content:center;width:${iconSize}px;height:${iconSize}px;background:rgba(13,15,24,0.9);border-radius:50%;">🚲</span>
                        <div style="position:absolute;bottom:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:${dispoInfo.color};border:2px solid rgba(13,15,24,0.9);"></div>
                    </div>`,
                className: '',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
            })
        }).bindPopup(window.buildVelovPopup(s), { maxWidth: 240 }).addTo(window.velovLayer);
        window.velovMarkerMap.set(key, m);
    });

    for (const [k, m] of window.velovMarkerMap) {
        if (!seen.has(k)) {
            window.velovLayer.removeLayer(m);
            window.velovMarkerMap.delete(k);
        }
    }
};

// ============================================
// CHARGEMENT DES AGENCES
// ============================================
window.loadAgencies = async function() {
    try {
        const data = await window.apiFetch('api/agencies');
        if (data.is_loading) {
            setTimeout(window.loadAgencies, 10000);
            return;
        }
        if (Array.isArray(data)) {
            data.forEach(agency => {
                if (agency.lat && agency.lon) {
                    const m = L.marker([parseFloat(agency.lat), parseFloat(agency.lon)], {
                        pane: 'stopPane',
                        icon: L.divIcon({
                            html: `<div style="width:32px;height:32px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px var(--accent-glow);"><img src="assets/Agence.svg" class="svg-ic" style="width:16px;height:16px;"></div>`,
                            className: '',
                            iconSize: [32, 32],
                            iconAnchor: [16, 16]
                        })
                    }).bindPopup(window.buildAgencyPopup(agency, agency.adresse || '', agency.facea || '')).addTo(window.agenceLayer);
                }
            });
        }
    } catch (e) {
        setTimeout(window.loadAgencies, 10000);
    }
};

// ============================================
// CHARGEMENT DU TRAFIC
// ============================================
window.updateTraffic = async function() {
    try {
        const data = await window.apiFetch('api/traffic');
        if (data.is_loading) {
            setTimeout(window.updateTraffic, 10000);
            return;
        }
        const container = document.getElementById('traffic-list');
        if (!container) return;

        if (!data || !data.alerts || data.alerts.length === 0) {
            container.innerHTML = '<div class="info-empty">Aucune perturbation en cours</div>';
            return;
        }

        container.innerHTML = data.alerts.map(alert => `
            <div class="info-item" onclick="window.toggleInfoItem(this)">
                <div class="info-item-header">
                    <span class="info-item-icon">⚠️</span>
                    <span class="info-item-title">${alert.line || 'Général'}</span>
                    <span class="info-item-badge">${alert.severity || 'Info'}</span>
                </div>
                <div class="info-item-body">
                    <p>${alert.message || 'Détails non disponibles'}</p>
                    <p class="mono">${alert.start_time ? new Date(alert.start_time).toLocaleString('fr-FR') : ''}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        setTimeout(window.updateTraffic, 10000);
    }
};

// ============================================
// CHARGEMENT DE L'ACCESSIBILITÉ
// ============================================
window.updateAccessibility = async function() {
    try {
        const data = await window.apiFetch('api/accessibility');
        if (data.is_loading) {
            setTimeout(window.updateAccessibility, 10000);
            return;
        }
        const container = document.getElementById('accessibility-list');
        if (!container) return;

        if (!data || !data.alerts || data.alerts.length === 0) {
            container.innerHTML = '<div class="info-empty">Aucune alerte accessibilité</div>';
            return;
        }

        container.innerHTML = data.alerts.map(alert => `
            <div class="info-item" onclick="window.toggleInfoItem(this)">
                <div class="info-item-header">
                    <span class="info-item-icon">♿</span>
                    <span class="info-item-title">${alert.stop || 'Arrêt inconnu'}</span>
                    <span class="info-item-badge">PMR</span>
                </div>
                <div class="info-item-body">
                    <p>${alert.message || 'Détails non disponibles'}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        setTimeout(window.updateAccessibility, 10000);
    }
};
