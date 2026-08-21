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

// ... (garde toutes tes autres fonctions utilitaires)
