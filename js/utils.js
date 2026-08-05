// ===== CONSTANTES =====
const API_BASE_URL = window.location.hostname.includes('hf.space')
    ? ''
    : 'https://matttcl-tcl-localisation.hf.space/';

const imgCache = new Map();

// Couleurs des lignes (source unique)
const LINE_COLORS_MASTER = {
    'A': '#e50069', 'B': '#0075bf', 'C': '#ec6608', 'D': '#cf7eae',
    'T1': '#004f9f', 'T2': '#6ba230', 'T3': '#00a3a6', 'T4': '#662483', 'T5': '#ec6608', 'T6': '#f191a3', 'T7': '#992358',
    'F1': '#6da432', 'F2': '#006f9e',
    'C1': '#004f9f', 'C2': '#e50069', 'C3': '#6ba230', 'C4': '#c57e65', 'C5': '#ec6608', 'C6': '#83c491',
    'C7': '#6e8997', 'C8': '#662483', 'C9': '#c88817', 'C10': '#cf7eae', 'C11': '#6ba230', 'C12': '#0099bc',
    'C13': '#c20344', 'C14': '#f191a3', 'C15': '#d3d800', 'C16': '#c57e65', 'C17': '#3f4e55', 'C18': '#00a3a6',
    'C19': '#e50069', 'C20': '#836c77', 'C21': '#0099bc', 'C22': '#bca3ce', 'C23': '#009e3d', 'C24': '#00336a',
    'C25': '#fdc300', 'C26': '#2699d6', 'C27': '#6ba230',
    'C20EX': '#f59c00', 'C22EX': '#80682e', 'C20E': '#f59c00',
    'TB11': '#fdc300', 'TB12': '#80682e',
    'NAVI1': '#00a3a6'
};

const LINE_TYPE_COLORS = {
    metro: '#E2001A', tram: '#662483', tb: '#fdc300', funiculaire: '#6da432',
    navgone: '#00A3A6', chrono: '#2699d6', bus: '#6e8997', navette: '#EC6608',
    pl: '#992358', jd: '#17297B', other: '#888'
};

// ===== FONCTIONS UTILITAIRES =====
function getLineColor(code) {
    if (!code) return LINE_TYPE_COLORS.other;
    const u = String(code).trim();
    if (LINE_COLORS_MASTER[u]) return LINE_COLORS_MASTER[u];
    if (LINE_COLORS_MASTER[u.toUpperCase()]) return LINE_COLORS_MASTER[u.toUpperCase()];
    return LINE_TYPE_COLORS[getLineType(u)] || LINE_TYPE_COLORS.other;
}

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
    if (/^BR/.test(u)) return 'bus';
    return 'bus';
}

function shouldLoadJDSvg(lineNum) {
    const s = String(lineNum);
    if (!s.startsWith('JD')) return true;
    const num = parseInt(s.replace('JD', ''), 10);
    return !isNaN(num) && num >= 300;
}

function lineImgHtml(lineNum, height = '20px') {
    const src = `assets/Lignes/${lineNum}.svg`;
    const fallbackStyle = `background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:2px 6px;border-radius:6px;font-size:11px;font-weight:600;color:#eee;display:inline-flex;align-items:center;justify-content:center;height:${height};min-width:24px;`;
    const color = getLineColor(lineNum);

    if (!shouldLoadJDSvg(lineNum)) {
        return `<span style="${fallbackStyle}color:${color};">${lineNum}</span>`;
    }

    const state = imgCache.get(src);
    if (state === 'ok') return `<img src="${src}" style="height:${height};width:auto;display:inline-block;vertical-align:middle;">`;
    if (state === 'error') return `<span style="${fallbackStyle}color:${color};">${lineNum}</span>`;

    return `<img src="${src}" data-line="${lineNum}" style="height:${height};width:auto;display:inline-block;vertical-align:middle;" loading="lazy"
        onload="imgCache.set(this.src,'ok')"
        onerror="imgCache.set(this.src,'error');var s=document.createElement('span');s.textContent=this.dataset.line;s.style.cssText='${fallbackStyle}color:${color};';this.replaceWith(s)">`;
}

function getDispoColor(value, total) {
    if (value === null || total === null) return null;
    const path = 'assets/SVG_Icons/';
    const style = 'style="width:14px;height:14px;vertical-align:-2px;filter:brightness(0) invert(1);"';

    if (value === 0 && total === 0) return {
        color: '#4B0082',
        rgb: '75,0,130',
        label: `<img src="${path}refusé.svg" ${style}> Fermé`,
        textColor: '#9b59b6'
    };
    if (value === 0) return {
        color: '#ff4d4d',
        rgb: '255,77,77',
        label: `<img src="${path}refusé.svg" ${style}> Complet`,
        textColor: '#ff4d4d'
    };

    const pct = total > 0 ? (value / total) * 100 : 0;
    if (pct <= 25) return {
        color: '#ffb84d',
        rgb: '255,184,77',
        label: `<img src="${path}trafic.svg" ${style}> Faible`,
        textColor: '#ffb84d'
    };
    if (pct <= 50) return {
        color: '#f1c40f',
        rgb: '241,196,15',
        label: `<img src="${path}validé.svg" ${style}> Moyen`,
        textColor: '#f1c40f'
    };
    if (pct <= 75) return {
        color: '#00d2ff',
        rgb: '0,210,255',
        label: `<img src="${path}validé.svg" ${style}> Correct`,
        textColor: '#00d2ff'
    };
    return {
        color: '#4dff88',
        rgb: '77,255,136',
        label: `<img src="${path}validé.svg" ${style}> Disponible`,
        textColor: '#4dff88'
    };
}

function getVelovDispoColor(bikes, stands, total) {
    if (bikes === 0 && stands === 0) return {
        color: '#4B0082',
        rgb: '75,0,130',
        label: 'Fermée',
        textColor: '#9b59b6'
    };
    return getDispoColor(bikes, total || (bikes + stands));
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) *
              Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function highlightText(text, term) {
    if (!term || !text) return text || '';
    return text.replace(
        new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<span class="search-highlight">$1</span>'
    );
}

function fmtDepAt(isoStr, now) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const diffSec = Math.floor((d.getTime() - now) / 1000);
    const hhmm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    if (diffSec <= 30) return `<span style="color:#4dff88;font-weight:700;">à quai</span> <span style="color:var(--text-muted);font-size:10px;">(${hhmm})</span>`;
    const diffMin = Math.floor(diffSec / 60);
    const remSec = diffSec % 60;
    if (diffMin < 60) {
        const secStr = remSec > 0 ? `<span style="color:var(--text-muted);font-size:10px;"> ${remSec}s</span>` : '';
        return `<span style="color:var(--text-primary);font-weight:700;">${diffMin} min</span>${secStr} <span style="color:var(--text-muted);font-size:10px;">(${hhmm})</span>`;
    }
    return `<span style="color:var(--text-secondary)">${hhmm}</span>`;
}

// Mappage des lignes (ancien → nouveau)
const lineMapping = {
    'C3': 'C3', 'C11': 'C27', 'C7': '36', 'C15E': '32', 'C19': '41', 'C20E': 'C20EX', 'C22E': 'C22EX',
    '2': '102', '3': '103', '5': '105', '6': '106', '6E': '106EX', '7': '107', '8': '108', '9': '109',
    '10': '110', '10E': '110EX', '11': '111', '12': '112', '14': '114', '15': '115', '15E': '99EX',
    '16': '116', '17': '117', '18': '118', '19': '119', '20': '120', '21': '121', '22': '123', '23': '123',
    '24': '124', '25': '125', '26': '126', '27': '127', '30': '230', '32': '232', '47': '248',
    '52E': '52EX', '89D': '89EX', '98E': '98EX', 'Zi1': '145', 'Zi2': '146', 'Zi3': '147', 'Zi4': '148',
    'Zi5': '149', 'Zi8': '150', 'GE2': '130', 'GE4': '131', 'GE6': '132', 'N20': 'N185', 'N80': 'N180',
    'N81': 'N181', 'N82': 'N182', 'N83': 'N183', 'N84': 'N184', 'N100': 'N186', 'S1': '133', 'S2': '138',
    'S3': '139', 'S4A': '104A', 'S4B': '104B', 'S5': '140', 'S6': '141', 'S7': '142', 'S8': '143',
    'S9': '144', 'S10': '134', 'S11': '135', 'S14': '136', 'S15': '137',
    'NAVI1': '7601'
};

function getNewLineNumber(l) {
    return lineMapping[l] || l;
}

function getOriginalCodes(targetMapped) {
    const codes = new Set([targetMapped]);
    for (const [orig, mapped] of Object.entries(lineMapping)) {
        if (mapped === targetMapped) codes.add(orig);
    }
    return codes;
}

function stopServesLine(desserte, targetMapped) {
    if (!desserte) return false;
    const codes = getOriginalCodes(targetMapped);
    return desserte.split(',').some(entry => {
        const code = entry.trim().split(':')[0].trim();
        return codes.has(code) || codes.has(getNewLineNumber(code));
    });
}

function extractLines(desserte) {
    if (!desserte) return [];
    const lines = [...new Set(
        desserte.split(',').map(x => getNewLineNumber(x.trim().split(':')[0].trim()))
    )];
    return lines.sort(sortLinesByType);
}

function renderLineSvgs(lines) {
    if (!lines?.length) return '<span style="color:var(--text-muted);font-size:11px;">Aucune ligne</span>';
    return lines.map(l => lineImgHtml(getNewLineNumber(l), '20px')).join('');
}

function getLineTypePriority(type) {
    const priorities = {
        metro: 1, tram: 2, tb: 3, navgone: 4, funiculaire: 5,
        chrono: 6, bus: 7, navette: 8, pl: 9, jd: 10, other: 11
    };
    return priorities[type] || 999;
}

function sortLinesByType(a, b) {
    const typeA = getLineType(a);
    const typeB = getLineType(b);
    const priorityA = getLineTypePriority(typeA);
    const priorityB = getLineTypePriority(typeB);

    if (priorityA !== priorityB) return priorityA - priorityB;

    const numA = parseInt(String(a).replace(/\D/g, '')) || 9999;
    const numB = parseInt(String(b).replace(/\D/g, '')) || 9999;
    if (numA !== numB) return numA - numB;

    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// ===== NOTIFICATIONS =====
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;">×</button>
    `;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// ===== GESTION DU SPINNER =====
function showSpinner() {
    document.getElementById('loading-spinner').style.display = 'flex';
}

function hideSpinner() {
    document.getElementById('loading-spinner').style.display = 'none';
}