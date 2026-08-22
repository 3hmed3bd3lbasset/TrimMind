FROM node:20-alpine

RUN apk add --no-cache bash curl python3 make g++

RUN npm install -g n8n@latest --omit=dev

ENV N8N_PORT=5678
ENV PORT=5678
ENV N8N_PROTOCOL=https
ENV GENERIC_TIMEZONE=Africa/Cairo
ENV TZ=Africa/Cairo
ENV N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false

WORKDIR /data

EXPOSE 5678

CMD ["n8n", "start"]
