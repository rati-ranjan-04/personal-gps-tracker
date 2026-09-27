FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_MAP_STYLE_URL
ARG VITE_RASTER_TILE_URL
ARG VITE_ROUTER_URL
ENV VITE_MAP_STYLE_URL=$VITE_MAP_STYLE_URL VITE_RASTER_TILE_URL=$VITE_RASTER_TILE_URL VITE_ROUTER_URL=$VITE_ROUTER_URL
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
