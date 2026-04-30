# Production image for EasyPanel / any Docker host (Node adapter).
#
# Runs two processes inside the container:
#   1. Piper TTS HTTP server (Python, bound to 127.0.0.1:5000) — synthesizes
#      German with the Thorsten medium voice.
#   2. SvelteKit Node server — proxies /api/tts to Piper above.
# See docker-entrypoint.sh for the launch order.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build && npm prune --omit=dev


FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Path of the waitlist signup log. Mount a persistent volume in EasyPanel at
# /app/data (or override WAITLIST_FILE) so signups survive container redeploys.
ENV WAITLIST_FILE=/app/data/waitlist.jsonl
# Local Piper TTS sidecar (started by docker-entrypoint.sh).
ENV PIPER_TTS_URL=http://127.0.0.1:5000
ENV PIPER_VOICE=de_DE-thorsten-medium
ENV PIPER_DATA_DIR=/opt/piper-voices

# System deps + Piper TTS + Thorsten medium voice (~63 MB download).
# Kept as a single layer so the apt + pip caches are dropped before commit.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		python3 python3-venv python3-pip ca-certificates tini \
	&& python3 -m venv /opt/piper-venv \
	&& /opt/piper-venv/bin/pip install --no-cache-dir --upgrade pip \
	&& /opt/piper-venv/bin/pip install --no-cache-dir 'piper-tts[http]' \
	&& mkdir -p "${PIPER_DATA_DIR}" \
	&& /opt/piper-venv/bin/python -m piper.download_voices "${PIPER_VOICE}" \
		--data-dir "${PIPER_DATA_DIR}" \
	&& apt-get purge -y python3-pip \
	&& apt-get autoremove -y \
	&& rm -rf /var/lib/apt/lists/* /root/.cache /tmp/*

# Create the non-root runtime user and the writable data directory in one
# layer, then hand both over to that user before the USER switch.
RUN groupadd --system --gid 1001 nodejs \
	&& useradd --system --uid 1001 --gid nodejs --no-create-home --shell /usr/sbin/nologin sveltekit \
	&& mkdir -p /app/data \
	&& touch /app/data/waitlist.jsonl \
	&& chown -R sveltekit:nodejs /app/data "${PIPER_DATA_DIR}" \
	&& chmod 775 /app/data \
	&& chmod 664 /app/data/waitlist.jsonl

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER sveltekit

COPY --from=builder --chown=sveltekit:nodejs /app/build ./build
COPY --from=builder --chown=sveltekit:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=sveltekit:nodejs /app/package.json ./package.json

# Declared as a volume so EasyPanel (or any Docker host) can bind a persistent
# volume here without an extra build step. Anything written to /app/data
# (currently just waitlist.jsonl) survives container redeploys when mounted.
VOLUME ["/app/data"]

EXPOSE 3000

# tini reaps the Piper child process cleanly when the container stops.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
