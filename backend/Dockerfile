FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (with legacy peer deps flag for compatibility)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
