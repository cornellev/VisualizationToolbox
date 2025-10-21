#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/joy.hpp"
#include "ackermann_msgs/msg/ackermann_drive.hpp"
#include <cmath>
#include <vector>
#include <pigpiod_if2.h>

float map(float x, float in_min, float in_max, float out_min, float out_max) {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

class GPIONode : public rclcpp::Node{
public: 
    GPIONode() : Node("gpio_node") {
        pi_ = pigpio_start(NULL, NULL);
        if (pi_ < 0) {
            RCLCPP_ERROR(this->get_logger(), "Failed to connect to pigpiod");
            rclcpp::shutdown();
            return;
        } else {
            RCLCPP_INFO(this->get_logger(), "pigpio initialized");
        } 

        set_mode(pi_, 17, PI_OUTPUT);
        set_mode(pi_, 27, PI_OUTPUT);
        set_mode(pi_, 22, PI_OUTPUT);

        rc_sub_ = this->create_subscription<ackermann_msgs::msg::AckermannDrive>("rc_msg", 1, std::bind(&GPIONode::rc_callback, this, std::placeholders::_1));
    }

    ~GPIONode() {
        if (pi_ >= 0) {
            pigpio_stop(pi_);
        }
    }

private:
    int pi_{-1};
    float velocity_ = 0;
    rclcpp::Subscription<ackermann_msgs::msg::AckermannDrive>::SharedPtr rc_sub_;

    void rc_callback(const ackermann_msgs::msg::AckermannDrive::SharedPtr msg) {
        velocity_ = msg->speed;
        int pwm = static_cast<int>(0.5 * 255);
        if (std::abs(velocity_) < 0.1) {
            pwm = 0;
        }
        // int freq = static_cast<int>(map(std::abs(velocity_), 0.0, 1.0, 4000, 20000));
        bool dir = (velocity_ > 0);

        gpio_write(pi_, 19, true);
        gpio_write(pi_, 26, true);

        gpio_write(pi_, 20, dir);
        set_PWM_dutycycle(pi_, 21, pwm);
        int result = set_PWM_frequency(pi_, 21, 4000);
        // int result = set_PWM_frequency(pi_, 21, freq);
        // RCLCPP_INFO(this->get_logger(), "Velocity: %f", velocity_);
        RCLCPP_INFO(this->get_logger(), "Frequency: %d\tPWM: %d", result, pwm);
    }
};

int main(int argc, char* argv[]) {
    rclcpp::init(argc, argv);
    auto node = std::make_shared<GPIONode>();
    rclcpp::spin(node);
    rclcpp::shutdown();
    return 0;
}