#!/bin/bash

# Print Node.js and npm versions
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Install dependencies with legacy peer deps flag
npm install --legacy-peer-deps

# Build the Next.js app
npm run build 