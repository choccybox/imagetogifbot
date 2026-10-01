# Giffy

Giffy converts a message attachment to a GIF. `To GIF` posts the completed attachment,
while `To GIF (priv)` privately returns a permanent `https://gif.chocbox.org`
link named from the GIF's visual content. Conversion progress and errors are logged by the container.

## Quick start

Windows PowerShell/CMD:

```powershell
.\run.bat
```

macOS/Linux/Git Bash:

```sh
sh ./run.sh
```

The script runs `npm install` to install packages and create/update
`package-lock.json`. If Docker Compose is available, it starts the stack with
`docker compose up --build`. If Docker is missing, it tells you to install Docker
or run locally with `node .`.

## Run with Docker and Cloudflare Tunnel

### 1. Prerequisites

- A Discord application with an application command configured.
- A domain managed by Cloudflare and a Cloudflare Zero Trust account.
- Docker Desktop (or Docker Engine with the Compose plugin).

### 2. Create a Discord application

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application.
2. Copy its **Application ID**, **Public Key**, and bot token.
3. Enable **User Install** in **Installation** and add the `applications.commands` scope.

### 3. Create a named Cloudflare Tunnel

1. Open **Cloudflare Zero Trust** → **Networks** → **Tunnels**.
2. Create a **Cloudflared** tunnel and choose **Docker** as the connector type.
3. Copy the tunnel token. Keep it secret.
4. Add the **Public Hostname** `gif.chocbox.org` to that tunnel.
5. Set the service type to **HTTP** and the service URL to:

   ```text
   http://host.docker.internal:6769
   ```

The Compose file uses Docker's built-in `bridge` network instead of creating a
project network. The bot publishes port `6769` on the host, so it is reachable
from `http://localhost:6769` and from your LAN IP, such as
`http://192.168.100.33:6769`. The Cloudflared container reaches it through
Docker's `host.docker.internal` gateway.

### 4. Configure environment variables

Create your local `.env` file from the template:

```powershell
Copy-Item .env.example .env
```

Fill in `.env`:

```dotenv
DISCORD_PUBLIC_KEY=your_discord_public_key
DISCORD_APP_ID=your_discord_application_id
DISCORD_BOT_TOKEN=your_discord_bot_token
CLOUDFLARE_TUNNEL_TOKEN=your_cloudflare_tunnel_token
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Never commit `.env` or expose the tunnel token.

### 5. Register the commands

Build the image, then register the command once:

```powershell
docker compose build
docker compose run --rm --no-deps bot node register_command.js
```

Run this command again only after changing `register_command.js`.

### 6. Start the bot and tunnel

```powershell
docker compose up -d
```

Check both services:

```powershell
docker compose ps
docker compose logs -f bot cloudflared
```

### 7. Configure Discord's endpoint

In the Discord Developer Portal, open **General Information** and set the
**Interactions Endpoint URL** to:

```text
https://gif.chocbox.org/interactions
```

Discord will send a verification request; the endpoint must return successfully
before Discord saves it.

## Use

Use the slash command to upload media directly:

- `/gif file:<image-or-video>` posts the completed GIF publicly.

You can also right-click a Discord message with an image or video attachment,
then choose:

- **Apps** → **To GIF** to post the completed GIF publicly.
- **Apps** → **To GIF (priv)** to receive an ephemeral message containing a
  permanent link such as
  `https://gif.chocbox.org/gifs/bright-cloud-otter.gif`.

Run `npm run register` or the documented Docker registration command again after
updating so Discord installs all three commands.

## Operations

- Source files are streamed to the project-local `temp/` directory and removed
  after conversion. Permanent linked GIFs are stored under `gifs/`. Compose
  mounts both directories into the bot container so links survive restarts.
- Every GIF gets a three-word filename. Private links use an atomic collision
  check before saving, and files are served with long-lived immutable cache
  headers.
- When `GEMINI_API_KEY` is configured, the bot sends the first frame to
  `gemini-3.5-flash-lite` and asks for up to five distinct visual feature tags.
  The first three valid tags become the filename. Without a key or when the
  model is unavailable, it falls back to local random words.
- The bot container runs as root so it can write to the Windows Docker Desktop
  bind mounts reliably.
- The Docker image includes FFmpeg and FFprobe for video conversion.
- GIFs target a maximum size of 10 MB; the bot estimates a starting resolution
  before conversion and retries at lower resolutions when needed.
- Tail conversion logs with `docker compose logs -f bot`.
- Stop the stack with `docker compose down`.

## Vision-based names

Vision naming is enabled when `GEMINI_API_KEY` is set in `.env`. The bot
extracts only the first frame, including for videos, and asks Google Gemini for
up to five distinct lowercase feature tags. The first three tags are used in the
filename. If the key, model, or request is unavailable, it falls back to local
random words.

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey) and
confirm the current model list with:

```powershell
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$env:GEMINI_API_KEY"
```

### Benchmarking models

`benchmark_models.js` sends the same prompt and frame to every vision-capable
model, prints each request and raw response live, and ranks the survivors by
median latency:

```powershell
npm run bench
node benchmark_models.js path\to\image.jpg 5
```

Measured on 2026-10-01 against `test.jpg` with three runs per model, three
models produced a valid three-word name:

| Model | Median | Name |
| --- | --- | --- |
| `gemini-3.5-flash-lite` | 1120 ms | `diamond-magnifying-glass` |
| `gemini-3.1-flash-lite` | 3025 ms | `diamond-loupe-magnifying` |
| `gemini-flash-lite-latest` | 20453 ms | `diamond-monocle-magnifier` |

`gemini-3.5-flash-lite` is the default because it is the fastest of the models
that reliably satisfied the filename rules. Faster models such as
`gemini-3.5-flash` and `gemini-3.6-flash` answered in under 2 s but replied with
prose or bullet lists instead of bare tags, so the normalizer rejected them.

Several models fail regardless of prompt: `gemini-2.5-pro` and
`gemini-2.5-flash-lite` now return 404 for new users, the Pro and Omni preview
models return 429 on a free tier, and `gemini-3.7-flash`, `gemini-3.8-flash`,
and `gemini-flash-latest` return 503 under load. Re-run the benchmark before
changing `GEMINI_MODEL`.

Frames are sent to Google when vision naming is enabled. Keep the API key
private and validate any model change against the three-word filename rules.
