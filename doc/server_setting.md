# Server Setting Guide (VPS)

## 1. Provision VPS
- Ubuntu 22.04 LTS (recommended)
- Open ports: `22`, `80`, `443`, and app port (example `3100` for internal/Nginx upstream)

## 2. Install Runtime
```bash
sudo apt update
sudo apt install -y git curl nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 3. Clone Project
```bash
cd /opt
sudo git clone <your-repo-url> pocserver
sudo chown -R $USER:$USER /opt/pocserver
cd /opt/pocserver/backend
npm install
```

## 4. Setup PostgreSQL
```bash
sudo -u postgres psql
CREATE DATABASE pocserver;
CREATE USER pocuser WITH ENCRYPTED PASSWORD 'strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE pocserver TO pocuser;
\q
```

## 5. Configure Backend Environment
Create `/opt/pocserver/backend/.env`:
```env
PORT=3100
JWT_SECRET=change_this_secret
DB_HOST=localhost
DB_PORT=5432
DB_USER=pocuser
DB_PASSWORD=strong_password_here
DB_NAME=pocserver
```

Initialize schema + seed:
```bash
cd /opt/pocserver/backend
npm run init-db
npm run seed-db
```

## 6. Run Backend with PM2
```bash
cd /opt/pocserver/backend
pm2 start src/server.js --name pocserver
pm2 save
pm2 startup
```

## 7. Nginx Reverse Proxy
Create `/etc/nginx/sites-available/pocserver`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/pocserver /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 8. Enable HTTPS (Let's Encrypt)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 9. Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 10. Android App Config
In APK config page:
- HTTP Base URL: `https://your-domain.com`
- WS URL: `wss://your-domain.com/ws/signaling`

## 11. Quick Health Checks
```bash
curl https://your-domain.com/api/health
pm2 logs pocserver
sudo systemctl status nginx
```

## 12. aaPanel Setup (Easier Option)
Yes, using aaPanel is usually easier for domain, SSL, and reverse proxy management.

### 12.1 Install aaPanel (if not installed)
```bash
URL=https://www.aapanel.com/script/install_6.0_en.sh && if [ -f /usr/bin/curl ];then curl -ksSO "$URL";else wget --no-check-certificate -O install_6.0_en.sh "$URL";fi;bash install_6.0_en.sh aapanel
```

### 12.2 Install required software from aaPanel App Store
- `Nginx`
- `PM2 Manager` (or Node Manager if available in your panel version)
- `PostgreSQL` (if available) or install PostgreSQL from apt command line

### 12.3 Create site/domain in aaPanel
1. aaPanel -> `Website` -> `Add Site`
2. Domain: `your-domain.com`
3. Root directory can be default (we only proxy to Node backend)

### 12.4 Configure backend app
Backend app path:
- `/opt/pocserver/backend`

Install deps and init DB:
```bash
cd /opt/pocserver/backend
npm install
npm run init-db
npm run seed-db
```

### 12.5 Run Node app with PM2 (via aaPanel or CLI)
CLI fallback:
```bash
cd /opt/pocserver/backend
pm2 start src/server.js --name pocserver
pm2 save
```

### 12.6 Add reverse proxy in aaPanel
1. aaPanel -> `Website` -> select `your-domain.com` -> `Proxy`
2. Add reverse proxy target:
- Target URL: `http://127.0.0.1:3100`
3. Enable WebSocket support (important for `/ws/signaling`).

If custom Nginx config field is shown, ensure these headers exist:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
```

### 12.7 Enable SSL in aaPanel
1. aaPanel -> `Website` -> `SSL`
2. Use Let's Encrypt
3. Enable `Force HTTPS`

### 12.8 Open firewall/ports
- aaPanel security/firewall: allow `80` and `443`
- VPS firewall/Cloud firewall: also allow `80` and `443`

### 12.9 Final test
```bash
curl https://your-domain.com/api/health
```
Expected:
```json
{"ok":true,"service":"pocserver-backend"}
```

## Notes
- For cross-network voice reliability, add TURN (`coturn`) and pass TURN ICE servers to clients.
- Keep JWT secret and DB credentials out of git.


node tools/license-generator/generate-license.js --company=BALIOffice.net --server=GoingSpring --maxServers=1 --maxDevices=300 --maxOnline=120 --expiresAt=2030-12-31T23:59:59Z --secretKey=Rudy --clientKey=Dwiantoro


eyJjb21wYW55TmFtZSI6IkJBTElPZmZpY2UubmV0Iiwic2VydmVyTmFtZSI6IkdvaW5nU3ByaW5nIiwibWF4U2VydmVycyI6MSwibWF4RGV2aWNlcyI6MzAwLCJtYXhPbmxpbmVEZXZpY2VzIjoxMjAsImV4cGlyZXNBdCI6IjIwMzAtMTItMzFUMjM6NTk6NTkuMDAwWiIsImNsaWVudEtleSI6IkR3aWFudG9ybyJ9.EJ4cK8L91oIqXBKWC2wVQ3FVlujIM4SVIJ-6P-Re1Yw

eyJjb21wYW55TmFtZSI6IkJBTElPZmZpY2UubmV0Iiwic2VydmVyTmFtZSI6IkdvaW5nU3ByaW5nIiwibWF4U2VydmVycyI6MSwibWF4RGV2aWNlcyI6MzAwLCJtYXhPbmxpbmVEZXZpY2VzIjoxMjAsImV4cGlyZXNBdCI6IjIwMzAtMTItMzFUMjM6NTk6NTkuMDAwWiIsImNsaWVudEtleSI6IkR3aWFudG9ybyJ9.EJ4cK8L91oIqXBKWC2wVQ3FVlujIM4SVIJ-6P-Re1Yw