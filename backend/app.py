
import os
from flask import Flask, request, jsonify
from breeze_connect import BreezeConnect
from google.generativeai import GenerativeModel, configure
import datetime

app = Flask(__name__)

# Configuration
BREEZE_API_KEY = os.environ.get("BREEZE_API_KEY")
BREEZE_API_SECRET = os.environ.get("BREEZE_API_SECRET")
GEMINI_API_KEY = os.environ.get("API_KEY")

# Initialize Gemini
configure(api_key=GEMINI_API_KEY)
model = GenerativeModel('gemini-2.5-flash')

# Initialize Breeze (Session token must be set daily)
breeze = BreezeConnect(api_key=BREEZE_API_KEY)

@app.route('/api/breeze/admin/api-session', methods=['POST'])
def set_session():
    data = request.json
    session_token = data.get("api_session")
    try:
        breeze.generate_session(api_secret=BREEZE_API_SECRET, session_token=session_token)
        return jsonify({"status": "success", "message": "Session generated"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/breeze/quotes', methods=['POST'])
def get_quotes():
    data = request.json
    stock_code = data.get("stock_code")
    try:
        res = breeze.get_quotes(stock_code=stock_code, exchange_code="NSE", expiry_date="", product_type="cash", right="", strike_price="")
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/breeze/depth', methods=['POST'])
def get_depth():
    data = request.json
    stock_code = data.get("stock_code")
    try:
        res = breeze.get_market_depth(stock_code=stock_code, exchange_code="NSE", product_type="cash")
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/analyze_market', methods=['POST'])
def analyze_market():
    data = request.json
    # Logic for Gemini analysis with search grounding
    # Note: Python SDK handles tools differently than JS
    prompt = f"Analyze Nifty 50 for {data.get('log_date')}..."
    try:
        response = model.generate_content(prompt)
        return jsonify({"text": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000)
