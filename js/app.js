// ============================================
// INITIALISATION DE LA CARTE
// ============================================
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    renderer: L.canvas()
}).setView([45.757, 4.832], 13);

// Ajouter le fond de carte (sombre mais lisible)
L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    maxZoom: 20,
    attribution: '© OpenStreetMap France | © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Créer les panes personnalisés pour le z-index
map.createPane('tracePane'); map.getPane('tracePane').style.zIndex = 390;
map.createPane('parkingPane'); map.getPane('parkingPane').style.zIndex = 410;
map.createPane('velovPane'); map.getPane('velovPane').style.zIndex = 420;
map.createPane('stopPane'); map.getPane('stopPane').style.zIndex = 430;
map.createPane('vehiclePane'); map.getPane('vehiclePane').style.zIndex = 440;
map.createPane('clusterPane'); map.getPane('clusterPane').style.zIndex = 450; // Pour les clusters

// Créer les couches (avec clustering pour les bus)
const parkingLayer = L.layerGroup().addTo(map);
const parcsRelaisLayer = L.layerGroup().addTo(map);
const lineTraceLayer = L.layerGroup().addTo(map);
const velovLayer = L.layerGroup().addTo(map);
const stopMapLayer = L.layerGroup().addTo(map);
const agenceLayer = L.layerGroup().addTo(map);

// Créer une couche pour les bus AVEC CLUSTERING
const busLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: function(cluster) {
        const count = cluster.getChildCount();
        return L.divIcon({
            html: `<div style="background:linear-gradient(135deg, rgba(226,0,26,0.8), rgba(226,0,26,0.6));width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;box-shadow:0 0 12px rgba(226,0,26,0.5);">${count}</div>`,
            className: 'cluster-marker',
            iconSize: [40, 40]
        });
    }
}).addTo(map);

// ============================================
// VARIABLES GLOBALES (ÉTAT DE L'INTERFACE)
// ============================================
let currentPanelTab = 'traffic';
const DEFAULT_LAYER_VISIBILITY = { bus: true, stops: true, velov: true, parking: true };
let layerVisibility = { ...DEFAULT_LAYER_VISIBILITY };

// Variables pour les données (conservées depuis ton code)
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
const stopMarkerMap = new Map();
let currentLineFilter = null;
let busLineFilter = null;
let stopsOnMap = [];

// ============================================
// FONCTIONS DE BASE (GESTION DES COUCHES)
// ============================================

/**
 * Bascule l'affichage d'une couche.
 */
function toggleLayer(layerName) {
    layerVisibility[layerName] = !layerVisibility[layerName];
    const btn = document.querySelector(`[data-layer="${layerName}"]`);
    if (btn) btn.classList.toggle('active', layerVisibility[layerName]);

    if (layerName === 'bus') {
        if (layerVisibility.bus) {
            map.addLayer(busLayer);
            applyBusLineFilter();
        } else {
            map.removeLayer(busLayer);
        }
    }
    if (layerName === 'stops') {
        if (layerVisibility.stops) {
            map.addLayer(stopMapLayer);
            renderVisibleStops();
        } else {
            map.removeLayer(stopMapLayer);
            stopMapLayer.clearLayers();
        }
    }
    if (layerName === 'velov') {
        if (layerVisibility.velov) {
            map.addLayer(velovLayer);
            updateVisibleVelov();
        } else {
            map.removeLayer(velovLayer);
            velovLayer.clearLayers();
            velovMarkerMap.clear();
        }
    }
    if (layerName === 'parking') {
        if (layerVisibility.parking) {
            map.addLayer(parkingLayer);
            map.addLayer(parcsRelaisLayer);
            updateVisibleParkings();
            updateVisibleParkAndRideLots();
        } else {
            map.removeLayer(parkingLayer);
            map.removeLayer(parcsRelaisLayer);
            parkingLayer.clearLayers();
            parcsRelaisLayer.clearLayers();
            parkingMarkerMap.clear();
            parcsRelaisMarkerMap.clear();
        }
    }
}

/**
 * Bascule l'affichage de TOUTES les couches.
 */
function toggleAllLayers() {
    const allVisible = Object.values(layerVisibility).every(v => v);
    Object.keys(layerVisibility).forEach(layer => {
        layerVisibility[layer] = !allVisible;
        const btn = document.querySelector(`[data-layer="${layer}"]`);
        if (btn) btn.classList.toggle('active', layerVisibility[layer]);
    });
    toggleLayer('bus');
    toggleLayer('stops');
    toggleLayer('velov');
    toggleLayer('parking');
}

// ============================================
// INITIALISATION
// ============================================

/**
 * Initialise l'application.
 */
async function init() {
    showSpinner();
    try {
        await loadInitialData();
        setTimeout(checkSystemStatus, 3000);
    } catch (e) {
        showNotification("Erreur d'initialisation", "error");
        console.error("Erreur init:", e);
    } finally {
        hideSpinner();
    }
}

// Démarrer l'application
init();

// Rafraîchir les données périodiquement
setInterval(updateBus, 30_000);
setInterval(updateVelov, 120_000);
setInterval(updateTraffic, 120_000);
setInterval(updateAccessibility, 120_000);
setInterval(updateStopsData, 600_000);
setInterval(checkSystemStatus, 30_000);

// Corriger la taille de la carte après un délai
setTimeout(() => map.invalidateSize(), 300);

// Gérer le mouvement de la carte (pour adapter les icônes)
let moveTimer = null;
map.on('moveend zoomend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
        updateVisibleVelov();
        updateVisibleParkings();
        updateVisibleParkAndRideLots();
        renderVisibleStops();
        updateBusIcons();
    }, 200);
}, { passive: true });

// Gérer le redimensionnement
window.addEventListener('resize', () => {
    setTimeout(() => map.invalidateSize(), 250);
    // Réinitialise la position du panneau si la fenêtre est redimensionnée
    const panel = document.getElementById('sidebar');
    if (panel && panel.classList.contains('visible')) {
        panel.style.bottom = '0';
    }
});
if (window.screen?.orientation) {
    window.screen.orientation.addEventListener('change', () => {
        setTimeout(() => map.invalidateSize(), 350);
    });
}

// Met à jour les icônes quand on zoome/dézoome
map.on('zoomend', () => {
    updateIconSizes();
    updateBusIcons(); // Met à jour les icônes de bus en fonction du zoom
});

/**
 * Bascule l'affichage de la sidebar.
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 300); // Rafraîchit la carte
}

/**
 * Bascule l'affichage des détails d'un élément dans les listes.
 */
function toggleInfoItem(element) {
    const item = element.closest('.info-item');
    if (!item) return;

    item.classList.toggle('expanded');

    // Masque tous les autres éléments ouverts
    document.querySelectorAll('.info-item.expanded').forEach(otherItem => {
        if (otherItem !== item) {
            otherItem.classList.remove('expanded');
        }
    });
}

/**
 * Bascule l'onglet actif dans le panneau latéral.
 */
function switchPanelTab(tabName) {
    currentPanelTab = tabName;

    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.panel-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `panel-${tabName}`);
    });
    if (tabName === 'velov' && !velovLoaded) {
        velovLoaded = true;
        updateVelov();
    }
}

/**
 * Filtre les stations Vélo'v.
 */
function filterVelovStations() {
    const term = document.getElementById('velov-search').value.toLowerCase().trim();
    // Logique de filtrage à implémenter si nécessaire
    console.log("Filtre Vélo'v :", term);
}

// ============================================
// FONCTIONS POUR LES BUS (AVEC CLUSTERING)
// ============================================

/**
 * Met à jour les positions des bus (version optimisée avec clustering).
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
        const newMarkers = [];

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

            // Créer le marqueur (sera automatiquement clusterisé par busLayer)
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
            marker.bindPopup(buildBusPopup(busSnap), {
                maxWidth: 270,
                className: '',
                closeButton: true
            });

            // Ajouter au cluster (pas besoin de vérifier busLineFilter ici, car on le fera après)
            newMarkers.push({ marker, hash: h, line, modeFile, hasValidBearing, bearing, id: bus.id });
        }

        // Mettre à jour busMarkers et busLayer
        busLayer.clearLayers();
        busMarkers.clear();
        newMarkers.forEach(bus => {
            busMarkers.set(bus.id, bus);
            if (!busLineFilter || bus.lineRemapped === busLineFilter || bus.line === busLineFilter) {
                bus.marker.addTo(busLayer);
            }
        });

        // Supprimer les marqueurs qui n'existent plus
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
    busMarkers.forEach((value, id) => {
        const lineRemapped = getNewLineNumber(value.line);
        const keep = !busLineFilter || lineRemapped === busLineFilter || value.line === busLineFilter;
        if (keep && !busLayer.hasLayer(value.marker)) {
            busLayer.addLayer(value.marker);
        } else if (!keep && busLayer.hasLayer(value.marker)) {
            busLayer.removeLayer(value.marker);
        }
    });
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
// RESTE DU CODE (CONSERVÉ DE TON CODE ORIGINAL)
// ============================================
// (Je garde toutes tes autres fonctions : loadParkings, updateVelov, etc.)
// Copie-colle ici le reste de ton app.js original, mais en remplaçant :
// - La création de busLayer par celle avec clustering (déjà faite ci-dessus)
// - Les fonctions updateBus et applyBusLineFilter par celles ci-dessus

// ============================================
// FONCTIONS CONSERVÉES DE TON CODE
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
        hideLoadingWhenReady();
    } catch (e) {
        showNotification("Erreur lors du chargement initial.", "error");
        console.error("Erreur loadInitialData:", e);
        hideLoadingWhenReady();
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

/**
 * Charge le mappage des arrêts.
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

// ============================================
// FONCTIONS POUR LES ARRÊTS (CONSERVÉES)
// ============================================

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
// FONCTIONS POUR LES PARKINGS (CONSERVÉES)
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

// (Le reste de ton code pour loadParkAndRideLots, updateVelov, etc. reste identique)
