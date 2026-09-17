<div align="center">

![Swind Banner](public/banner.webp)

# Swind ⚡
### Swiggy Inside Discord

*Integrate Swiggy Instamart seamlessly into Discord.*

[![OAuth 2.1 PKCE](https://img.shields.io/badge/Auth-OAuth_2.1_PKCE-orange.svg)](https://mcp.swiggy.com)
[![Discord.js v14](https://img.shields.io/badge/Discord.js-v14-5865F2.svg)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6.svg)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/Health-Active-brightgreen.svg)](https://auth.swiggyinsidediscord.tech/health)

</div>

---

## 📌 Overview

**Swind** brings Swiggy Instamart services directly into Discord. Users can authenticate securely with their Swiggy account via OAuth 2.1 PKCE, view cart details, and utilize Swiggy MCP tools within Discord server channels.

![Swind Demo](public/ss.webp)

---

## ✨ Features

- 🔐 **OAuth 2.1 + PKCE**: Secure authorization flow with state-token CSRF protection.
- 🛡️ **AES-256-GCM Encryption**: Envelope encryption for user tokens stored in Supabase.
- 🛒 **Instamart MCP Integration**: Real-time access to Swiggy Instamart tools and resources.
- ⚡ **Production Systemd Management**: Deployed on Oracle Cloud with health monitoring endpoints.

---

## 🤖 Commands

| Command | Description |
| :--- | :--- |
| `/login` | Authenticate with your Swiggy account via OAuth 2.1 PKCE |
| `/logout` | Revoke session and disconnect your Swiggy account |
| `/authstatus` | View authentication state, granted scopes, and token expiration |
| `/ping` | Check bot latency and OAuth server health |

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

### 2. Installation
```bash
git clone https://github.com/ankitdey01/swind.git
cd swind
npm install
```

### 3. Environment Variables (`.env`)
```env
DISCORD_TOKEN=your_discord_bot_token
DEVELOPER_IDS=your_discord_user_id
OAUTH_CALLBACK_URL=https://auth.xxxx.tech/auth/callback
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
TOKEN_ENCRYPTION_KEY=64_character_hex_key
```

### 4. Build and Run
```bash
npm start
```

---

## 🌐 Oracle Cloud Deployment

Swind runs as a `systemd` service on Oracle Cloud. Deploying updates is streamlined via a single script.

### Deployment Flow
```bash
# 1. SSH into Oracle Cloud instance
ssh -i "$HOME\.ssh\swind.key" ubuntu@161.118.178.22

# 2. Run automated deployment script
~/deploy-swind.sh
```

### Deployment Script (`~/deploy-swind.sh`)
```bash
#!/bin/bash
set -e

cd /home/ubuntu/swind
echo "==> Pulling latest code..."
git pull --ff-only

echo "==> Installing dependencies..."
npm install

echo "==> Restarting Swind..."
sudo systemctl restart swind

echo "==> Checking service..."
sudo systemctl is-active --quiet swind

echo "==> Checking health endpoint..."
curl --fail --silent http://127.0.0.1:3000/health

echo "================================"
echo " Swind deployment successful"
echo "================================"
```

> **Note:** `.env` is ignored by Git and preserved across deployments. `npm install` is used as `package-lock.json` is in `.gitignore`. `npm start` automatically compiles TypeScript before starting Node.

### Operational Commands
- **Public Health:** `curl https://auth.swiggyinsidediscord.tech/health`
- **Local Health:** `curl http://127.0.0.1:3000/health`
- **Service Controls:** `sudo systemctl [status|restart|stop|start] swind`
- **Live Logs:** `sudo journalctl -u swind -f`
- **Recent Logs:** `sudo journalctl -u swind -n 100 --no-pager`

---

## 📚 References & Links

- **Auth Server Health:** [auth.swiggyinsidediscord.tech/health](https://auth.swiggyinsidediscord.tech/health)

---

<div align="center">
Built with ❤️ for the Swiggy Builders Club. 
</div>
