# 🚀 DevOpsFlow Portal: Full-Fledged CI/CD & Cloud-Native Deployment

A production-grade DevOps reference project featuring **DevOpsFlow Portal** — a cloud-native Node.js & PostgreSQL web application with an automated end-to-end CI/CD pipeline orchestrated by **Jenkins**, containerized with **Docker**, and deployed to **Kubernetes** with zero-downtime rolling updates.

---

## 📑 Guides & Documentation

- 👉 **[JENKINS_STEP_BY_STEP_GUIDE.md](JENKINS_STEP_BY_STEP_GUIDE.md)**: **The Complete Step-by-Step Jenkins CI/CD Setup Guide** (Docker Hub tokens, Kubeconfig setup, Jenkins container with Docker socket, Jenkinsfile stages, and troubleshooting).
- 👉 **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**: Comprehensive architectural reference for Kubernetes manifests, Docker Compose, and environment variables.

---

## ⚡ Quick Start (Local Development)

### Option 1: Run with Docker Compose (Recommended)
Spins up both the `devopsflow-portal` application and the PostgreSQL database in containers with health checks:

```bash
# Start the full stack
docker compose up -d --build

# View real-time logs
docker compose logs -f

# Check container status
docker compose ps

# Stop containers
docker compose down
```
Open **`http://localhost:3000`** in your browser.

---

### Option 2: Run Locally with Node.js
```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite (8 unit & integration tests)
npm test

# 3. Start the application
npm start
```
Open **`http://localhost:3000`** in your browser.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Application** | Node.js 20, Express, Real-time Glassmorphic Dashboard, REST API |
| **Database** | PostgreSQL 16, Connection Pooling, Auto-Schema Migration, Health Monitoring |
| **Testing** | Node.js Native Test Runner (`node --test`), Supertest |
| **Containerization** | Docker (Multi-stage Alpine, Non-root user, Healthcheck probe) |
| **CI/CD Automation** | Jenkins Declarative Pipeline (`Jenkinsfile`) |
| **Container Orchestration** | Kubernetes (RollingUpdate Deployments, Services, Secrets, PVCs, Probes) |

---

## 📁 Repository Structure

```
jenkins-deploy-project/
├── JENKINS_STEP_BY_STEP_GUIDE.md # 🌟 Complete step-by-step Jenkins tutorial
├── DEPLOYMENT_GUIDE.md           # Architecture and Kubernetes deployment guide
├── Jenkinsfile                   # Declarative Jenkins CI/CD pipeline
├── Dockerfile                    # Production multi-stage Docker build
├── docker-compose.yml            # Local multi-container development environment
├── package.json                  # Dependencies, metadata, and test scripts
├── .env.example                  # Sample environment variable template
├── .env                          # Local environment configuration
├── src/
│   ├── app.js                    # Express app, REST API & Glassmorphism Dashboard
│   ├── db.js                     # PostgreSQL connection pool with auto-reconnect & CRUD
│   └── server.js                 # HTTP server with graceful shutdown handling
├── test/
│   └── app.test.js               # Comprehensive unit & integration test suite (8 tests)
└── k8s/
    ├── postgres-secret.yaml      # Database credentials
    ├── postgres-pvc.yaml         # Persistent storage claim for DB
    ├── postgres-deployment.yaml  # PostgreSQL deployment
    ├── postgres-service.yaml     # Internal ClusterIP for DB
    ├── app-deployment.yaml       # DevOpsFlow Portal deployment with rolling update
    └── app-service.yaml          # NodePort service exposing app on :30080
```

---

## 🚦 Jenkins Pipeline Summary

The included `Jenkinsfile` automates:
1. **🧹 Workspace Setup**: Initializes environment and logs build parameters.
2. **🧪 Lint & Unit Tests**: Executes `npm test` verifying health, API routes, and database operations.
3. **🐳 Build Docker Image**: Builds an immutable Alpine container image tagged with `${BUILD_NUMBER}` and `latest`.
4. **📤 Push to Docker Registry**: Authenticates with Docker Hub and pushes the tags.
5. **☸️ Deploy to Kubernetes**: Replaces image placeholder and executes rolling update with zero downtime.
6. **🔍 Verify Deployment**: Validates pod status, replicas, and service endpoints.

For the full setup instructions, see **[JENKINS_STEP_BY_STEP_GUIDE.md](JENKINS_STEP_BY_STEP_GUIDE.md)**!
