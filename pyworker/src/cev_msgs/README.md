Custom ROS 2 messages for Cornell Electric Vehicles.

SensorCollect.msg
 - float64 : timestamp      [ Message time in s ]
 - float32 : velocity       [ Velocity in m/s]
 - float32 : steering_angle [ Steering angle in radians ]

Trajectory.msg
 - Header     : header       [ Header ]
 - Waypoint[] : waypoints    [ Array of Waypoints ]

Waypoint.msg
 - float32 : x     [ x-coordinate in meters ]
 - float32 : y     [ y-coordinate in meters ]
 - float32 : v     [ velocity in m/s ]
 - float32 : tau   [ steering angle in radians ]
 - float32 : theta [ heading in radians ]
 
Obstacle.msg
 - float64 : x              [ x-coordinate of obstacle center in meters ]
 - float64 : y              [ y-coordinate of obstacle center in meters ]
 - float64 : z              [ z-coordinate of obstacle center in meters ]
 - float64 : max_radius     [ maximum radius of obstacle in meters ]

Obstacles.msg
 - Obstacle[] : obstacles   [ Array of Obstacle(s) ]