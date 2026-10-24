#!/usr/bin/env bash
# Share the Orin's model on a public HTTPS address for as long as this script runs.
#
#   ssh -t orin ~/prerak-gateway/start_public.sh            # start (prints the address and key)
#   ssh -t orin ~/prerak-gateway/start_public.sh --new-key  # same, but issue a fresh key first
#
# Internet -> Cloudflare quick tunnel -> gateway.py (key, limits) -> llama.cpp on 127.0.0.1:8000.
# Nothing listens on the LAN. Ctrl-C (or closing the SSH session) stops the tunnel and the gateway, and unloads
# the model unless an `ssh orin_model` session is still using it.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE="llama-granite"
UPSTREAM_PORT=8000
GW_PORT=8090
KEY_FILE="$DIR/api_key"
CLOUDFLARED="$DIR/bin/cloudflared"
# Shared with run_model.sh so neither script unloads the model while the other still needs it.
SESSIONS="${XDG_RUNTIME_DIR:-/tmp}/run_model.sessions"

if [ "${1:-}" = "--new-key" ]; then rm -f "$KEY_FILE"; fi
if [ ! -s "$KEY_FILE" ]; then
  (umask 077 && python3 -c 'import secrets; print("prk_" + secrets.token_urlsafe(32))' > "$KEY_FILE")
fi

if [ ! -x "$CLOUDFLARED" ]; then
  echo "Downloading cloudflared ..."
  mkdir -p "$DIR/bin"
  curl -fsSL -o "$CLOUDFLARED.tmp" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
  chmod +x "$CLOUDFLARED.tmp" && mv "$CLOUDFLARED.tmp" "$CLOUDFLARED"
fi

mkdir -p "$SESSIONS"
touch "${SESSIONS}/$$"
GW_PID="" CF_PID="" TAIL_PID=""

live_sessions() {
  local pid n=0
  for f in "${SESSIONS}"/*; do
    [ -e "$f" ] || continue
    pid=$(basename "$f")
    if kill -0 "$pid" 2>/dev/null; then n=$((n + 1)); else rm -f "$f"; fi
  done
  echo "$n"
}

cleanup() {
  # stdout may already be a dead pipe once the SSH client is gone; don't let an echo abort the cleanup.
  set +e
  trap "" PIPE
  trap - EXIT INT TERM HUP
  for p in $TAIL_PID $CF_PID $GW_PID; do kill "$p" 2>/dev/null; done
  wait 2>/dev/null
  rm -f "${SESSIONS}/$$"
  if [ "$(live_sessions)" -eq 0 ]; then
    echo "Public access closed. Unloading model ..." 2>/dev/null
    sudo -n systemctl stop "$SERVICE" >/dev/null 2>&1
  else
    echo "Public access closed. Model left loaded for the other session." 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM HUP

if ! curl -sf --max-time 2 "http://127.0.0.1:${UPSTREAM_PORT}/health" >/dev/null 2>&1; then
  echo -n "Loading model "
  sudo -n systemctl start "$SERVICE"
  for i in $(seq 1 150); do
    curl -sf --max-time 2 "http://127.0.0.1:${UPSTREAM_PORT}/health" >/dev/null 2>&1 && { echo " ready in ${i}s"; break; }
    [ "$i" -eq 150 ] && { echo " FAILED. Check: journalctl -u $SERVICE -n 50" >&2; exit 1; }
    [ $((i % 5)) -eq 0 ] && echo -n "."
    sleep 1
  done
fi

: > "$DIR/gateway.log"
python3 "$DIR/gateway.py" --port "$GW_PORT" --upstream "http://127.0.0.1:${UPSTREAM_PORT}" --key-file "$KEY_FILE" >> "$DIR/gateway.log" 2>&1 &
GW_PID=$!
for i in $(seq 1 20); do
  curl -sf --max-time 1 "http://127.0.0.1:${GW_PORT}/health" >/dev/null 2>&1 && break
  kill -0 "$GW_PID" 2>/dev/null || { cat "$DIR/gateway.log" >&2; exit 1; }
  sleep 0.5
done

: > "$DIR/cloudflared.log"
"$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:${GW_PORT}" >> "$DIR/cloudflared.log" 2>&1 &
CF_PID=$!
URL=""
for i in $(seq 1 60); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$DIR/cloudflared.log" | head -1 || true)
  [ -n "$URL" ] && break
  kill -0 "$CF_PID" 2>/dev/null || { tail -20 "$DIR/cloudflared.log" >&2; exit 1; }
  sleep 1
done
[ -n "$URL" ] || { echo "Tunnel did not come up. See $DIR/cloudflared.log" >&2; exit 1; }

cat <<EOF

  Public model is ON. Put these in Prerak > Settings:

    API base URL : ${URL}/v1
    API key      : $(cat "$KEY_FILE")

  Share the key privately. The address changes every time this script starts.
  Ctrl-C stops public access and unloads the model.

  Requests (no message content is logged):
EOF

tail -n 0 -f "$DIR/gateway.log" &
TAIL_PID=$!
wait -n "$GW_PID" "$CF_PID" || true
echo "Gateway or tunnel stopped; shutting down." >&2
