// ============================================
// INITIALISATION DE LA CARTE
// ============================================
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    renderer: L.canvas()
}).setView([45.757, 4.832], 13);

// Ajouter le fond de carte (OpenStreetMap - version claire)
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
// GESTION DU GLISSER-DÉPOSER POUR LE TIROIR (PAR LE TITRE)
// ============================================
let isDraggingPanel = false;
let dragStartY = 0;
let panelStartTop = 0;
let panelHeight = 0;

/**
 * Initialise le glisser-déposer du panneau par son titre.
 */
function initPanelDrag() {
    const panel = document.getElementById('info-panel');
    const panelHeader = document.querySelector('.panel-header');

    if (!panel || !panelHeader) return;

    // Initialise la hauteur et la position
    panelHeight = window.innerHeight * 0.6;
    panel.style.height = `${panelHeight}px`;
    panel.style.bottom = '0';
    panel.style.top = 'auto';

    // Écouteurs pour le glisser depuis le titre
    panelHeader.addEventListener('touchstart', (e) => {
        isDraggingPanel = true;
        dragStartY = e.touches[0].clientY;
        panelStartTop = parseInt(window.getComputedStyle(panel).bottom) || 0;
        e.preventDefault();
    }, { passive: false });

    panelHeader.addEventListener('touchmove', (e) => {
        if (!isDraggingPanel) return;
        const deltaY = dragStartY - e.touches[0].clientY; // Inversé pour un mouvement naturel
        const newBottom = panelStartTop + deltaY;

        // Limite la position entre 0 (en bas) et 80% de la hauteur de l'écran (en haut)
        const minBottom = 0;
        const maxBottom = window.innerHeight * 0.8;
        const clampedBottom = Math.max(minBottom, Math.min(newBottom, maxBottom));

        panel.style.bottom = `${clampedBottom}px`;
        e.preventDefault();
    }, { passive: false });

    panelHeader.addEventListener('touchend', () => {
        isDraggingPanel = false;
        setTimeout(() => map.invalidateSize(), 100);
    });

    // Version souris (pour desktop)
    panelHeader.addEventListener('mousedown', (e) => {
        isDraggingPanel = true;
        dragStartY = e.clientY;
        panelStartTop = parseInt(window.getComputedStyle(panel).bottom) || 0;
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingPanel) return;
        const deltaY = dragStartY - e.clientY;
        const newBottom = panelStartTop + deltaY;

        const minBottom = 0;
        const maxBottom = window.innerHeight * 0.8;
        const clampedBottom = Math.max(minBottom, Math.min(newBottom, maxBottom));

        panel.style.bottom = `${clampedBottom}px`;
        e.preventDefault();
    });

    window.addEventListener('mouseup', () => {
        isDraggingPanel = false;
        setTimeout(() => map.invalidateSize(), 100);
    });
}

// ============================================
// GESTION DES ONGLETS (EN HAUT DU TIROIR)
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
        updateVelov();
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

    if (Math.abs(deltaX) > 50) {
        const tabs = Array.from(document.querySelectorAll('.header-tab'));
        if (deltaX > 50 && currentTabIndex > 0) {
            switchToTab(tabs[currentTabIndex - 1].dataset.tab);
            isTabDragging = false;
        } else if (deltaX < -50 && currentTabIndex < tabs.length - 1) {
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

// Initialiser le glisser-déposer du panneau
window.addEventListener('load', () => {
    initPanelDrag();
    // Masquer les textes des onglets si pas assez de place
    checkTabSpace();
});
window.addEventListener('resize', () => {
    checkTabSpace();
});

// Met à jour les icônes quand on zoome/dézoome
map.on('zoomend', () => {
    updateIconSizes();
});

// ============================================
// FONCTION POUR MASQUER LES TEXTES DES ONGLETS SI PAS ASSEZ DE PLACE
// ============================================
/**
 * Masque les textes des onglets si pas assez de place.
 */
function checkTabSpace() {
    const tabsContainer = document.querySelector('.header-tabs');
    if (!tabsContainer) return;

    const tabs = Array.from(tabsContainer.querySelectorAll('.header-tab'));
    const containerWidth = tabsContainer.offsetWidth;
    let totalWidth = 0;

    // Mesure la largeur totale nécessaire (avec textes)
    tabs.forEach(tab => {
        totalWidth += tab.offsetWidth;
    });

    // Si la largeur totale dépasse la largeur du conteneur, masquer les textes
    const shouldHideText = totalWidth > containerWidth * 1.2; // Marge de 20%

    tabs.forEach(tab => {
        const textSpan = tab.querySelector('span');
        if (textSpan) {
            textSpan.style.display = shouldHideText ? 'none' : 'inline';
        }
    });
}
