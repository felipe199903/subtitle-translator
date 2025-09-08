#!/bin/sh
set -e
echo "Entrypoint: import TM if present and start server"
# If the runtime volume at /data is empty, seed it from the baked-in tm.db in the image
if [ ! -f /data/tm.db ] && [ -f /usr/src/app/packages/backend/tm.db ]; then
  echo "Seeding /data/tm.db from image baked tm.db"
  mkdir -p /data
  cp /usr/src/app/packages/backend/tm.db /data/tm.db || true
fi
if [ -f /data/memory.csv ]; then
  echo "Found /data/memory.csv, importing to TM..."
  # run the compiled import runner if available, else fallback to original runner if present
  if [ -f /usr/src/app/packages/backend/dist/scripts/import-tm.js ]; then
    node /usr/src/app/packages/backend/dist/scripts/import-tm.js /data/memory.csv || true
  elif [ -f /usr/src/app/packages/backend/scripts/import-tm-runner.js ]; then
    node /usr/src/app/packages/backend/scripts/import-tm-runner.js /data/memory.csv || true
  else
    echo "No import runner available in image"
  fi
else
  echo "No memory.csv found in /data"
fi

echo "Starting API server (index.js)"
node packages/backend/dist/index.js
