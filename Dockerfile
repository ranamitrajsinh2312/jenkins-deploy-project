# Stage 1: Build & Dependencies
FROM node:20-alpine AS base

# Install curl for docker healthcheck
RUN apk --no-cache add curl

WORKDIR /usr/src/app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source code
COPY src/ ./src/

# Set file permissions for non-root user
RUN chown -R node:node /usr/src/app

# Switch to non-root user for container security
USER node

# Expose default application port
EXPOSE 3000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["node", "src/server.js"]
