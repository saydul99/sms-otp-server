# SMS Sender Project Structure

This project consists of an Android application that monitors incoming SMS and forwards their headers to a remote server based on a user-provided ID.

## 1. Android Application Structure (Kotlin)

### Package: `com.example.smssender`

- **`ui/`**
    - `MainActivity.kt`: User interface to input the **Server URL** and **User ID**.
- **`receiver/`**
    - `SmsReceiver.kt`: Extends `BroadcastReceiver`. Listens for `android.provider.Telephony.SMS_RECEIVED`.
- **`network/`**
    - `ApiService.kt`: Interface for Retrofit or logic for HttpURLConnection to send POST requests.
    - `NetworkClient.kt`: Singleton for network operations.
- **`model/`**
    - `SmsData.kt`: Data class containing `sender`, `timestamp`, `header`, and `userId`.
- **`utils/`**
    - `PermissionManager.kt`: Handles runtime permissions for `RECEIVE_SMS` and `INTERNET`.

### Android Manifest Requirements
- `RECEIVE_SMS` permission.
- `INTERNET` permission.
- Static registration of `SmsReceiver`.

---

## 2. Backend Server Structure (Node.js/Express)

### Directory: `server/`

- `index.js`: Main entry point.
- `data/`: Folder where SMS logs are stored.
    - `[id].log`: Each ID gets its own file where SMS headers are appended.

### API Endpoint
- **POST `/send-sms`**
    - Body: `{ "id": "user123", "sender": "MD-INDANE", "header": "...", "time": "..." }`
    - Logic: Reads the `id`, finds/creates `data/user123.log`, and appends the header details.

---

## 3. Workflow
1. User opens the App and enters the **Server URL** (e.g., `https://your-api.com`) and their **ID**.
2. App requests SMS permissions.
3. When an SMS arrives, `SmsReceiver` triggers.
4. App extracts the Header (Sender Name) and Timestamp.
5. App sends a POST request to the Server with the Header and the saved ID.
6. Server receives the data and writes it into a file named after the ID.
