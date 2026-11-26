# Live Shutter — Remote Camera Web App

A mobile-first web app hosted on **Cloudflare** via Git. Open it on your **Pixel 8** (Camera Phone) to stream live camera view, and open the same website on your **wife's phone** (Remote Phone) to watch the live moments and tap the shutter button to capture photos.

## How It Works
- **Live Video**: Peer-to-peer WebRTC streams low-latency video directly from the Pixel 8 to the Remote phone.
- **Remote Click**: Tapping the shutter button on the Remote phone sends a `snap` command over WebRTC (with WebSocket fallback).
- **Photo Capture**: The Pixel 8 captures a high-resolution JPEG (`ImageCapture.takePhoto()` on Android Chrome with canvas fallback), saves it on the Pixel 8, and sends a preview copy back to the Remote phone.
- **Signaling**: A lightweight Cloudflare Worker + Durable Object (`src/worker.js`) handles room pairing over WebSockets.

## Deploy to Cloudflare Using Git

1. **Push this folder to GitHub (or GitLab)**:
   ```bash
   git init
   git add .
   git commit -m "Initial Live Shutter app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **Connect Git to Cloudflare**:
   - Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
   - Go to **Workers & Pages** → **Create** → **Import a repository**.
   - Select your GitHub repository.
   - Cloudflare will detect `wrangler.jsonc` automatically:
     - **Build command**: *(leave empty or `npm install`)*
     - **Deploy command**: `npx wrangler deploy`
   - Click **Save and Deploy**.

3. **Use on Both Phones**:
   - Open your deployed `https://live-shutter.<your-subdomain>.workers.dev` URL on your **Pixel 8**, tap **Camera Phone**, and allow camera permission.
   - Tap **Share** (or enter the same 4-digit Room Code) and open the website on your **wife's phone**, then tap **Remote Phone**.
   - She will see your live camera feed and can tap the white shutter button anytime to click a photo!

