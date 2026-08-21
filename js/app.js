// ============================================
// INITIALISATION DE LA CARTE
// ============================================
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    renderer: L.canvas()
}).setView([45.757, 4.832], 13);

// Ajouter le fond de carte
L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    maxZoom: 20,
    attribution: '© OpenStreetMap France | © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Créer les panes
map.createPane('tracePane'); map.getPane('tracePane').style.zIndex = 390;
map.createPane('parkingPane'); map.getPane('parkingPane').style.zIndex = 410;
map.createPane('velovPane'); map.getPane('velovPane').style.zIndex = 420;
map.createPane('stopPane'); map.getPane('stopPane').style.zIndex = 430;
map.createPane('vehiclePane'); map.getPane('vehiclePane').style.zIndex = 440;

// Créer les couches
const parkingLayer = L.layerGroup().addTo(map);
const parcsRelaisLayer = L.layerGroup().addTo(map);
const lineTraceLayer = L.layerGroup().addTo(map);
const velovLayer = L.layerGroup().addTo(map);
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
const stopMapLayer = L.layerGroup().addTo(map);
const agenceLayer = L.layerGroup().addTo(map);

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

// Corriger la taille de la carte
setTimeout(() => map.invalidateSize(), 300);

// Gérer le mouvement de la carte
let moveTimer = null;
map.on('moveend zoomend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
        if (typeof updateVisibleVelov === 'function') updateVisibleVelov();
        if (typeof updateVisibleParkings === 'function') updateVisibleParkings();
        if (typeof updateVisibleParkAndRideLots === 'function') updateVisibleParkAndRideLots();
        if (typeof renderVisibleStops === 'function') renderVisibleStops();
        if (typeof updateBusIcons === 'function') updateBusIcons();
    }, 200);
}, { passive: true });

// Gérer le redimensionnement
window.addEventListener('resize', () => {
    setTimeout(() => map.invalidateSize(), 250);
});

// Bascule l'affichage de la sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 300);
}

// Bascule l'onglet actif
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
        if (typeof updateVelov === 'function') updateVelov();
    }
}

// Filtre les stations Vélo'v
function filterVelovStations() {
    const term = document.getElementById('velov-search')?.value.toLowerCase().trim();
    console.log("Filtre Vélo'v :", term);
}

// Bascule l'affichage des couches
function toggleLayer(layerName) {
    if (!layerVisibility) return;
    layerVisibility[layerName] = !layerVisibility[layerName];
    const btn = document.querySelector(`[data-layer="${layerName}"]`);
    if (btn) btn.classList.toggle('active', layerVisibility[layerName]);

    if (layerName === 'bus') {
        if (layerVisibility.bus) {
            map.addLayer(busLayer);
            if (typeof applyBusLineFilter === 'function') applyBusLineFilter();
        } else {
            map.removeLayer(busLayer);
        }
    }
    if (layerName === 'stops') {
        if (layerVisibility.stops) {
            map.addLayer(stopMapLayer);
            if (typeof renderVisibleStops === 'function') renderVisibleStops();
        } else {
            map.removeLayer(stopMapLayer);
            if (typeof stopMapLayer.clearLayers === 'function') stopMapLayer.clearLayers();
        }
    }
    if (layerName === 'velov') {
        if (layerVisibility.velov) {
            map.addLayer(velovLayer);
            if (typeof updateVisibleVelov === 'function') updateVisibleVelov();
        } else {
            map.removeLayer(velovLayer);
            if (typeof velovLayer.clearLayers === 'function') velovLayer.clearLayers();
            if (typeof velovMarkerMap?.clear === 'function') velovMarkerMap.clear();
        }
    }
    if (layerName === 'parking') {
        if (layerVisibility.parking) {
            map.addLayer(parkingLayer);
            map.addLayer(parcsRelaisLayer);
            if (typeof updateVisibleParkings === 'function') updateVisibleParkings();
            if (typeof updateVisibleParkAndRideLots === 'function') updateVisibleParkAndRideLots();
        } else {
            map.removeLayer(parkingLayer);
            map.removeLayer(parcsRelaisLayer);
            if (typeof parkingLayer.clearLayers === 'function') parkingLayer.clearLayers();
            if (typeof parcsRelaisLayer.clearLayers === 'function') parcsRelaisLayer.clearLayers();
            if (typeof parkingMarkerMap?.clear === 'function') parkingMarkerMap.clear();
            if (typeof parcsRelaisMarkerMap?.clear === 'function') parcsRelaisMarkerMap.clear();
        }
    }
}
