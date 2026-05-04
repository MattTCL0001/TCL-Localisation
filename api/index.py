from flask import Flask, jsonify
from flask_cors import CORS
import requests
import os
import re
from collections import Counter
import threading
import time

app = Flask(__name__)
CORS(app)

# On va chercher les secrets dans le système au lieu de les écrire ici
USER = os.environ.get('GRANDLYON_USER')
PASS = os.environ.get('GRANDLYON_PASS')

# --- Cache pour stocker les données ---
cache = {
    'parkings': None,
    'traffic': None,
    'accessibility': None,
    'velov': None,
    'stops': None,
    'last_update': {}
}

# --- Statut du chargement initial ---
initial_load_status = {
    'parkings': False,
    'traffic': False,
    'accessibility': False,
    'velov': False,
    'stops': False
}

# --- Extraction couleur dominante depuis les SVG de lignes ---
def extract_dominant_color(svg_path):
    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read()
        colors = re.findall(r'#([0-9a-fA-F]{6})', content)
        if not colors:
            return None
        filtered = [c.upper() for c in colors if c.upper() not in ('FFFFFF', '000000', 'EEEEEE', 'F0F0F0', '1A1A1A')]
        candidates = filtered if filtered else colors
        return '#' + Counter(candidates).most_common(1)[0][0].upper()
    except:
        return None

# Chargement des couleurs au démarrage
LIGNES_DIR = 'Lignes'
# Couleurs par ligne (remplace l'extraction automatique)
LINE_COLORS = {
    # 8ec89a
    'C6': '#8ec89a', 'C202': '#8ec89a', '38': '#8ec89a', '76': '#8ec89a', '112': '#8ec89a', '141': '#8ec89a', '143': '#8ec89a', '147': '#8ec89a',
    '12': '#8ec89a', 'S6': '#8ec89a', 'S8': '#8ec89a', 'Zi3': '#8ec89a',
    'T4': '#63227e', 'C8': '#63227e', '31': '#63227e', '66': '#63227e',
    '69': '#63227e', '78': '#63227e', '15': '#63227e', 'GE6': '#63227e',
    '161': '#63227e', '236': '#63227e',

    # ec6608
    'T5': '#ec6608', 'C5': '#ec6608', 'C205': '#ec6608', '40': '#ec6608',
    '7': '#ec6608', '11': '#ec6608', '23': '#ec6608', '26': '#ec6608',
    'GE4': '#ec6608', '155': '#ec6608', '211': '#ec6608', '239': '#ec6608',
    'N100': '#ec6608','6029': '#ec6608',
    'T6': '#f296aa', 'C14': '#f296aa', '82': '#f296aa', '86': '#f296aa',
    'S4A': '#f296aa', '9': '#f296aa', '219': '#f296aa', '241': '#f296aa',
    'TB11': '#fdc300', 'C25': '#fdc300', 'C200': '#fdc300', '45': '#fdc300',
    '137': '#fdc300', 'S15': '#fdc300', '144': '#fdc300', 'S9': '#fdc300',
    '231': '#fdc300', '232': '#fdc300', '247': '#fdc300', '32': '#fdc300','5001': '#fdc300',
    'C2': '#e50069', '57': '#e50069', '72': '#e50069', '125': '#e50069', '25': '#e50069',
    'C13': '#836c77', 'C17': '#836c77', 'C20': '#836c77', '79': '#836c77', '102': '#836c77',
    '114': '#836c77', '2': '#836c77', '14': '#836c77', 'N187': '#836c77',
    'C16': '#cd8264', '65': '#cd8264',
    'T3': '#00a3a6', 'NAVI1': '#00a3a6', 'C18': '#00a3a6', '54': '#00a3a6', '90': '#00a3a6', '124': '#00a3a6', '134': '#00a3a6', '159': '#00a3a6',
    'N180': '#00a3a6', '24': '#00a3a6', 'S10': '#00a3a6', '7601': '#00a3a6',
    'T2': '#6da432', 'C27': '#6da432', '32': '#6da432', '34': '#6da432', '105': '#6da432', '5': '#6da432', '106EX': '#6da432', '6E': '#6da432', '135': '#6da432',
    '142': '#6da432', '156': '#6da432', 'S7': '#6da432','S11': '#6da432', 'C3': '#6da432', 'C11': '#6da432', 'C15E': '#6da432', '240': '#6da432', '2004': '#6da432',
    '33': '#31287d', '106': '#31287d', '136': '#31287d',
    '6': '#31287d', 'S14': '#31287d',
    'C15': '#d5c900', '44': '#d5c900', '61': '#d5c900', '98': '#d5c900', '129': '#d5c900', '220': '#d5c900', 'N181': '#d5c900',
    'N81': '#d5c900', '3085': '#d5c900', 
    '49': '#007390', '85': '#007390', '118': '#007390',
    '18': '#007390',
    '36': '#6e8997', '87': '#6e8997', '110EX': '#6e8997', '218': '#6e8997', '222': '#6e8997', '150': '#6e8997', '164': '#6e8997',
    'C7': '#6e8997', '10E': '#6e8997', 'Zi8': '#6e8997','5003': '#6e8997',
    'C9': '#c28b14', '50': '#c28b14', '119': '#c28b14', '88': '#c28b14', '149': '#c28b14', '151': '#c28b14',
    '19': '#c28b14',  'Zi5': '#c28b14','6025': '#c28b14',
    'TB12': '#80682e', 'C22EX': '#80682e', '46': '#80682e', '84': '#80682e', '117': '#80682e', '128': '#80682e', 'N185': '#80682e',
    '17': '#80682e',  'N20': '#80682e', 'C22E': '#80682e',
    'C23': '#009e3d', '52': '#009e3d', '55': '#009e3d', '89': '#009e3d', '97': '#009e3d', '104B': '#009e3d', '122': '#009e3d', '139': '#009e3d', '140': '#009e3d', '153': '#009e3d', '157': '#009e3d',  '245': '#009e3d',
    'S4B': '#009e3d',  '22': '#009e3d', 'S5': '#009e3d', 'S3': '#009e3d', '6027': '#009e3d', 
    'C20EX': '#f59c00', 'C203': '#f59c00', '60': '#f59c00', 'BR60': '#f59c00', '81': '#f59c00', '116': '#f59c00', '120': '#f59c00', '146': '#f59c00',
    'C20E': '#f59c00',  '203': '#f59c00', '16': '#f59c00', '20': '#f59c00', 'Zi2': '#f59c00', 
    'C22': '#bca3ce', '35': '#bca3ce', '70': '#bca3ce', '108': '#bca3ce', '138': '#bca3ce', '154': '#bca3ce',
    '8': '#bca3ce',  'S2': '#bca3ce', '6028': '#bca3ce',
    '95': '#3f4e55', '98EX': '#3f4e55',
    '98E': '#3f4e55',
    'C24': '#003863', '64': '#003863', '71': '#003863', '103': '#003863', 'N183': '#003863', 
    '3': '#003863', 'N83': '#003863',
    'C10': '#cf7eae', '43': '#cf7eae', '80': '#cf7eae', '145': '#cf7eae',
    'Zi1': '#cf7eae',
    'C21': '#0099bc', '63': '#0099bc',
    'T1': '#004f9f', 'C1': '#004f9f', '39': '#004f9f', '77': '#004f9f', '133': '#004f9f', '243': '#004f9f',
    'S1': '#004f9f','4133': '#004f9f',
    'C12': '#359ed0', 'C26': '#359ed0', 'C204': '#359ed0', '68': '#359ed0', '130': '#359ed0', '212': '#359ed0', '214': '#359ed0', '237': '#359ed0', '248': '#359ed0', '249': '#359ed0', '285': '#359ed0',
    '5002': '#359ed0', '15E': '#359ed0',
    'C201': '#0075bf', '37': '#0075bf', '62': '#0075bf', '110': '#0075bf', '152': '#0075bf',
    '10': '#0075bf', '6026': '#0075bf',
    '41': '#c20344', '93': '#c20344', '121': '#c20344', '165': '#c20344', '265': '#c20344',
    'C19': '#c20344', '21': '#c20344',
    'T7': '#952456', '59': '#952456', '96': '#952456', '127': '#952456', '230': '#952456',
    '27': '#952456',
    '89EX': '#9f9825', '52EX': '#9f9825', '158': '#9f9825',
    '89D': '#9f9825', '52E': '#9f9825',
    '67': '#b90845', '216': '#b90845',
}

# --- Fonctions de chargement des données avec cache ---
def fetch_with_cache(endpoint_name, url, fetch_func=None):
    """Fonction générique pour charger et mettre en cache les données"""
    try:
        print(f"Chargement de {endpoint_name}...")
        if fetch_func:
            r = fetch_func(url)
        else:
            r = requests.get(url, auth=(USER, PASS), timeout=15)
        
        if r.status_code == 200:
            cache[endpoint_name] = r.json()
            cache['last_update'][endpoint_name] = time.time()
            initial_load_status[endpoint_name] = True
            print(f"✓ {endpoint_name} chargé avec succès")
            return True
        else:
            print(f"✗ Erreur {endpoint_name}: {r.status_code}")
            return False
    except Exception as e:
        print(f"✗ Erreur {endpoint_name}: {str(e)}")
        return False

def fetch_parkings():
    url_geo = (
        "https://data.grandlyon.com/geoserver/sytral/ows"
        "?SERVICE=WFS&VERSION=2.0.0&request=GetFeature"
        "&typename=sytral:tcl_sytral.tclparcrelaisst"
        "&outputFormat=application/json&SRSNAME=EPSG:4171&sortBy=gid"
    )
    try:
        r_geo = requests.get(url_geo, auth=(USER, PASS), timeout=10)
        if r_geo.status_code != 200:
            return None

        raw_geo = r_geo.json()
        parkings = []

        for feature in raw_geo.get('features', []):
            props = feature.get('properties', {})
            coords = feature.get('geometry', {}).get('coordinates', [])

            if coords and isinstance(coords[0], list):
                coords = coords[0]

            if len(coords) < 2:
                continue

            lon, lat = coords[0], coords[1]

            if not (45.0 < lat < 46.5 and 4.0 < lon < 6.0):
                continue

            parkings.append({
                "id": props.get('id'),
                "nom": props.get('nom') or props.get('libelle') or "P+R",
                "capacite": props.get('capacite') or "?",
                "place_handi": props.get('place_handi') or 0,
                "horaires": props.get('horaires') or "Horaires non disponibles",
                "p_surv": props.get('p_surv', False),
                "lat": lat,
                "lon": lon,
                "last_update": props.get('last_update')
            })

        cache['parkings'] = parkings
        cache['last_update']['parkings'] = time.time()
        initial_load_status['parkings'] = True
        print(f"✓ {len(parkings)} parkings chargés")
        return parkings
    except Exception as e:
        print(f"✗ Erreur chargement parkings: {str(e)}")
        return None

# --- Endpoints avec cache ---
@app.route('/api/buses')
def get_buses():
    """Les bus sont en temps réel, pas de cache"""
    url = "https://data.grandlyon.com/siri-lite/2.0/vehicle-monitoring.json"
    try:
        r = requests.get(url, auth=(USER, PASS), timeout=10)
        if r.status_code != 200:
            return jsonify({"error": f"Erreur API Bus {r.status_code}"}), r.status_code

        raw = r.json()
        delivery = raw.get('Siri', {}).get('ServiceDelivery', {}).get('VehicleMonitoringDelivery', [])
        if not delivery:
            return jsonify([])

        vehicles = delivery[0].get('VehicleActivity', [])
        clean_data = []

        for v in vehicles:
            try:
                j = v.get('MonitoredVehicleJourney', {})
                pos = j.get('VehicleLocation', {})
                raw_id = j.get('VehicleRef', {}).get('value', '0000')
                parc_id = raw_id.split(':')[-2] if ':' in str(raw_id) else raw_id
                line_raw = j.get('PublishedLineName')
                if not line_raw:
                    line_ref = j.get('LineRef', {}).get('value', '')
                    line_raw = line_ref.split('::')[-1].split(':')[0] if '::' in line_ref else "??"

                dest_ref = j.get('DestinationRef', {}).get('value', '')
                dest_code = dest_ref.split(':')[-2] if ':' in dest_ref else '???'
                delay_raw = j.get('Delay', 'PT0S')
                delay_clean = delay_raw.replace('PT', '').replace('M', 'm ').replace('S', 's') if delay_raw else "0s"

                clean_data.append({
                    "id": parc_id,
                    "line": line_raw,
                    "color": LINE_COLORS.get(line_raw),
                    "dest_name": j.get('DestinationName', 'Inconnue'),
                    "dest_code": dest_code,
                    "lat": pos.get('Latitude'),
                    "lon": pos.get('Longitude'),
                    "bearing": j.get('Bearing', 0),
                    "direction": j.get('DirectionRef', {}).get('value', 'N/C'),
                    "delay": delay_clean
                })
            except:
                continue

        return jsonify(clean_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/parkings')
def get_parkings_cached():
    """Retourne les parkings depuis le cache"""
    if cache['parkings'] is None:
        # Si pas en cache, on charge immédiatement
        fetch_parkings()
    return jsonify(cache['parkings'] if cache['parkings'] is not None else [])

@app.route('/api/traffic')
def get_traffic_cached():
    """Retourne le trafic depuis le cache"""
    if cache['traffic'] is None:
        fetch_with_cache('traffic', "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalertetrafic_2/all.json?maxfeatures=-1&start=1")
    return jsonify(cache['traffic'] if cache['traffic'] is not None else {"values": []})

@app.route('/api/accessibility')
def get_accessibility_cached():
    """Retourne l'accessibilité depuis le cache"""
    if cache['accessibility'] is None:
        fetch_with_cache('accessibility', "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalerteaccessibilite/all.json?maxfeatures=-1&start=1")
    return jsonify(cache['accessibility'] if cache['accessibility'] is not None else {"values": []})

@app.route('/api/velov')
def get_velov_cached():
    """Retourne les vélos depuis le cache"""
    if cache['velov'] is None:
        fetch_with_cache('velov', "https://data.grandlyon.com/fr/datapusher/ws/rdata/jcd_jcdecaux.jcdvelov/all.json?maxfeatures=-1&start=1")
    return jsonify(cache['velov'] if cache['velov'] is not None else {"values": []})

@app.route('/api/stops')
def get_stops_cached():
    """Retourne les arrêts depuis le cache"""
    if cache['stops'] is None:
        fetch_with_cache('stops', "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclarret/all.json?maxfeatures=-1&start=1")
    return jsonify(cache['stops'] if cache['stops'] is not None else {"values": []})

# --- Fonction de chargement initial en arrière-plan ---
def initial_load():
    """Charge toutes les données au démarrage (sauf les bus)"""
    print("\n" + "="*50)
    print("🚀 CHARGEMENT INITIAL DES DONNÉES (hors bus)")
    print("="*50 + "\n")
    
    # Chargement parallèle avec threads
    threads = []
    
    # Parkings (charge différente)
    parking_thread = threading.Thread(target=fetch_parkings)
    parking_thread.start()
    threads.append(parking_thread)
    
    # Les autres endpoints
    endpoints = [
        ('traffic', 'https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalertetrafic_2/all.json?maxfeatures=-1&start=1'),
        ('accessibility', 'https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalerteaccessibilite/all.json?maxfeatures=-1&start=1'),
        ('velov', 'https://data.grandlyon.com/fr/datapusher/ws/rdata/jcd_jcdecaux.jcdvelov/all.json?maxfeatures=-1&start=1'),
        ('stops', 'https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclarret/all.json?maxfeatures=-1&start=1')
    ]
    
    for name, url in endpoints:
        thread = threading.Thread(target=fetch_with_cache, args=(name, url, None))
        thread.start()
        threads.append(thread)
    
    # Attendre la fin de tous les threads
    for thread in threads:
        thread.join()
    
    print("\n" + "="*50)
    print("📊 RÉSULTAT DU CHARGEMENT INITIAL")
    print("="*50)
    for name, status in initial_load_status.items():
        print(f"  {name.upper()}: {'✅ CHARGÉ' if status else '❌ ÉCHEC'}")
    print("="*50)
    print("✅ Serveur prêt ! Réponses immédiates pour toutes les données (sauf bus)")
    print("="*50 + "\n")

# --- Fonction de rafraîchissement périodique du cache ---
def refresh_cache():
    """Rafraîchit le cache périodiquement"""
    while True:
        time.sleep(300)  # Toutes les 5 minutes
        print("\n🔄 Rafraîchissement du cache...")
        
        fetch_with_cache('traffic', "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalertetrafic_2/all.json?maxfeatures=-1&start=1")
        fetch_with_cache('accessibility', "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalerteaccessibilite/all.json?maxfeatures=-1&start=1")
        fetch_with_cache('velov', "https://data.grandlyon.com/fr/datapusher/ws/rdata/jcd_jcdecaux.jcdvelov/all.json?maxfeatures=-1&start=1")
        fetch_parkings()
        # Les arrêts ne changent que rarement, on les rafraîchit moins souvent
        fetch_with_cache('stops', "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclarret/all.json?maxfeatures=-1&start=1")
        
        print("✅ Cache rafraîchi\n")

if __name__ == '__main__':
    # Lancer le chargement initial dans un thread séparé
    load_thread = threading.Thread(target=initial_load)
    load_thread.start()
    
    # Lancer le thread de rafraîchissement périodique
    refresh_thread = threading.Thread(target=refresh_cache, daemon=True)
    refresh_thread.start()
    
    print("\n" + "="*50)
    print("🌐 SERVEUR EN COURS D'EXÉCUTION")
    print("="*50)
    print("Serveur démarré sur http://127.0.0.1:5000")
    print("Endpoints disponibles:")
    print("  - /api/buses         (positions des bus) [TEMPS RÉEL]")
    print("  - /api/parkings      (parkings relais) [CACHÉ - chargé au démarrage]")
    print("  - /api/traffic       (alertes trafic) [CACHÉ - chargé au démarrage]")
    print("  - /api/accessibility (alertes accessibilité) [CACHÉ - chargé au démarrage]")
    print("  - /api/velov         (stations Velo'v) [CACHÉ - chargé au démarrage]")
    print("  - /api/stops         (points d'arrêt) [CACHÉ - chargé au démarrage]")
    print("="*50 + "\n")
    
    app.run(port=5000, debug=False, use_reloader=False)