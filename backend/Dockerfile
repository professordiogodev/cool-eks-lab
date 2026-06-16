# ╔══════════════════════════════════════════════════════╗
# ║   CloudPilot Backend — Write your Dockerfile!       ║
# ║                                                      ║
# ║  Hints:                                              ║
# ║   • Base image: node:20-slim                         ║
# ║   • Working dir: /app                                ║
# ║   • Install deps: npm ci --omit=dev                  ║
# ║   • App port: 3000                                   ║
# ║   • Start command: ["node", "index.js"]              ║
# ╚══════════════════════════════════════════════════════╝

# 🚀 TODO 1 — Choose your base image
FROM _______________

# 📁 TODO 2 — Set the working directory inside the container
WORKDIR _______________

# Copy dependency manifests first (Docker layer caching trick!)
COPY package*.json ./

# 🔧 TODO 3 — Install production dependencies only
RUN _______________

# Copy the rest of the source code
COPY . .

# 🔌 TODO 4 — Expose the port the API listens on
EXPOSE _______________

# ▶️  TODO 5 — Default command to start the server
CMD _______________
