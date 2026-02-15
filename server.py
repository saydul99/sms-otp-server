from flask import Flask, request, jsonify
import os

app = Flask(__name__)

# Temporary storage for OTPs in memory
# Key: UserID, Value: OTP
otp_store = {}

@app.route('/sms', methods=['POST'])
def receive_sms():
    data = request.json
    user_id = data.get('id')
    sender = data.get('sender')
    content = data.get('content') # This is the OTP

    if not user_id or not content:
        return "Missing data", 400

    print(f"[*] Received OTP for {user_id}: {content}")
    otp_store[user_id] = content
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

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)