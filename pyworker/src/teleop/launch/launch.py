from launch import LaunchDescription
from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
import os
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource


def generate_launch_description():
    return LaunchDescription([
	    Node(
            package="joy",
            executable="joy_node",
            name="joy_node",
	    ),

        Node(
            package="teleop",
            executable="joy_interpreter",
            name="joy_interpreter",
        )
    ])