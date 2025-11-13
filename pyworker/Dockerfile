FROM ros:humble

# Use bash so we can "source" setup scripts
SHELL ["/bin/bash", "-c"]

# Install build tools and ROS 2 deps for custom messages
RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-colcon-common-extensions \
    ros-humble-rosidl-generator-py \
    ros-humble-rosidl-default-generators \
    ros-humble-rosidl-default-runtime \
    ros-humble-std-msgs \
    ros-humble-sensor-msgs \
    ros-humble-ackermann-msgs \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Create ROS 2 workspace
WORKDIR /ros_ws
RUN mkdir -p src

# Copy all your custom ROS 2 packages (i2c_com, serial_com, cev_msgs, etc.)
COPY src/ src/

# Build pigpio from source
RUN git clone https://github.com/joan2937/pigpio.git /tmp/pigpio && \
    cd /tmp/pigpio && make && make install && ldconfig && rm -rf /tmp/pigpio

# Build the workspace
RUN source /opt/ros/humble/setup.bash && colcon build --symlink-install

# Make sure ROS 2 env + Python paths are visible inside container
ENV ROS_DISTRO=humble
ENV PYTHONPATH=/ros_ws/install/i2c_com/lib/python3.10/site-packages:\
/ros_ws/install/serial_com/lib/python3.10/site-packages:\
/ros_ws/install/spi_com/lib/python3.10/site-packages:\
/ros_ws/install/teleop/lib/python3.10/site-packages:${PYTHONPATH:-}
ENV LD_LIBRARY_PATH=/ros_ws/install/lib:${LD_LIBRARY_PATH:-}
ENV PATH=/ros_ws/install/bin:$PATH

# Now switch to your app code
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip pip-tools pipdeptree
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy rest of your app
COPY . .

# Run worker
CMD ["bash", "-c", "source /opt/ros/humble/setup.bash && source /ros_ws/install/setup.bash && uvicorn main:app --host 0.0.0.0 --port 8000"]
