#!/usr/bin/env bash

# APEX Development Helper Script
# Usage: ./scripts/dev.sh [command]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}ℹ ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
}

# Main commands
case "${1:-help}" in
    setup)
        info "Setting up APEX development environment..."
        
        # Install dependencies
        info "Installing dependencies..."
        npm install
        
        # Build Docker images
        info "Building Docker images..."
        docker-compose build
        
        # Run initial type check
        info "Running TypeScript type check..."
        npm run type-check || warning "TypeScript errors found (this is expected during migration)"
        
        # Run tests
        info "Running tests..."
        npm test
        
        success "Development environment setup complete!"
        ;;
        
    dev)
        check_docker
        info "Starting development environment..."
        docker-compose up apex-dev
        ;;
        
    test)
        info "Running tests..."
        npm test
        ;;
        
    test:docker)
        check_docker
        info "Running tests in Docker..."
        docker-compose run --rm apex-dev npm test
        ;;
        
    type-check)
        info "Running TypeScript type check..."
        npm run type-check
        ;;
        
    lint)
        info "Running linter..."
        npm run lint
        ;;
        
    format)
        info "Formatting code..."
        npm run format
        ;;
        
    build)
        info "Building project..."
        npm run build
        ;;
        
    build:docker)
        check_docker
        info "Building Docker images..."
        docker-compose build
        ;;
        
    cli)
        check_docker
        info "Starting APEX CLI in Docker..."
        docker-compose run --rm apex-cli "${@:2}"
        ;;
        
    clean)
        info "Cleaning up..."
        rm -rf dist coverage node_modules
        docker-compose down -v
        success "Cleanup complete!"
        ;;
        
    help|*)
        echo "APEX Development Helper"
        echo ""
        echo "Usage: ./scripts/dev.sh [command]"
        echo ""
        echo "Commands:"
        echo "  setup          - Set up development environment"
        echo "  dev            - Start development environment (Docker)"
        echo "  test           - Run tests locally"
        echo "  test:docker    - Run tests in Docker"
        echo "  type-check     - Run TypeScript type check"
        echo "  lint           - Run linter"
        echo "  format         - Format code"
        echo "  build          - Build project"
        echo "  build:docker   - Build Docker images"
        echo "  cli [args]     - Run APEX CLI in Docker"
        echo "  clean          - Clean up generated files and Docker volumes"
        echo "  help           - Show this help message"
        ;;
esac