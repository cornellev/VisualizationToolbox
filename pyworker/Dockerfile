FROM ros:humble

RUN apt-get update && apt-get install -y python3-pip python3-colcon-common-extensions \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements.txt first to leverage Docker cache
COPY requirements.txt .

# Upgrade pip and install all Python dependencies
RUN pip3 install --no-cache-dir --upgrade pip
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy rest of the code
COPY . .

CMD ["shiny", "run", "--host", "0.0.0.0", "--port", "8000", "shiny_main.py"]