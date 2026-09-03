# Giffy

Giffy converts a message attachment to a GIF. `To GIF` posts the completed attachment,
while `To GIF (priv)` privately returns a permanent `https://gifs.chocbox.org`
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
4. Add the **Public Hostname** `gifs.chocbox.org` to that tunnel.
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
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=minimax/minimax-m3:free
```

Never commit `.env` or expose the tunnel token.

### 5. Register the context-menu command

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
https://gifs.chocbox.org/interactions
```

Discord will send a verification request; the endpoint must return successfully
before Discord saves it.

## Use

Right-click a Discord message with an image or video attachment, then choose:

- **Apps** → **To GIF** to post the completed GIF publicly.
- **Apps** → **To GIF (priv)** to receive an ephemeral message containing a
  permanent link such as
  `https://gifs.chocbox.org/gifs/bright-cloud-otter.gif`.

Run `npm run register` or the documented Docker registration command again after
updating so Discord installs both commands.

## Operations

- Source files are streamed to the project-local `temp/` directory and removed
  after conversion. Permanent linked GIFs are stored under `gifs/`. Compose
  mounts both directories into the bot container so links survive restarts.
- Every GIF gets a three-word filename. Private links use an atomic collision
  check before saving, and files are served with long-lived immutable cache
  headers.
- When `OPENROUTER_API_KEY` is configured, the bot sends the first frame to
  `minimax/minimax-m3:free` and asks for up to five distinct visual feature tags.
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

Vision naming is enabled when `OPENROUTER_API_KEY` is set in `.env`. The bot
extracts only the first frame, including for videos, and asks
`minimax/minimax-m3:free` for up to five distinct lowercase feature tags. The
first three tags are used in the filename. If the key, model, or request is
unavailable, it falls back to local random words.

Good free alternatives to test through OpenRouter are:

- [`openrouter/free`](https://openrouter.ai/docs/guides/routing/routers/free-router) — automatically routes to an available free model that supports the requested image capability.
- [`minimax/minimax-m3:free`](https://openrouter.ai/minimax/minimax-m3:free) — currently listed as free and supports image and video input.
- Google Gemma multimodal free listings — check the [current OpenRouter free collection](https://openrouter.ai/collections/free-models) because model IDs, availability, and limits change.

Free routing is not guaranteed availability, and frames are sent to the
selected provider when vision naming is enabled. Keep the API key private and
validate any model change against the three-word filename rules.
