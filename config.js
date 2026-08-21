// Configuration globale
const CONFIG = {
    API_BASE_URL: window.location.hostname.includes('hf.space') 
        ? '' 
        : 'https://matttcl-tcl-localisation.hf.space/',
    API_FETCH_TIMEOUT: 15000,
    MAX_STOPS_ON_MAP: 200,
    MAX_VELOV_ON_MAP: 250,
    MAX_PARKINGS_ON_MAP: 100,
    PROXY_ENABLED: true
};

// Variables globales partagées
window.allStops = [];
window.stopsMapping = {};
window.allLines = [];
window.allVelovStations = [];
window.allParkings = [];
window.allParcsRelais = [];
window.busMarkers = new Map();
window.velovMarkerMap = new Map();
window.parkingMarkerMap = new Map();
window.parcsRelaisMarkerMap = new Map();
window.stopMarkerMap = new Map();
window.layerVisibility = { bus: true, stops: true, velov: true, parking: true };
