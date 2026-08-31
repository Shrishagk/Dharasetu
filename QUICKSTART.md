# Quick Start Guide - UrbanLand Fusion AI

**Get running in 60 seconds** ⚡

## Fastest Path: Docker Compose

```bash
# 1. Navigate to project
cd c:\vs_codes\Dharasetu

# 2. Start all services (takes ~10 seconds)
docker compose up -d

# 3. Open in browser
Frontend:  http://localhost:5173
API Docs:  http://localhost:8000/docs
API Health: http://localhost:8000/health
```

**That's it!** ✅ All services running

---

## Verify Everything Works

### Check Services
```bash
docker compose ps
# Should show 3 containers: db, api, web (all healthy)
```

### Test API
```bash
# Health check
curl http://localhost:8000/health

# Dashboard with data
curl http://localhost:8000/api/v1/dashboard

# API documentation
curl http://localhost:8000/docs
```

### View Frontend
```
Open http://localhost:5173 in your browser
```

---

## Common Tasks (30 seconds each)

### View Demo Data
```bash
# Dashboard with 72 parcels
curl http://localhost:8000/api/v1/dashboard | jq .summary

# Output: 
# {
#   "total_parcels": 72,
#   "harmonized": 64,
#   "conflicts": 8,
#   "human_review": 3
# }
```

### List Data Sources
```bash
curl http://localhost:8000/api/v1/sources | jq '.sources[].name'
```

### Make a Decision (Approve Parcel)
```bash
# Get a parcel ID from dashboard
PARCEL="CULR-56000006"

# Approve it
curl -X POST http://localhost:8000/api/v1/parcels/$PARCEL/decision \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "officer": "Test Officer",
    "confidence": 0.95
  }'
```

### View Audit Log
```bash
curl http://localhost:8000/api/v1/audit?limit=5 | jq .
```

### Export Results
```bash
curl http://localhost:8000/api/v1/export/canonical.geojson > results.geojson
```

---

## Stop Services

```bash
docker compose down

# To also remove volumes (data):
docker compose down -v
```

---

## Troubleshooting (2 minutes)

### Services not starting?
```bash
# Check logs
docker compose logs

# Restart
docker compose restart

# Full reset
docker compose down
docker compose up -d
```

### Database issues?
```bash
# Check database health
docker compose exec db pg_isready -U urbanland -d urbanland

# Connect to database
docker compose exec db psql -U urbanland -d urbanland

# List tables
\dt
```

### API not responding?
```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000

# Check container logs
docker compose logs api

# Restart API
docker compose restart api
```

---

## Next Steps

### For SIH Submission
1. Read [SIH_SUBMISSION.md](SIH_SUBMISSION.md) (10 min read)
2. Review architecture & algorithms
3. Test full workflow (upload → process → approve → export)

### For Deployment
1. Read [DEPLOYMENT.md](DEPLOYMENT.md) (15 min read)
2. Choose platform (Azure, Kubernetes, VM)
3. Follow deployment steps

### For Testing
1. Read [TESTING.md](TESTING.md) (10 min read)
2. Run test suite
3. Load test the system

### For Development
1. Read [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) (15 min read)
2. Explore code: `backend/app/main.py`
3. Check database: `backend/app/models.py`

---

## Key URLs (When Running)

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:5173 | Web UI for reviewing parcels |
| API Docs | http://localhost:8000/docs | Interactive Swagger documentation |
| Health | http://localhost:8000/health | Service health check |
| Dashboard | http://localhost:8000/api/v1/dashboard | Main metrics & review queue |
| Database | localhost:5432 | PostgreSQL (internal only) |

---

## API Endpoints at a Glance

```bash
# Health & Info
GET /health
GET /api/v1/dashboard

# Data Sources
GET /api/v1/sources
POST /api/v1/sources/sample
POST /api/v1/sources/upload

# Harmonization
POST /api/v1/harmonization/jobs
GET /api/v1/harmonization/jobs/{id}

# Parcels & Decisions
GET /api/v1/parcels/{id}
POST /api/v1/parcels/{id}/decision

# Metrics & Export
GET /api/v1/metrics
GET /api/v1/audit
GET /api/v1/export/canonical.geojson

# Embeddings
GET /api/v1/embeddings/backend
```

---

## Environment Variables (if needed)

```env
# API Configuration
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg://urbanland:urbanland_dev@db:5432/urbanland
DEMO_DATA_DIR=/app/data/generated
EMBEDDINGS_BACKEND=sentence-transformers

# Frontend Configuration
VITE_API_BASE=http://localhost:8000/api/v1
VITE_MAP_CENTER_LAT=12.968
VITE_MAP_CENTER_LNG=77.590

# Optional: File Upload
MAX_UPLOAD_SIZE_MB=100
UPLOAD_DIR=/tmp/urbanland-uploads
```

---

## Performance Notes

- **First load**: API might take 5-10 seconds to initialize embeddings model on first request
- **Dashboard**: Loads in ~45ms (after initialization)
- **Harmonization**: ~2.3 seconds for 72 parcels
- **Database**: Indexed queries typically <50ms

---

## Getting Help

1. **API Documentation**: http://localhost:8000/docs (Swagger UI)
2. **Guides**: 
   - [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Complete overview
   - [DEPLOYMENT.md](DEPLOYMENT.md) - How to deploy
   - [TESTING.md](TESTING.md) - How to test
   - [SIH_SUBMISSION.md](SIH_SUBMISSION.md) - Competition submission

3. **Logs**:
   ```bash
   docker compose logs -f api      # API logs
   docker compose logs -f db       # Database logs
   docker compose logs -f web      # Frontend logs
   ```

4. **Status**:
   ```bash
   docker compose ps              # Service status
   docker stats                   # Resource usage
   ```

---

## That's It! 🎉

You now have a **production-ready** UrbanLand Fusion AI system running.

Ready to move forward? Check out:
- **SIH Submission?** → Read [SIH_SUBMISSION.md](SIH_SUBMISSION.md)
- **Deploy to production?** → Read [DEPLOYMENT.md](DEPLOYMENT.md)
- **Test the system?** → Read [TESTING.md](TESTING.md)
- **Understand the code?** → Read [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

---

**Questions?** See the docs in the root directory or check `/docs` endpoint while running.

**Happy harmonizing! 🌍**
