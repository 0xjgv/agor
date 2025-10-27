#!/bin/bash
set -e

echo "🎮 Starting Agor Playground..."
echo ""

# Check if this is first run
if [ ! -d ~/.agor ]; then
  echo "📦 First run - initializing Agor..."
  echo ""
  echo "⚠️  SANDBOX MODE: Temporary playground instance"
  echo "   - Data is ephemeral (lost on rebuild)"
  echo "   - Try Agor without setup!"
  echo ""

  # Run agor init with --force (anonymous mode, no prompts)
  agor init --force

  # Create default admin user
  echo "👤 Creating admin user..."
  agor user create-admin

  echo ""
  echo "✅ Initialization complete!"
  echo ""
  echo "📝 Login credentials:"
  echo "   Email:    admin@agor.live"
  echo "   Password: admin"
  echo ""
fi

# Start daemon in background
echo "🔧 Starting daemon on :3030..."
nohup agor daemon start > /tmp/agor-daemon.log 2>&1 &
DAEMON_PID=$!

# Wait for daemon to be ready
echo -n "   Waiting for daemon"
for i in {1..30}; do
  if curl -s http://localhost:3030/health > /dev/null 2>&1; then
    echo " ✅ (PID $DAEMON_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo " ❌"
    echo ""
    echo "Daemon failed to start. Check logs:"
    echo "  tail -f /tmp/agor-daemon.log"
    exit 1
  fi
  echo -n "."
  sleep 1
done

# Start UI in background
echo "🎨 Starting UI on :5173..."

# Detect Codespaces and set daemon URL accordingly
if [ -n "$CODESPACE_NAME" ]; then
  DAEMON_URL="https://${CODESPACE_NAME}-3030.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  echo "   Codespaces detected - daemon URL: $DAEMON_URL"
  export VITE_DAEMON_URL="$DAEMON_URL"
fi

nohup agor ui > /tmp/agor-ui.log 2>&1 &
UI_PID=$!

# Wait for UI to be ready
echo -n "   Waiting for UI"
for i in {1..30}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo " ✅ (PID $UI_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo " ❌"
    echo ""
    echo "UI failed to start. Check logs:"
    echo "  tail -f /tmp/agor-ui.log"
    exit 1
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "🎉 Agor Playground is running!"
echo ""
echo "   Daemon: http://localhost:3030"
echo "   UI: http://localhost:5173"
echo ""
echo "   (Codespaces auto-forwards these ports)"
echo ""
echo "📝 Logs:"
echo "   tail -f /tmp/agor-daemon.log"
echo "   tail -f /tmp/agor-ui.log"
echo ""
echo "🎮 PLAYGROUND MODE"
echo "   - Try Agor without setup"
echo "   - Create sessions, orchestrate AI agents"
echo "   - Installed from npm (agor-live@latest)"
echo ""
echo "🔄 Keeping services running (Ctrl+C to stop)..."
echo ""

# Keep script running
wait
