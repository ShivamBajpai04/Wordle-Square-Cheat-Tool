# Use an official lightweight Debian-based Node.js image
FROM node:lts-bullseye

# Set working directory
WORKDIR /app

# Install necessary dependencies (gcc, g++, python, make)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy the entire server codebase
COPY . .

# Ensure 'main' directory exists
RUN mkdir -p main

# Copy C++ files and compile the solver
COPY ./code.cpp ./main/code.cpp
COPY ./words.txt ./main/words.txt
RUN g++ -std=c++17 -o ./main/code ./main/code.cpp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
