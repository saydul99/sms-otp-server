from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import re
import threading
import time

app = Flask(__name__)
CORS(app, resources={r"/check-otp/*": {"origins": "*"}})

# Temporary storage for OTPs in memory
# Key: UserID, Value: OTP
otp_store = {}

# ══════════════════════════════════════════════════════════════════════════════
# IRCTC TOKEN STORE — APP Mode token relay
# Phone (patched IRCTC app) → POST /irctc-token → store
# Desktop (Little-Boy) → GET /get-irctc-tokens/<user_id> → consume + delete
# ══════════════════════════════════════════════════════════════════════════════
irctc_token_store = {}  # { user_id: [ {step, csrf, jwt, cookies, greq, bmiyek, ...}, ... ] }
irctc_lock = threading.Lock()

def extract_otp(text):
    """SMS text se 4-8 digit OTP extract karta hai."""
    # Pehle 6-digit numbers dhundho (most common OTP length)
    matches = re.findall(r'\b(\d{6})\b', text)
    if matches:
        return matches[0]
    # 4 ya 8 digit bhi try karo
    matches = re.findall(r'\b(\d{4,8})\b', text)
    if matches:
        return matches[0]
    # Kuch nahi mila - content as-is return karo
    return text.strip()

@app.route('/sms', methods=['POST'])
def receive_sms():
    data = request.json
    user_id = data.get('id')
    sender = data.get('sender')
    content = data.get('content')

    if not user_id or not content:
        return "Missing data", 400

    # SMS text se sirf OTP digits extract karo
    otp = extract_otp(content)
    print(f"[*] Received SMS for {user_id} from {sender}")
    print(f"[*] Full SMS: {content}")
    print(f"[*] Extracted OTP: {otp}")
    otp_store[user_id] = otp
    return "OK", 200

@app.route('/get-otp/<user_id>', methods=['GET'])
def get_otp(user_id):
    # This endpoint your bot will call to get the OTP
    otp = otp_store.get(user_id)
    if otp:
        # Clear after reading so we don't use it twice
        del otp_store[user_id]
        return jsonify({"status": "success", "otp": otp})
    return jsonify({"status": "pending", "otp": None}), 404

@app.route('/check-otp/<user_id>', methods=['GET'])
def check_otp(user_id):
    # Sirf dekhne ke liye - OTP DELETE NAHI HOGA
    otp = otp_store.get(user_id)
    if otp:
        return jsonify({"status": "received", "otp": otp, "note": "OTP server pe hai - DELETE nahi hua"})
    return jsonify({"status": "empty", "otp": None, "note": "Abhi koi OTP nahi aaya"}), 404

@app.route('/clear-all', methods=['DELETE'])
def clear_all():
    count = len(otp_store)
    otp_store.clear()
    return jsonify({"status": "cleared", "deleted": count})

@app.route('/irctc-token', methods=['POST'])
def receive_irctc_token():
    """Phone ka patched IRCTC app yahan token bhejta hai."""
    try:
        data = request.get_json(force=True) or {}
        user_id = data.get('user_id', 'default')

        entry = {
            "step":          data.get("step", "UNKNOWN"),
            "sequence":      int(data.get("sequence", 0)),
            "url":           data.get("url", ""),
            "http_code":     data.get("http_code", 0),
            "access_token":  data.get("access_token", ""),
            "csrf_token":    data.get("csrf_token", ""),
            "cookies":       data.get("cookies", ""),
            "greq":          data.get("greq", ""),
            "bmiyek":        data.get("bmiyek", ""),
            "response_body": data.get("response_body", "")[:3000],
            "received_at":   time.time(),
        }

        with irctc_lock:
            if user_id not in irctc_token_store:
                irctc_token_store[user_id] = []
            irctc_token_store[user_id].append(entry)
            count = len(irctc_token_store[user_id])

        print(f"[IRCTC-TOKEN] {user_id}: step={entry['step']} seq={entry['sequence']} total={count}")
        return jsonify({"status": "ok", "total": count}), 200

    except Exception as e:
        print(f"[IRCTC-TOKEN] receive error: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500


@app.route('/get-irctc-tokens/<user_id>', methods=['GET'])
def get_irctc_tokens(user_id):
    """Desktop consume karta hai — tokens return + DELETE."""
    with irctc_lock:
        tokens = irctc_token_store.pop(user_id, [])

    tokens.sort(key=lambda t: t.get("sequence", 0))

    # Latest values extract karo (last non-empty wins)
    latest = {"access_token": "", "csrf_token": "", "cookies": "", "greq": "", "bmiyek": ""}
    for t in tokens:
        for field in latest:
            if t.get(field):
                latest[field] = t[field]

    print(f"[IRCTC-TOKEN] {user_id}: consumed {len(tokens)} tokens → desktop")
    return jsonify({"tokens": tokens, "count": len(tokens), "latest": latest}), 200


@app.route('/check-irctc-tokens/<user_id>', methods=['GET'])
def check_irctc_tokens(user_id):
    """Count check — DELETE nahi hota."""
    with irctc_lock:
        tokens = irctc_token_store.get(user_id, [])
        count  = len(tokens)
        steps  = [t.get("step") for t in tokens]
        has_jwt  = any(t.get("access_token") for t in tokens)
        has_csrf = any(t.get("csrf_token")   for t in tokens)

    return jsonify({
        "count":           count,
        "steps":           steps,
        "has_login_token": has_jwt,
        "has_csrf":        has_csrf,
        "ready":           count >= 4 and has_jwt,
    }), 200


@app.route('/clear-irctc-tokens/<user_id>', methods=['POST'])
def clear_irctc_tokens(user_id):
    """Testing ke liye tokens clear karo."""
    with irctc_lock:
        cleared = len(irctc_token_store.pop(user_id, []))
    return jsonify({"status": "ok", "cleared": cleared}), 200


@app.route('/status', methods=['GET'])
def status():
    # Server status + kitne OTPs stored hain
    with irctc_lock:
        token_counts = {uid: len(t) for uid, t in irctc_token_store.items()}
    return jsonify({
        "server": "running",
        "stored_otps": list(otp_store.keys()),
        "total_otps": len(otp_store),
        "irctc_tokens": token_counts,
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)