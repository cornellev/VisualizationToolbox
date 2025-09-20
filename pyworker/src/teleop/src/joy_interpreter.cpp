#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/joy.hpp"
#include "ackermann_msgs/msg/ackermann_drive.hpp"
#include <cmath>
#include <vector>

class JoyRead {
public:
    JoyRead(const std::vector<float>& axes, const std::vector<int>& buttons)
        : axes_(axes), buttons_(buttons) {}

    float get_left_trigger() const {
        return 1 - (axes_[2] + 1) / 2;
    }

    float get_right_trigger() const {
        return 1 - (axes_[5] + 1) / 2;
    }

    float get_y_button() const {
        return buttons_[3];
    }

    float get_right_stick_x() const {
        return axes_[3];
    }

private:
    std::vector<float> axes_;
    std::vector<int> buttons_;
};

class JoyInterpreter : public rclcpp::Node {
    public:
        JoyInterpreter() : Node("joy_interpreter") {
            movement_pub_ = this->create_publisher<ackermann_msgs::msg::AckermannDrive>("rc_msg", 1);
            joy_sub_ = this->create_subscription<sensor_msgs::msg::Joy>("joy", 1, std::bind(&JoyInterpreter::joy_callback, this, std::placeholders::_1));

            this->declare_parameter<double>("joy_interpreter/teleop/deadzone", 0.1);
            deadzone_ = this->get_parameter("joy_interpreter/teleop/deadzone").as_double();
        }

    private:
        void joy_callback(const sensor_msgs::msg::Joy::SharedPtr msg) {
            JoyRead gamepad_data(msg->axes, msg->buttons);

            // Calculate turning angle
            float turn = -gamepad_data.get_right_stick_x();
            if (std::abs(turn) < deadzone_) {
                turn = 0.0;
            }

            // Calculate velocity
            float drive = gamepad_data.get_right_trigger() - gamepad_data.get_left_trigger();
            if (std::abs(drive) < deadzone_) {
                drive = 0.0;
            }
            // float drive = gamepad_data.get_y_button() ? .3 : 0.0;

            // Publish AckermannDrive message
            auto ackermann_msg = ackermann_msgs::msg::AckermannDrive();
            ackermann_msg.steering_angle = turn;
            ackermann_msg.speed = drive;
            movement_pub_->publish(ackermann_msg);
            // RCLCPP_INFO(this->get_logger(), "Velocity: %f\tAngle: %f", drive, turn);
        }

        rclcpp::Publisher<ackermann_msgs::msg::AckermannDrive>::SharedPtr movement_pub_;
        rclcpp::Subscription<sensor_msgs::msg::Joy>::SharedPtr joy_sub_;

        double deadzone_;
};

int main(int argc, char* argv[]) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<JoyInterpreter>());
    rclcpp::shutdown();
    return 0;
}