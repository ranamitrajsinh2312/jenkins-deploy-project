# 🚀 End-to-End CI/CD Deployment Guide
### Deploying **DevOpsFlow Portal** (Node.js & PostgreSQL) using Jenkins, Docker, and Kubernetes

> 💡 **Looking specifically for the step-by-step Jenkins setup tutorial?**  
> Check out **[JENKINS_STEP_BY_STEP_GUIDE.md](JENKINS_STEP_BY_STEP_GUIDE.md)** for a direct walkthrough of Jenkins container setup, Docker socket mounting, credentials configuration, pipeline creation, and common troubleshooting fixes.

---

## 📑 Table of Contents
1. [Architecture & Overview](#1-architecture--overview)
2. [Prerequisites & System Requirements](#2-prerequisites--system-requirements)
3. [Project Structure](#3-project-structure)
4. [Phase 1: Local Development & Quick Verification](#phase-1-local-development--quick-verification)
5. [Phase 2: Docker Hub & Registry Setup](#phase-2-docker-hub--registry-setup)
6. [Phase 3: Kubernetes Cluster Setup](#phase-3-kubernetes-cluster-setup)
7. [Phase 4: Jenkins Setup & Configuration](#phase-4-jenkins-setup--configuration)
8. [Phase 5: Configuring the Jenkins Pipeline Job](#phase-5-configuring-the-jenkins-pipeline-job)
9. [Phase 6: Running the Build & Verifying Deployment](#phase-6-running-the-build--verifying-deployment)
10. [Phase 7: Testing Zero-Downtime Rolling Updates](#phase-7-testing-zero-downtime-rolling-updates)
11. [Troubleshooting & Common Gotchas](#troubleshooting--common-gotchas)

---

## 1. Architecture & Overview

This project implements an automated, production-grade **Continuous Integration & Continuous Deployment (CI/CD)** pipeline:

```mermaid
flowchart TD
    subgraph Developer [Developer Machine]
        Code[Code Changes] --> GitRepo[Git Repository (GitHub/GitLab)]
    end

    subgraph CI [Jenkins Server - Continuous Integration]
        GitRepo -->|Webhook / Poll| Jenkins[Jenkins Pipeline]
        Jenkins --> Step1[1. Clean & Setup Workspace]
        Step1 --> Step2[2. Install Dependencies & Run Tests]
        Step2 --> Step3[3. Build Multi-Stage Docker Image]
        Step3 --> Step4[4. Authenticate & Push to Docker Hub]
    end

    subgraph CD [Kubernetes Cluster - Continuous Deployment]
        Step4 --> Step5[5. Kubectl Apply Manifests]
        Step5 --> K8sDeploy[Rolling Update App Deployment]
        
        subgraph ClusterWorkloads [Cluster Pods & Services]
            K8sDeploy --> Pod1[DevOpsFlow Pod 1]
            K8sDeploy --> Pod2[DevOpsFlow Pod 2]
            Pod1 & Pod2 -->|Internal DNS: postgres-service:5432| DB[(PostgreSQL Pod + PVC)]
            Service[NodePort Service :30080] --> Pod1 & Pod2
        end
    end

    subgraph Users [End Users]
        Browser[Web Browser :30080 / :3000] --> Service
    end
```

### Components:
- **Node.js Web Application (`devopsflow-portal`)**: REST API + responsive real-time dashboard displaying host metadata, container hostname/pod, system uptime, and database connection status with round-trip latency.
- **PostgreSQL Database**: Persistent storage for tasks and records, with automated connection retries, auto-migration, and health checking.
- **Docker**: Containerizes the application into an immutable, lightweight Alpine-based image running as a non-root user.
- **Jenkins**: Orchestrates the entire lifecycle (unit tests, Docker image building, pushing to registry, and updating Kubernetes).
- **Kubernetes**: Manages container orchestration, zero-downtime rolling updates, service discovery, persistent volumes, and health monitoring.

---

## 2. Prerequisites & System Requirements

Before starting, ensure you have the following installed on your machine:

| Tool | Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | v18+ or v20+ | Running and testing the application locally |
| **Docker Desktop** | Latest | Running Docker containers and local Kubernetes |
| **Kubernetes (k8s)** | v1.25+ | Minikube, Kind, or Docker Desktop's built-in Kubernetes |
| **kubectl** | Latest | Kubernetes command-line tool |
| **Jenkins** | v2.400+ | CI/CD automation server |
| **Git** | Latest | Source control management |
| **Docker Hub Account** | Free | Public/private container image registry |

---

## 3. Project Structure

```
jenkins-deploy-project/
├── JENKINS_STEP_BY_STEP_GUIDE.md # 🌟 Dedicated Jenkins step-by-step tutorial
├── DEPLOYMENT_GUIDE.md           # Architecture and deployment guide (this file)
├── .env.example                  # Sample environment variables
├── .env                          # Local environment variables
├── .gitignore                    # Files excluded from git
├── .dockerignore                 # Files excluded from Docker build context
├── Dockerfile                    # Production Docker container definition
├── docker-compose.yml            # Local multi-container development (App + Postgres)
├── Jenkinsfile                   # Declarative Jenkins CI/CD pipeline
├── package.json                  # Project dependencies and test scripts
├── src/
│   ├── app.js                    # Express app routes, healthcheck, and UI dashboard
│   ├── db.js                     # PostgreSQL connection pool, auto-reconnect & CRUD
│   └── server.js                 # HTTP listener with graceful shutdown handling
├── test/
│   └── app.test.js               # Automated unit and integration tests (8 tests)
└── k8s/
    ├── postgres-secret.yaml       # Database credentials secret
    ├── postgres-pvc.yaml          # PersistentVolumeClaim for DB storage
    ├── postgres-deployment.yaml   # PostgreSQL Pod deployment
    ├── postgres-service.yaml      # ClusterIP service for internal database access
    ├── app-deployment.yaml        # DevOpsFlow application rolling update deployment
    └── app-service.yaml           # NodePort service exposing app to outside traffic
```

---

## Phase 1: Local Development & Quick Verification

Before automating everything in Jenkins, always verify that your application works locally.

### Method A: Running Locally with Node.js
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run automated tests:
   ```bash
   npm test
   ```
3. Start the application:
   ```bash
   npm start
   ```
4. Open your browser at `http://localhost:3000`. You will see the live dashboard!

---

### Method B: Running with Docker Compose (Full Stack: App + PostgreSQL)
To test the complete containerized stack with zero manual database setup:

1. Launch both containers:
   ```bash
   docker compose up -d --build
   ```
2. Check container status:
   ```bash
   docker compose ps
   ```
3. View application logs:
   ```bash
   docker compose logs -f app
   ```
4. Open your browser:
   - Dashboard: `http://localhost:3000`
   - Health check: `http://localhost:3000/health`
   - Add a task using the dashboard form to verify database write/read persistence!
5. Stop the containers when done:
   ```bash
   docker compose down
   ```

---

## Phase 2: Docker Hub & Registry Setup

Jenkins needs a registry to push the built Docker image so Kubernetes can pull it.

1. Go to [https://hub.docker.com](https://hub.docker.com) and log in.
2. Create a new repository:
   - Name: `devopsflow-portal`
   - Visibility: **Public** (recommended for easy pulling without imagePullSecrets)
3. Create an Access Token (Recommended over your personal password):
   - Go to **Account Settings** -> **Security** -> **New Access Token**.
   - Description: `jenkins-ci-token`
   - Permissions: **Read & Write**
   - Copy and save the generated token securely.

---

## Phase 3: Kubernetes Cluster Setup

You can use **Docker Desktop Kubernetes** or **Minikube**.

### Option A: Using Docker Desktop (Easiest on Windows/Mac)
1. Open Docker Desktop **Settings** (gear icon).
2. Click **Kubernetes** on the left menu.
3. Check **Enable Kubernetes** and click **Apply & restart**.
4. Verify from your terminal:
   ```bash
   kubectl cluster-info
   kubectl get nodes
   ```

### Option B: Using Minikube
1. Start Minikube:
   ```bash
   minikube start --driver=docker
   ```
2. Verify:
   ```bash
   kubectl get nodes
   ```

### Locate Your Kubeconfig File
Jenkins needs your `kubeconfig` file to connect to your Kubernetes cluster.
- On Windows: `C:\Users\<YourUsername>\.kube\config`
- On Linux/macOS: `~/.kube/config`

> [!IMPORTANT]
> **If Jenkins is running inside a Docker container:**
> Inside your `kubeconfig`, the cluster server URL might say `https://127.0.0.1:6443` or `https://localhost:6443`.
> Because `127.0.0.1` inside a Docker container refers to the container itself, change `127.0.0.1` to `host.docker.internal` in a copy of your `kubeconfig` used for Jenkins:
> ```yaml
> server: https://host.docker.internal:6443
> ```

---

## Phase 4: Jenkins Setup & Configuration

For full step-by-step instructions with exact screen navigation, refer to **[JENKINS_STEP_BY_STEP_GUIDE.md](JENKINS_STEP_BY_STEP_GUIDE.md)**.

### Quick Start: Running Jenkins with Docker Access
```bash
docker run -d \
  --name jenkins \
  --restart=always \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v //var/run/docker.sock:/var/run/docker.sock \
  -u root \
  jenkins/jenkins:lts
```

### Install Plugins
Search and install in **Manage Jenkins** -> **Plugins**:
- ✅ **Docker Pipeline**
- ✅ **Kubernetes CLI**
- ✅ **Credentials Binding**
- ✅ **Git**
- ✅ **Pipeline**

### Configure Credentials
- `dockerhub-credentials`: Username with password (or PAT)
- `k8s-kubeconfig`: Secret file (upload `jenkins-kubeconfig.yaml`)

---

## Phase 5: Configuring the Jenkins Pipeline Job

1. Push your project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "feat: complete DevOpsFlow Portal with Jenkins CI/CD"
   git branch -M main
   git remote add origin https://github.com/<your-username>/devops-pipeline-project.git
   git push -u origin main
   ```

2. Open Jenkins -> **New Item**:
   - Item Name: `devopsflow-pipeline`
   - Type: **Pipeline**
   - Click **OK**.

3. In the Job Configuration page:
   - Scroll to **Pipeline**.
   - **Definition**: `Pipeline script from SCM`.
   - **SCM**: `Git`.
   - **Repository URL**: `https://github.com/<your-username>/devops-pipeline-project.git`.
   - **Branch Specifier**: `*/main`.
   - **Script Path**: `Jenkinsfile`.
   - Click **Save**.

4. **Update `Jenkinsfile` with your Docker Hub Username**:
   In `Jenkinsfile`, line 6:
   ```groovy
   DOCKER_HUB_USER = 'yourdockerhubuser' // Replace with your actual username
   ```
   Commit and push this change to your repository.

---

## Phase 6: Running the Build & Verifying Deployment

1. Click **Build Now** (or **Build with Parameters**) on the Jenkins job page.
2. Watch the pipeline execute through each stage:
   - 🧹 **Workspace Setup**: Logs target build details.
   - 🧪 **Lint & Unit Tests**: Runs `npm test` to prevent broken code from shipping.
   - 🐳 **Build Docker Image**: Creates the tagged container image.
   - 📤 **Push to Docker Registry**: Uploads the image to Docker Hub.
   - ☸️ **Deploy to Kubernetes**: Replaces image tag in `app-deployment.yaml` and executes `kubectl apply`.
   - 🔍 **Verify Deployment**: Confirms pods are ready and running.

3. **Verify from the Command Line**:
   ```bash
   kubectl get pods -l app=devopsflow-portal
   kubectl get pods -l app=postgres
   ```

4. **Access the Deployed Application in Your Browser**:
   - **Via NodePort**: `http://localhost:30080`
   - **Via Port Forwarding**:
     ```bash
     kubectl port-forward svc/app-service 3000:3000
     ```
     Then open `http://localhost:3000` in your browser.

---

## Phase 7: Testing Zero-Downtime Rolling Updates

1. In `src/app.js`, bump the version:
   ```javascript
   const APP_VERSION = process.env.APP_VERSION || '2.0.0';
   ```
2. Commit and push:
   ```bash
   git commit -am "chore: release version 2.0.0"
   git push origin main
   ```
3. Run the Jenkins build again.
4. In another terminal, watch Kubernetes perform the rolling update in real-time:
   ```bash
   kubectl get pods -l app=devopsflow-portal -w
   ```
   Zero dropped connections and zero downtime!

---

## Troubleshooting & Common Gotchas

See **[JENKINS_STEP_BY_STEP_GUIDE.md#step-10-troubleshooting--common-gotchas](JENKINS_STEP_BY_STEP_GUIDE.md#step-10-troubleshooting--common-gotchas)** for a complete troubleshooting guide.
