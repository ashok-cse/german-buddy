#!/usr/bin/env sh
# Launches the Piper TTS HTTP server in the background, then execs the Node
# SvelteKit server in the foreground. tini (set as ENTRYPOINT) reaps Piper
# when the container exits.
set -eu

PIPER_VOICE="${PIPER_VOICE:-de_DE-thorsten-medium}"
PIPER_DATA_DIR="${PIPER_DATA_DIR:-/opt/piper-voices}"
PIPER_HOST="127.0.0.1"
PIPER_PORT="5000"

echo "[entrypoint] starting piper http_server voice=${PIPER_VOICE}" >&2
/opt/piper-venv/bin/python -m piper.http_server \
	-m "${PIPER_VOICE}" \
	--data-dir "${PIPER_DATA_DIR}" \
	--host "${PIPER_HOST}" \
	--port "${PIPER_PORT}" &
PIPER_PID=$!
trap 'kill -TERM ${PIPER_PID} 2>/dev/null || true' EXIT INT TERM

# Best-effort warm-up: wait up to ~5s for piper to bind its port. Node will
# fall back to browser TTS if piper is still down when the first request hits.
i=0
while [ $i -lt 25 ]; do
	if node -e "require('net').createConnection(${PIPER_PORT},'${PIPER_HOST}').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" >/dev/null 2>&1; then
		echo "[entrypoint] piper is up after ${i} probes" >&2
		break
	fi
	i=$((i + 1))
	sleep 0.2
done

exec node build
