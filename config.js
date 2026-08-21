// Configuration de l'API (utilise TON proxy Hugging Face)
const API_BASE_URL = 'https://matttcl-tcl-localisation.hf.space/';

// Timeout pour les requêtes API (15 secondes)
const API_FETCH_TIMEOUT = 15000;

// Délai de réessai en cas d'erreur (1 seconde)
let _fetchBackoff = 1000;

// Limites pour éviter la surcharge
const MAX_STOPS_ON_MAP = 200;
const MAX_VELOV_ON_MAP = 250;
const MAX_PARKINGS_ON_MAP = 100;

// Préférences par défaut pour les couches
const DEFAULT_LAYER_VISIBILITY = { bus: true, stops: true, velov: true, parking: true };
