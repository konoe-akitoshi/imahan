FROM node:18-alpine

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    xvfb \
    x11vnc \
    fluxbox

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 8080

# Create startup script
RUN echo '#!/bin/sh\n\
Xvfb :0 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &\n\
fluxbox &\n\
sleep 2\n\
node display.js' > /app/start.sh && chmod +x /app/start.sh

CMD ["sh", "/app/start.sh"]