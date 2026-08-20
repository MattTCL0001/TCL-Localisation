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

// ============================================
// VARIABLES GLOBALES (ÉTAT DE L'INTERFACE)
// ============================================

// État des onglets du panneau
let currentPanelTab = 'traffic';

// ============================================
// FONCTIONS DE BASE (GESTION DES COUCHES)
// ============================================

/**
 * Bascule l'affichage d'une couche (bus, arrêts, Vélo'v, parkings).
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
    const panel = document.getElementById('info-panel');
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
 * Bascule l'affichage des détails d'un élément dans les listes (ex: trafic, accessibilité).
 * @param {HTMLElement} element - L'élément cliqué.
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
 * @param {string} tabName - Le nom de l'onglet à activer.
 */
function switchPanelTab(tabName) {
    currentPanelTab = tabName; // ré-ajouté, perdu dans le doublon

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
 * Filtre les stations Vélo'v (si tu as cette fonctionnalité).
 */
function filterVelovStations() {
    const term = document.getElementById('velov-search').value.toLowerCase().trim();
    // Logique de filtrage à implémenter si nécessaire
    console.log("Filtre Vélo'v :", term);
}
