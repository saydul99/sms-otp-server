# SMS Forwarder Project

This project contains an Android App and a Node.js Backend.

## 1. Backend Server (Node.js)
The server receives SMS data and saves it to a file named after the User ID.

### Setup:
1. Install Node.js.
2. Run: `npm install`
3. Start server: `npm start`
4. The server will listen on `http://YOUR_IP:3000/sms`.

## 2. Android App
The app monitors incoming SMS and sends the header (sender name) and content to the server.

### How to Build (CLI):
If you have the Android SDK and Gradle installed:
1. Open terminal in the project root.
2. Run: `gradle assembleDebug`
3. The APK will be generated at `app/build/outputs/apk/debug/app-debug.apk`.

**Note:** If you are using Android Studio, just open this folder as a project.

### How to Use:
1. Install the APK on your Android phone.
2. Open the app and allow **SMS Permissions**.
3. Enter your **Server URL** (e.g., `http://192.168.1.5:3000/sms`).
4. Enter your **User ID** (e.g., `my_id_1`).
5. Click **Save Settings**.
6. When an SMS arrives, check the `data/` folder on your server for `my_id_1.log`.
