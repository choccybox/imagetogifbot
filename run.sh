#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

echo "Installing npm packages and creating package-lock.json..."
if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js from https://nodejs.org/ then run this again."
  exit 1
fi
npm install

if ! command -v docker >/dev/null 2>&1; then
  echo
  echo "Docker was not found."
  echo "Install Docker from https://docs.docker.com/get-docker/"
  echo "or run the bot locally with:"
  echo "  node ."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo
  echo "Docker is installed, but Docker Compose was not found."
  echo "Install/update Docker Desktop or the Compose plugin, or run locally with:"
  echo "  node ."
  exit 1
fi

echo "Starting with Docker Compose..."
docker compose up --build
