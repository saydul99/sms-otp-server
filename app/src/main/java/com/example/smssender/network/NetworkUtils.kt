package com.example.smssender.network

import android.content.Context
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

object NetworkUtils {
    private val client = OkHttpClient()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    fun sendSmsHeader(context: Context, url: String, userId: String, header: String, body: String) {
        val json = JSONObject()
        json.put("id", userId)
        json.put("sender", header)
        json.put("content", body)
        json.put("timestamp", System.currentTimeMillis())

        val requestBody = json.toString().toRequestBody(JSON)
        val request = Request.Builder()
            .url(url)
            .post(requestBody)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("NetworkUtils", "Failed to send data: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                Log.d("NetworkUtils", "Response: ${response.code}")
                response.close()
            }
        })
    }
}
