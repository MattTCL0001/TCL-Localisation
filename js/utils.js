// ============================================
// CONSTANTES GLOBALES (UTILITAIRES)
// ============================================
const imgCache = new Map();

// Couleurs des lignes (ton mappage existant)
const COLOR_TO_LINES = {
    '#0099BC': ['C12', 'C21', '63', 'N180'],
    '#2699D6': ['C26', 'C204', '68', '99EX', '130', '212', '214', '237', '248', '285'],
    // ... (garde ton mappage existant)
};

// Génère LINE_COLORS_MASTER
const LINE_COLORS_MASTER = (() => {
    const master = {};
    for (const [color, lines] of Object.entries(COLOR_TO_LINES)) {
        for (const line of lines) {
            master[line] = color;
        }
    }
    return master;
})();

// Couleurs par type de ligne
const LINE_TYPE_COLORS = {
    metro: '#E2001A',
    tram: '#662483',
    tb: '#fdc300',
    funiculaire: '#6da432',
    navgone: '#00A3A6',
    chrono: '#2699d6',
    bus: '#6e8997',
    navette: '#EC6608',
    pl: '#992358',
    jd: '#17297B',
    other: '#888'
};

// Mappage des lignes
const lineMapping = {
    'C3': 'C3', 'C11': 'C27', 'C7': '36', 'C15E': '32', 'C19': '41', 'C20E': 'C20EX',
    // ... (garde ton mappage existant)
};

// ============================================
// FONCTIONS D'AFFICHAGE (Spinners, Notifications)
// ============================================

/**
 * Affiche le spinner de chargement.
 */
function showSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'flex';
}

/**
 * Masque le spinner de chargement.
 */
function hideSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'none';
}

/**
 * Affiche une notification.
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;">×</button>
    `;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// ============================================
// FONCTIONS UTILITAIRES (conservées de ton code)
// ============================================

/**
 * Obtient la couleur d'une ligne.
 */
function getLineColor(code) {
    if (!code) return LINE_TYPE_COLORS.other;
    const u = String(code).trim();
    if (LINE_COLORS_MASTER[u]) return LINE_COLORS_MASTER[u];
    if (LINE_COLORS_MASTER[u.toUpperCase()]) return LINE_COLORS_MASTER[u.toUpperCase()];
    return LINE_TYPE_COLORS[getLineType(u)] || LINE_TYPE_COLORS.other;
}

/**
 * Obtient le type d'une ligne.
 */
function getLineType(line) {
    const u = line.toUpperCase();
    if (/^[ABCD]$/.test(u)) return 'metro';
    if (/^NAVI|^7601/.test(u)) return 'navgone';
    if (u === '203' || u === '204') return 'chrono';
    if (/^T\d/.test(u) || /^RX/.test(u)) return 'tram';
    if (/^TB/.test(u)) return 'tb';
    if (/^F[12]$/.test(u)) return 'funiculaire';
    if (/^C/.test(u)) return 'chrono';
    if (/^N\d*/.test(u) || /^BGS\d*/.test(u)) return 'navette';
    if (/^PL/.test(u)) return 'pl';
    if (/^JD/.test(u)) return 'jd';
    return 'bus';
}

// ===== FONCTIONS MANQUANTES AJOUTÉES =====

/**
 * Vérifie le statut du système (appelé périodiquement)
 */
async function checkSystemStatus() {
    try {
        const statusDot = document.getElementById('system-status-dot');
        if (!statusDot) return;
        
        // Simuler un check (à remplacer par un vrai appel API si disponible)
        const response = await fetch(CONFIG.API_BASE_URL + 'api/status', {
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            statusDot.className = 'system-status-dot online';
            statusDot.title = 'Système opérationnel';
        } else {
            statusDot.className = 'system-status-dot warning';
            statusDot.title = 'Problème de connexion';
        }
    } catch (e) {
        const statusDot = document.getElementById('system-status-dot');
        if (statusDot) {
            statusDot.className = 'system-status-dot offline';
            statusDot.title = 'Hors ligne - Mode dégradé';
        }
        console.warn('System status check failed:', e.message);
    }
}

/**
 * Met à jour les données de trafic
 */
async function updateTraffic() {
    try {
        const data = await apiFetch('api/traffic');
        if (data.is_loading) {
            setTimeout(updateTraffic, 10000);
            return;
        }
        renderTrafficList(data);
        console.log("✅ Trafic mis à jour");
    } catch (e) {
        console.error("❌ Erreur updateTraffic:", e);
        setTimeout(updateTraffic, 10000);
    }
}

/**
 * Met à jour les alertes d'accessibilité
 */
async function updateAccessibility() {
    try {
        const data = await apiFetch('api/accessibility');
        if (data.is_loading) {
            setTimeout(updateAccessibility, 10000);
            return;
        }
        renderAccessibilityList(data);
        console.log("✅ Accessibilité mise à jour");
    } catch (e) {
        console.error("❌ Erreur updateAccessibility:", e);
        setTimeout(updateAccessibility, 10000);
    }
}

/**
 * Affiche la liste du trafic
 */
function renderTrafficList(data) {
    const container = document.getElementById('traffic-list');
    if (!container) return;
    
    if (!data || !data.alerts || data.alerts.length === 0) {
        container.innerHTML = '<div class="info-empty">Aucune perturbation en cours</div>';
        return;
    }
    
    container.innerHTML = data.alerts.map(alert => `
        <div class="info-item" onclick="toggleInfoItem(this)">
            <div class="info-item-header">
                <span class="info-item-icon">⚠️</span>
                <span class="info-item-title">${alert.line || 'Général'}</span>
                <span class="info-item-badge">${alert.severity || 'Info'}</span>
            </div>
            <div class="info-item-body">
                <p>${alert.message || 'Détails non disponibles'}</p>
                <p class="mono">${alert.start_time ? new Date(alert.start_time).toLocaleString('fr-FR') : ''}</p>
            </div>
        </div>
    `).join('');
}

/**
 * Affiche la liste d'accessibilité
 */
function renderAccessibilityList(data) {
    const container = document.getElementById('accessibility-list');
    if (!container) return;
    
    if (!data || !data.alerts || data.alerts.length === 0) {
        container.innerHTML = '<div class="info-empty">Aucune alerte accessibilité</div>';
        return;
    }
    
    container.innerHTML = data.alerts.map(alert => `
        <div class="info-item" onclick="toggleInfoItem(this)">
            <div class="info-item-header">
                <span class="info-item-icon">♿</span>
                <span class="info-item-title">${alert.stop || 'Arrêt inconnu'}</span>
                <span class="info-item-badge">PMR</span>
            </div>
            <div class="info-item-body">
                <p>${alert.message || 'Détails non disponibles'}</p>
            </div>
        </div>
    `).join('');
}

/**
 * Efface tous les filtres
 */
function clearAllFilters() {
    currentLineFilter = null;
    busLineFilter = null;
    document.getElementById('bus-filter-banner').style.display = 'none';
    document.getElementById('stop-filter-banner').style.display = 'none';
    updateVisibleVelov();
    updateVisibleParkings();
    updateVisibleParkAndRideLots();
    renderVisibleStops();
    applyBusLineFilter();
}

/**
 * Filtre par ligne depuis un popup
 */
function filterLineFromPopup(line) {
    busLineFilter = getNewLineNumber(line);
    currentLineFilter = busLineFilter;
    const label = document.getElementById('bus-filter-label');
    if (label) {
        label.textContent = `Ligne ${line} seulement`;
        document.getElementById('bus-filter-banner').style.display = 'flex';
    }
    applyBusLineFilter();
    renderVisibleStops();
}
