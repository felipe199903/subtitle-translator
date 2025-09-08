FROM node:20-bullseye AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
WORKDIR /usr/src/app/packages/backend
RUN npm install --include=dev || npm install
RUN npm run build
# Compile the import script so we can run it in the final image without ts-node
RUN npx tsc ./scripts/import-tm.ts --outDir ./dist/scripts || true
# Copy static JSON resources into dist for runtime
RUN cp src/glossary.json dist/glossary.json || true
RUN cp src/dict.json dist/dict.json || true
# COPY the provided memory.csv into the builder; fail the build if it's missing so
# builds are deterministic and require an explicit TM to bake into the image.
COPY packages/backend/tm/memory.csv ./tm/memory.csv
RUN if [ -f ./dist/scripts/import-tm.js ]; then \
			TM_DB_PATH=./tm.db node ./dist/scripts/import-tm.js ./tm/memory.csv; \
		else \
			TM_DB_PATH=./tm.db npx ts-node ./scripts/import-tm.ts ./tm/memory.csv; \
		fi
RUN test -f ./tm.db || (echo "tm.db not created" && exit 1)

FROM node:20-bullseye
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /usr/src/app/packages/backend/package.json ./packages/backend/package.json
# Copy installed node_modules from builder so runtime has dependencies
COPY --from=builder /usr/src/app/packages/backend/tm.db /data/tm.db
COPY packages/backend/entrypoint.sh ./packages/backend/entrypoint.sh
RUN chmod +x ./packages/backend/entrypoint.sh
RUN cd ./packages/backend && npm install --production --no-audit --no-fund || true
EXPOSE 3000
ENV NODE_ENV=production
ENV TM_DB_PATH=/data/tm.db
ENTRYPOINT ["sh","/usr/src/app/packages/backend/entrypoint.sh"]
