// ============================================
// CONSTANTES GLOBALES (API)
// ============================================
const API_BASE_URL = 'https://matttcl-tcl-localisation.hf.space/';
const API_FETCH_TIMEOUT = 15000;
let _fetchBackoff = 1000;
const MAX_STOPS_ON_MAP = 200;
const MAX_VELOV_ON_MAP = 250;
const MAX_PARKINGS_ON_MAP = 100;

// Variables globales
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
let layerVisibility = { bus: true, stops: true, velov: true, parking: true };

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

// ============================================
// FONCTIONS POUR LES BUS
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

        // ... (ton code existant pour updateBus)
        console.log("✅ Bus mis à jour");
    } catch (e) {
        console.error("❌ Erreur updateBus:", e);
        setTimeout(updateBus, 10000);
    }
}

// ============================================
// FONCTIONS POUR LES VÉLO'V
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

// ============================================
// AUTRES FONCTIONS (à copier depuis ton code original)
// ============================================
// loadStopsMapping, loadParkings, loadParkAndRideLots, updateTraffic, updateAccessibility, updateStopsData, loadAgencies
// (Copie-colle ces fonctions depuis ton api.js original)
