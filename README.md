# Image to GIF Discord Bot

Converts a message attachment to a GIF. The bot posts only the completed GIF;
conversion progress and errors are logged by the container.

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
4. Add a **Public Hostname** to that tunnel, for example `gif.example.com`.
5. Set the service type to **HTTP** and the service URL to:

   ```text
   http://host.docker.internal:8787
   ```

The Compose file uses Docker's built-in `bridge` network instead of creating a
project network. The bot publishes port `8787` on the host, so it is reachable
from `http://localhost:8787` and from your LAN IP, such as
`http://192.168.100.33:8787`. The Cloudflared container reaches it through
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
https://gif.example.com/interactions
```

Replace `gif.example.com` with the public hostname created in Cloudflare. Discord
will send a verification request; the endpoint must return successfully before
Discord saves it.

## Use

Right-click a Discord message with an image or video attachment, then select
**Apps** → **To GIF**. The only channel message sent by the bot is the completed
GIF.

## Operations

- Source files are streamed to the project-local `temp/` directory and removed
  after conversion. The Compose file mounts that directory into the bot
  container.
- The Docker image includes FFmpeg and FFprobe for video conversion.
- GIFs target a maximum size of 10 MB; the bot estimates a starting resolution
  before conversion and retries at lower resolutions when needed.
- Tail conversion logs with `docker compose logs -f bot`.
- Stop the stack with `docker compose down`.
