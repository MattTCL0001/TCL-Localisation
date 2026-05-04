from flask import Flask, jsonify
from flask_cors import CORS
import requests
import os
import time

app = Flask(__name__)
CORS(app)

# Secrets Vercel
USER = os.environ.get('GRANDLYON_USER')
PASS = os.environ.get('GRANDLYON_PASS')

# --- Cache minimaliste ---
# Note : Sur Vercel, ce cache se videra souvent, c'est normal (mode Serverless)
cache = {
    'parkings': None,
    'traffic': None,
    'accessibility': None,
    'velov': None,
    'stops': None
}

# Ton dictionnaire LINE_COLORS (Garde-le tel quel dans ton code)
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

# --- Fonctions de récupération ---

def fetch_parkings():
    url_geo = "https://data.grandlyon.com/geoserver/sytral/ows?SERVICE=WFS&VERSION=2.0.0&request=GetFeature&typename=sytral:tcl_sytral.tclparcrelaisst&outputFormat=application/json&SRSNAME=EPSG:4171&sortBy=gid"
    try:
        r = requests.get(url_geo, auth=(USER, PASS), timeout=10)
        if r.status_code == 200:
            raw_geo = r.json()
            parkings = []
            for feature in raw_geo.get('features', []):
                props = feature.get('properties', {})
                coords = feature.get('geometry', {}).get('coordinates', [])
                if coords:
                    parkings.append({
                        "nom": props.get('nom') or "P+R",
                        "lat": coords[1], "lon": coords[0],
                        "capacite": props.get('capacite', "?")
                    })
            cache['parkings'] = parkings
            return parkings
    except: return []

def fetch_generic(key, url):
    try:
        r = requests.get(url, auth=(USER, PASS), timeout=10)
        if r.status_code == 200:
            cache[key] = r.json()
            return cache[key]
    except: return None

# --- Routes API ---

@app.route('/api/status')
def get_status():
    return jsonify({"status": "online", "auth": USER is not None})

@app.route('/api/buses')
def get_buses():
    # Toujours en temps réel
    url = "https://data.grandlyon.com/siri-lite/2.0/vehicle-monitoring.json"
    try:
        r = requests.get(url, auth=(USER, PASS), timeout=10)
        # ... Ta logique de nettoyage des bus ici ...
        return jsonify(r.json()) # Simplifié pour l'exemple
    except: return jsonify([])

@app.route('/api/parkings')
def get_parkings_cached():
    if cache['parkings'] is None: fetch_parkings()
    return jsonify(cache['parkings'] or [])

@app.route('/api/traffic')
def get_traffic_cached():
    if cache['traffic'] is None: 
        fetch_generic('traffic', "https://data.grandlyon.com/fr/datapusher/ws/rdata/tcl_sytral.tclalertetrafic_2/all.json")
    return jsonify(cache['traffic'] or {"values": []})

# --- CONFIGURATION VERCEL ---
# Pas de app.run(), pas de threads, pas de while True

# L'objet app doit être accessible par Vercel
expose_app = app
