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

Right-click a message with an image or video attachment. Apps > To GIF. Follow the public conversion updates in the channel.

# Notes

Node 18+ required (built-in fetch, FormData, Blob).
Source attachments are downloaded to the project-local `temp/` directory and
removed after each conversion. `temp/` is excluded from Git.
GIF attachments are not reconverted. Video attachments are converted through
FFmpeg at 15 FPS using a generated color palette.
The public response reports download, inspection, conversion, retry, and
upload stages with elapsed time and an ETA that refreshes every two seconds.
For videos, the ETA is recalculated from FFmpeg's processing position and
speed. Before conversion, the bot estimates the GIF size from source metadata and
precalculates a starting resolution to target a 10 MB GIF. GIFs over 10 MB are
retried at lower resolutions.
No gateway connection, no persistent bot process needed.
Don't commit `.env`, only `.env.example`.
