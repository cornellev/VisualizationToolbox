cmake_minimum_required(VERSION 3.8)
project(spi_com)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES Clang)
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(rclcpp REQUIRED)
find_package(std_msgs REQUIRED)
find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)

set(msg_files
  "msg/StrainGauge.msg"
  "msg/PowerMonitor.msg"
  "msg/MotorController.msg"
)

rosidl_generate_interfaces(${PROJECT_NAME}
  ${msg_files}
  DEPENDENCIES std_msgs
)

# This includes the necessary I2C headers
include_directories(SYSTEM /usr/include)

add_executable(spi_node src/spi_node.cpp)
ament_target_dependencies(spi_node rclcpp std_msgs)

find_library(PIGPIOD_IF2_LIB pigpiod_if2)
target_link_libraries(spi_node ${PIGPIOD_IF2_LIB})

rosidl_get_typesupport_target(cpp_typesupport_target ${PROJECT_NAME} "rosidl_typesupport_cpp")
target_link_libraries(spi_node ${cpp_typesupport_target})
ament_export_dependencies(rosidl_default_runtime)

# Install the node executable and other resources
install(TARGETS
  spi_node
  DESTINATION lib/${PROJECT_NAME}
)

install(DIRECTORY launch/
  DESTINATION share/${PROJECT_NAME}/launch
)

install(DIRECTORY config/
  DESTINATION share/${PROJECT_NAME}/config
)

ament_package()