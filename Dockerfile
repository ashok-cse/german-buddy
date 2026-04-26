# Production image for EasyPanel / any Docker host (Node adapter).
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
# Path of the waitlist signup log. Mount a persistent volume in EasyPanel at
# /app/data (or override WAITLIST_FILE) so signups survive container redeploys.
ENV WAITLIST_FILE=/app/data/waitlist.jsonl

# Create the non-root runtime user and the writable data directory in one
# layer, then hand both over to that user before the USER switch.
RUN addgroup --system --gid 1001 nodejs \
	&& adduser --system --uid 1001 sveltekit \
	&& mkdir -p /app/data \
	&& touch /app/data/waitlist.jsonl \
	&& chown -R sveltekit:nodejs /app/data \
	&& chmod 775 /app/data \
	&& chmod 664 /app/data/waitlist.jsonl

USER sveltekit

COPY --from=builder --chown=sveltekit:nodejs /app/build ./build
COPY --from=builder --chown=sveltekit:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=sveltekit:nodejs /app/package.json ./package.json

# Declared as a volume so EasyPanel (or any Docker host) can bind a persistent
# volume here without an extra build step. Anything written to /app/data
# (currently just waitlist.jsonl) survives container redeploys when mounted.
VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build"]
