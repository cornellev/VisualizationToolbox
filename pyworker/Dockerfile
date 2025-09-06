FROM ros:humble

RUN apt-get update && apt-get install -y python3-pip python3-colcon-common-extensions \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir --upgrade pip \
 && pip3 install --no-cache-dir -r /app/requirements.txt

COPY . /app

CMD ["shiny", "run", "--host", "0.0.0.0", "--port", "8000", "shiny_main.py"]