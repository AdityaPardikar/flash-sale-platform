# SSL Certificate Setup for Flash Sale Platform

## Development (Self-Signed)

```bash
# Generate self-signed certificate for development
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem \
  -out fullchain.pem \
  -subj "/C=US/ST=State/L=City/O=FlashSale/CN=localhost"
```

## Production (Let's Encrypt)

### Using certbot standalone:

```bash
certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --agree-tos \
  --email admin@yourdomain.com
```

### Using certbot with Docker:

```bash
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/www/certbot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d yourdomain.com
```

### Auto-renewal cron:

```bash
0 0 1 * * certbot renew --quiet && docker exec flash-sale-web nginx -s reload
```

## Certificate File Placement

Place your certificates in this directory:

- `fullchain.pem` - Full certificate chain
- `privkey.pem` - Private key

Then uncomment the SSL blocks in:

- `docker/nginx/nginx.prod.conf`
- `docker/nginx/default.prod.conf`
- `docker-compose.production.yml` (volume mount)

## Verification

```bash
# Test SSL configuration
nginx -t

# Check certificate expiry
openssl x509 -enddate -noout -in fullchain.pem
```
