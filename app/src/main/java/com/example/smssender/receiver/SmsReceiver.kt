package com.example.smssender.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.example.smssender.network.NetworkUtils
import java.util.regex.Pattern

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            
            // Get saved settings
            val prefs = context.getSharedPreferences("SmsPrefs", Context.MODE_PRIVATE)
            val serverUrl = prefs.getString("server_url", "") ?: ""
            val userId = prefs.getString("user_id", "") ?: ""
            val targetHeader = prefs.getString("target_header", "AX-ADHAAR-S") ?: ""
            val testHeader = prefs.getString("test_header", "CP-GDLCKT-S") ?: ""

            if (serverUrl.isEmpty() || userId.isEmpty()) {
                Log.d("SmsReceiver", "Server URL or User ID missing, ignoring SMS.")
                return
            }

            for (sms in messages) {
                val header = sms.originatingAddress ?: "Unknown"
                val body = sms.messageBody ?: ""
                
                Log.d("SmsReceiver", "Received SMS from: $header")
                
                // Check if header matches EITHER target OR test header
                val matchMain = targetHeader.isNotEmpty() && header.contains(targetHeader, ignoreCase = true)
                val matchTest = testHeader.isNotEmpty() && header.contains(testHeader, ignoreCase = true)

                if (matchMain || matchTest) {
                    val otp = extractOtp(body)
                    val contentToSend = otp ?: body // Send OTP if found, else full body
                    
                    Log.d("SmsReceiver", "Match found! Sending to $serverUrl")
                    NetworkUtils.sendSmsHeader(context, serverUrl, userId, header, contentToSend)
                }
            }
        }
    }

    private fun extractOtp(message: String): String? {
        // Regex to find 4 to 8 consecutive digits
        val pattern = Pattern.compile("\\b(\\d{4,8})\\b")
        val matcher = pattern.matcher(message)
        if (matcher.find()) {
            return matcher.group(1)
        }
        return null
    }
}
