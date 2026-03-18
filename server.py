from flask import Flask, request, jsonify
import os
import re
import time
import threading
import urllib.request

app = Flask(__name__)

# Self-ping to prevent Render free tier sleep
def keep_alive():
    """Har 10 min pe khud ko ping karo taaki Render so na jaye."""
    import time
    url = os.environ.get("RENDER_EXTERNAL_URL", "https://sms-otp-server.onrender.com")
    while True:
        time.sleep(600)  # 10 minutes
        try:
            urllib.request.urlopen(f"{url}/status", timeout=10)
        except Exception:
            pass

threading.Thread(target=keep_alive, daemon=True).start()

# Temporary storage for OTPs in memory
# Key: UserID, Value: OTP
otp_store = {}

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

# ──────────────────────────────────────────────
# IRCTC Token Relay — Phone → Desktop
# ──────────────────────────────────────────────
_token_store = {}
_token_lock = threading.Lock()

@app.route('/irctc-token', methods=['POST'])
def receive_irctc_token():
    """Phone (modified IRCTC app) se token receive karo."""
    try:
        data = request.get_json(force=True) or {}
        user_id = data.get('user_id', 'default')

        token_entry = {
            "step":          data.get("step", "UNKNOWN"),
            "sequence":      int(data.get("sequence", 0)),
            "url":           data.get("url", ""),
            "http_code":     data.get("http_code", 0),
            "access_token":  data.get("access_token", ""),
            "csrf_token":    data.get("csrf_token", ""),
            "cookies":       data.get("cookies", ""),
            "greq":          data.get("greq", ""),
            "bmiyek":        data.get("bmiyek", ""),
            "response_body": data.get("response_body", ""),
            "captured_at":   data.get("captured_at", 0),
            "received_at":   time.time(),
        }

        with _token_lock:
            if user_id not in _token_store:
                _token_store[user_id] = []
            _token_store[user_id].append(token_entry)
            count = len(_token_store[user_id])

        print(f"[TOKEN] {user_id}: step={token_entry['step']} seq={token_entry['sequence']} total={count}")
        return jsonify({"status": "ok", "total": count}), 200

    except Exception as e:
        print(f"[TOKEN] receive error: {e}")
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/get-irctc-tokens/<user_id>', methods=['GET'])
def get_irctc_tokens(user_id):
    """Desktop consume tokens (deletes after read)."""
    with _token_lock:
        tokens = _token_store.pop(user_id, [])

    tokens.sort(key=lambda t: t.get("sequence", 0))

    latest_access_token = ""
    latest_csrf = ""
    latest_cookies = ""
    latest_greq = ""
    latest_bmiyek = ""

    for t in tokens:
        if t.get("access_token"):
            latest_access_token = t["access_token"]
        if t.get("csrf_token"):
            latest_csrf = t["csrf_token"]
        if t.get("cookies"):
            latest_cookies = t["cookies"]
        if t.get("greq"):
            latest_greq = t["greq"]
        if t.get("bmiyek"):
            latest_bmiyek = t["bmiyek"]

    return jsonify({
        "tokens": tokens,
        "count": len(tokens),
        "latest": {
            "access_token": latest_access_token,
            "csrf_token": latest_csrf,
            "cookies": latest_cookies,
            "greq": latest_greq,
            "bmiyek": latest_bmiyek,
        }
    }), 200

@app.route('/check-irctc-tokens/<user_id>', methods=['GET'])
def check_irctc_tokens(user_id):
    """Check token count WITHOUT deleting."""
    with _token_lock:
        tokens = _token_store.get(user_id, [])
        count = len(tokens)
        steps = [t.get("step") for t in tokens]
        has_login = any(s == "LOGIN" for s in steps)
        has_csrf = any(t.get("csrf_token") for t in tokens)

    return jsonify({
        "count": count,
        "steps": steps,
        "has_login_token": has_login,
        "has_csrf": has_csrf,
        "ready": count >= 4,
    }), 200

@app.route('/status', methods=['GET'])
def status():
    # Server status + kitne OTPs stored hain
    return jsonify({
        "server": "running",
        "stored_otps": list(otp_store.keys()),
        "total": len(otp_store)
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)