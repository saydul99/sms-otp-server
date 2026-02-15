# How to Launch Your Free SMS Server

This guide will put your server online so your Android App can send OTPs from anywhere.

## Step 1: Push to GitHub (One-Time Setup)

You need to put this code on GitHub so Render can access it.

1.  **Go to GitHub**: [https://github.com/new](https://github.com/new)
2.  Create a **New Repository**.
    *   Name it: `sms-otp-server`
    *   Keep it **Public** (or Private, works too).
    *   Click **Create repository**.
3.  **Upload Code**:
    *   Copy the commands GitHub shows under `…or push an existing repository from the command line`.
    *   Open your terminal in this folder (`C:\Users\saydul\Desktop\SMS`) and paste them:
        ```bash
        git remote add origin https://github.com/YOUR_USERNAME/sms-otp-server.git
        git branch -M main
        git push -u origin main
        ```

## Step 2: Deploy on Render (Free)

1.  **Go to Render**: [https://dashboard.render.com/](https://dashboard.render.com/)
2.  Click **New +** -> **Web Service**.
3.  Connect your **GitHub** account.
4.  Select the `sms-otp-server` repository you just created.
5.  **Settings**:
    *   **Name**: `my-sms-otp` (Whatever you like)
    *   **Region**: `Singapore` (Fastest for India) or `Frankfurt`.
    *   **Runtime**: `Python 3`
    *   **Build Command**: `pip install -r requirements.txt`
    *   **Start Command**: `gunicorn server:app`
    *   **Plan**: `Free`
6.  Click **Create Web Service**.

## Step 3: Get Your URL

Wait 1-2 minutes. Render will give you a URL like:
`https://my-sms-otp.onrender.com`

## Step 4: Update Your Android App

1.  Open the **SMS App** on your phone.
2.  In **Server URL**, enter: `https://my-sms-otp.onrender.com/sms`
3.  Click **Save**.

## Step 5: Test It!

1.  Send an SMS to your phone with header `AX-ADHAAR-S` and message `Your OTP is 123456`.
2.  Open your browser to: `https://my-sms-otp.onrender.com/get-otp/YOUR_USER_ID`
3.  You should see: `{"status": "success", "otp": "123456"}`

---

**Note:** The free tier on Render might sleep after 15 minutes of inactivity. The first request after sleep might take 30-50 seconds. To keep it awake, you can use a free service like `cron-job.org` to ping your URL every 10 minutes.
