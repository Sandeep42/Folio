# Deploying Folio publicly

## 1. Get a server

A €4–6/month VPS works fine. Recommended providers:
- **Hetzner** CX11 (2GB RAM, Helsinki/Nuremberg) — best value
- **DigitalOcean** Basic Droplet (1GB RAM)
- **Linode** Nanode

Minimum: 1 vCPU, 1GB RAM, Ubuntu 22.04 LTS.

## 2. Point your domain

Add an A record pointing `yourdomain.com` → your server IP.
Also add `www` if you want (CNAME → yourdomain.com).

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in
```

## 4. Clone / upload the app

```bash
scp -r cas-analyzer user@your-server:~/folio
# or git clone if you've pushed it
```

## 5. Get a TLS certificate (Let's Encrypt)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com
# Certs land at /etc/letsencrypt/live/yourdomain.com/
```

Certbot auto-renews via a systemd timer — verify with:
```bash
sudo certbot renew --dry-run
```

## 6. Configure for production

Edit `docker-compose.yml`:
```yaml
environment:
  ALLOWED_ORIGIN: "https://yourdomain.com"
  # API_KEY: "generate-with: openssl rand -hex 32"
```

Edit `frontend/nginx.conf` — uncomment the HTTPS server block and fill in your domain.
Uncomment the HTTP→HTTPS redirect block.
Uncomment the 443 port mapping and letsencrypt volume in docker-compose.yml.

## 7. Build and start

```bash
cd folio
sudo docker compose up --build -d
```

Check it's running:
```bash
sudo docker compose ps
curl https://yourdomain.com/api/health
```

## 8. Firewall

Allow only ports 80 (HTTP redirect), 443 (HTTPS), and 22 (SSH):
```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443
sudo ufw enable
```

Block direct access to port 8080 (internal only):
```bash
sudo ufw deny 8080
```

## 9. Auto-renew certs with Docker

Add to crontab (`crontab -e`):
```
0 3 * * * certbot renew --quiet && docker compose -f /home/user/folio/docker-compose.yml restart frontend
```

## Security checklist

- [ ] HTTPS enabled with valid cert
- [ ] HTTP redirects to HTTPS
- [ ] `ALLOWED_ORIGIN` set to your domain
- [ ] Firewall blocks port 8080 externally
- [ ] Privacy policy email address updated in `public/privacy.html`
- [ ] Consider setting `API_KEY` if you want to restrict access

## Rate limits (already configured in nginx)

| Endpoint | Limit |
|---|---|
| Parse (CAS/XLS/KFIN/Zerodha) | 6 per minute per IP |
| Refresh prices | 2 per minute per IP |
| Analysis endpoints | 30 per minute per IP |

Returns HTTP 429 when exceeded.
