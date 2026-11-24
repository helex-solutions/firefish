# Firefish — FSH ⇄ FHIR compiler (SUSHI + GoFSH) as a Node service.
#
# Two images from one build, the same split sct-browser uses:
#
#   --target serve  ->  the runnable service             (ghcr.io/helex-solutions/firefish)
#   --target app    ->  a FROM scratch carrier: the tree plus production node_modules under
#                       /bundle/firefish/, no runtime     (ghcr.io/helex-solutions/firefish-app)
#
# The carrier is what the helex-tx suite image copies in (it runs Firefish beside its Java
# services under /firefish/); the runnable image is for running Firefish on its own.
#
# The install runs on the BUILD platform. Every dependency is pure JavaScript, so the tree is
# the same for amd64 and arm64, and installing once natively avoids running npm under qemu for
# the other half of the multi-arch build.
FROM --platform=$BUILDPLATFORM node:22-slim AS deps

WORKDIR /bundle
COPY package*.json ./
RUN npm ci --omit=dev
# test/ and the docs are not part of what runs. .dockerignore keeps node_modules and .git out.
COPY . .
RUN rm -rf test Dockerfile .dockerignore .github \
    && test -f index.js && test -d node_modules/fsh-sushi && test -d node_modules/gofsh

FROM scratch AS app

COPY --from=deps /bundle/ /bundle/firefish/

FROM node:22-slim AS serve

WORKDIR /usr/src/app
COPY --from=deps /bundle/ ./

ENV PORT=3000
EXPOSE 3000
CMD [ "node", "index.js" ]
