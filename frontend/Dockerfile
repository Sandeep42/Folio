# Stage 1: build the Vite bundle
FROM node:20-alpine AS build
WORKDIR /ui
COPY package.json ./
RUN npm install
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# Stage 2: serve static files + proxy /api to the backend service
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx_common.conf /etc/nginx/conf.d/folio_common.conf
COPY --from=build /ui/dist /usr/share/nginx/html
EXPOSE 80
