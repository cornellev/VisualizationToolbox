FROM ros:humble

# Install Python deps
RUN apt-get update && apt-get install -y python3-pip python3-colcon-common-extensions \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip3 install --no-cache-dir --upgrade pip

# Install FastAPI + Uvicorn
RUN pip3 install --no-cache-dir fastapi uvicorn[standard]

# Set up workspace dir
WORKDIR /app

# Copy code
COPY . /app

# Default command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
