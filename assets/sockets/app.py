from flask import Flask, render_template, jsonify, request
import json
import os
import yfinance as yf
import time
import threading
from threading import Lock

# ================== APP SETUP ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, template_folder=os.path.join(BASE_DIR, 'templates'))

# ================== CONFIG ==================
CACHE_TTL = 10  # seconds
UPDATE_INTERVAL = 5  # background refresh

# ================== SYMBOLS ==================
SYMBOLS = [
    "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN",
    "KOTAKBANK","AXISBANK","INDUSINDBK","WIPRO","HCLTECH","TECHM",
    "ONGC","BPCL","IOC","POWERGRID","NTPC","ITC","HINDUNILVR",
    "NESTLEIND","BRITANNIA","DABUR","MARICO","MARUTI","TATAMOTORS",
    "M&M","BAJAJ-AUTO","HEROMOTOCO","EICHERMOT","SUNPHARMA",
    "DRREDDY","CIPLA","DIVISLAB","LUPIN","TATASTEEL","JSWSTEEL",
    "HINDALCO","COALINDIA","VEDL","LT","ULTRACEMCO","ASIANPAINT",
    "BAJFINANCE","BAJAJFINSV","ADANIENT","ADANIPORTS","GRASIM",
    "SHREECEM","APOLLOHOSP"
]

# ================== CACHE ==================
cache = {}        # {symbol: (timestamp, data)}
locks = {}        # {symbol: Lock()}

def get_lock(symbol):
    if symbol not in locks:
        locks[symbol] = Lock()
    return locks[symbol]

def get_cached(symbol):
    now = time.time()
    if symbol in cache:
        ts, data = cache[symbol]
        if now - ts < CACHE_TTL:
            return data
    return None

def set_cache(symbol, data):
    cache[symbol] = (time.time(), data)

# ================== ROUTES ==================
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/symbols')
def get_symbols():
    # send structured symbols
    return jsonify([{"symbol": s, "name": s} for s in SYMBOLS])


@app.route('/api/data')
def get_symbol_data():
    symbol = request.args.get('symbol', '').upper()
    if not symbol:
        return jsonify({"error": "Symbol required"}), 400

    try:
        # ✅ 1. check cache
        cached = get_cached(symbol)
        if cached:
            return jsonify(cached)

        lock = get_lock(symbol)

        # 🔒 prevent duplicate fetch
        with lock:
            cached = get_cached(symbol)
            if cached:
                return jsonify(cached)

            ticker = yf.Ticker(f"{symbol}.NS")
            df = ticker.history(interval="1m", period="1d")

            if df.empty:
                return jsonify([])

            ohlc = []
            for t, row in df.iterrows():
                ohlc.append({
                    "time": int(t.timestamp() * 1000),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": int(row["Volume"])
                })

            set_cache(symbol, ohlc)
            return jsonify(ohlc)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ================== BACKGROUND UPDATER ==================
def update_loop():
    while True:
        for symbol in SYMBOLS:
            try:
                ticker = yf.Ticker(f"{symbol}.NS")
                df = ticker.history(interval="1m", period="1d")

                if not df.empty:
                    ohlc = []
                    for t, row in df.iterrows():
                        ohlc.append({
                            "time": int(t.timestamp() * 1000),
                            "open": float(row["Open"]),
                            "high": float(row["High"]),
                            "low": float(row["Low"]),
                            "close": float(row["Close"]),
                            "volume": int(row["Volume"])
                        })

                    set_cache(symbol, ohlc)

            except Exception as e:
                print(f"Error updating {symbol}: {e}")

        time.sleep(UPDATE_INTERVAL)


# start background thread
threading.Thread(target=update_loop, daemon=True).start()


# ================== RUN ==================
if __name__ == '__main__':
    app.run(debug=True, threaded=True)