// ============================================
// CONSTANTES GLOBALES (UTILITAIRES)
// ============================================
const imgCache = new Map();

// Couleurs des lignes (mappage couleur → lignes)
const COLOR_TO_LINES = {
    '#0099BC': ['C12', 'C21', '63', 'N180'],
    '#2699D6': ['C26', 'C204', '68', '99EX', '130', '212', '214', '237', '248', '285'],
    '#006F9E': ['F2', '49', '85', '118', '148', '243'],
    '#00A3A6': ['NAVI1', 'T3', 'C18', '54', '90', '124', '134', 'A32', 'PL3'],
    '#004F9F': ['T1', 'C1', '39', '77', '133', 'N184', 'N196'],
    '#00336A': ['C24', '64', '71', '103', 'N183'],
    '#0075BF': ['B', 'C201', '37', '62', '110', '152', 'PL2'],
    '#312783': ['33', '106', '136'],
    '#C88817': ['C9', '50', '88', '119', '149', '151', 'TN190'],
    '#80682E': ['TB12', '46', '84', '117', '128', 'N185'],
    '#3F4E55': ['C17', '95', '98EX'],
    '#6E8997': ['C7', '36', '87', '110EX', '150', '164', '218', '222'],
    '#FDC300': ['TB11', 'C25', 'C200', '45', '137', '144', '231', '232', '247'],
    '#F59C00': ['C20EX', 'C203', '60', '81', '116', '120', '146'],
    '#C57E65': ['C4', 'C16', '65'],
    '#EC6608': ['C', 'T5', 'C5', 'C205', '40', '107', '111', '123', '126', '131', '239', 'N186'],
    '#992358': ['T7', 'F1', '59', '96', '127', 'N189', 'PL1'],
    '#D682B5': ['C10', '43', '80', '145'],
    '#E50069': ['C2', 'C19', '41', '93', '121', '165', '265'],
    '#E8308A': ['A', '57', '72', '125', 'PL4'],
    '#836C77': ['C20', '79', '102', '114', 'N187'],
    '#F191A3': ['T6', 'C14', '82', '86', '104A', '109', '219', '238', '241', 'TN192'],
    '#C20344': ['C13', '67', '216', 'N195'],
    '#D3D800': ['C15', '44', '61', '98', '217', '220', 'N181', 'TN191'],
    '#83C491': ['C6', 'C202', '38', '76', '112', '141', '143', '147'],
    '#9F9825': ['52EX', '89EX'],
    '#6BA230': ['T2', 'C3', 'C11', 'C27', '32', '34', '105', '106EX', '135', '142', '156', '213', '215', '235', '240', 'N182'],
    '#009E3D': ['D', 'C23', '52', '55', '89', '97', '104B', '122', '139', '140', '153', '245', 'N197'],
    '#662483': ['T4', 'C8', '31', '66', '69', '78', '115', '132', '161', '236'],
    '#BCA3CE': ['C22', '35', '70', '108', '138', '154']
};

// Génère LINE_COLORS_MASTER à partir de COLOR_TO_LINES
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
    'S9': '144', 'S10': '134', 'S11': '135', 'S14': '136', 'S15': '137', 'NAVI1': '7601'
};

// ============================================
// FONCTIONS UTILITAIRES
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

/**
 * Génère le HTML pour une icône de ligne.
 */
function lineImgHtml(lineNum, height = '20px') {
    const src = `assets/Lignes/${lineNum}.svg`;
    const fallbackStyle = `background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);padding:2px 6px;border-radius:6px;font-size:11px;font-weight:600;color:#eee;display:inline-flex;align-items:center;justify-content:center;height:${height};min-width:24px;`;
    const color = getLineColor(lineNum);

    const state = imgCache.get(src);
    if (state === 'ok') return `<img src="${src}" style="height:${height};width:auto;display:inline-block;vertical-align:middle;">`;
    if (state === 'error') return `<span style="${fallbackStyle}color:${color};">${lineNum}</span>`;

    return `<img src="${src}" data-line="${lineNum}" style="height:${height};width:auto;display:inline-block;vertical-align:middle;" loading="lazy"
        onload="imgCache.set(this.src,'ok')"
        onerror="imgCache.set(this.src,'error');var s=document.createElement('span');s.textContent=this.dataset.line;s.style.cssText='${fallbackStyle}color:${color};';this.replaceWith(s)">`;
}

/**
 * Obtient la couleur de disponibilité.
 */
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

/**
 * Obtient la couleur de disponibilité pour les Vélo'v.
 */
function getVelovDispoColor(bikes, stands, total) {
    if (bikes === 0 && stands === 0) return {
        color: '#4B0082',
        rgb: '75,0,130',
        label: 'Fermée',
        textColor: '#9b59b6'
    };
    return getDispoColor(bikes, total || (bikes + stands));
}

/**
 * Calcule la distance entre deux points (formule de Haversine).
 */
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

/**
 * Met en surbrillance le texte correspondant à la recherche.
 */
function highlightText(text, term) {
    if (!term || !text) return text || '';
    return text.replace(
        new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<span class="search-highlight">$1</span>'
    );
}

/**
 * Formate l'heure de départ.
 */
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

/**
 * Obtient le nouveau numéro de ligne.
 */
function getNewLineNumber(l) {
    return lineMapping[l] || l;
}

/**
 * Obtient les codes originaux pour une ligne mappée.
 */
function getOriginalCodes(targetMapped) {
    const codes = new Set([targetMapped]);
    for (const [orig, mapped] of Object.entries(lineMapping)) {
        if (mapped === targetMapped) codes.add(orig);
    }
    return codes;
}

/**
 * Vérifie si un arrêt dessert une ligne.
 */
function stopServesLine(desserte, targetMapped) {
    if (!desserte) return false;
    const codes = getOriginalCodes(targetMapped);
    return desserte.split(',').some(entry => {
        const code = entry.trim().split(':')[0].trim();
        return codes.has(code) || codes.has(getNewLineNumber(code));
    });
}

/**
 * Extrait les lignes d'un arrêt.
 */
function extractLines(desserte) {
    if (!desserte) return [];
    const lines = [...new Set(
        desserte.split(',').map(x => getNewLineNumber(x.trim().split(':')[0].trim()))
    )];
    return lines.sort(sortLinesByType);
}

/**
 * Génère le HTML pour les icônes des lignes d'un arrêt.
 */
function renderLineSvgs(lines) {
    if (!lines?.length) return '<span style="color:var(--text-muted);font-size:11px;">Aucune ligne</span>';
    return lines.map(l => lineImgHtml(getNewLineNumber(l), '20px')).join('');
}

/**
 * Obtient la priorité d'un type de ligne pour le tri.
 */
function getLineTypePriority(type) {
    const priorities = {
        metro: 1, tram: 2, tb: 3, navgone: 4, funiculaire: 5,
        chrono: 6, bus: 7, navette: 8, pl: 9, jd: 10, other: 11
    };
    return priorities[type] || 999;
}

/**
 * Trie les lignes par type et numéro.
 */
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

/**
 * Construit le popup d'un bus.
 */
function buildBusPopup(bus) {
    return `
    <div style="width:260px;background:var(--glass-bg-heavy);border-radius:16px;overflow:hidden;font-family:inherit;border:1px solid var(--glass-border-highlight);">
        <div style="position:relative;height:80px;background:linear-gradient(135deg,${bus.color}33 0%,#08090f 55%,${bus.color}22 100%);display:flex;align-items:center;justify-content:center;overflow:hidden;">
            <div style="position:absolute;inset:0;background:linear-gradient(135deg,${bus.color}33 0%,transparent 55%,${bus.color}22 100%);pointer-events:none;"></div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:48px;background:linear-gradient(transparent,var(--glass-bg-heavy));pointer-events:none;"></div>
            <div onclick="filterLineFromPopup('${bus.line}')" title="Filtrer la ligne ${bus.line}" style="position:absolute;bottom:12px;left:12px;background:rgba(13,15,24,0.75);border:1px solid ${bus.color}66;border-radius:12px;padding:6px;cursor:pointer;backdrop-filter:blur(12px);box-shadow:0 4px 12px rgba(0,0,0,0.4);transition:all 0.2s ease;" onmouseover="this.style.transform='scale(1.05)';this.style.borderColor='${bus.color}'" onmouseout="this.style.transform='scale(1)';this.style.borderColor='${bus.color}66'">
                ${lineImgHtml(bus.line, '30px')}
            </div>
        </div>
        <div style="padding:12px 14px;border-bottom:1px solid var(--glass-border);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:6px;height:6px;border-radius:50%;background:${bus.color};flex-shrink:0;"></div>
                    <span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;">Ligne ${bus.line}</span>
                </div>
                <span style="font-size:10px;padding:3px 8px;border-radius:20px;${bus.delayOk ? 'background:rgba(77,255,136,0.1);color:#4dff88;border:1px solid rgba(77,255,136,0.2);' : 'background:rgba(255,77,77,0.1);color:#ff4d4d;border:1px solid rgba(255,77,77,0.2);'}">${bus.delayOk ? "À l'heure" : bus.delay}</span>
            </div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">${bus.dest || 'Destination inconnue'}</div>
        </div>
        <div style="padding:10px 14px;">
            <div style="font-size:11px;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">
                <img src="assets/SVG_Icons/bus.svg" class="svg-ic" style="width:12px;height:12px;">${getVehicleType(bus)}
            </div>
            <div style="font-size:10px;color:var(--text-muted);font-family:monospace;margin-top:4px;display:flex;align-items:center;gap:6px;">
                <img src="assets/SVG_Icons/id.svg" class="svg-ic" style="width:11px;height:11px;">${bus.id}
            </div>
        </div>
    </div>`;
}

/**
 * Obtient le type de véhicule.
 */
function getVehicleType(bus) {
    const id = parseInt(bus.id);
    if (isNaN(id)) return 'Véhicule TCL';
    if (id === 111) return 'Le Gône';
    if (id === 112) return 'La Fenotte';
    if (id === 113) return 'Le Canut';
    if (id >= 801 && id < 873) return 'Alstom Citadis 302';
    if (id >= 874 && id < 937) return 'Alstom Citadis 402';
    if (id >= 101 && id < 106) return 'Stadler Tango';
    if ((id >= 1001 && id < 1030) || (id >= 1201 && id < 1218) || (id >= 1301 && id < 1333) || (id >= 1401 && id < 1417) || (id >= 2301 && id < 2328)) return 'Iveco Urbanway 18';
    if ((id >= 2401 && id < 2458) || (id >= 2501 && id < 2524) || (id >= 2701 && id < 2750) || (id >= 3000 && id < 3065)) return 'Iveco Urbanway 12';
    if ((id >= 2001 && id < 2034) || (id >= 2801 && id < 2835)) return 'Hess LighTram 19 DC';
    return 'Véhicule TCL';
}

/**
 * Hash pour les bus.
 */
function busHash(b) {
    return `${b.lat},${b.lon},${b.bearing},${b.delay},${b.dest_code}`;
}

/**
 * Obtient le nom d'un arrêt.
 */
function getStopName(code) {
    if (!code) return null;
    const clean = code.includes(':') ? code.split(':').pop() : code;
    return stopsMapping[clean] || stopsMapping[code] || null;
}

/**
 * Construit le popup d'un parking.
 */
function buildParkingPopup(p, titre = 'Parking') {
    const dispo = p._nb_dispo ?? p.nb_place_dispo ?? null;
    const cap = p.capacite ?? p.nb_place_tot ?? null;

    let dispoSection = '';
    if (dispo !== null && cap !== null) {
        const dispoInfo = getDispoColor(dispo, cap);
        dispoSection = `
        <div style="display:flex;gap:8px;margin-top:10px;">
            <div style="flex:1;text-align:center;background:rgba(255,255,255,0.04);border-radius:10px;padding:8px;border:1px solid var(--glass-border);">
                <div style="font-size:18px;font-weight:700;color:${dispoInfo.textColor};">${dispo}</div>
                <div style="font-size:10px;color:var(--text-muted);">libres</div>
            </div>
            <div style="flex:1;text-align:center;background:rgba(255,255,255,0.04);border-radius:10px;padding:8px;border:1px solid var(--glass-border);">
                <div style="font-size:18px;font-weight:700;color:var(--text-secondary);">${cap}</div>
                <div style="font-size:10px;color:var(--text-muted);">total</div>
            </div>
        </div>`;
    }

    return `
    <div style="width:220px;background:var(--glass-bg-heavy);border-radius:16px;overflow:hidden;font-family:inherit;border:1px solid var(--glass-border-highlight);padding:14px;">
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">🅿️ ${p.nom || titre}</div>
        <div style="font-size:11px;color:var(--text-secondary);">${p.horaires || 'Horaires non disponibles'}</div>
        ${dispoSection}
    </div>`;
}

/**
 * Construit le popup d'une agence.
 */
function buildAgencyPopup(a, adresse, facea) {
    return `
    <div style="width:230px;background:var(--glass-bg-heavy);border-radius:16px;overflow:hidden;font-family:inherit;border:1px solid var(--glass-border-highlight);">
        <div style="background:linear-gradient(135deg,rgba(226,0,26,0.2),rgba(226,0,26,0.05));padding:14px;border-bottom:1px solid var(--glass-border);">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:36px;height:36px;background:var(--accent);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px var(--accent-glow);">
                    <img src="assets/Agence.svg" class="svg-ic" style="width:18px;height:18px;">
                </div>
                <div>
                    <div style="font-size:14px;font-weight:700;color:var(--text-primary);line-height:1.2;">${a.nom}</div>
                    <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Agence commerciale TCL</div>
                </div>
            </div>
        </div>
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--text-secondary);">
            <div style="display:flex;align-items:flex-start;gap:8px;">
                <span>📍</span>
                <div>
                    <div style="color:var(--text-primary);">${adresse}</div>
                    <div style="font-size:11px;">${a.codepostal || ''}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span>🪟</span>
                <span>Face à face : <span style="color:var(--text-primary);">${facea}</span></span>
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;">
                <span>🕒</span>
                <span>${a.horaires || 'Non renseignés'}</span>
            </div>
        </div>
    </div>`;
}

/**
 * Construit le popup d'une station Vélo'v.
 */
function buildVelovPopup(s) {
    const bikes = s.available_bikes || 0;
    const stands = s.available_bike_stands || 0;
    const total = s.bike_stands || (bikes + stands) || 0;
    const dispoInfo = getVelovDispoColor(bikes, stands, total);
    const ms = s.main_stands?.availabilities || {};
    return `
    <div style="width:210px;background:var(--glass-bg-heavy);border-radius:16px;overflow:hidden;font-family:inherit;border:1px solid var(--glass-border-highlight);padding:14px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <img src="assets/SVG_Icons/velo.svg" class="svg-ic" style="width:14px;height:14px;"> ${s.name}
        </div>
        <div style="display:flex;gap:8px;">
            <div style="flex:1;text-align:center;background:rgba(255,255,255,0.04);border-radius:10px;padding:8px;border:1px solid var(--glass-border);">
                <div style="font-size:20px;font-weight:700;color:${dispoInfo.textColor};">${bikes}</div>
                <div style="font-size:10px;color:var(--text-muted);">vélos</div>
            </div>
            <div style="flex:1;text-align:center;background:rgba(255,255,255,0.04);border-radius:10px;padding:8px;border:1px solid var(--glass-border);">
                <div style="font-size:20px;font-weight:700;color:var(--text-secondary);">${stands}</div>
                <div style="font-size:10px;color:var(--text-muted);">places</div>
            </div>
        </div>
        ${(ms.electricalBikes > 0 || ms.mechanicalBikes > 0) ? `
        <div style="display:flex;gap:6px;margin-top:10px;">
            ${ms.electricalBikes > 0 ? `<span style="font-size:10px;color:#00d2ff;background:rgba(0,210,255,0.1);border:1px solid rgba(0,210,255,0.2);border-radius:6px;padding:3px 8px;">⚡ ${ms.electricalBikes} élec</span>` : ''}
            ${ms.mechanicalBikes > 0 ? `<span style="font-size:10px;color:var(--text-secondary);background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);border-radius:6px;padding:3px 8px;">🔧 ${ms.mechanicalBikes} méca</span>` : ''}
        </div>` : ''}
    </div>`;
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
