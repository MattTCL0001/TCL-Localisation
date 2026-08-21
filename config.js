// config.js - Configuration globale pour toute l'application
window.CONFIG = {
    API_BASE_URL: window.location.hostname.includes('hf.space') ? '' : 'https://matttcl-tcl-localisation.hf.space/',
    API_FETCH_TIMEOUT: 15000,
    MAX_STOPS_ON_MAP: 200,
    MAX_VELOV_ON_MAP: 250,
    MAX_PARKINGS_ON_MAP: 100
};

// Variables globales partagées entre tous les fichiers
window.allStops = [];
window.stopsMapping = {};
window.allLines = [];
window.busMarkers = new Map();
window.velovMarkerMap = new Map();
window.parkingMarkerMap = new Map();
window.stopMarkerMap = new Map();
window.layerVisibility = { bus: true, stops: true, velov: true, parking: true };
window.currentLineFilter = null;
window.busLineFilter = null;
