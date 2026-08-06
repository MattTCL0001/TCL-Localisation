// ============================================
// INITIALISATION DE LA CARTE
// ============================================
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    renderer: L.canvas()
}).setView([45.757, 4.832], 13);

// Ajouter le fond de carte (OpenStreetMap - version plus claire)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    maxZoom: 20,
    attribution: '© OpenStreetMap contributors'
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
// État du panneau latéral (glisser-déposer)
let isPanelDragging = false;
let panelStartY = 0;
let panelStartHeight = 0;
let initialPanelHeight = 0;

// État des onglets (glisser entre onglets)
let isTabDragging = false;
let tabStartX = 0;
let currentTabIndex = 0;

// État des onglets (actif)
let currentTab = 'traffic';

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
    panel.classList.toggle('collapsed');
    setTimeout(() => map.invalidateSize(), 300);
}

// ============================================
// GESTION DU GLISSER-DÉPOSER POUR LE TIROIR
// ============================================

/**
 * Initialise la hauteur du panneau.
 */
function initPanelHeight() {
    const panel = document.getElementById('info-panel');
    if (panel) {
        initialPanelHeight = window.innerHeight * 0.6; // 60% de la hauteur par défaut
        panel.style.height = `${initialPanelHeight}px`;
    }
}

// Écouteurs pour le glisser-déposer du panneau
document.getElementById('info-panel')?.addEventListener('touchstart', (e) => {
    isPanelDragging = true;
    panelStartY = e.touches[0].clientY;
    panelStartHeight = parseInt(document.getElementById('info-panel').style.height || initialPanelHeight);
    e.preventDefault();
}, { passive: false });

document.getElementById('info-panel')?.addEventListener('touchmove', (e) => {
    if (!isPanelDragging) return;
    const deltaY = e.touches[0].clientY - panelStartY;
    const newHeight = panelStartHeight - deltaY;

    // Limite la hauteur entre 100px et 90% de la hauteur de l'écran
    const minHeight = 100;
    const maxHeight = window.innerHeight * 0.9;
    const clampedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));

    document.getElementById('info-panel').style.height = `${clampedHeight}px`;
    e.preventDefault();
}, { passive: false });

document.getElementById('info-panel')?.addEventListener('touchend', () => {
    isPanelDragging = false;
    setTimeout(() => map.invalidateSize(), 100);
});

// ============================================
// GESTION DES ONGLETS (GLISSER ENTRE LES MENUS)
// ============================================

/**
 * Change d'onglet dans le panneau latéral.
 */
function switchToTab(name) {
    currentTab = name;
    document.querySelectorAll('.header-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.remove('active');
    });
    document.getElementById(`${name}-pane`).classList.add('active');
    if (name === 'velov' && !velovLoaded) {
        velovLoaded = true;
        updateVelov(); // Utilise updateVelov au lieu de loadVelovList
    }
}

// Écouteurs pour le glisser entre onglets
document.querySelector('.header-tabs')?.addEventListener('touchstart', (e) => {
    isTabDragging = true;
    tabStartX = e.touches[0].clientX;
    const activeTab = document.querySelector('.header-tab.active');
    currentTabIndex = Array.from(document.querySelectorAll('.header-tab')).indexOf(activeTab);
    e.preventDefault();
}, { passive: false });

document.querySelector('.header-tabs')?.addEventListener('touchmove', (e) => {
    if (!isTabDragging) return;
    const deltaX = e.touches[0].clientX - tabStartX;

    // Seuil de 50px pour changer d'onglet
    if (Math.abs(deltaX) > 50) {
        const tabs = Array.from(document.querySelectorAll('.header-tab'));
        if (deltaX > 50 && currentTabIndex > 0) {
            // Glisser vers la droite → onglet précédent
            switchToTab(tabs[currentTabIndex - 1].dataset.tab);
            isTabDragging = false;
        } else if (deltaX < -50 && currentTabIndex < tabs.length - 1) {
            // Glisser vers la gauche → onglet suivant
            switchToTab(tabs[currentTabIndex + 1].dataset.tab);
            isTabDragging = false;
        }
    }
    e.preventDefault();
}, { passive: false });

document.querySelector('.header-tabs')?.addEventListener('touchend', () => {
    isTabDragging = false;
});

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
});
if (window.screen?.orientation) {
    window.screen.orientation.addEventListener('change', () => {
        setTimeout(() => map.invalidateSize(), 350);
    });
}

// Initialiser les onglets
document.querySelectorAll('.header-tab').forEach(b => {
    b.addEventListener('click', () => switchToTab(b.dataset.tab));
});

// Initialiser la hauteur du panneau au chargement
window.addEventListener('load', initPanelHeight);
window.addEventListener('resize', initPanelHeight);

// Met à jour les icônes quand on zoome/dézoome
map.on('zoomend', () => {
    updateIconSizes();
});
