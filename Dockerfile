# Firefish — FSH ⇄ FHIR compiler (SUSHI + GoFSH) as a standalone Node service.
# In the combined suite image (docker/tx.Dockerfile) Firefish is copied in and run
# alongside the Java services instead; this Dockerfile is for running it on its own.
FROM node:22-slim

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 3000
CMD [ "node", "index.js" ]
