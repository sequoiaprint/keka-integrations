# Use Node.js LTS Alpine image for minimal footprint
FROM node:20-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Set working directory
WORKDIR /usr/src/app

# Copy package files and tsconfig before source code
# (separate layer so npm install is cached unless dependencies change)
COPY package*.json tsconfig.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY src ./src

# Compile TypeScript to JavaScript into /dist
RUN npm run build

# Expose the application port
EXPOSE 5080

# Run the compiled JavaScript entry point
CMD ["node", "dist/server.js"]