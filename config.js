/**
 * Configuration de l'application TCL Localisation - Version Optimisée 2026
 */
const CONFIG = {
    MAP: {
        center: [45.764043, 4.835659],
        zoom: 13,
        minZoom: 11,
        maxZoom: 19
    },
    API: {
        bus: 'https://data.lyon.fr/wfs/rdata?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=GEOJSON&SRSNAME=EPSG:4326&TYPENAMES=tcl_sytral.tcllignesbus',
        velov: 'https://data.lyon.fr/wfs/rdata?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=GEOJSON&SRSNAME=EPSG:4326&TYPENAMES=tcl_sytral.tclarretvelov',
        parkings: 'https://data.lyon.fr/wfs/rdata?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=GEOJSON&SRSNAME=EPSG:4326&TYPENAMES=tcl_sytral.tclparcrelais',
        busPositions: 'https://data.lyon.fr/wfs/rdata?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=GEOJSON&SRSNAME=EPSG:4326&TYPENAMES=tcl_sytral.tclpositionbus'
    },
    PERFORMANCE: {
        updateInterval: 30000,
        clusterThreshold: 50,
        maxMarkers: 1000,
        clusterDistance: 50,
        throttleDelay: 200
    },
    ICONS: {
        bus: { iconUrl: 'assets/SVG_Icons/Bus.svg', iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16], className: 'bus-icon' },
        velov: { iconUrl: 'assets/SVG_Icons/Velov.svg', iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16], className: 'velov-icon' },
        parking: { iconUrl: 'assets/SVG_Icons/Park.svg', iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16], className: 'parking-icon' },
        velovColors: {
            bleu: 'assets/SVG_Icons/Velov_bleu.svg',
            vert: 'assets/SVG_Icons/Velov_vert.svg',
            orange: 'assets/SVG_Icons/Velov_orange.svg',
            rouge: 'assets/SVG_Icons/Velov_rouge.svg'
        }
    },
    THEME: {
        primary: '#e74c3c',
        secondary: '#3498db',
        success: '#2ecc71',
        warning: '#f39c12',
        danger: '#e74c3c',
        info: '#3498db',
        light: '#f8f9fa',
        dark: '#1a1a2e',
        glass: 'rgba(255, 255, 255, 0.15)',
        glassBorder: 'rgba(255, 255, 255, 0.3)',
        text: '#ffffff',
        textSecondary: '#b0b0b0'
    },
    POPUP: { maxWidth: 300, maxHeight: 200, closeButton: true, autoClose: false, keepInView: true },
    CLUSTER: { spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true, maxClusterRadius: 50 },
    ERRORS: { apiTimeout: 10000, maxRetries: 3, fallbackData: true }
};
