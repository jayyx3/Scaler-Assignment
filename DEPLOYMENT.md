# 🌐 Production Deployment Guide

This guide provides step-by-step instructions to deploy the Zoom Workplace Clone on **Render** (FastAPI backend) and **Vercel** (Next.js frontend) with full WebSockets and WebRTC capability.

---

## 🛠️ Step 1: Ensure Your Code is Pushed to GitHub

Ensure all deployment configuration files (`render.yaml`, `vercel.json`, and environment updates) are committed and pushed to your repository:
```bash
git add .
git commit -m "Configure production deployment environments"
git push origin main
```
*Your repository is located at: `https://github.com/jayyx3/Scaler-Assignment.git`*

---

## 🐍 Step 2: Deploy the Backend on Render (Free Tier)

Render will host the FastAPI server and handle WebSocket signaling. Choose **one** of the two free methods below:

### Option A: Using the Blueprint (Automatic)
1. Open your browser and go to [Render Dashboard](https://dashboard.render.com/).
2. Log in or Sign Up using your **GitHub account**.
3. Click the **"New +"** button (top right) and select **"Blueprint"**.
4. Select the `jayyx3/Scaler-Assignment` repository.
5. Under the Blueprint configuration page, Render will automatically detect the `render.yaml` file (configured for the **Free** tier).
6. Give your service group a name and click **"Apply"**.
7. Once successfully built, copy the generated **Service URL** (e.g., `https://scaler-zoom-backend.onrender.com`).
   - *Let's refer to this URL as `YOUR_BACKEND_URL`.*

### Option B: Manual Web Service Deployment (Recommended if Blueprint requests a card)
1. Open your browser and go to [Render Dashboard](https://dashboard.render.com/).
2. Click the **"New +"** button (top right) and select **"Web Service"**.
3. Choose **"Build and deploy from a Git repository"** and click **"Next"**.
4. Connect the `jayyx3/Scaler-Assignment` repository.
5. In the settings form, write:
   - **Name**: `scaler-zoom-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Scroll down to the **"Instance Type"** section and select **"Free"** ($0/month).
7. Click **"Create Web Service"** at the bottom of the page.
8. Wait for the deploy log to show `Application startup complete`.
9. Copy the generated **Service URL** at the top of the page.
   - *Let's refer to this URL as `YOUR_BACKEND_URL`.*

---

## ⚡ Step 3: Deploy the Frontend on Vercel

Vercel will host the Next.js single-page application.

### What to Click & Where:
1. Open your browser and go to [Vercel Dashboard](https://vercel.com/dashboard).
2. Log in or Sign Up using your **GitHub account**.
3. Click the **"Add New..."** button (top right) and choose **"Project"**.
4. In the list of GitHub repositories, find `jayyx3/Scaler-Assignment` and click **"Import"**.
5. In the **"Configure Project"** page, make the following configuration changes:
   - **Framework Preset**: Verify it is set to **Next.js**.
   - **Root Directory**:
     - Click **"Edit"** next to the root directory path.
     - Select the **`frontend`** directory from the project tree and click **"Continue"**.
6. Expand the **"Environment Variables"** accordion section:
   - **Variable 1**:
     - **Name**: `NEXT_PUBLIC_API_URL`
     - **Value**: Paste `YOUR_BACKEND_URL` (e.g., `https://scaler-zoom-backend.onrender.com`).
     - Click **"Add"**.
   - **Variable 2**:
     - **Name**: `NEXT_PUBLIC_WS_URL`
     - **Value**: Paste your backend URL but change the scheme to **`wss://`** (e.g., `wss://scaler-zoom-backend.onrender.com`).
     - Click **"Add"**.
7. Click the **"Deploy"** button at the bottom of the page.
8. Vercel will install npm dependencies, compile the production Next.js assets, and output your live deployment link!
9. Open the Vercel app link in your browser to verify it connects to the active Render backend.

---

## 💡 Troubleshooting WebRTC & WebSockets in Production

- **HTTPS and WSS Requirement**: Modern browsers restrict webcam access and WebRTC peer negotiation to secure contexts (`https://`). Since Vercel and Render provide HTTPS by default, make sure your environment variables use `https://` (for API) and `wss://` (for WebSockets).
- **CORS Issues**: The FastAPI backend is configured to accept CORS requests from all origins (`allow_origins=["*"]`), ensuring Vercel requests are accepted.
- **Render Cold Starts**: Render's free tier spins down services after 15 minutes of inactivity. When loading the dashboard for the first time, it may take 30-50 seconds for the backend to wake up and fetch meetings.
