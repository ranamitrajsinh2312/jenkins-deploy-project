pipeline {
    agent any

    environment {
        // Docker Hub username and registry image
        DOCKER_HUB_USER         = 'ranamitrajsinh23'
        IMAGE_NAME              = "${DOCKER_HUB_USER}/jenkins-deploy-project-app"
        IMAGE_TAG               = "${env.BUILD_NUMBER}"
        
        // Jenkins Credentials IDs (configured in Jenkins -> Manage Jenkins -> Credentials)
        DOCKER_CREDENTIALS_ID   = 'dockerhub-credentials'
        KUBECONFIG_CRED_ID      = 'k8s-kubeconfig'
    }

    parameters {
        choice(name: 'ENVIRONMENT', choices: ['dev', 'staging', 'production'], description: 'Target deployment environment')
        booleanParam(name: 'FORCE_DEPLOY', defaultValue: false, description: 'Skip tests and force deployment')
    }

    stages {
        stage('🧹 Workspace Setup') {
            steps {
                echo "🚀 Starting CI/CD Pipeline for Build #${env.BUILD_NUMBER}"
                echo "Target Environment: ${params.ENVIRONMENT}"
                echo "Image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}"
            }
        }

        stage('🧪 Lint & Unit Tests') {
            when {
                expression { return !params.FORCE_DEPLOY }
            }
            steps {
                echo '📦 Installing application dependencies...'
                sh 'npm ci || npm install'

                echo '🔬 Running automated unit, integration, and database API tests...'
                sh 'npm test'
            }
        }

        stage('🐳 Build Docker Image') {
            steps {
                echo "🔨 Building Docker image: ${env.IMAGE_NAME}:${env.IMAGE_TAG} and ${env.IMAGE_NAME}:latest..."
                sh """
                    docker build -t ${env.IMAGE_NAME}:${env.IMAGE_TAG} -t ${env.IMAGE_NAME}:latest .
                """
            }
        }

        stage('📤 Push to Docker Registry') {
            steps {
                echo '🔐 Authenticating with Docker Registry...'
                withCredentials([usernamePassword(
                    credentialsId: env.DOCKER_CREDENTIALS_ID,
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh """
                        echo "\$DOCKER_PASS" | docker login -u "\$DOCKER_USER" --password-stdin
                        echo "🚀 Pushing image tags to Docker Hub..."
                        docker push ${env.IMAGE_NAME}:${env.IMAGE_TAG}
                        docker push ${env.IMAGE_NAME}:latest
                    """
                }
            }
        }

        stage('☸️ Deploy to Kubernetes') {
            steps {
                echo '⚙️ Preparing Kubernetes manifests...'
                sh """
                    # Substitute the image placeholder in k8s deployment manifest
                    sed -i 's|DOCKER_IMAGE_PLACEHOLDER|${env.IMAGE_NAME}:${env.IMAGE_TAG}|g' k8s/app-deployment.yaml
                """

                echo '🚀 Applying Kubernetes manifests (Secrets, PVC, Postgres, App Deployment & Service)...'
                // Uses Jenkins secret file credential with KUBECONFIG
                withCredentials([file(credentialsId: env.KUBECONFIG_CRED_ID, variable: 'KUBECONFIG')]) {
                    sh """
                        # 1. Apply database secret and storage
                        kubectl apply -f k8s/postgres-secret.yaml
                        kubectl apply -f k8s/postgres-pvc.yaml

                        # 2. Deploy PostgreSQL database
                        kubectl apply -f k8s/postgres-deployment.yaml
                        kubectl apply -f k8s/postgres-service.yaml

                        # 3. Deploy DevOpsFlow Web Application
                        kubectl apply -f k8s/app-deployment.yaml
                        kubectl apply -f k8s/app-service.yaml

                        # 4. Wait for zero-downtime rolling update to finish
                        echo "⏳ Waiting for app rollout to finish..."
                        kubectl rollout status deployment/app-deployment --timeout=120s
                    """
                }
            }
        }

        stage('🔍 Verify Deployment') {
            steps {
                withCredentials([file(credentialsId: env.KUBECONFIG_CRED_ID, variable: 'KUBECONFIG')]) {
                    sh """
                        echo "📊 --- Running Pods ---"
                        kubectl get pods -l app=devopsflow-portal
                        kubectl get pods -l app=postgres

                        echo "🌐 --- Exposed Services ---"
                        kubectl get svc app-service postgres-service
                    """
                }
            }
        }
    }

    post {
        always {
            echo "🧹 Cleaning up local artifacts..."
            // Remove local dangling images created during the build if needed
            sh "docker rmi ${env.IMAGE_NAME}:${env.IMAGE_TAG} || true"
        }
        success {
            echo """
            =======================================================
            🎉 DEPLOYMENT SUCCEEDED!
            -------------------------------------------------------
            Build: #${env.BUILD_NUMBER}
            Image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}
            NodePort: Access via http://<node-ip>:30080
            Local Port-Forward: kubectl port-forward svc/app-service 3000:3000
            Health Check: curl http://localhost:3000/health
            =======================================================
            """
        }
        failure {
            echo """
            =======================================================
            ❌ DEPLOYMENT FAILED!
            -------------------------------------------------------
            Please inspect the console output above to identify:
            1. Unit test failures in Stage 'Lint & Unit Tests'
            2. Docker login/push authentication errors
            3. Kubeconfig authentication or Pod scheduling errors
            =======================================================
            """
        }
    }
}
