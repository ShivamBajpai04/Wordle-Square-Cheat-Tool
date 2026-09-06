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

# Copy package files and install dependencies. --omit=dev keeps Puppeteer and
# its bundled Chromium out of the image: scraping runs in CI, never here.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the entire server codebase
COPY . .

# Compile the solver. -O2 is worth having: every /solve spawns a fresh process
# that reloads and filters the whole dictionary.
RUN mkdir -p main && g++ -std=c++17 -O2 -o ./main/code ./code.cpp

# The solver reads words.txt from its working directory, which is /app.
ENV WORDS_FILE=/app/words.txt

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
