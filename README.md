# Setup

1. Create app: https://discord.com/developers/applications
2. Copy Public Key, Application ID, Bot Token.
3. Copy `.env.example` to `.env`, fill values:
   ```
   DISCORD_PUBLIC_KEY=xxx
   DISCORD_APP_ID=xxx
   DISCORD_BOT_TOKEN=xxx
   ```
4. Install deps: `npm install`
5. Install FFmpeg and FFprobe, ensuring `ffmpeg` and `ffprobe` are on your `PATH` (or set `FFMPEG_PATH` and `FFPROBE_PATH`).
6. Register command once: `npm run register`
7. Start server: `npm start` (port 8787)
8. Expose port publicly (Cloudflare Tunnel, ngrok, reverse proxy).
9. In portal, General Information tab, set Interactions Endpoint URL to `https://yourdomain/interactions`
10. In portal, Installation tab, enable User Install.

# Use

Right-click a message with an image or video attachment. Apps > To GIF. The final GIF is the only message posted.
