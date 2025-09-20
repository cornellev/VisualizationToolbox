#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <linux/i2c-dev.h>
#include <sstream>
#include <string>
#include <chrono>
#include "i2c_com/msg/electrical_state.hpp"

#define ADDR 0x40       
#define REG_CONFIG 0x00     
#define REG_SHUNT_V 0x01    // Shunt voltage register
#define REG_BUS_V 0x02      // Bus voltage register
#define REG_POWER 0x03      // Power register
#define REG_CURRENT 0x04    // Current register

class I2CNode : public rclcpp::Node {
public:
    I2CNode() : Node("i2c_node") {
        publisher_ = this->create_publisher<i2c_com::msg::ElectricalState>("electrical_state", 1);

        i2c_fd_ = open("/dev/i2c-1", O_RDWR);
        if (i2c_fd_ < 0) {
            RCLCPP_ERROR(this->get_logger(), "Failed to open I2C bus");
            return;
        }

        if (ioctl(i2c_fd_, I2C_SLAVE, ADDR) < 0) {
            RCLCPP_ERROR(this->get_logger(), "Failed to select I2C device");
            return;
        }

        configure_ina226();
        timer_ = this->create_wall_timer(std::chrono::milliseconds(10), std::bind(&I2CNode::timer_callback, this));
    }

    ~I2CNode() {
        if (i2c_fd_ >= 0) {
            close(i2c_fd_);
        }
    }

private:
    int i2c_fd_;
    rclcpp::Publisher<i2c_com::msg::ElectricalState>::SharedPtr publisher_;
    rclcpp::TimerBase::SharedPtr timer_;

    void configure_ina226() {
        uint8_t config_data[2] = { 0x00, 0x00 }; 
        if (write(i2c_fd_, config_data, 2) != 2) {
            RCLCPP_ERROR(this->get_logger(), "Failed to configure INA226");
        }
    }

    int16_t read_register(uint8_t reg) {
        uint8_t buffer[2];

        // Send the register address
        if (write(i2c_fd_, &reg, 1) != 1) {
            RCLCPP_ERROR(this->get_logger(), "Failed to send register address");
            return 0;
        }

        // Read the 2 bytes from the register
        if (read(i2c_fd_, buffer, 2) != 2) {
            RCLCPP_ERROR(this->get_logger(), "Failed to read data from register");
            return 0;
        }

        // Combine the 2 bytes into a 16-bit value
        return (int16_t)((buffer[0] << 8) | buffer[1]);
    }

    void timer_callback() {
        int16_t bus_voltage = read_register(REG_BUS_V);
        int16_t shunt_voltage = read_register(REG_SHUNT_V);
        int16_t current = read_register(REG_CURRENT);
        int16_t power = read_register(REG_POWER);

        // convert raw data to actual values 
        float bus_voltage_volts = bus_voltage * 0.00125f;       // 1.25mV per bit
        float shunt_voltage_volts = shunt_voltage * 0.0029797377825f; // 2.5µV per bit
        float current_amperes = current * 0.0001f;              // 100µA per bit
        float power_watts = power * 0.0025f;                    // 2.5mW per bit

        RCLCPP_INFO(this->get_logger(), "Bus Voltage: %.3f V", bus_voltage_volts);

        auto msg = i2c_com::msg::ElectricalState();
        msg.bus_voltage = bus_voltage_volts;
        msg.shunt_voltage = shunt_voltage_volts;
        msg.current = current_amperes;
        msg.power = power_watts;
        publisher_->publish(msg);
    }
};

int main(int argc, char **argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<I2CNode>());
    rclcpp::shutdown();
    return 0;
}
