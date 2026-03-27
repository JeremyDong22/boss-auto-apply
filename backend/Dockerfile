# Boss Auto Apply Backend - Zeabur Deployment
# Bypasses Zeabur's auto-generated npm update step which fails on some base images
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
