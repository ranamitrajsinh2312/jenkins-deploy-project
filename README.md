# 🚀 CampusJudge & DevOpsFlow: Production CI/CD & Multi-Service AWS Deployment

A battle-tested DevOps implementation demonstrating end-to-end automation, container orchestration, and cloud infrastructure deployment for a multi-service web platform (**CampusJudge**) on **AWS EC2**, automated with **Jenkins CI/CD**, containerized with **Docker & Docker Compose**, and hardened with production Linux configurations.

---

## 📑 Table of Contents

- [Architectural Overview](#-architectural-overview)
- [Infrastructure & Cloud Provisioning](#-infrastructure--cloud-provisioning)
- [Multi-Service Application Stack](#-multi-service-application-stack)
- [CI/CD Pipeline Architecture](#-cicd-pipeline-architecture)
- [Step-by-Step Deployment Guide](#-step-by-step-deployment-guide)
- [Real-World Engineering Challenges & Fixes (Troubleshooting Log)](#-real-world-engineering-challenges--fixes)
- [DevOps Interview Questions & In-Depth Answers](#-devops-interview-questions--answers)
- [Repository Structure](#-repository-structure)

---

## 🏗️ Architectural Overview

```
                                      +------------------------------------+
                                      |          GitHub Repository         |
                                      +-----------------+------------------+
                                                        |
                                                        | Webhook / Push
                                                        v
                                      +------------------------------------+
                                      |           Jenkins Server           |
                                      |   - Lint & Unit Testing (Node.js)  |
                                      |   - Docker Build (Multi-stage)     |
                                      |   - Tag & Push to Docker Hub       |
                                      +-----------------+------------------+
                                                        |
                                                        | Deploy Trigger / SSH
                                                        v
+------------------------------------------------------------------------------------------------------+
| AWS EC2 (Amazon Linux 2023 | t3.micro | 25 GB EBS | 2 GB Swapfile)                                  |
|                                                                                                      |
|   +----------------------------------------------------------------------------------------------+   |
|   | Docker Engine & Docker Compose Network                                                       |   |
|   |                                                                                              |   |
|   |   +-----------------------------+               +-----------------------------+              |   |
|   |   |   Next.js Frontend (App)    |               |   Express REST API (Backend)|              |   |
|   |   |   Port 3000 (Public)        | <===========> |   Port 4000 (Public)        |              |   |
|   |   |   Standalone Output Mode    |  CORS & WS    |   Prisma ORM (Schema: app)  |              |   |
|   |   +-----------------------------+               +--------------+--------------+              |   |
|   |                                                                |                             |   |
|   |                 +----------------------------------------------+--------------------+        |   |
|   |                 |                                              |                    |        |   |
|   |                 v                                              v                    v        |   |
|   |   +-----------------------------+               +----------------------+  +--------------+   |   |
|   |   |      PostgreSQL 15          |               |       Redis 7        |  | Judge0 1.13  |   |   |
|   |   |  - Schema 'public': Judge0  | <===========> |  - Async Bull Queue  |  | Code Sandbox |   |   |
|   |   |  - Schema 'app': Backend    |               |  - Maxmemory LRU     |  | (Privileged) |   |   |
|   |   +-----------------------------+               +----------------------+  +--------------+   |   |
|   +----------------------------------------------------------------------------------------------+   |
+------------------------------------------------------------------------------------------------------+
```

---

## ☁️ Infrastructure & Cloud Provisioning

### 1. AWS EC2 Instance Specs
- **AMI**: Amazon Linux 2023 (`al2023-ami-kernel-6.1-x86_64`)
- **Instance Type**: `t3.micro` (2 vCPUs, 1 GB Physical RAM)
- **Region**: `ap-southeast-2` (Sydney)
- **Storage**: 25 GB General Purpose SSD (`gp3`)

### 2. AWS Security Group Rules
| Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- |
| **SSH** | `22` | My IP / Anywhere | Remote SSH administration & Instance Connect |
| **HTTP** | `80` | `0.0.0.0/0` | Web traffic / Nginx reverse proxy |
| **HTTPS** | `443` | `0.0.0.0/0` | Secure SSL/TLS web traffic |
| **Custom TCP** | `3000` | `0.0.0.0/0` | CampusJudge Next.js Web Frontend |
| **Custom TCP** | `4000` | `0.0.0.0/0` | Express REST API & WebSockets |

### 3. Linux Virtual Memory Optimization (Swapfile)
Running multiple containers (Postgres, Redis, Judge0, Express, Next.js) on a 1 GB RAM `t3.micro` instance triggers the Linux kernel Out-Of-Memory (OOM) Killer. We provisioned a 2 GB dedicated swapfile:
```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 4. Dynamic EBS Storage Expansion
The default 8 GB EBS volume exhausted during large Docker image pulls (`judge0/judge0:1.13.0` alone is ~1.5 GB uncompressed). The volume was dynamically expanded to 25 GB in the AWS console and resized online without rebooting:
```bash
# Grow the GPT partition 1 on the NVMe disk
sudo growpart /dev/nvme0n1 1

# Expand the XFS filesystem online
sudo xfs_growfs /
```

---

## 📦 Multi-Service Application Stack

| Service | Technology | Port | Access | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | Next.js 14, React 18, TailwindCSS | `3000` | Public | Standalone SSR/client UI with Monaco Code Editor |
| **Backend** | Node.js 20, Express, Prisma ORM | `4000` | Public | REST API, Bull queue producer, WebSocket server |
| **Database** | PostgreSQL 15 (Alpine) | `5432` | Internal | Relational database with dual-schema multi-tenancy |
| **Cache/Queue**| Redis 7 (Alpine) | `6379` | Internal | Password-protected Bull task queue broker |
| **Judge Sandbox**| Judge0 v1.13.0 (CE) | `2358` | Internal | Isolated code execution sandbox for 47+ languages |

---

## 🚦 CI/CD Pipeline Architecture

The Jenkins pipeline (`Jenkinsfile`) automates quality assurance, container packaging, and deployment:

1. **🧹 Preparation**: Checks out source code, cleans workspace, verifies dependencies.
2. **🧪 Quality Assurance**: Runs unit & integration test suites (`npm test`).
3. **🐳 Container Build**: Executes Docker multi-stage build using Docker Buildx for lean, secure Alpine images.
4. **🔐 Registry Publishing**: Securely authenticates with Docker Hub using Jenkins secret credentials and Personal Access Tokens (PAT), tagging images with `${BUILD_NUMBER}` and `latest`.
5. **🚀 Deployment**: Triggers rolling updates or redeployment on the target server.

---

## 🛠️ Step-by-Step Deployment Guide

### Step 1: Clone Repository & Setup Secrets
```bash
git clone https://github.com/ranamitrajsinh2312/campus-judge.git
cd campus-judge/backend
bash generate-secrets.sh
```

### Step 2: Configure Environment Variables (`backend/.env`)
Ensure `ALLOWED_ORIGINS` includes your EC2 public IP or domain:
```env
ALLOWED_ORIGINS=http://<YOUR_EC2_IP>:3000,http://localhost:3000
PORT=4000
```

### Step 3: Launch Multi-Service Backend Stack
```bash
sudo /usr/local/bin/docker-compose up -d --build
```

### Step 4: Seed Database
```bash
sudo docker exec -it backend-backend-1 npx tsx prisma/seed.ts
```

### Step 5: Build and Run Frontend
```bash
cd ../frontend
sudo docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://<YOUR_EC2_IP>:4000 \
  --build-arg NEXT_PUBLIC_WS_URL=http://<YOUR_EC2_IP>:4000 \
  -t campusjudge-frontend .

sudo docker run -d \
  --name cj-frontend \
  --restart unless-stopped \
  -p 3000:3000 \
  campusjudge-frontend
```

---

## 🧗 Real-World Engineering Challenges & Fixes

Below are the actual production bugs, edge cases, and architectural hurdles encountered and resolved during this deployment.

### 1. Disk Exhaustion During Image Pull (`no space left on device`)
- **Symptom**: Pulling `judge0/judge0:1.13.0` failed with `write /var/lib/docker/tmp/GetImageBlob...: no space left on device`.
- **Root Cause**: The default AWS EC2 EBS volume was 8 GiB. Combined with Amazon Linux packages, Docker runtime, and base images, disk utilization reached 100%.
- **Solution**:
  1. Modified EBS volume size in AWS Console from 8 GiB to 25 GiB.
  2. Applied online partition growth: `sudo growpart /dev/nvme0n1 1`.
  3. Resized the XFS filesystem on the fly: `sudo xfs_growfs /` (expanded free space from 0 to 21 GB with zero downtime).

### 2. Missing Docker Buildx on Amazon Linux 2023
- **Symptom**: `docker-compose up --build` halted with `compose build requires buildx 0.17.0 or later`.
- **Root Cause**: Amazon Linux 2023's standard `docker` RPM package did not package the standalone `docker-buildx` plugin binary.
- **Solution**: Downloaded the official `docker-buildx` v0.19.3 x86_64 binary and installed it into `/usr/libexec/docker/cli-plugins/docker-buildx` with executable permissions (`chmod +x`).

### 3. Docker Multi-Stage Build Failure (`sh: tsc: not found`)
- **Symptom**: `npm run build` failed in Stage 1 of `Dockerfile` with `exit code 127: sh: tsc: not found`.
- **Root Cause**: The Dockerfile had `RUN npm ci --omit=dev`. In `package.json`, `typescript` and `tsc` were listed under `devDependencies`. Omitting devDependencies meant the compiler was missing.
- **Solution**: Updated the builder stage to `RUN npm ci` so that build tools are present during compilation, then copying only the compiled `dist/` and runtime dependencies to Stage 2.

### 4. Prisma Missing OpenSSL on Alpine Linux
- **Symptom**: Prisma crashed with `Prisma failed to detect the libssl/openssl version to use... Error: Can't write to /app/node_modules/@prisma/engines`.
- **Root Cause**: Alpine Linux uses `musl` libc instead of `glibc` and does not include OpenSSL by default. Furthermore, switching to a non-root user without chowning `/app` prevented Prisma from unpacking its query engine.
- **Solution**: Added `RUN apk add --no-cache openssl libc6-compat` in both builder and runner stages and managed file ownership permissions properly.

### 5. Database Schema Collision & Prisma P3005 Baseline Conflict
- **Symptom**: Container crashed on startup with `Error: P3005: The database schema is not empty. Read more about how to baseline an existing production database`. When forced with `db push`, Prisma warned: `You are about to drop the languages table (89 rows) and schema_migrations (24 rows)`.
- **Root Cause**: Judge0 (built with Ruby on Rails) and CampusJudge (built with Prisma) shared the same PostgreSQL database (`campusjudge`) and default `public` schema. Judge0 populated its 89 languages first, causing Prisma to treat the database as foreign and attempt to wipe Judge0's core tables!
- **Solution**: **PostgreSQL Schema Isolation**.
  - Configured backend's connection string to use an isolated schema: `DATABASE_URL="postgresql://...:5432/campusjudge?schema=app"`.
  - Used `npx prisma db push --skip-generate`.
  - **Result**: Judge0 remains untouched in schema `public` with its 89 language compilers, while CampusJudge cleanly isolates all its models in schema `app`.

### 6. Accidental PostgreSQL Healthcheck Corruption via Regex
- **Symptom**: `dependency failed to start: container backend-postgres-1 is unhealthy`.
- **Root Cause**: A blanket `sed` string replacement intended for `DATABASE_URL` accidentally altered PostgreSQL's healthcheck: `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}?schema=app`. `pg_isready` failed because no database named `campusjudge?schema=app` existed.
- **Solution**: Reverted and reconstructed `docker-compose.yml` with precise service-level separation.

### 7. Next.js Client-Side API Inlining
- **Symptom**: Frontend in browser made requests to `http://localhost:4000` instead of the EC2 public IP.
- **Root Cause**: Next.js bakes `NEXT_PUBLIC_*` variables into client-side JS bundles at **build time**. Because the image was built without build arguments, it fell back to the hardcoded `localhost:4000` default.
- **Solution**: Added `ARG NEXT_PUBLIC_API_URL` and `ENV NEXT_PUBLIC_API_URL` to the builder stage of `frontend/Dockerfile` and passed `--build-arg NEXT_PUBLIC_API_URL=http://<EC2_IP>:4000` during build.

---

## 💼 DevOps Interview Questions & Answers

### 1. General & Linux
**Q1: How do you handle low-memory OOM crashes on small cloud instances (e.g. AWS `t3.micro`)?**
> **Answer**: On instances with limited physical RAM (like `t3.micro` with 1 GB), memory-heavy processes like Docker builds and database engines can trigger the Linux kernel OOM (Out-of-Memory) killer. We mitigate this by:
> 1. Configuring a **Swapfile** (e.g., 2 GB allocated via `dd` / `mkswap` / `swapon` and persisted in `/etc/fstab`).
> 2. Setting container memory limits in `docker-compose.yml` (e.g., Redis `maxmemory 256mb` with `allkeys-lru` eviction).
> 3. Using lightweight Alpine Linux base images to minimize memory footprint.

**Q2: How do you resize an AWS EBS root volume without downtime or restarting the instance?**
> **Answer**:
> 1. Expand the volume in AWS EC2 Console (EBS volumes support online elastic expansion).
> 2. SSH into the instance and verify the block device with `lsblk`.
> 3. Use `growpart /dev/nvme0n1 1` to expand partition 1 into the newly available disk space.
> 4. Expand the filesystem online using `xfs_growfs /` for XFS filesystems, or `resize2fs` for ext4 filesystems.

---

### 2. Docker & Containerization
**Q3: What are the benefits of Docker Multi-Stage builds, and what common pitfalls exist?**
> **Answer**: Multi-stage builds allow separating the **build environment** (which requires heavy SDKs, compilers, TypeScript, headers) from the **runtime environment** (which only requires production artifacts and minimal binaries).
> - **Benefits**: Drastically reduces image size (e.g., from 1 GB down to ~150 MB), eliminates attack surface by omitting build tools, and prevents leaking credentials.
> - **Pitfalls**: Pruning dev dependencies too early (e.g. `npm ci --omit=dev`) breaks TypeScript compilation (`tsc: not found`). Build tools must remain through the compile step, and only production dependencies or compiled artifacts should be copied to the final stage.

**Q4: Why does Alpine Linux sometimes fail with Node.js native add-ons or Prisma engines, and how do you fix it?**
> **Answer**: Alpine uses `musl libc` instead of `glibc`. Precompiled binaries built for Debian/Ubuntu (like Prisma query engines or native C++ modules) require GNU libc compatibility and dynamic libraries like OpenSSL. Installing `apk add --no-cache openssl libc6-compat` provides the necessary shared libraries.

---

### 3. Database & Architecture
**Q5: In a multi-service setup where two services share one PostgreSQL instance, how do you prevent schema collisions?**
> **Answer**: Rather than running multiple database instances (which wastes RAM), we use **PostgreSQL Schemas**. In our project, Judge0 uses the default `public` schema, while CampusJudge connects using `?schema=app`. This completely isolates tables, migrations, and enums, preventing tools like Prisma from detecting or dropping foreign tables.

**Q6: What is the difference between `prisma migrate deploy` and `prisma db push`?**
> **Answer**:
> - `prisma migrate deploy`: Applies pending SQL migration files recorded in `_prisma_migrations`. It strictly requires a consistent baseline and fails with `P3005` if untracked tables exist in the schema.
> - `prisma db push`: Compares `schema.prisma` directly against the database and synchronizes the schema state without maintaining migration history. It is ideal for prototyping and microservices targeting a dedicated schema.

---

### 4. CI/CD & Networking
**Q7: How did you handle CORS between a frontend on port 3000 and backend on port 4000?**
> **Answer**: Since the client's browser makes API requests from the frontend origin to the backend API origin, the browser enforces the Same-Origin Policy (SOP). We configured the backend Express `cors` middleware with an environment-driven whitelist (`ALLOWED_ORIGINS`) containing `http://<EC2_IP>:3000`.

**Q8: How does Jenkins securely build and push Docker images in a pipeline?**
> **Answer**: 
> 1. Jenkins uses the Docker-in-Docker (or host Docker socket `/var/run/docker.sock`) pattern.
> 2. Docker Hub credentials (Username and Personal Access Token) are stored securely in Jenkins Credentials Manager (`withCredentials([usernamePassword(...)])`).
> 3. The pipeline dynamically tags images with the unique `${BUILD_NUMBER}` for traceability and `latest` for production deployment, authenticates via `docker login`, and pushes the image.

---

## 📁 Repository Structure

```
jenkins-deploy-project/
├── README.md                      # Complete project documentation & guide
├── DEPLOYMENT_GUIDE.md            # Architecture & Kubernetes specification
├── JENKINS_STEP_BY_STEP_GUIDE.md  # Detailed Jenkins CI/CD tutorial
├── Jenkinsfile                    # Automated Jenkins Declarative Pipeline
├── Dockerfile                     # Optimized multi-stage production Dockerfile
├── docker-compose.yml             # Multi-container orchestration definition
├── package.json                   # Application dependencies & test scripts
├── src/
│   ├── app.js                     # Express application & REST API
│   ├── db.js                      # PostgreSQL connection pool & queries
│   └── server.js                  # HTTP server & graceful shutdown hooks
├── test/
│   └── app.test.js                # Automated unit & integration tests
└── k8s/                           # Production Kubernetes manifests
    ├── postgres-deployment.yaml
    ├── postgres-service.yaml
    ├── app-deployment.yaml
    └── app-service.yaml
```

---

## 👨‍💻 Author & Contact

**Mitrajsinh Rana**  
*DevOps Engineer (Intern) • CI/CD • Cloud • Containers*  
- **Email**: mitrajsinh.dev@gmail.com  
- **Phone**: +91 8401447354  
- **Location**: Rajkot, Gujarat, India  
- **GitHub**: [github.com/ranamitrajsinh2312](https://github.com/ranamitrajsinh2312)
