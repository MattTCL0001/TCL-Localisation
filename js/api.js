// ============================================
// CONSTANTES GLOBALES (API)
// ============================================
const API_BASE_URL = window.location.hostname.includes('hf.space')
    ? ''
    : 'https://matttcl-tcl-localisation.hf.space/';

const API_FETCH_TIMEOUT = 15000; // Timeout pour les requêtes API (15 secondes)
let _fetchBackoff = 1000; // Délai de réessai en cas d'erreur (1 seconde)
const MAX_STOPS_ON_MAP = 200; // Limite le nombre d'arrêts affichés sur la carte
const MAX_VELOV_ON_MAP = 250; // Limite le nombre de stations Vélo'v affichées
const MAX_PARKINGS_ON_MAP = 100; // Limite le nombre de parkings affichés

// ============================================
// VARIABLES GLOBALES (Données)
// ============================================
let allStops = [];
let stopsMapping = {};
let allLines = [];
let allVelovStations = [];
let allParkings = [];
let allParcsRelais = [];
let currentStopMarker = null;
let currentVelovMarker = null;
let parkingsLoaded = false;
let velovLoaded = false;
let parcsRelaisLoaded = false;
const busMarkers = new Map();
const velovMarkerMap = new Map();
const parkingMarkerMap = new Map();
const parcsRelaisMarkerMap = new Map();
let currentLineFilter = null;
let busLineFilter = null;
let stopsOnMap = [];
const layerVisibility = { bus: true, stops: true, velov: true, parking: true };

// ============================================
// FONCTIONS D'APPEL API
// ============================================

/**
 * Effectue une requête API avec gestion des erreurs et des timeouts.
 */
async function apiFetch(path, attempt = 1) {
    showSpinner();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT);

    try {
        const res = await fetch(API_BASE_URL + path, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        hideSpinner();

        if (res.status === 429) {
            const wait = Math.min(_fetchBackoff * attempt * 2, 30000);
            console.warn(`⏳ 429 rate limit sur ${path}, attente ${wait/1000}s...`);
            await new Promise(r => setTimeout(r, wait));
            if (attempt < 3) return apiFetch(path, attempt + 1);
            showNotification("Trop de requêtes. Réessayez plus tard.", "error");
            return { is_loading: true };
        }

        if (res.status === 503) {
            showNotification("Service temporairement indisponible.", "error");
            return { is_loading: true };
        }

        _fetchBackoff = 1000;

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (e) {
        clearTimeout(timeoutId);
        _fetchBackoff = Math.min(_fetchBackoff * 2, 30000);
        console.error(`❌ Erreur API (${path}):`, e.message);
        showNotification(`Erreur de chargement: ${e.message}`, "error");
        if (attempt < 2) {
            await new Promise(r => setTimeout(r, _fetchBackoff));
            return apiFetch(path, attempt + 1);
        }
        throw e;
    }
}

// ============================================
// CHARGEMENT DES DONNÉES
// ============================================

/**
 * Charge toutes les données initiales.
 */
async function loadInitialData() {
    try {
        await Promise.all([
            loadStopsMapping(),
            updateBus(),
            loadParkings(),
            loadParkAndRideLots(),
            updateVelov(),
            updateTraffic(),
            updateAccessibility(),
            updateStopsData(),
            loadAgencies()
        ]);
        showNotification("Données chargées avec succès !", "success");
    } catch (e) {
        showNotification("Erreur lors du chargement initial.", "error");
        console.error("Erreur loadInitialData:", e);
    }
}

/**
 * Charge le mappage des arrêts (id → nom).
 */
async function loadStopsMapping() {
    try {
        const data = await apiFetch('api/stops');
        if (data.is_loading) {
            setTimeout(loadStopsMapping, 10000);
            return;
        }
        (data.values || []).forEach(s => {
            if (s.id && s.nom) stopsMapping[s.id] = s.nom;
            if (s.code_station && s.nom) stopsMapping[s.code_station] = s.nom;
        });
        console.log("✅ Mappage des arrêts chargé");
    } catch (e) {
        setTimeout(loadStopsMapping, 10000);
    }
}

/**
 * Met à jour les données des arrêts.
 */
async function updateStopsData() {
    try {
        const data = await apiFetch('api/stops');
        if (data.is_loading) {
            setTimeout(updateStopsData, 10000);
            return;
        }
        allStops = data.values || [];
        extractAllLines();
        renderStopList('');
        renderStopsOnMap();
        console.log("✅ Arrêts chargés");
    } catch (e) {
        document.getElementById('stops-list').innerHTML = `<div class="info-empty">Erreur de chargement (réessai...)</div>`;
        setTimeout(updateStopsData, 10000);
    }
}

/**
 * Extrait toutes les lignes uniques à partir des arrêts.
 */
function extractAllLines() {
    const set = new Set();
    allStops.forEach(s => {
        if (s.desserte) s.desserte.split(',').forEach(x => set.add(getNewLineNumber(x.trim().split(':')[0].trim())));
    });
    allLines = [...set].sort(sortLinesByType);
    filterLines();
}

// ============================================
// CHARGEMENT DES BUS (AVEC ICÔNES ADAPTATIVES)
// ============================================

/**
 * Met à jour les positions des bus.
 */
async function updateBus() {
    try {
        const buses = await apiFetch('api/buses');
        if (buses.is_loading) {
            setTimeout(updateBus, 10000);
            return;
        }

        const zoom = map.getZoom();
        const seen = new Set();
        for (const bus of buses) {
            const lat = parseFloat(bus.lat);
            const lon = parseFloat(bus.lon);
            if (isNaN(lat) || isNaN(lon)) {
                console.warn("⚠️ Coordonnées invalides pour le bus:", bus.id, bus);
                continue;
            }

            seen.add(bus.id);
            const h = busHash(bus);
            const existing = busMarkers.get(bus.id);

            if (existing) {
                const popupOpen = existing.marker.isPopupOpen();
                if (popupOpen) {
                    existing.marker.setLatLng([lat, lon]);
                    existing.hash = h;
                    continue;
                }
                if (existing.hash === h) continue;
                busLayer.removeLayer(existing.marker);
                busMarkers.delete(bus.id);
            }

            const line = bus.line;
            const color = bus.color || getLineColor(line);
            const lineRemapped = getNewLineNumber(line);

            let modeFile = 'Mode_Bus.svg';
            if (line.startsWith('BR')) modeFile = 'Mode_BR.svg';
            else if (line === 'C7' || line === 'C19') modeFile = 'Mode_Bus.svg';
            else if (line.startsWith('C')) modeFile = 'Mode_C.svg';
            else if (line.startsWith('TB')) modeFile = 'Mode_TB.svg';
            else if (line.startsWith('RX')) modeFile = 'RX.svg';
            else if (line.startsWith('T')) modeFile = 'Mode_T.svg';
            else if (line.startsWith('7601') || line.toUpperCase().startsWith('NAVI')) modeFile = 'Mode_NAVI.svg';

            const dest = getStopName(bus.dest_code) || bus.dest_name || 'Destination inconnue';
            const delayOk = bus.delay === '0s';
            const bearing = parseFloat(bus.bearing);
            const hasValidBearing = Number.isFinite(bearing) && Math.abs(bearing) >= 0.5 && Math.abs(bearing) < 360;

            // Taille des icônes adaptative en fonction du zoom
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

            const busSnap = { ...bus, line, color, dest, delayOk, modeFile, lineRemapped };
            marker.bindPopup(() => buildBusPopup(busSnap), { maxWidth: 270, className: 'tcl-popup' });

            if (!busLineFilter || lineRemapped === busLineFilter || line === busLineFilter) {
                marker.addTo(busLayer);
            }
            busMarkers.set(bus.id, { marker, hash: h, line });
        }

        for (const [id, e] of busMarkers) {
            if (!seen.has(id) && !e.marker.isPopupOpen()) {
                busLayer.removeLayer(e.marker);
                busMarkers.delete(id);
            }
        }
        applyBusLineFilter();
        console.log("✅ Bus mis à jour");
    } catch (e) {
        console.error("❌ Erreur updateBus:", e);
        setTimeout(updateBus, 10000);
    }
}

/**
 * Met à jour la taille des icônes de bus en fonction du zoom.
 */
function updateBusIcons() {
    const zoom = map.getZoom();
    busMarkers.forEach((value, key) => {
        const iconSize = zoom < 14 ? 24 : 38;
        const line = value.line;
        const color = value.marker.options.icon.options.color || getLineColor(line);
        const modeFile = value.modeFile || 'Mode_Bus.svg';

        const arrowPath = value.hasValidBearing ? (() => {
            const bearing = parseFloat(value.marker.options.bearing) || 0;
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

        value.marker.setIcon(L.divIcon({
            html: iconHtml,
            className: '',
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2]
        }));
    });
}

/**
 * Applique le filtre de ligne aux bus.
 */
function applyBusLineFilter() {
    for (const [, e] of busMarkers) {
        const lineRemapped = getNewLineNumber(e.line);
        const keep = !busLineFilter || lineRemapped === busLineFilter || e.line === busLineFilter;
        if (keep && !busLayer.hasLayer(e.marker)) {
            busLayer.addLayer(e.marker);
        } else if (!keep && busLayer.hasLayer(e.marker)) {
            busLayer.removeLayer(e.marker);
        }
    }
}

// ============================================
// CHARGEMENT DES PARKINGS (REFACTORISÉ)
// ============================================

/**
 * Charge les parkings.
 */
async function loadParkings() {
    if (parkingsLoaded) return;
    try {
        const parkingsData = await apiFetch('api/parkings');
        if (parkingsData.is_loading) {
            setTimeout(loadParkings, 10000);
            return;
        }
        allParkings = Array.isArray(parkingsData) ? parkingsData : [];
        parkingsLoaded = true;
        updateVisibleParkings();
        console.log("✅ Parkings chargés");
    } catch (e) {
        setTimeout(loadParkings, 10000);
    }
}

/**
 * Met à jour les parkings visibles sur la carte.
 */
function updateVisibleParkings() {
    if (!layerVisibility.parking) {
        parkingLayer.clearLayers();
        parkingMarkerMap.clear();
        return;
    }
    if (!parkingsLoaded) {
        loadParkings();
        return;
    }

    const zoom = map.getZoom();
    if (zoom < 12) {
        parkingMarkerMap.forEach(m => parkingLayer.removeLayer(m));
        parkingMarkerMap.clear();
        return;
    }

    const bounds = map.getBounds();
    const visible = allParkings.filter(p => {
        const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
        return !isNaN(lat) && !isNaN(lon) && bounds.contains([lat, lon]);
    }).slice(0, MAX_PARKINGS_ON_MAP);

    const seen = new Set();
    visible.forEach(p => {
        const key = `${p.lat},${p.lon}`;
        seen.add(key);
        if (parkingMarkerMap.has(key)) return;

        // Taille des icônes adaptative
        const iconSize = zoom < 14 ? 20 : 28;
        const dispoInfo = getDispoColor(p._nb_dispo ?? 0, p.capacite || 1);

        const m = L.marker([parseFloat(p.lat), parseFloat(p.lon)], {
            pane: 'parkingPane',
            icon: L.divIcon({
                html: `
                    <div style="position:relative;width:${iconSize}px;height:${iconSize}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                        <span style="font-size:${iconSize * 0.8}px;display:flex;align-items:center;justify-content:center;width:${iconSize}px;height:${iconSize}px;background:rgba(13,15,24,0.9);border-radius:6px;">🅿️</span>
                        ${dispoInfo ? `<div style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${dispoInfo.color};border:2px solid rgba(13,15,24,0.9);"></div>` : ''}
                    </div>`,
                className: '',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
            })
        }).bindPopup(buildParkingPopup(p), { maxWidth: 240, className: 'tcl-popup' }).addTo(parkingLayer);
        parkingMarkerMap.set(key, m);
    });

    for (const [k, m] of parkingMarkerMap) {
        if (!seen.has(k)) {
            parkingLayer.removeLayer(m);
            parkingMarkerMap.delete(k);
        }
    }
}

// ============================================
// CHARGEMENT DES PARCS RELAIS
// ============================================

/**
 * Charge les parcs relais.
 */
async function loadParkAndRideLots() {
    if (parcsRelaisLoaded) return;
    try {
        const data = await apiFetch('api/park-and-ride');
        if (data.is_loading) {
            setTimeout(loadParkAndRideLots, 10000);
            return;
        }
        allParcsRelais = Array.isArray(data) ? data : [];
        parcsRelaisLoaded = true;
        updateVisibleParkAndRideLots();
        console.log("✅ Parcs relais chargés");
    } catch (e) {
        setTimeout(loadParkAndRideLots, 10000);
    }
}

/**
 * Met à jour les parcs relais visibles sur la carte.
 */
function updateVisibleParkAndRideLots() {
    if (!layerVisibility.parking) {
        parcsRelaisLayer.clearLayers();
        parcsRelaisMarkerMap.clear();
        return;
    }
    if (!parcsRelaisLoaded) {
        loadParkAndRideLots();
        return;
    }
    if (map.getZoom() < 11) {
        parcsRelaisMarkerMap.forEach(m => parcsRelaisLayer.removeLayer(m));
        parcsRelaisMarkerMap.clear();
        return;
    }

    const bounds = map.getBounds();
    const visible = allParcsRelais.filter(p => {
        const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
        return !isNaN(lat) && !isNaN(lon) && bounds.contains([lat, lon]);
    }).slice(0, MAX_PARKINGS_ON_MAP);

    const seen = new Set();
    visible.forEach(p => {
        const key = `${p.lat},${p.lon}`;
        seen.add(key);
        if (parcsRelaisMarkerMap.has(key)) return;

        const zoom = map.getZoom();
        const iconSize = zoom < 14 ? 20 : 28;
        const dispoInfo = getDispoColor(p._nb_dispo ?? 0, p.capacite || 1);

        const m = L.marker([parseFloat(p.lat), parseFloat(p.lon)], {
            pane: 'parkingPane',
            icon: L.divIcon({
                html: `
                    <div style="position:relative;width:${iconSize}px;height:${iconSize}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                        <span style="font-size:${iconSize * 0.8}px;display:flex;align-items:center;justify-content:center;width:${iconSize}px;height:${iconSize}px;background:rgba(13,15,24,0.9);border-radius:6px;">🅿️</span>
                        ${dispoInfo ? `<div style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${dispoInfo.color};border:2px solid rgba(13,15,24,0.9);"></div>` : ''}
                    </div>`,
                className: '',
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
            })
        }).bindPopup(buildParkingPopup(p, 'Parc Relais TCL'), { maxWidth: 240, className: 'tcl-popup' }).addTo(parcsRelaisLayer);
        parcsRelaisMarkerMap.set(key, m);
    });

    for (const [k, m] of parcsRelaisMarkerMap) {
        if (!seen.has(k)) {
            parcsRelaisLayer.removeLayer(m);
            parcsRelaisMarkerMap.delete(k);
        }
    }
}
