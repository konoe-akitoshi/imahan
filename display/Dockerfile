FROM node:18-alpine

# Install Firefox ESR and dependencies
RUN apk add --no-cache \
    firefox-esr \
    xvfb \
    ca-certificates \
    ttf-freefont

# Set environment variables
ENV DISPLAY=:99

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 8080

# Create startup script
RUN echo '#!/bin/sh\n\
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &\n\
sleep 3\n\
firefox-esr --display=:99 --kiosk --private-window --no-remote https://www.google.com &\n\
node display.js' > /app/start.sh && chmod +x /app/start.sh

CMD ["sh", "/app/start.sh"]