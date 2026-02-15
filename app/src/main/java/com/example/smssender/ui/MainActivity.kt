package com.example.smssender.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.example.smssender.R

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Request SMS Permission Immediately
        requestSmsPermission()

        val etTargetHeader = findViewById<EditText>(R.id.et_target_header)
        val etTestHeader = findViewById<EditText>(R.id.et_test_header)
        val etUserId = findViewById<EditText>(R.id.et_user_id)
        val etServerUrl = findViewById<EditText>(R.id.et_server_url)
        val btnSave = findViewById<Button>(R.id.btn_save)
        val tvStatus = findViewById<TextView>(R.id.tv_status)

        // Load saved preferences
        val prefs = getSharedPreferences("SmsPrefs", Context.MODE_PRIVATE)
        etTargetHeader.setText(prefs.getString("target_header", "AX-ADHAAR-S"))
        etTestHeader.setText(prefs.getString("test_header", "CP-GDLCKT-S"))
        etUserId.setText(prefs.getString("user_id", ""))
        etServerUrl.setText(prefs.getString("server_url", "")) // Load last used URL

        // Update status text
        val isSetup = prefs.getString("target_header", "")!!.isNotEmpty()
        updateStatus(isSetup, tvStatus)

        btnSave.setOnClickListener {
            val header = etTargetHeader.text.toString().trim()
            val testHeader = etTestHeader.text.toString().trim()
            val userId = etUserId.text.toString().trim()
            val url = etServerUrl.text.toString().trim()

            if (header.isNotEmpty() && userId.isNotEmpty()) {
                val editor = prefs.edit()
                editor.putString("target_header", header)
                editor.putString("test_header", testHeader)
                editor.putString("user_id", userId)
                editor.putString("server_url", url)
                editor.apply()

    }

    private fun updateStatus(active: Boolean, view: TextView) {
        if (active) {
            view.text = "Status: ACTIVE (Listening)"
            view.setTextColor(Color.GREEN)
        } else {
            view.text = "Status: INACTIVE (Setup Required)"
            view.setTextColor(Color.RED)
        }
    }

    private fun requestSmsPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                arrayOf(Manifest.permission.RECEIVE_SMS), 101)
        }
    }
}