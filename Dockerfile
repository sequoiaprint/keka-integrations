FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Install all deps including dev dependencies (needed for ts-node-dev)
RUN npm install

# Copy source code
COPY . .

EXPOSE 5080

# Run app in dev mode
CMD ["npm", "run", "dev"]
