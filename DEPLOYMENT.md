# Deployment Guide for UrbanLand Fusion AI

## Table of Contents
1. [Local Development](#local-development)
2. [Docker Compose (Recommended)](#docker-compose)
3. [Production Deployment](#production-deployment)
4. [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites
- Python 3.10+
- PostgreSQL 14+
- Node.js 18+
- Git

### Setup Steps

#### 1. Clone Repository
```bash
git clone https://github.com/urbanland/fusion-ai
cd Dharasetu
```

#### 2. Backend Setup
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
cd backend
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://urbanland:urbanland_dev@localhost:5432/urbanland"
export DEMO_DATA_DIR="/path/to/Dharasetu/data/generated"

# Initialize database
python -m pytest tests/  # Runs initialization

# Start API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev  # Runs on http://localhost:5173
```

#### 4. Database Setup
```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE urbanland;
CREATE USER urbanland WITH PASSWORD 'urbanland_dev';
GRANT ALL PRIVILEGES ON DATABASE urbanland TO urbanland;
\q

# Initialize PostGIS
psql -U urbanland -d urbanland
CREATE EXTENSION postgis;
\q
```

#### 5. Generate Demo Data
```bash
cd scripts
python generate_synthetic_ward.py
```

---

## Docker Compose

### Quick Start (Recommended)
```bash
# Build and start all services
docker compose up -d --build

# Check service status
docker compose ps

# View logs
docker compose logs -f api

# Stop services
docker compose down
```

### Service URLs
- **Frontend**: http://localhost:5173
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Database**: localhost:5432

### Volumes
- `postgis_data/` — PostgreSQL data persistence

### Environment Variables
Create `.env` file:
```env
# Database
DATABASE_URL=postgresql+psycopg://urbanland:urbanland_dev@db:5432/urbanland
DEMO_DATA_DIR=/app/data/generated

# API
UVICORN_HOST=0.0.0.0
UVICORN_PORT=8000

# Frontend
VITE_API_BASE=http://localhost:8000/api/v1

# Embeddings
EMBEDDINGS_BACKEND=sentence-transformers
```

### Health Checks
```bash
# API health
curl http://localhost:8000/health

# Frontend availability
curl http://localhost:5173

# Database connectivity
docker compose exec db pg_isready -U urbanland -d urbanland
```

---

## Production Deployment

### Option 1: Azure Container Apps

#### Prerequisites
- Azure subscription
- Azure CLI installed
- Resource group created

#### Steps
```bash
# 1. Create Azure Container Registry
az acr create --resource-group rg-urbanland \
  --name urbanlandacr --sku Basic

# 2. Build and push images
az acr build --registry urbanlandacr \
  --image urbanland-api:latest ./backend

az acr build --registry urbanlandacr \
  --image urbanland-frontend:latest ./frontend

# 3. Create Container Apps environment
az containerapp env create --name urbanland-env \
  --resource-group rg-urbanland \
  --location eastus

# 4. Deploy API
az containerapp create \
  --name urbanland-api \
  --resource-group rg-urbanland \
  --environment urbanland-env \
  --image urbanlandacr.azurecr.io/urbanland-api:latest \
  --target-port 8000 \
  --cpu 1 --memory 2Gi \
  --env-vars DATABASE_URL=<your-db-url> \
  --secrets db-password=<password> \
  --ingress external

# 5. Deploy Frontend
az containerapp create \
  --name urbanland-frontend \
  --resource-group rg-urbanland \
  --environment urbanland-env \
  --image urbanlandacr.azurecr.io/urbanland-frontend:latest \
  --target-port 80 \
  --cpu 0.5 --memory 1Gi \
  --env-vars VITE_API_BASE=<api-url> \
  --ingress external
```

### Option 2: Kubernetes

#### Prerequisites
- Kubernetes cluster (AKS, GKE, EKS)
- kubectl configured
- Helm 3+

#### Steps
```bash
# 1. Create namespace
kubectl create namespace urbanland

# 2. Create PostgreSQL (via Helm)
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install postgres bitnami/postgresql \
  --namespace urbanland \
  --set auth.username=urbanland \
  --set auth.password=urbanland_dev \
  --set auth.database=urbanland

# 3. Deploy secrets
kubectl create secret generic urbanland-secrets \
  --namespace urbanland \
  --from-literal=db-password=urbanland_dev

# 4. Deploy API
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/api-service.yaml

# 5. Deploy Frontend
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml

# 6. Check deployment status
kubectl get pods -n urbanland
kubectl get svc -n urbanland
```

### Option 3: Traditional VMs (AWS EC2, Azure VM)

#### Steps
```bash
# 1. SSH into VM
ssh -i key.pem ubuntu@<instance-ip>

# 2. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 3. Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 4. Clone repository
git clone https://github.com/urbanland/fusion-ai
cd Dharasetu

# 5. Configure environment
cp .env.example .env
nano .env  # Edit with production values

# 6. Start services
docker compose -f docker-compose.prod.yml up -d

# 7. Configure Nginx reverse proxy
# (See nginx.conf in repository)

# 8. Setup SSL/TLS
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d yourdomain.com
```

---

## Environment Variables

### API Backend

```env
# Database Configuration
DATABASE_URL=postgresql+psycopg://urbanland:urbanland_dev@db:5432/urbanland
SQL_ECHO=false  # Set to true for SQL debugging

# Demo Data
DEMO_DATA_DIR=/app/data/generated

# Embeddings Backend
EMBEDDINGS_BACKEND=sentence-transformers  # or: azure-openai, morphology
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_ENDPOINT=<your-endpoint>

# File Upload
UPLOAD_DIR=/tmp/urbanland-uploads
MAX_UPLOAD_SIZE_MB=100

# API Settings
API_TITLE=UrbanLand Fusion AI
API_VERSION=1.0.0
ENVIRONMENT=production
```

### Frontend

```env
# API Configuration
VITE_API_BASE=http://localhost:8000/api/v1
VITE_API_TIMEOUT=30000  # milliseconds

# Map Configuration
VITE_MAP_CENTER_LAT=12.968
VITE_MAP_CENTER_LNG=77.590
VITE_MAP_ZOOM=13

# Analytics
VITE_ENABLE_ANALYTICS=false
```

---

## Database Initialization

### Automatic (Via Docker)
The database is automatically initialized on container startup via `database.py`.

### Manual (Local)
```bash
cd backend
python -c "from app.database import init_db; init_db()"
```

### Backup & Restore
```bash
# Backup
docker exec urbanland-db pg_dump -U urbanland urbanland > backup.sql

# Restore
docker exec -i urbanland-db psql -U urbanland urbanland < backup.sql
```

---

## Monitoring & Logging

### Docker Logs
```bash
# View service logs
docker compose logs -f api
docker compose logs -f db
docker compose logs -f web

# Tail last 100 lines
docker compose logs -n 100 api
```

### Database Monitoring
```bash
# Connect to database
docker compose exec db psql -U urbanland -d urbanland

# Query active connections
SELECT pid, usename, query FROM pg_stat_activity;

# Check table sizes
SELECT schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables WHERE schemaname != 'pg_catalog' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Application Metrics
```bash
# Health check
curl http://localhost:8000/health

# API info
curl http://localhost:8000/api/v1/info

# Metrics
curl http://localhost:8000/api/v1/metrics
```

---

## Scaling

### Horizontal Scaling (Multiple API Instances)

#### Docker Compose
```yaml
services:
  api1:
    build: ./backend
    ports: ["8001:8000"]
    environment:
      - DATABASE_URL=postgresql://...

  api2:
    build: ./backend
    ports: ["8002:8000"]
    environment:
      - DATABASE_URL=postgresql://...

  nginx:
    image: nginx:latest
    ports: ["8000:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

#### Kubernetes
```bash
# Scale API deployment to 3 replicas
kubectl scale deployment urbanland-api -n urbanland --replicas=3
```

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_canonical_job_status ON canonical_records(job_id, review_status);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_decisions_parcel_date ON parcel_decisions(record_id, decided_at DESC);

-- Vacuum for maintenance
VACUUM ANALYZE;
```

---

## Troubleshooting

### Issue: Database connection refused
```bash
# Check if PostgreSQL is running
docker compose ps db

# Check logs
docker compose logs db

# Verify credentials
docker compose exec db psql -U urbanland -d urbanland -c "SELECT 1"
```

### Issue: API returns 503 (Service Unavailable)
```bash
# Check if database tables exist
docker compose exec db psql -U urbanland -d urbanland \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='public'"

# Reinitialize database
docker compose exec api python -c "from app.database import init_db; init_db()"
```

### Issue: Out of memory
```bash
# Check container resource usage
docker stats

# Increase memory limits in docker-compose.yml
# services:
#   api:
#     mem_limit: 2g
#   db:
#     mem_limit: 4g

# Restart services
docker compose restart
```

### Issue: Slow queries
```bash
# Enable SQL logging
export SQL_ECHO=true

# Check slow query log
docker compose exec db psql -U urbanland -d urbanland \
  -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10"
```

---

## Backup & Disaster Recovery

### Automated Backups (Recommended)
```bash
#!/bin/bash
# backup.sh - Run daily via cron

BACKUP_DIR="/backups/urbanland"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker compose exec db pg_dump -U urbanland urbanland | \
  gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup demo data
tar czf $BACKUP_DIR/data_$DATE.tar.gz data/generated/

# Keep only last 30 days
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
```

Schedule with cron:
```bash
0 2 * * * /path/to/backup.sh
```

### Restore from Backup
```bash
# Restore database
gunzip -c /backups/urbanland/db_20260831_020000.sql.gz | \
  docker compose exec -T db psql -U urbanland -d urbanland

# Restore demo data
tar xzf /backups/urbanland/data_20260831_020000.tar.gz
```

---

## Security Hardening

### 1. PostgreSQL Security
```bash
# Change default credentials
docker compose exec db psql -U urbanland -d urbanland \
  -c "ALTER USER urbanland WITH PASSWORD 'strong_password_here';"

# Restrict PostgreSQL to local connections
# In postgresql.conf: listen_addresses = 'db'
```

### 2. API Security
```env
# .env
ALLOWED_ORIGINS=https://yourdomain.com
API_KEY_ENABLED=true
API_KEY_HEADER=X-API-Key
```

### 3. TLS/SSL
```bash
# Generate self-signed certificate (development)
openssl req -x509 -newkey rsa:4096 -nodes \
  -out cert.pem -keyout key.pem -days 365

# Use Let's Encrypt (production)
certbot certonly --standalone -d yourdomain.com
```

---

## Performance Tuning

### PostgreSQL
```sql
-- Adjust shared_buffers (25% of RAM)
ALTER SYSTEM SET shared_buffers = '4GB';

-- Adjust effective_cache_size (50-75% of RAM)
ALTER SYSTEM SET effective_cache_size = '12GB';

-- Restart database
SELECT pg_reload_conf();
```

### API
```env
# Increase worker count
UVICORN_WORKERS=4
```

### Frontend
```bash
# Build optimized production bundle
npm run build

# Output: dist/ with minified assets
```

---

## Maintenance

### Regular Tasks
- **Daily**: Monitor logs and metrics
- **Weekly**: Database vacuum and analyze
- **Monthly**: Review audit logs, plan capacity
- **Quarterly**: Performance benchmarking, upgrade dependencies

### Dependency Updates
```bash
# Check for outdated packages
pip list --outdated
npm outdated

# Update safely
pip install --upgrade package-name
npm update
```

---

## Support

For deployment issues:
1. Check [Troubleshooting](#troubleshooting) section
2. Review logs: `docker compose logs -f`
3. Check GitHub Issues: https://github.com/urbanland/fusion-ai/issues
4. Contact: urbanland.fusion@example.com

---

**Last Updated**: August 31, 2026  
**Version**: 1.0.0
