# Pinned by digest so a rebuild months from now produces the same image.
# nginx:1.29-alpine, resolved 2026-08-25.
FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de

# .dockerignore keeps working notes, tests, scripts and package metadata out of
# the web root; this only trims anything a future .dockerignore edit lets slip.
COPY . /usr/share/nginx/html
RUN rm -rf /usr/share/nginx/html/.git \
    /usr/share/nginx/html/.github \
    /usr/share/nginx/html/dist \
    /usr/share/nginx/html/node_modules \
    /usr/share/nginx/html/scripts \
    /usr/share/nginx/html/test \
    && find /usr/share/nginx/html -maxdepth 1 -name '*.md' ! -name 'README.md' -delete \
    && rm -f /usr/share/nginx/html/package.json \
       /usr/share/nginx/html/package-lock.json \
       /usr/share/nginx/html/Dockerfile \
       /usr/share/nginx/html/.dockerignore

COPY docker/default.conf docker/security-headers.conf /etc/nginx/conf.d/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1/index.html || exit 1
