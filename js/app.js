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
// État du panneau latéral (glisser pour monter/descendre)
let isDraggingPanel = false;
let dragStartY = 0;
let panelStartBottom = 0;

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

/**
 * Bascule l'affichage du panneau latéral.
 */
function togglePanel() {
    const panel = document.getElementById('info-panel');
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible')) {
        panel.style.bottom = '0';
    } else {
        panel.style.bottom = '-90%';
    }
    setTimeout(() => map.invalidateSize(), 300);
}

// ============================================
// GESTION DU GLISSER-DÉPOSER POUR LE PANNEAU
// ============================================

/**
 * Initialise le glisser-déposer du panneau.
 */
function initPanelDrag() {
    const panel = document.getElementById('info-panel');
    const dragHandle = document.getElementById('panel-drag-handle');

    if (!panel || !dragHandle) return;

    // Écouteurs pour le glisser (tactile)
    dragHandle.addEventListener('touchstart', (e) => {
        isDraggingPanel = true;
        dragStartY = e.touches[0].clientY;
        panelStartBottom = parseInt(window.getComputedStyle(panel).bottom) || 0;
        e.preventDefault();
    }, { passive: false });

    dragHandle.addEventListener('touchmove', (e) => {
        if (!isDraggingPanel) return;
        const deltaY = dragStartY - e.touches[0].clientY; // Inversé pour un mouvement naturel
        const newBottom = panelStartBottom + deltaY;

        // Limite la position entre 0 (complètement visible) et -90% (complètement caché)
        const minBottom = -window.innerHeight * 0.9;
        const maxBottom = 0;
        const clampedBottom = Math.max(minBottom, Math.min(newBottom, maxBottom));

        panel.style.bottom = `${clampedBottom}px`;
        e.preventDefault();
    }, { passive: false });

    dragHandle.addEventListener('touchend', () => {
        isDraggingPanel = false;
        const panel = document.getElementById('info-panel');
        const bottom = parseInt(window.getComputedStyle(panel).bottom) || 0;

        // Si le panneau est à mi-chemin ou plus caché, le cacher complètement
        if (bottom < -window.innerHeight * 0.4) {
            panel.style.bottom = `-90%`;
            panel.classList.remove('visible');
        } else {
            // Sinon, le montrer complètement
            panel.style.bottom = `0`;
            panel.classList.add('visible');
        }
        setTimeout(() => map.invalidateSize(), 100);
    });

    // Écouteurs pour la souris (desktop)
    dragHandle.addEventListener('mousedown', (e) => {
        isDraggingPanel = true;
        dragStartY = e.clientY;
        panelStartBottom = parseInt(window.getComputedStyle(panel).bottom) || 0;
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingPanel) return;
        const deltaY = dragStartY - e.clientY;
        const newBottom = panelStartBottom + deltaY;

        const minBottom = -window.innerHeight * 0.9;
        const maxBottom = 0;
        const clampedBottom = Math.max(minBottom, Math.min(newBottom, maxBottom));

        panel.style.bottom = `${clampedBottom}px`;
        e.preventDefault();
    });

    window.addEventListener('mouseup', () => {
        isDraggingPanel = false;
        const panel = document.getElementById('info-panel');
        const bottom = parseInt(window.getComputedStyle(panel).bottom) || 0;

        if (bottom < -window.innerHeight * 0.4) {
            panel.style.bottom = `-90%`;
            panel.classList.remove('visible');
        } else {
            panel.style.bottom = `0`;
            panel.classList.add('visible');
        }
        setTimeout(() => map.invalidateSize(), 100);
    });
}

// ============================================
// GESTION DES ONGLETS DU PANNEAU
// ============================================

/**
 * Change d'onglet dans le panneau latéral.
 */
function switchPanelTab(name) {
    currentPanelTab = name;
    document.querySelectorAll('.panel-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.panel-tab-pane').forEach(p => {
        p.classList.remove('active');
    });
    document.getElementById(`panel-${name}`).classList.add('active');
    if (name === 'velov' && !velovLoaded) {
        velovLoaded = true;
        updateVelov();
    }
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

// Initialiser le glisser-déposer du panneau
window.addEventListener('load', initPanelDrag);

// Met à jour les icônes quand on zoome/dézoome
map.on('zoomend', () => {
    updateIconSizes();
});
