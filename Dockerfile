FROM nginx:1.27-alpine

COPY . /usr/share/nginx/html

RUN rm -rf /usr/share/nginx/html/.git \
    /usr/share/nginx/html/.github \
    /usr/share/nginx/html/dist \
    /usr/share/nginx/html/node_modules \
    /usr/share/nginx/html/scripts

EXPOSE 80
