# Stage 1: Build frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy all files
COPY . .

# Build Next.js frontend
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app ./

EXPOSE 3000

# Start backend server (it can also serve frontend via Next.js)
CMD ["node", "index.js"]