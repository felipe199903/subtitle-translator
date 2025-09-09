# Dockerfile específico para Render
FROM node:20-bullseye AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Compile the import script
RUN npx tsc ./scripts/import-tm.ts --outDir ./dist/scripts || true

# Copy static resources
RUN cp src/glossary.json dist/glossary.json || true
RUN cp src/dict.json dist/dict.json || true

# Import translation memory
RUN if [ -f ./tm/memory.csv ]; then \
    if [ -f ./dist/scripts/import-tm.js ]; then \
        TM_DB_PATH=./tm.db node ./dist/scripts/import-tm.js ./tm/memory.csv; \
    else \
        TM_DB_PATH=./tm.db npx ts-node ./scripts/import-tm.ts ./tm/memory.csv; \
    fi \
else \
    echo "No memory.csv found, creating empty database"; \
    touch ./tm.db; \
fi

# Production stage
FROM node:20-bullseye

WORKDIR /usr/src/app

# Copy built application
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/tm.db ./tm.db

# Install production dependencies
RUN npm install --production --no-audit --no-fund

# Create data directory and copy database
RUN mkdir -p /data
COPY --from=builder /usr/src/app/tm.db /data/tm.db

EXPOSE 3000

ENV NODE_ENV=production
ENV TM_DB_PATH=/data/tm.db
ENV DB_PATH=/data/tm.db

CMD ["npm", "start"]
