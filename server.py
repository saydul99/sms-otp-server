from flask import Flask, request, jsonify
import os
import re

app = Flask(__name__)

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