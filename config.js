// Configuration globale
const API_BASE_URL = 'https://matttcl-tcl-localisation.hf.space/';
const API_FETCH_TIMEOUT = 15000;
let _fetchBackoff = 1000;
const MAX_STOPS_ON_MAP = 200;
const MAX_VELOV_ON_MAP = 250;
const MAX_PARKINGS_ON_MAP = 100;
const DEFAULT_LAYER_VISIBILITY = { bus: true, stops: true, velov: true, parking: true };
