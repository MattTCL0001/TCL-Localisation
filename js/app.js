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

// Gérer le redimensionnement
window.addEventListener('resize', () => {
    setTimeout(() => map.invalidateSize(), 250);
});
if (window.screen?.orientation) {
    window.screen.orientation.addEventListener('change', () => {
        setTimeout(() => map.invalidateSize(), 350);
    });
}

// Gérer le mouvement de la carte
let moveTimer = null;
map.on('moveend zoomend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
        updateVisibleVelov();
        updateVisibleParkings();
        updateVisibleParkAndRideLots();
        renderVisibleStops();
    }, 200);
}, { passive: true });

// Initialiser les onglets
document.querySelectorAll('.header-tab').forEach(b => {
    b.addEventListener('click', () => switchToTab(b.dataset.tab));
});

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