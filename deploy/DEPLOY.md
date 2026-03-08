# Financial Tracker — Deployment Guide (Linux VPS)

> **Architecture**: One backend (Docker) + one frontend (static files served by Nginx).
> Multiple domains point to the same server, each with its own `config.js` → different API key → different database.

```
Browser → https://tracker.example.com
           │
           ▼
       ┌────────────────────────────────────────┐
       │  Nginx (port 443)                      │
       │  ├─ Basic Auth (username/password)     │
       │  ├─ GET /config.js → domain config     │
       │  ├─ GET /api/*    → proxy to :8000     │
       │  └─ GET /*        → frontend static    │
       └────────────────────────────────────────┘
           │ /api/* only
           ▼
       ┌────────────────────────────────────────┐
       │  Docker: FastAPI backend (:8000)       │
       │  ├─ X-API-Key header → selects DB      │
       │  ├─ user-a.db                          │
       │  └─ user-b.db                          │
       └────────────────────────────────────────┘
```

---

## Prerequisites

On your VPS you need:
- **Docker** + **Docker Compose**
- **Nginx**
- **certbot** for SSL certificates
- DNS A records for your domains pointing to your VPS IP

---

## Step 1: Copy files to the server

From your local machine, upload the entire project. Choose a location on your server, e.g. `/opt/financial-tracker` or `~/my_apps/financial-tracker`:

```bash
# Option A: rsync (recommended — fast, incremental)
rsync -avz --exclude '__pycache__' --exclude '.git' \
  . user@YOUR_VPS_IP:/path/to/financial-tracker/

# Option B: scp
scp -r . user@YOUR_VPS_IP:/path/to/financial-tracker/
```

Your server should end up with:
```
/path/to/financial-tracker/
├── docker-compose.yml
├── backend/
│   ├── users.json          ← API keys → DB mapping (gitignored, create manually)
│   ├── data/               ← single copy of all data (local dev + Docker same dir)
│   │   ├── database/       ← SQLite databases (one .db file per user)
│   │   ├── backups/
│   │   ├── usd_exchange_rates/
│   │   └── schema.sql
│   └── ...
├── frontend/               ← static files (served by Nginx)
│   ├── index.html
│   ├── app.js
│   ├── defaults.js
│   └── ...                 ← no config.js here (served per-domain by Nginx)
└── deploy/
    ├── configs/
    │   ├── tracker.example.com.config.js
    │   └── finance.example.org.config.js
    └── nginx/
        └── financial-tracker.conf
```

---

## Step 2: Ensure data directories exist

```bash
ssh user@YOUR_VPS_IP

cd /path/to/financial-tracker
mkdir -p backend/data/database backend/data/backups backend/data/usd_exchange_rates
```

> These are the same directories used when running locally — Docker mounts them directly from `backend/data/`, so there is only one copy of your databases.

---

## Step 3: Create `users.json`

`backend/users.json` is gitignored and must be created manually on the server. It maps API keys to database files:

```bash
nano /path/to/financial-tracker/backend/users.json
```

```json
{
  "REPLACE_WITH_A_LONG_RANDOM_KEY": {
    "name": "user-a",
    "db": "data/database/user-a.db"
  },
  "REPLACE_WITH_ANOTHER_LONG_RANDOM_KEY": {
    "name": "user-b",
    "db": "data/database/user-b.db"
  }
}
```

Generate secure random keys with:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Step 4: Create per-domain `config.js` files

Each domain needs a config file in `deploy/configs/` that tells the frontend which API key to use. These files are gitignored (they contain your keys) so create them on the server:

```bash
# tracker.example.com → user-a.db
cat > /path/to/financial-tracker/deploy/configs/tracker.example.com.config.js << 'EOF'
export const appConfig = {
  apiBaseUrl: "/api",
  currency: 'usd',
  apiKey: 'REPLACE_WITH_A_LONG_RANDOM_KEY',
  displayName: '',
}
EOF

# finance.example.org → user-b.db
cat > /path/to/financial-tracker/deploy/configs/finance.example.org.config.js << 'EOF'
export const appConfig = {
  apiBaseUrl: "/api",
  currency: 'usd',
  apiKey: 'REPLACE_WITH_ANOTHER_LONG_RANDOM_KEY',
  displayName: '',
}
EOF
```

The key in each config file must match the corresponding entry in `users.json`.

---

## Step 5: Start the backend with Docker

```bash
cd /path/to/financial-tracker
docker compose up -d --build
```

Verify it's running:
```bash
docker compose logs -f
# Should see: [APP] Ready.

# Test with one of your API keys:
curl -H "X-API-Key: REPLACE_WITH_A_LONG_RANDOM_KEY" \
     http://127.0.0.1:8000/me
# Should return: {"name": "user-a"}
```

---

## Step 6: Set up Basic Auth (browser login prompt)

```bash
# Install htpasswd utility
apt install -y apache2-utils   # Debian/Ubuntu

# Create the password file with your first user
htpasswd -c /path/to/financial-tracker/.htpasswd alice

# Add more users
htpasswd /path/to/financial-tracker/.htpasswd bob
```

Each domain shares the same `.htpasswd` file. You can create separate files per domain if you want different credentials — just update the `auth_basic_user_file` paths in the Nginx config.

---

## Step 7: SSL Certificates

```bash
# Stop Nginx temporarily so certbot can bind to port 80
systemctl stop nginx

# Issue a single SAN certificate covering all your domains
certbot certonly --standalone \
  -d tracker.example.com \
  -d finance.example.org

systemctl start nginx
```

> Certbot will store all certs under the **first domain's** path, e.g.
> `/etc/letsencrypt/live/tracker.example.com/`. Use that path for **all**
> server blocks in the Nginx config (they share one certificate).

---

## Step 8: Configure Nginx

The provided config is at `deploy/nginx/financial-tracker.conf`. Before using it, open it and:

1. Replace every occurrence of `/path/to/financial-tracker` with your actual server path
2. Replace the example domain names with your real domains
3. Update the SSL certificate paths (use the path certbot printed after issuing the cert)

```bash
# Copy to Nginx sites-enabled
cp /path/to/financial-tracker/deploy/nginx/financial-tracker.conf \
   /etc/nginx/sites-enabled/financial-tracker.conf

# Edit it
nano /etc/nginx/sites-enabled/financial-tracker.conf

# Test and reload
nginx -t && systemctl reload nginx
```

### Using a control panel (CloudPanel, Plesk, etc.)

If you manage sites through a control panel, create each domain as a **Static Site** with the document root pointing to `frontend/`, then paste the following into the site's custom Nginx directives:

```nginx
# Basic Auth
auth_basic "Financial Tracker";
auth_basic_user_file /path/to/financial-tracker/.htpasswd;

# Per-domain config.js — change the alias for each domain
location = /config.js {
    alias /path/to/financial-tracker/deploy/configs/tracker.example.com.config.js;
    add_header Cache-Control "no-cache";
}

# API reverse proxy (strips /api prefix before forwarding)
location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## Step 9: DNS Records

In your DNS provider, create **A records** for each domain:

| Type | Name                    | Value       |
|------|-------------------------|-------------|
| A    | tracker.example.com     | YOUR_VPS_IP |
| A    | finance.example.org     | YOUR_VPS_IP |

---

## Step 10: Verify

```bash
# Test backend directly (no Nginx)
curl -s http://127.0.0.1:8000/me \
  -H "X-API-Key: REPLACE_WITH_A_LONG_RANDOM_KEY"

# Test through Nginx (with basic auth)
curl -s -u alice:YOUR_PASSWORD https://tracker.example.com/api/me

# Check that each domain gets the right config.js
curl -s -u alice:YOUR_PASSWORD https://tracker.example.com/config.js
curl -s -u bob:YOUR_PASSWORD   https://finance.example.org/config.js
```

Then open each URL in a browser — you should see the basic auth popup, then the Financial Tracker dashboard.

---

## How it works

1. User visits `https://tracker.example.com`
2. **Nginx basic auth** → browser shows username/password popup
3. After auth, Nginx serves `frontend/index.html`
4. `app.js` loads → `defaults.js` dynamically imports `./config.js`
5. Nginx intercepts `GET /config.js` → serves the domain-specific config file
   - Contains: `apiBaseUrl: "/api"`, `apiKey: "<user-a's key>"`
6. Frontend makes API calls to `/api/movements`, `/api/bank-accounts`, etc.
7. Nginx proxies `/api/*` → `http://127.0.0.1:8000/*` (strips the `/api` prefix)
8. Backend reads `X-API-Key` header → looks up in `users.json` → opens the right database
9. Response flows back through Nginx to the browser

---

## Updating the app

Make changes locally, then push to the server:

```bash
# Frontend or backend changes — sync files
rsync -avz --exclude '__pycache__' --exclude '.git' \
  . user@YOUR_VPS_IP:/path/to/financial-tracker/

# If any Python file changed, rebuild the container
ssh user@YOUR_VPS_IP \
  "cd /path/to/financial-tracker && docker compose up -d --build"

# Frontend-only changes take effect immediately (no rebuild needed)
```

Files that live **only on the server** (never overwritten by rsync from your local repo):
- `backend/users.json` — API keys (gitignored)
- `backend/data/` — databases and backups
- `deploy/configs/*.config.js` — per-domain configs with API keys (gitignored)
- `.htpasswd` — basic auth passwords
- `/etc/nginx/sites-enabled/financial-tracker.conf` — Nginx config

---

## Useful commands

```bash
# View backend logs
docker compose logs -f

# Restart backend
docker compose restart

# Check Nginx status / reload after config changes
systemctl status nginx
nginx -t && systemctl reload nginx

# Renew SSL certificates (certbot auto-renews via systemd timer)
certbot renew
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **502 Bad Gateway** | Backend container not running → `docker compose up -d` |
| **403 Forbidden** | File permissions — ensure Nginx can read the frontend dir |
| **config.js 404** | Check the `alias` path in Nginx config matches the actual file location |
| **CORS errors** | Shouldn't happen (same-origin via proxy) — check browser devtools Network tab |
| **401 from API** | API key mismatch — verify the key in the domain's config.js matches `users.json` |
| **SSL errors** | Check cert paths in Nginx config; run `certbot renew` if expired |

```
Browser → https://fin.purewell.com.mx
           │
           ▼
       ┌────────────────────────────────────────┐
       │  Nginx (port 443)                      │
       │  ├─ Basic Auth (username/password)     │
       │  ├─ GET /config.js → purewell config   │
       │  ├─ GET /api/*    → proxy to :8000     │
       │  └─ GET /*        → frontend static    │
       └────────────────────────────────────────┘
           │ /api/* only
           ▼
       ┌────────────────────────────────────────┐
       │  Docker: FastAPI backend (:8000)       │
       │  ├─ X-API-Key header → selects DB      │
       │  ├─ pw.db (purewell)                   │
       │  └─ personal.db (personal)             │
       └────────────────────────────────────────┘
```

---

## Prerequisites

On your Hetzner VPS you need:
- **Docker** + **Docker Compose** (already installed)
- **Nginx** (already installed via CloudPanel)
- **certbot** or CloudPanel for SSL certificates
- DNS A records for both domains pointing to your VPS IP

---

## Step 1: Copy files to the server

From your local machine, upload the entire project:

```bash
# Option A: rsync (recommended — fast, incremental)
rsync -avz --exclude '__pycache__' --exclude '.git' \
  . root@YOUR_VPS_IP:/root/my_apps/my_financial_tracker/

# Option B: scp
scp -r . root@YOUR_VPS_IP:/root/my_apps/my_financial_tracker/
```

Your server should end up with:
```
/root/my_apps/my_financial_tracker/
├── docker-compose.yml
├── backend/
│   ├── users.json          ← API keys → DB mapping
│   ├── data/               ← single copy of all data (local dev + Docker same dir)
│   │   ├── database/       ← SQLite databases (personal.db, pw.db)
│   │   ├── backups/
│   │   ├── usd_exchange_rates/
│   │   └── schema.sql
│   └── ...
├── frontend/               ← static files (served by Nginx)
│   ├── index.html
│   ├── app.js
│   ├── defaults.js
│   └── ...                 ← no config.js here (served per-domain by Nginx)
└── deploy/
    ├── configs/
    │   ├── fin.purewell.com.mx.config.js
    │   └── fin.agneslisbon.com.config.js
    └── nginx/
        └── financial-tracker.conf
```

---

## Step 2: Ensure data directories exist

```bash
ssh root@YOUR_VPS_IP

cd /root/my_apps/my_financial_tracker
mkdir -p backend/data/database backend/data/backups backend/data/usd_exchange_rates
```

> These are the same directories used when running locally — Docker mounts them directly from `backend/data/`, so there is only one copy of your databases.

---

## Step 3: Verify `users.json`

Make sure `backend/users.json` exists on the server with your API keys:

```bash
cat backend/users.json
```

It should look like:
```json
{
  "z9euUF_pmmXfWxkCXUHkp8T8PrgGyPAUmv8biwRDRhM": {
    "name": "personal",
    "db": "data/database/personal.db"
  },
  "BU6zV04r-6Fhz4bVtnHN3r1nLFXeM3RVZTxK-BEWk64": {
    "name": "purewell",
    "db": "data/database/pw.db"
  }
}
```

If it wasn't copied (it's gitignored), create it manually.

---

## Step 4: Start the backend with Docker

```bash
cd /root/my_apps/my_financial_tracker
docker compose up -d --build
```

Verify it's running:
```bash
docker compose logs -f
# Should see: [APP] Ready.

# Test locally:
curl -H "X-API-Key: BU6zV04r-6Fhz4bVtnHN3r1nLFXeM3RVZTxK-BEWk64" \
     http://127.0.0.1:8000/me
# Should return: {"name": "purewell"}
```

---

## Step 5: Set up Basic Auth (username/password)

This gives you the browser login prompt when accessing the site.

```bash
# Install htpasswd utility if not already available
apt install -y apache2-utils

# Create the password file (you'll be prompted for a password)
htpasswd -c /root/my_apps/my_financial_tracker/.htpasswd purewell

# Add more users:
htpasswd /root/my_apps/my_financial_tracker/.htpasswd agnes
```

Each domain shares the same `.htpasswd` file. You can create separate files per domain if you want different credentials (update the Nginx config paths accordingly).

---

## Step 6: SSL Certificates

### Option A: Using certbot (standalone)

```bash
# If Nginx is running, stop it temporarily
systemctl stop nginx

certbot certonly --standalone \
  -d fin.purewell.com.mx \
  -d fin.agneslisbon.com

systemctl start nginx
```

### Option B: Using certbot (with Nginx plugin)

```bash
certbot certonly --nginx \
  -d fin.purewell.com.mx \
  -d fin.agneslisbon.com
```

### Option C: Via CloudPanel

If you manage certs through CloudPanel, note the certificate paths and update the Nginx config in step 7.

---

## Step 7: Configure Nginx

### Option A: Manual Nginx config (recommended)

Copy the provided config:

```bash
cp /root/my_apps/my_financial_tracker/deploy/nginx/financial-tracker.conf \
   /etc/nginx/sites-enabled/financial-tracker.conf
```

**Edit the SSL paths** if your certs are in a different location (e.g., CloudPanel certs are usually at `/etc/nginx/ssl-certificates/`):

```bash
nano /etc/nginx/sites-enabled/financial-tracker.conf
```

Test and reload:

```bash
nginx -t
systemctl reload nginx
```

### Option B: CloudPanel custom Nginx directives

If you prefer to create the sites through CloudPanel:

1. Create a **Static Site** in CloudPanel for `fin.purewell.com.mx`
2. Set the document root to `/root/my_apps/my_financial_tracker/frontend`
3. Enable SSL via CloudPanel
4. In the site's **Nginx Directives** (Vhost tab), add:

```nginx
# Basic Auth
auth_basic "Financial Tracker";
auth_basic_user_file /root/my_apps/my_financial_tracker/.htpasswd;

# Per-domain config.js
location = /config.js {
    alias /root/my_apps/my_financial_tracker/deploy/configs/fin.purewell.com.mx.config.js;
    add_header Cache-Control "no-cache";
}

# API reverse proxy
location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

5. Repeat for `fin.agneslisbon.com` (change the config.js alias path).

---

## Step 8: DNS Records

In your DNS provider, create **A records**:

| Type | Name                       | Value          |
|------|----------------------------|----------------|
| A    | fin.purewell.com.mx        | YOUR_VPS_IP    |
| A    | fin.agneslisbon.com        | YOUR_VPS_IP    |

---

## Step 9: Test everything

```bash
# Test backend directly
curl -s http://127.0.0.1:8000/me \
  -H "X-API-Key: BU6zV04r-6Fhz4bVtnHN3r1nLFXeM3RVZTxK-BEWk64"

# Test Nginx proxy (with basic auth)
curl -s -u purewell:YOUR_PASSWORD https://fin.purewell.com.mx/api/me

# Test config.js is served correctly per domain
curl -s -u purewell:YOUR_PASSWORD https://fin.purewell.com.mx/config.js
curl -s -u agnes:YOUR_PASSWORD https://fin.agneslisbon.com/config.js
```

Then open each domain in a browser — you should see the basic auth popup, then the Financial Tracker dashboard.

---

## How it works

1. User visits `https://fin.purewell.com.mx`
2. **Nginx basic auth** → browser shows username/password popup
3. After auth, Nginx serves `frontend/index.html`
4. `app.js` loads → `defaults.js` imports `./config.js`
5. Nginx intercepts `GET /config.js` → serves `fin.purewell.com.mx.config.js`
   - Contains: `apiBaseUrl: "/api"`, `apiKey: "BU6zV0..."` (purewell key)
6. Frontend makes API calls to `/api/movements`, `/api/bank-accounts`, etc.
7. Nginx proxies `/api/*` → `http://127.0.0.1:8000/*` (strips `/api` prefix)
8. Backend reads `X-API-Key` header → looks up in `users.json` → selects `pw.db`
9. Response flows back through Nginx to the browser

---

## Updating the app

After making changes locally:

```bash
# Sync files to server
rsync -avz --exclude '__pycache__' --exclude '.git' \
  --exclude 'data/database' --exclude 'data/backups' \
  . root@YOUR_VPS_IP:/root/my_apps/my_financial_tracker/

# Rebuild backend if Python code changed
ssh root@YOUR_VPS_IP "cd /root/my_apps/my_financial_tracker && docker compose up -d --build"

# Frontend changes take effect immediately (static files, no rebuild)
```

---

## Useful commands

```bash
# View backend logs
docker compose -f /root/my_apps/my_financial_tracker/docker-compose.yml logs -f

# Restart backend
docker compose -f /root/my_apps/my_financial_tracker/docker-compose.yml restart

# Check Nginx status
systemctl status nginx

# Test Nginx config
nginx -t

# Renew SSL certificates
certbot renew
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **502 Bad Gateway** | Backend container not running → `docker compose up -d` |
| **403 Forbidden** | Check file permissions: `chown -R www-data:www-data /root/my_apps/my_financial_tracker/frontend` |
| **config.js 404** | Check the `alias` path in Nginx config matches the actual file location |
| **CORS errors** | Shouldn't happen (same-origin via proxy), but check browser devtools Network tab |
| **401 from API** | API key mismatch — verify the key in the domain's config.js matches users.json |
| **SSL errors** | Check cert paths in Nginx config, run `certbot renew` if expired |
