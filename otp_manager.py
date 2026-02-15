import requests
import time
import threading

class OTPManager:
    def __init__(self, server_url, user_id):
        """
        :param server_url: Your Render Server URL (e.g., "https://my-app.onrender.com")
        :param user_id: The User ID you set in the Android App (e.g., "user_123")
        """
        self.server_url = server_url.rstrip('/')
        self.user_id = user_id
        self.running = False
        self.latest_otp = None
        
        # Start the "Keep-Alive" thread automatically
        self.start_keep_alive()

    def start_keep_alive(self):
        """Pings the server every 5 minutes to prevent sleeping."""
        def pinger():
            while True:
                try:
                    requests.get(f"{self.server_url}/") # Just a ping
                except:
                    pass
                time.sleep(300) # 5 Minutes
        
        t = threading.Thread(target=pinger, daemon=True)
        t.start()
        print("[*] Server Keep-Alive Started (No Sleep Mode)")

    def wait_for_otp(self, timeout=60):
        """
        Blocks and waits for OTP.
        :param timeout: Max seconds to wait.
        :return: OTP string or None if timed out.
        """
        print(f"[*] Waiting for OTP from Server...")
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                # Check for OTP
                response = requests.get(f"{self.server_url}/get-otp/{self.user_id}")
                if response.status_code == 200:
                    data = response.json()
                    if data['status'] == 'success':
                        otp = data['otp']
                        print(f"[+] OTP RECEIVED: {otp}")
                        return otp
            except Exception as e:
                print(f"[!] Connection Error: {e}")
            
            time.sleep(1) # Check every 1 second
            
        print("[-] OTP Timeout")
        return None

# --- USE THIS IN YOUR MAIN SCRIPT ---
if __name__ == "__main__":
    # EXAMPLE USAGE
    YOUR_SERVER_URL = "https://your-app-name.onrender.com"  # REPLACE THIS
    YOUR_USER_ID = "user_123"                               # REPLACE THIS
    
    manager = OTPManager(YOUR_SERVER_URL, YOUR_USER_ID)
    
    # Whenever you need OTP:
    otp = manager.wait_for_otp()
    
    if otp:
        print(f"Use this OTP: {otp}")
    else:
        print("Failed to get OTP")
