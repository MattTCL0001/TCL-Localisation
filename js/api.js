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
 * @param {string} path - Chemin de l'API.
 * @param {number} [attempt=1] - Tentative actuelle (pour les réessais).
 * @returns {Promise<Object>} - Données JSON ou objet d'erreur.
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
// CHARGEMENT DES DONNÉES INITIALES
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
        hideLoadingWhenReady(); // Masque le spinner une fois tout chargé
    } catch (e) {
        showNotification("Erreur lors du chargement initial.", "error");
        console.error("Erreur loadInitialData:", e);
        hideLoadingWhenReady(); // Masque le spinner même en cas d'erreur
    }
}

/**
 * Masque le spinner quand toutes les données sont chargées.
 */
function hideLoadingWhenReady() {
    const allDataLoaded =
        allStops.length > 0 &&
        parkingsLoaded &&
        parcsRelaisLoaded &&
        allVelovStations.length > 0;

    if (allDataLoaded) {
        hideSpinner();
    } else {
        setTimeout(hideLoadingWhenReady, 1000);
    }
}

// ============================================
// CHARGEMENT DES ARRÊTS
// ============================================

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

            const busSnap = { ...bus, line, color, dest, delayOk, modeFile, lineRemapped, hasValidBearing, bearing };
            marker.bindPopup(() => buildBusPopup(busSnap), { maxWidth: 270, className: 'tcl-popup' });

            if (!busLineFilter || lineRemapped === busLineFilter || line === busLineFilter) {
                marker.addTo(busLayer);
            }
            busMarkers.set(bus.id, { marker, hash: h, line, modeFile, hasValidBearing, bearing });
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

/**
 * Met à jour la taille des icônes de bus en fonction du zoom.
 */
function updateBusIcons() {
    const zoom = map.getZoom();
    const iconSize = zoom < 14 ? 24 : 38;

    busMarkers.forEach((value) => {
        const line = value.line;
        const color = value.marker.options.icon.options.color || getLineColor(line);
        const modeFile = value.modeFile || 'Mode_Bus.svg';
        const hasValidBearing = value.hasValidBearing || false;
        const bearing = value.bearing || 0;

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

        value.marker.setIcon(L.divIcon({
            html: iconHtml,
            className: '',
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2]
        }));
    });
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

// ============================================
// CHARGEMENT DES VÉLO'V
// ============================================

/**
 * Met à jour les stations Vélo'v.
 */
async function updateVelov() {
    try {
        const data = await apiFetch('api/velov');
        if (data.is_loading) {
            setTimeout(updateVelov, 10000);
            return;
        }
        allVelovStations = data.values || [];
        velovLoaded = true;
        updateVisibleVelov();
        console.log("✅ Vélo'v mis à jour");
    } catch (e) {
        setTimeout(updateVelov, 10000);
    }
}

/**
 * Met à jour les stations Vélo'v visibles sur la carte.
 */
function updateVisibleVelov() {
    if (!layerVisibility.velov) {
        velovLayer.clearLayers();
        velovMarkerMap.clear();
        return;
    }

    const zoom = map.getZoom();
    if (zoom < 13) {
        velovMarkerMap.forEach(m => velovLayer.removeLayer(m));
        velovMarkerMap.clear();
        return;
    }

    const bounds = map.getBounds();
    const visible = allVelovStations.filter(s => {
        const lat = parseFloat(s.lat), lng = parseFloat(s.lng);
        return !isNaN(lat) && !isNaN(lng) && bounds.contains([lat, lng]);
    }).slice(0, MAX_VELOV_ON_MAP);

    const seen = new Set();
    visible.forEach(s => {
        const key = `${s.lat},${s.lng}`;
        seen.add(key);
        if (velovMarkerMap.has(key)) return;

        const bikes = s.available_bikes || 0;
        const stands = s.available_bike_stands || 0;
        const total = s.bike_stands || (bikes + stands) || 0;
        const dispoInfo = getVelovDispoColor(bikes, stands, total);

        // Taille adaptative en fonction du zoom
        const iconSize = zoom < 14 ? 12 : 18;

        const m = L.circleMarker([parseFloat(s.lat), parseFloat(s.lng)], {
            pane: 'velovPane',
            radius: iconSize / 2,
            fillColor: dispoInfo.color,
            color: 'rgba(13, 15, 24, 0.8)',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        }).bindPopup(buildVelovPopup(s), { maxWidth: 230, className: 'tcl-popup' }).addTo(velovLayer);
        velovMarkerMap.set(key, m);
    });

    for (const [k, m] of velovMarkerMap) {
        if (!seen.has(k)) {
            velovLayer.removeLayer(m);
            velovMarkerMap.delete(k);
        }
    }
}

// ============================================
// CHARGEMENT DES AGENCES
// ============================================

/**
 * Charge les agences TCL.
 */
async function loadAgencies() {
    try {
        const data = await apiFetch('api/agencies');
        if (data.is_loading) {
            setTimeout(loadAgencies, 10000);
            return;
        }
        const allAgences = (data || []).filter(a => a.lat && a.lon);
        allAgences.forEach(a => {
            const adresse = [a.numero, (a.typevoie || '').charAt(0).toUpperCase() + (a.typevoie || '').slice(1).toLowerCase(), (a.adr || '').toUpperCase()].filter(Boolean).join(' ');
            const facea = a.facea === true ? '✅ Oui' : (a.facea === false ? '❌ Non' : '—');
            const popup = buildAgencyPopup(a, adresse, facea);
            L.marker([a.lat, a.lon], {
                icon: L.divIcon({
                    html: `
                        <div style="width:36px;height:36px;background:linear-gradient(135deg, #ff4d4d, #e2001a);border-radius:10px;border:2px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px var(--accent-glow);">
                            <img src="assets/Agence.svg" style="width:18px;height:18px;filter:brightness(0) invert(1);">
                        </div>`,
                    className: '',
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                })
            }).bindPopup(popup, { maxWidth: 250, className: 'tcl-popup' }).addTo(agenceLayer);
        });
        console.log("✅ Agences chargées");
    } catch (e) {
        setTimeout(loadAgencies, 10000);
    }
}

// ============================================
// CHARGEMENT DES PERTURBATIONS (TRAFIC)
// ============================================

/**
 * Met à jour les perturbations trafic.
 */
async function updateTraffic() {
    try {
        const data = await apiFetch('api/traffic');
        if (data.is_loading) {
            setTimeout(updateTraffic, 10000);
            return;
        }
        const items = data.values || [];
        const list = document.getElementById('traffic-list');
        if (!items.length) {
            list.innerHTML = `
                <div class="info-empty">
                    <img src="assets/SVG_Icons/validé.svg" class="svg-ic" style="width:20px;height:20px;filter:invert(72%) sepia(64%) saturate(540%) hue-rotate(78deg);">
                    Aucune perturbation
                </div>`;
            return;
        }

        const grouped = new Map();
        items.forEach(a => {
            const key = [a.titre, a.message, a.type, a.cause].join('|');
            if (!grouped.has(key)) grouped.set(key, { ...a, lines: new Set() });
            const g = grouped.get(key);
            [a.ligne_cli, a.ligne_com].forEach(l => l?.split(',').forEach(x => {
                const t = x.trim();
                if (t) g.lines.add(t);
            }));
        });

        list.innerHTML = [...grouped.values()].map(a => {
            const isP = a.type?.toLowerCase().includes('perturbation');
            const isT = a.cause?.toLowerCase().includes('travaux');
            const icon = 'trafic.svg';
            const filterP = isP
                ? 'invert(36%) sepia(74%) saturate(3000%) hue-rotate(340deg) brightness(95%)'
                : (isT
                    ? 'invert(72%) sepia(46%) saturate(800%) hue-rotate(1deg) brightness(105%)'
                    : 'invert(67%) sepia(82%) saturate(2000%) hue-rotate(160deg)');
            const bg = isP ? 'rgba(255,77,77,0.12)' : (isT ? 'rgba(255,184,77,0.12)' : 'rgba(0,210,255,0.12)');
            const bdr = isP ? 'rgba(255,77,77,0.3)' : (isT ? 'rgba(255,184,77,0.3)' : 'rgba(0,210,255,0.3)');
            return `
                <div class="info-item">
                    <div class="info-summary" onclick="toggleInfoItem(this)">
                        <div class="info-line-badge" style="background:${bg};border:1px solid ${bdr};">
                            <img src="assets/SVG_Icons/${icon}" style="width:18px;height:18px;filter:${filterP};">
                        </div>
                        <div class="info-summary-text">
                            <div class="info-titre">${a.titre || 'Info trafic'}</div>
                            <div class="stop-lines" style="margin-top:6px;">${[...a.lines].map(l => lineImgHtml(l, '24px')).join('')}</div>
                            <div class="info-type">${a.mode || 'TCL'} • ${a.type || 'Information'}</div>
                        </div>
                        <span class="info-chevron">▼</span>
                    </div>
                    <div class="info-detail">${a.message || 'Aucun détail'}</div>
                </div>`;
        }).join('');
        console.log("✅ Trafic mis à jour");
    } catch (e) {
        setTimeout(updateTraffic, 10000);
    }
}

// ============================================
// CHARGEMENT DES ALERTES ACCESSIBILITÉ
// ============================================

/**
 * Met à jour les alertes accessibilité.
 */
async function updateAccessibility() {
    try {
        const data = await apiFetch('api/accessibility');
        if (data.is_loading) {
            setTimeout(updateAccessibility, 10000);
            return;
        }
        const items = data.values || [];
        const list = document.getElementById('accessibility-list');
        if (!items.length) {
            list.innerHTML = `
                <div class="info-empty">
                    <img src="assets/SVG_Icons/PMR.svg" class="svg-ic" style="width:20px;height:20px;filter:invert(72%) sepia(64%) saturate(540%) hue-rotate(78deg);">
                    Aucune alerte
                </div>`;
            return;
        }

        list.innerHTML = items.map(a => {
            const bg = a.cause === 'Panne' ? 'rgba(255,77,77,0.12)' : 'rgba(255,184,77,0.12)';
            const bdr = a.cause === 'Panne' ? 'rgba(255,77,77,0.3)' : 'rgba(255,184,77,0.3)';
            const debut = a.debut_indispo ? new Date(a.debut_indispo).toLocaleDateString('fr-FR') : '';
            const fin = a.fin_indispo ? new Date(a.fin_indispo).toLocaleDateString('fr-FR') : '';
            return `
                <div class="info-item">
                    <div class="info-summary" onclick="toggleInfoItem(this)">
                        <div class="info-line-badge" style="background:${bg};border:1px solid ${bdr};">
                            <img src="assets/SVG_Icons/PMR.svg" class="svg-ic" style="width:18px;height:18px;">
                        </div>
                        <div class="info-summary-text">
                            <div class="info-titre">${a.type_equipement || 'Équipement'} – ${a.nom_station || ''}</div>
                            <div class="info-type">${a.cause || ''}</div>
                        </div>
                        <span class="info-chevron">▼</span>
                    </div>
                    <div class="info-detail">${a.equipement || ''}<br>📅 ${debut} → ${fin}</div>
                </div>`;
        }).join('');
        console.log("✅ Accessibilité mise à jour");
    } catch (e) {
        setTimeout(updateAccessibility, 10000);
    }
}

// ============================================
// RENDU DES ARRÊTS SUR LA CARTE
// ============================================

/**
 * Rend les arrêts sur la carte (avec regroupement et limitation).
 */
function renderStopsOnMap() {
    stopMapLayer.clearLayers();
    stopsOnMap = [];

    // Regroupe les arrêts par nom (pour éviter les doublons)
    const grouped = new Map();
    for (const s of allStops) {
        if (!s.lat || !s.lon) continue;
        const lat = parseFloat(s.lat), lon = parseFloat(s.lon);
        if (isNaN(lat) || isNaN(lon)) continue;
        const key = (s.nom || '').toLowerCase();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push({ ...s, lat, lon });
    }

    // Fusionne les arrêts proches (moins de 30m)
    for (const [, stops] of grouped) {
        const clusters = [];
        for (const s of stops) {
            let merged = false;
            for (const c of clusters) {
                if (haversineMeters(s.lat, s.lon, c.lat, c.lon) < 30) {
                    c.stops.push(s);
                    merged = true;
                    break;
                }
            }
            if (!merged) clusters.push({ lat: s.lat, lon: s.lon, stops: [s] });
        }

        for (const c of clusters) {
            const main = c.stops[0];
            stopsOnMap.push({ lat: c.lat, lon: c.lon, nom: main.nom, stops: c.stops });
        }
    }

    renderVisibleStops();
}

/**
 * Rend les arrêts visibles sur la carte (avec limitation).
 */
function renderVisibleStops() {
    if (!layerVisibility.stops) {
        stopMapLayer.clearLayers();
        return;
    }

    const zoom = map.getZoom();
    if (zoom < 13) {
        stopMapLayer.clearLayers();
        return;
    }

    const bounds = map.getBounds();
    // Filtre les arrêts visibles dans la vue ET limite à MAX_STOPS_ON_MAP
    const visible = stopsOnMap.filter(s => bounds.contains([s.lat, s.lon])).slice(0, MAX_STOPS_ON_MAP);
    const seen = new Map();

    visible.forEach(s => {
        const key = `${s.lat},${s.lon}`;
        if (seen.has(key)) return;

        const isHighlighted = currentLineFilter && s.stops.some(st => stopServesLine(st.desserte, currentLineFilter));

        // Taille adaptative en fonction du zoom
        const iconSize = zoom < 15 ? 10 : 14;

        const marker = L.marker([s.lat, s.lon], {
            pane: 'stopPane',
            icon: L.divIcon({
                className: '',
                html: `<div class="stop-map-marker ${isHighlighted ? 'highlighted' : ''}" title="${s.nom}" style="width:${iconSize}px;height:${iconSize}px;"></div>`,
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconSize / 2, iconSize / 2]
            })
        }).addTo(stopMapLayer);

        marker.on('click', async () => {
            await openStopGroupPopup(s);
        });

        seen.set(key, marker);
    });
}

// ============================================
// OUVRIR LE POPUP D'UN GROUPE D'ARRÊTS
// ============================================

/**
 * Ouvre le popup d'un groupe d'arrêts.
 */
async function openStopGroupPopup(stopGroup) {
    const main = stopGroup.stops[0];
    const lines = getLinesForStop(main);
    const safeId = main.id || ('grp_' + stopGroup.lat + '_' + stopGroup.lon);
    const popupEl = document.createElement('div');
    popupEl.style.cssText = 'width:260px;font-family:inherit;';

    popupEl.innerHTML = `
        <div style="background:var(--glass-bg-heavy);border:1px solid var(--glass-border-highlight);border-radius:16px;overflow:hidden;">
            <div style="padding:12px 14px;border-bottom:1px solid var(--glass-border);">
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                    <img src="assets/SVG_Icons/arrêt.svg" class="svg-ic" style="width:16px;height:16px;">${main.nom}
                </div>
                <div style="font-size:10px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                    ${main.commune ? `<span style="color:#ffb84d;">${main.commune}</span>` : ''}
                    ${main.zone ? `<span style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);border-radius:4px;padding:1px 6px;font-size:10px;">Zone ${main.zone}</span>` : ''}
                    ${stopGroup.stops.length > 1 ? `<span style="color:var(--text-muted);font-size:10px;">+ ${stopGroup.stops.length - 1} arrêt(s) à proximité</span>` : ''}
                </div>
                <div style="margin-top:8px;"><strong style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">Lignes :</strong></div>
                <div class="stop-lines" style="margin-top:4px;">${renderLineSvgs(lines)}</div>
            </div>
            <div id="deps-${safeId}" style="padding:10px 14px 12px;">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px;">Prochains passages</div>
                <div style="font-size:11px;color:var(--text-muted);text-align:center;padding:4px 0;">Chargement...</div>
            </div>
        </div>`;

    if (currentStopMarker) {
        map.removeLayer(currentStopMarker);
        currentStopMarker = null;
    }

    currentStopMarker = L.marker([stopGroup.lat, stopGroup.lon], {
        icon: L.divIcon({
            className: 'my-custom-marker',
            html: '<div style="background:var(--accent);width:16px;height:16px;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 12px var(--accent-glow);"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        })
    }).bindPopup(popupEl, { maxWidth: 280, className: 'tcl-popup', closeButton: true }).addTo(map);

    currentStopMarker.on('popupclose', _stopDepInterval);
    map.setView([stopGroup.lat, stopGroup.lon], Math.max(map.getZoom(), 16));
    currentStopMarker.openPopup();

    if (main.id) loadNextDepartures(main.id, `deps-${safeId}`);
}

// ============================================
// CHARGEMENT DES PROCHAINS DÉPARTS
// ============================================

let _depInterval = null;

/**
 * Arrête l'intervalle de mise à jour des départs.
 */
function _stopDepInterval() {
    if (_depInterval) {
        clearInterval(_depInterval);
        _depInterval = null;
    }
}

/**
 * Démarre l'intervalle de mise à jour des départs.
 */
function _startDepInterval(containerId) {
    _stopDepInterval();
    _depInterval = setInterval(() => {
        const container = document.getElementById(containerId);
        if (!container) {
            _stopDepInterval();
            return;
        }
        const now = Date.now();
        container.querySelectorAll('[data-dep-ts]').forEach(cell => {
            const ts = parseFloat(cell.dataset.depTs);
            if (!ts) return;
            if (now - ts * 1000 > 30000) {
                cell.closest('[data-dep-row]')?.remove();
                return;
            }
            cell.innerHTML = fmtDepAt(cell.dataset.depIso, now);
        });
    }, 1000);
}

/**
 * Charge les prochains départs pour un arrêt.
 */
async function loadNextDepartures(stopId, containerId) {
    if (!stopId) return;
    await new Promise(r => setTimeout(r, 0));
    const el = document.getElementById(containerId);
    if (!el) return;
    _stopDepInterval();
    const header = '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:8px;">Prochains passages</div>';
    try {
        const data = await apiFetch(`api/next-departures/${stopId}`);
        if (data.is_loading) {
            el.innerHTML = header + '<div style="font-size:11px;color:#f1c40f;text-align:center;padding:8px 0;">⏳ Initialisation des données en cours...</div>';
            setTimeout(() => loadNextDepartures(stopId, containerId), 10000);
            return;
        }

        const nowSec = Date.now() / 1000;
        const deps = (data.departures || []).filter(d => d.ts > nowSec - 30);
        if (!deps.length) {
            el.innerHTML = header + '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px 0;">Aucun passage prévu</div>';
            return;
        }

        const nowMs = Date.now();
        const rows = deps.slice(0, 5).map((dep, i) => {
            const lineRemapped = getNewLineNumber(dep.line);
            let timeDisplay = fmtDepAt(dep.expected || dep.aimed, nowMs);
            let typeLabel = dep.type === 'E'
                ? '<span style="font-size:9px;color:#4dff88;margin-left:4px;">⚡ TR</span>'
                : '<span style="font-size:9px;color:var(--text-muted);margin-left:4px;">⏱ Th.</span>';

            return `
                <div data-dep-row="${i}" style="padding:6px 0;border-bottom:1px solid var(--glass-border);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="flex-shrink:0;">${lineImgHtml(lineRemapped, '20px')}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                → ${dep.dest_name || dep.dest_id || '—'}${typeLabel}
                            </div>
                        </div>
                        <div data-dep-ts="${dep.ts}" data-dep-iso="${dep.expected || dep.aimed}" style="font-size:12px;text-align:right;flex-shrink:0;">
                            ${timeDisplay}
                        </div>
                    </div>
                </div>`;
        }).join('');
        el.innerHTML = header + rows;
        _startDepInterval(containerId);
    } catch (e) {
        el.innerHTML = header + '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px 0;">Indisponible</div>';
    }
}

// ============================================
// GESTION DES FILTRES
// ============================================

/**
 * Applique un filtre de ligne.
 */
async function applyLineFilter(line) {
    currentLineFilter = line;
    busLineFilter = line;
    document.getElementById('stop-filter-label').innerHTML = `Arrêts : &nbsp;${lineImgHtml(line, '18px')}`;
    document.getElementById('stop-filter-banner').classList.add('visible');
    document.getElementById('bus-filter-label').innerHTML = `Véhicules : &nbsp;${lineImgHtml(line, '18px')}`;
    document.getElementById('bus-filter-banner').classList.add('visible');
    applyBusLineFilter();
    renderVisibleStops();
    await showLineTrace(line);
}

/**
 * Efface tous les filtres.
 */
function clearAllFilters() {
    currentLineFilter = null;
    busLineFilter = null;
    document.getElementById('stop-filter-banner').classList.remove('visible');
    document.getElementById('bus-filter-banner').classList.remove('visible');
    for (const [, e] of busMarkers) {
        if (!busLayer.hasLayer(e.marker)) busLayer.addLayer(e.marker);
    }
    document.getElementById('stop-search').value = '';
    renderStopList('');
    lineTraceLayer.clearLayers();
    renderVisibleStops();
}

/**
 * Filtre les arrêts en fonction de la recherche.
 */
let stopSearchTimer = null;
function filterStops() {
    currentLineFilter = null;
    document.getElementById('stop-filter-banner').classList.remove('visible');
    lineTraceLayer.clearLayers();
    renderVisibleStops();
    clearTimeout(stopSearchTimer);
    stopSearchTimer = setTimeout(() => {
        renderStopList(document.getElementById('stop-search').value.toLowerCase().trim());
    }, 200);
}

/**
 * Rend la liste des arrêts.
 */
function renderStopList(term = '') {
    let stops = [...allStops].sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    if (currentLineFilter) {
        stops = stops.filter(s => stopServesLine(s.desserte, currentLineFilter));
    } else if (term) {
        stops = stops.filter(s =>
            (s.nom || '').toLowerCase().includes(term) ||
            (s.commune || '').toLowerCase().includes(term) ||
            (s.desserte || '').toLowerCase().includes(term)
        );
    }

    document.getElementById('search-stats').textContent = `${stops.length}/${allStops.length}`;
    if (!stops.length) {
        document.getElementById('stops-list').innerHTML = `
            <div class="info-empty">
                <img src="assets/SVG_Icons/loupe.svg" class="svg-ic" style="width:20px;height:20px;opacity:0.5;">
                Aucun arrêt trouvé
            </div>`;
        return;
    }

    const chunk = stops.slice(0, 300);
    const html = chunk.map(s => {
        const lines = extractLines(s.desserte);
        const icon = s.desserte?.match(/T[1-7]/) ? 'tramway.svg' :
                   (s.desserte?.match(/^[ABCD]$/) ? 'metro.svg' : 'bus.svg');
        return `
            <div class="info-item" data-lat="${s.lat}" data-lon="${s.lon}" data-id="${s.id || ''}" data-nom="${(s.nom || '').replace(/"/g, '&quot;')}" data-commune="${(s.commune || '').replace(/"/g, '&quot;')}" data-zone="${s.zone || ''}">
                <div class="info-summary" onclick="selectStopOnMap(this)">
                    <div class="info-line-badge"><img src="assets/SVG_Icons/${icon}" class="svg-ic" style="width:20px;height:20px;"></div>
                    <div class="info-summary-text">
                        <div class="info-titre">${highlightText(s.nom || 'Arrêt', term)}${s.pmr ? '<span class="stop-pmr-badge"><img src="assets/SVG_Icons/PMR.svg" style="width:10px;height:10px;filter:brightness(0) invert(1);"> PMR</span>' : ''}</div>
                        <div class="stop-commune">${highlightText(s.commune || '', term)} • Zone ${s.zone || 'N/A'}</div>
                        <div class="stop-lines">${renderLineSvgs(lines)}</div>
                    </div>
                    <span class="info-chevron">▼</span>
                </div>
                <div class="info-detail">
                    <strong>📍 Adresse :</strong> ${s.adresse || 'Non renseignée'}<br>
                    <strong>🚌 Lignes :</strong> ${s.desserte || 'Aucune'}<br>
                    <strong>♿ PMR :</strong> ${s.pmr ? '✅ Accessible' : '❌ Non accessible'}<br>
                    <strong>🏙️ Commune :</strong> ${s.commune || ''}
                </div>
            </div>`;
    }).join('');

    document.getElementById('stops-list').innerHTML = html +
        (stops.length > 300 ? `<div class="info-empty">+${stops.length - 300} arrêts (affinez la recherche)</div>` : '');
}

/**
 * Sélectionne un arrêt sur la carte.
 */
function selectStopOnMap(el) {
    const item = el.closest('.info-item');
    if (!item) return;
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    if (isNaN(lat) || isNaN(lon)) return;

    let group = stopsOnMap.find(s =>
        haversineMeters(s.lat, s.lon, lat, lon) < 30 &&
        s.nom === item.dataset.nom
    );
    if (!group) {
        group = {
            lat,
            lon,
            nom: item.dataset.nom,
            stops: [{
                id: item.dataset.id,
                lat,
                lon,
                nom: item.dataset.nom,
                commune: item.dataset.commune,
                zone: item.dataset.zone
            }]
        };
    }

    openStopGroupPopup(group);
}

// ============================================
// AFFICHAGE DU TRACÉ D'UNE LIGNE
// ============================================

/**
 * Affiche le tracé d'une ligne sur la carte.
 */
async function showLineTrace(lineCode) {
    lineTraceLayer.clearLayers();
    const traceColor = getLineColor(lineCode);
    const lineStops = allStops.filter(s => stopServesLine(s.desserte, lineCode));
    const bounds = [];

    try {
        const resp = await fetch(API_BASE_URL + 'api/line-trace/' + encodeURIComponent(lineCode));
        if (resp.ok) {
            const traceData = await resp.json();
            const segs = traceData.segs || [];

            if (segs.length > 0) {
                segs.forEach(seg => {
                    if (seg.length < 2) return;
                    L.polyline(seg.map(([lon, lat]) => [lat, lon]), {
                        pane: 'tracePane',
                        color: traceColor,
                        weight: 4,
                        opacity: 0.85,
                        lineJoin: 'round',
                        lineCap: 'round'
                    }).addTo(lineTraceLayer);
                });
            }
        }
    } catch (e) {
        console.warn('Erreur tracé:', e);
    }

    lineStops.forEach(s => {
        if (!s.lat || !s.lon) return;
        const lat = parseFloat(s.lat), lon = parseFloat(s.lon);
        if (isNaN(lat) || isNaN(lon)) return;
        const cm = L.circleMarker([lat, lon], {
            pane: 'tracePane',
            radius: 5,
            fillColor: traceColor,
            color: '#fff',
            weight: 2,
            fillOpacity: 1
        }).addTo(lineTraceLayer);
        cm.on('click', async () => {
            let group = stopsOnMap.find(st =>
                haversineMeters(st.lat, st.lon, lat, lon) < 30 &&
                st.nom === s.nom
            );
            if (!group) group = { lat, lon, nom: s.nom, stops: [s] };
            await openStopGroupPopup(group);
        });
        bounds.push([lat, lon]);
    });
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
}

// ============================================
// FILTRAGE DES LIGNES
// ============================================

/**
 * Type de ligne et métadonnées associées.
 */
const TYPE_META = {
    metro: { icon: '<img src="assets/SVG_Icons/metro.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Métro', color: '#E2001A' },
    tram: { icon: '<img src="assets/SVG_Icons/tramway.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Tramway', color: '#662483' },
    tb: { icon: '<img src="assets/SVG_Icons/trolleybus.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'TramBus', color: '#fdc300' },
    funiculaire: { icon: '<img src="assets/SVG_Icons/funicular.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Funiculaire', color: '#6da432' },
    navgone: { icon: '<img src="assets/SVG_Icons/navigone.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Navigône', color: '#00A3A6' },
    chrono: { icon: '<img src="assets/SVG_Icons/chrono.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Chrono', color: '#2699d6' },
    bus: { icon: '<img src="assets/SVG_Icons/bus.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Bus', color: '#6e8997' },
    navette: { icon: '<img src="assets/SVG_Icons/navette.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Navette', color: '#EC6608' },
    pl: { icon: '<img src="assets/SVG_Icons/pleine_lune.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Pleine Lune', color: '#992358' },
    jd: { icon: '<img src="assets/SVG_Icons/JD.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Junior Direct', color: '#17297B' },
    other: { icon: '<img src="assets/SVG_Icons/lignes.svg" class="svg-ic" style="width:14px;height:14px;">', name: 'Autres', color: '#888' }
};

/**
 * Filtre les lignes en fonction des cases cochées.
 */
function filterLines() {
    const ck = id => document.getElementById(`filter-${id}`)?.checked;
    const filters = {
        metro: ck('metro'),
        tram: ck('tram'),
        tb: ck('trolleybus'),
        funiculaire: ck('funicular'),
        navgone: ck('navgone'),
        chrono: ck('chrono'),
        bus: ck('bus'),
        navette: ck('navette'),
        pl: ck('pl'),
        jd: ck('jd')
    };
    let html = '';
    for (const [type, meta] of Object.entries(TYPE_META)) {
        if (!filters[type] && type !== 'other') continue;
        const group = allLines.filter(l => getLineType(l) === type).sort(sortLinesByType);
        if (!group.length) continue;
        html += `
            <div class="line-group">
                <div class="line-group-header" style="color:${meta.color};border-left-color:${meta.color};">
                    ${meta.icon} ${meta.name} <span style="opacity:0.6;font-weight:400;">(${group.length})</span>
                </div>
                <div class="line-items">
                    ${group.map(l => `<div class="line-item" onclick="searchLineInStops('${l}')">${lineImgHtml(l, '24px')}</div>`).join('')}
                </div>
            </div>`;
    }
    document.getElementById('lines-list').innerHTML = html || `<div class="info-empty">Aucune ligne</div>`;
}

/**
 * Recherche une ligne dans les arrêts.
 */
async function searchLineInStops(line) {
    switchToTab('stops');
    document.getElementById('stop-search').value = '';
    await applyLineFilter(line);
    renderStopList('');
    const panel = document.getElementById('info-panel');
    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        setTimeout(() => map.invalidateSize(), 300);
    }
}

/**
 * Filtre une ligne depuis un popup.
 */
async function filterLineFromPopup(line) {
    switchToTab('stops');
    document.getElementById('stop-search').value = '';
    await applyLineFilter(getNewLineNumber(line));
    renderStopList('');
    const panel = document.getElementById('info-panel');
    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        setTimeout(() => map.invalidateSize(), 300);
    }
}

/**
 * Obtient les lignes pour un arrêt.
 */
function getLinesForStop(stop) {
    return extractLines(stop.desserte);
}

// ============================================
// VÉRIFICATION DU STATUT DU SYSTÈME
// ============================================

/**
 * Vérifie le statut du système.
 */
async function checkSystemStatus() {
    try {
        const res = await fetch(API_BASE_URL);
        const data = await res.json();
        const dot = document.getElementById('system-status-dot');
        if (data.data_loaded && data.data_loaded.stops) {
            dot.classList.add('ready');
            dot.title = "Toutes les données sont chargées et prêtes";
        } else {
            dot.classList.remove('ready');
            dot.title = "Initialisation des données en cours...";
        }
    } catch (e) {
        console.warn("Erreur checkSystemStatus:", e);
    }
}
