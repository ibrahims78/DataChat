#!/bin/bash
# Start DataChat — Backend + Frontend concurrently

# Start Express server in background
node server/src/index.js &
SERVER_PID=$!
echo "🚀 Server started (PID: $SERVER_PID) on port 3001"

# Give server time to initialize
sleep 2

# Start Vite dev server (foreground)
cd client && npx vite --port 5000 --host 0.0.0.0

# Cleanup on exit
kill $SERVER_PID 2>/dev/null
