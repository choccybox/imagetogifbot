@echo off

setlocal

cd /d "%~dp0"



echo Installing npm packages and creating package-lock.json...

where npm >nul 2>nul

if errorlevel 1 (

  echo npm was not found. Install Node.js from https://nodejs.org/ then run this again.

  exit /b 1

)

call npm install

if errorlevel 1 exit /b 1



where docker >nul 2>nul

if errorlevel 1 (

  echo.

  echo Docker was not found.

  echo Install Docker Desktop from https://www.docker.com/products/docker-desktop/

  echo or run the bot locally with:

  echo   node .

  exit /b 1

)



docker compose version >nul 2>nul

if errorlevel 1 (

  echo.

  echo Docker is installed, but Docker Compose was not found.

  echo Install/update Docker Desktop, or run the bot locally with:

  echo   node .

  exit /b 1

)



echo Starting with Docker Compose...

docker compose up --build

