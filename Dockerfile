# Multi-stage Dockerfile for APEX development and production

# Stage 1: Dependencies
FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Development dependencies
FROM node:24-alpine AS dev-dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 3: Development environment
FROM node:24 AS development
WORKDIR /app

# Install useful development tools
RUN apt-get update && apt-get install -y \
    git \
    vim \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies
COPY --from=dev-dependencies /app/node_modules ./node_modules
COPY . .

# Expose port for potential future web UI
EXPOSE 3000

# Development command
CMD ["npm", "run", "test:watch"]

# Stage 4: Build stage
FROM node:24-alpine AS builder
WORKDIR /app

# Copy everything needed for build
COPY --from=dev-dependencies /app/node_modules ./node_modules
COPY . .

# Build TypeScript if tsconfig exists
RUN if [ -f "tsconfig.json" ]; then npm run build; fi

# Stage 5: Production
FROM node:24-alpine AS production
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S apex && adduser -S apex -u 1001

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/templates ./templates
COPY package*.json ./
COPY README.md LICENSE ./

# Change ownership
RUN chown -R apex:apex /app

# Switch to non-root user
USER apex

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "src/cli/apex.js"]