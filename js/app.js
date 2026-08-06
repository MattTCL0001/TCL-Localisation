// ===== CONSTANTES =====
const API_BASE_URL = window.location.hostname.includes('hf.space') ? '' : 'https://matttcl-tcl-localisation.hf.space/';
const API_FETCH_TIMEOUT = 15000;
let _fetchBackoff = 1000;

// ===== GESTION DES APPELS API =====
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

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

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

// ===== CHARGEMENT DES DONNÉES =====
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

// Charger les données initiales
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

// Charger le mappage des arrêts
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

// Charger les arrêts
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

// Extraire toutes les lignes
function extractAllLines() {
    const set = new Set();
    allStops.forEach(s => {
        if (s.desserte) s.desserte.split(',').forEach(x => set.add(getNewLineNumber(x.trim().split(':')[0].trim())));
    });
    allLines = [...set].sort(sortLinesByType);
    filterLines();
}

// ===== INITIALISATION DE LA CARTE =====
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    renderer: L.canvas()
}).setView([45.757, 4.832], 13);

// Ajouter le fond de carte (OpenStreetMap)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// Créer les panes personnalisés pour le z-index
map.createPane('tracePane');
map.getPane('tracePane').style.zIndex = 390;
map.createPane('parkingPane');
map.getPane('parkingPane').style.zIndex = 410;
map.createPane('velovPane');
map.getPane('velovPane').style.zIndex = 420;
map.createPane('stopPane');
map.getPane('stopPane').style.zIndex = 430;
map.createPane('vehiclePane');
map.getPane('vehiclePane').style.zIndex = 440;

// Créer les couches
const parkingLayer = L.layerGroup().addTo(map);
const parcsRelaisLayer = L.layerGroup().addTo(map);
const lineTraceLayer = L.layerGroup().addTo(map);
const velovLayer = L.layerGroup().addTo(map);
const busLayer = L.layerGroup().addTo(map);
const agenceLayer = L.layerGroup().addTo(map);
const stopMapLayer = L.layerGroup().addTo(map);

// ===== FONCTIONS DE BASE =====
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

function togglePanel() {
    document.getElementById('info-panel').classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 300);
}

function toggleInfoItem(el) {
    el.closest('.info-item').classList.toggle('expanded');
}

function switchToTab(name) {
    document.querySelectorAll('.header-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.remove('active');
    });
    document.getElementById(`${name}-pane`).classList.add('active');
    if (name === 'velov' && !velovLoaded) {
        velovLoaded = true;
        loadVelovList();
    }
}

// ===== INITIALISATION =====
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
