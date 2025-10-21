#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"
#include <unistd.h>
#include <fcntl.h>
#include <sys/ioctl.h>
#include <sstream>
#include <string>
#include <chrono>
#include <linux/spi/spidev.h>
#include <pigpiod_if2.h>
#include "spi_com/msg/strain_gauge.hpp"
#include "spi_com/msg/power_monitor.hpp"
#include "spi_com/msg/motor_controller.hpp"

using namespace std::chrono_literals;

constexpr uint8_t SPI_MODE = 1;          // CPOL=0, CPHA=1
constexpr uint32_t SPI_SPEED = 1000000;  // SPI speed (1 MHz)
constexpr const char* SPI_DEVICE = "/dev/spidev0.0";

#define GPIO_CS1 23
#define GPIO_CS2 24
#define GPIO_CS3 25
#define GPIO_CS4 27 
#define GPIO_CS5 22

class SPINode : public rclcpp::Node {
public:
    SPINode() : Node("spi_node") {

        pi_ = pigpio_start(NULL, NULL);
        if (pi_ < 0) {
            RCLCPP_ERROR(this->get_logger(), "Failed to connect to pigpiod");
            rclcpp::shutdown();
            return;
        } else {
            RCLCPP_INFO(this->get_logger(), "pigpio initialized");
        } 

        set_mode(pi_, GPIO_CS1, PI_OUTPUT);
        set_mode(pi_, GPIO_CS2, PI_OUTPUT);
        set_mode(pi_, GPIO_CS3, PI_OUTPUT);
        set_mode(pi_, GPIO_CS4, PI_OUTPUT);
        set_mode(pi_, GPIO_CS5, PI_OUTPUT);

        gpio_write(pi_, GPIO_CS1, 1);
        gpio_write(pi_, GPIO_CS2, 1);
        gpio_write(pi_, GPIO_CS3, 1);
        gpio_write(pi_, GPIO_CS4, 1);
        gpio_write(pi_, GPIO_CS5, 1);
        
        // Open SPI device
        spi_fd_ = open(SPI_DEVICE, O_RDWR);
        if (spi_fd_ < 0) {
            RCLCPP_ERROR(this->get_logger(), "Failed to open SPI device");
            return;
        }

        // Set SPI mode
        if (ioctl(spi_fd_, SPI_IOC_WR_MODE, &SPI_MODE) < 0) {
            RCLCPP_ERROR(this->get_logger(), "Failed to set SPI mode");
            close(spi_fd_);
            return;
        }

        // Set speed
        if (ioctl(spi_fd_, SPI_IOC_WR_MAX_SPEED_HZ, &SPI_SPEED) < 0) {
            RCLCPP_ERROR(this->get_logger(), "Failed to set SPI max speed");
            close(spi_fd_);
            return;
        }

        RCLCPP_INFO(this->get_logger(), "SPI device initialized");

        mech_pub1_ = this->create_publisher<spi_com::msg::StrainGauge>("strain_gauge_123", 1);
        mech_pub2_ = this->create_publisher<spi_com::msg::StrainGauge>("strain_gauge_456", 1);
        mech_pub3_ = this->create_publisher<spi_com::msg::StrainGauge>("strain_gauge_789", 1);
        power_pub_ = this->create_publisher<spi_com::msg::PowerMonitor>("power_monitor", 1);
        motor_pub_ = this->create_publisher<spi_com::msg::MotorController>("motor_controller", 1);
        timer_ = this->create_wall_timer(std::chrono::microseconds(5000), std::bind(&SPINode::timer_callback, this));
    }

    ~SPINode() {
        if (spi_fd_ >= 0) {
            close(spi_fd_);
        }
        if (pi_ >= 0) {
            pigpio_stop(pi_);
        }
    }

private:
    rclcpp::Publisher<spi_com::msg::StrainGauge>::SharedPtr mech_pub1_;
    rclcpp::Publisher<spi_com::msg::StrainGauge>::SharedPtr mech_pub2_;
    rclcpp::Publisher<spi_com::msg::StrainGauge>::SharedPtr mech_pub3_;
    rclcpp::Publisher<spi_com::msg::PowerMonitor>::SharedPtr power_pub_;
    rclcpp::Publisher<spi_com::msg::MotorController>::SharedPtr motor_pub_;
    int spi_fd_;
    int pi_{-1};
    rclcpp::TimerBase::SharedPtr timer_;
    std::vector<uint8_t> p1 = std::vector<uint8_t>(10, 0x00);
    std::vector<uint8_t> p2 = std::vector<uint8_t>(10, 0x00);
    std::vector<uint8_t> p3 = std::vector<uint8_t>(10, 0x00);
    std::vector<uint8_t> p4 = std::vector<uint8_t>(12, 0x00);
    std::vector<uint8_t> p5 = std::vector<uint8_t>(12, 0x00);

    float unpack_float(uint8_t b0, uint8_t b1, uint8_t b2, uint8_t b3) {
        uint32_t bits = ((uint32_t)b3 << 24) |
                        ((uint32_t)b2 << 16) |
                        ((uint32_t)b1 << 8)  |
                        ((uint32_t)b0);

        float result;
        std::memcpy(&result, &bits, sizeof(result)); // safest, strict-aliasing-compliant
        return result;
    }

    void flushBytes(int chipSelect, int num_bytes)
    {
        std::vector<uint8_t> tx(num_bytes, 0x00);
        std::vector<uint8_t> rx(num_bytes, 0x00);

        gpio_write(pi_, GPIO_CS1, chipSelect == 1 ? 0 : 1);
        gpio_write(pi_, GPIO_CS2, chipSelect == 2 ? 0 : 1);
        gpio_write(pi_, GPIO_CS3, chipSelect == 3 ? 0 : 1);
        gpio_write(pi_, GPIO_CS4, chipSelect == 4 ? 0 : 1);
        gpio_write(pi_, GPIO_CS5, chipSelect == 5 ? 0 : 1);

        struct spi_ioc_transfer flush_transfer = {};
        flush_transfer.tx_buf = reinterpret_cast<unsigned long>(tx.data());
        flush_transfer.rx_buf = reinterpret_cast<unsigned long>(rx.data());
        flush_transfer.len = num_bytes;
        flush_transfer.speed_hz = SPI_SPEED;
        flush_transfer.bits_per_word = 8;

        if (ioctl(spi_fd_, SPI_IOC_MESSAGE(1), &flush_transfer) < 0) {
            RCLCPP_ERROR(this->get_logger(), "SPI flush transfer (%d bytes) failed.", num_bytes);
        }

        gpio_write(pi_, GPIO_CS1, 1);
        gpio_write(pi_, GPIO_CS2, 1);
        gpio_write(pi_, GPIO_CS3, 1);
        gpio_write(pi_, GPIO_CS4, 1);
        gpio_write(pi_, GPIO_CS5, 1);
    }

    std::vector<uint8_t> readData(int chipSelect, int len, uint8_t last_first_byte_)
    {

        gpio_write(pi_, GPIO_CS1, chipSelect == 1 ? 0 : 1);
        gpio_write(pi_, GPIO_CS2, chipSelect == 2 ? 0 : 1);
        gpio_write(pi_, GPIO_CS3, chipSelect == 3 ? 0 : 1);
        gpio_write(pi_, GPIO_CS4, chipSelect == 4 ? 0 : 1);
        gpio_write(pi_, GPIO_CS5, chipSelect == 5 ? 0 : 1);

        std::vector<uint8_t> tx(len, 0x00);  
        std::vector<uint8_t> rx(len, 0x00);  

        // SPI transfer structure   
        struct spi_ioc_transfer transfer = {};
        transfer.tx_buf = reinterpret_cast<unsigned long>(tx.data());
        transfer.rx_buf = reinterpret_cast<unsigned long>(rx.data());
        transfer.len = len;  
        transfer.speed_hz = SPI_SPEED;
        transfer.bits_per_word = 8;

        if (ioctl(spi_fd_, SPI_IOC_MESSAGE(1), &transfer) < 0) {
            RCLCPP_ERROR(this->get_logger(), "SPI transfer failed.");
        }
        
        gpio_write(pi_, GPIO_CS1, 1);
        gpio_write(pi_, GPIO_CS2, 1);
        gpio_write(pi_, GPIO_CS3, 1);
        gpio_write(pi_, GPIO_CS4, 1);
        gpio_write(pi_, GPIO_CS5, 1);

        // RCLCPP_INFO(this->get_logger(), "Received SPI data: ");
        // for (int i = 0; i < 10; ++i)
        // {
        //     RCLCPP_INFO(this->get_logger(), "0x%02X", rx[i]);
        // }

        uint8_t current_first = rx[0];
        int diff = __builtin_popcount(current_first ^ last_first_byte_);
        if (diff > 1 || (current_first == 0x00 && last_first_byte_ != 0x00)) {
            RCLCPP_WARN(this->get_logger(), "Bit difference in first byte too large (diff = %d)", diff);
            flushBytes(chipSelect, len);
            // return std::vector<uint8_t>(len, 0);
        }

        return rx;
    }

    // Timer callback to periodically read from the SPI device
    void timer_callback() {

        // len is 12 for power monitor and mcu, 10 for strain gauge
        p1 = readData(1, 10, p1[0]); 
        p2 = readData(2, 10, p2[0]);
        p3 = readData(3, 10, p3[0]);
        p4 = readData(4, 12, p4[0]);
        p5 = readData(5, 12, p5[0]);

        uint32_t timestamp = 0;
        uint16_t adc1 = 0;
        uint16_t adc2 = 0;
        uint16_t adc3 = 0;
        uint16_t adc4 = 0;
        uint16_t adc5 = 0;
        uint16_t adc6 = 0;
        uint16_t adc7 = 0;
        uint16_t adc8 = 0;
        uint16_t adc9 = 0;
        float current = 0;
        float voltage = 0;
        float throttle = 0;
        float velocity = 0;

        timestamp = (p1[3]) | (p1[2] << 8) | (p1[1] << 16) | (p1[0] << 24);
        adc1 = (p1[5]) | (p1[4] << 8);
        adc2 = (p1[7]) | (p1[6] << 8);
        adc3 = (p1[9]) | (p1[8] << 8);
        auto m1 = spi_com::msg::StrainGauge();
        m1.timestamp = timestamp;
        m1.sensor1 = adc1;
        m1.sensor2 = adc2;
        m1.sensor3 = adc3;
        mech_pub1_->publish(m1);

        timestamp = (p2[3]) | (p2[2] << 8) | (p2[1] << 16) | (p2[0] << 24);
        adc4 = (p2[5]) | (p2[4] << 8);
        adc5 = (p2[7]) | (p2[6] << 8);
        adc6 = (p2[9]) | (p2[8] << 8);
        auto m2 = spi_com::msg::StrainGauge();
        m2.timestamp = timestamp;
        m2.sensor4 = adc4;
        m2.sensor5 = adc5;
        m2.sensor6 = adc6;
        mech_pub2_->publish(m2);

        timestamp = (p3[3]) | (p3[2] << 8) | (p3[1] << 16) | (p3[0] << 24);
        adc7 = (p3[5]) | (p3[4] << 8);
        adc8 = (p3[7]) | (p3[6] << 8);
        adc9 = (p3[9]) | (p3[8] << 8);
        auto m3 = spi_com::msg::StrainGauge();
        m3.timestamp = timestamp;
        m3.sensor7 = adc7;
        m3.sensor8 = adc8;
        m3.sensor9 = adc9;
        mech_pub3_->publish(m3);

        timestamp = (p4[3]) | (p4[2] << 8) | (p4[1] << 16) | (p4[0] << 24);
        current = unpack_float(p4[4], p4[5], p4[6], p4[7]);
        voltage = unpack_float(p4[8], p4[9], p4[10], p4[11]);
        auto m4 = spi_com::msg::PowerMonitor();
        m4.timestamp = timestamp;
        m4.current = current;
        m4.voltage = voltage;
        m4.current = current;
        power_pub_->publish(m4);

        timestamp = (p5[3]) | (p5[2] << 8) | (p5[1] << 16) | (p5[0] << 24);
        throttle = unpack_float(p5[4], p5[5], p5[6], p5[7]);
        velocity = unpack_float(p5[8], p5[9], p5[10], p5[11]);
        auto m5 = spi_com::msg::MotorController();
        m5.timestamp = timestamp;
        m5.throttle = throttle;
        m5.velocity = velocity;
        motor_pub_->publish(m5);

        // RCLCPP_INFO(this->get_logger(), "Received SPI data: %d\t%f\t%f", timestamp1, voltage, current);
        RCLCPP_INFO(this->get_logger(), "Received: ");
        for (int i = 0; i < 13; i++){
            RCLCPP_INFO(this->get_logger(), "0x%02X", p5[i]);
        }
        // RCLCPP_INFO(this->get_logger(), "Timestamp: %u", timestamp);
        // RCLCPP_INFO(this->get_logger(), "ADC4: %u", adc4);  
        // RCLCPP_INFO(this->get_logger(), "ADC5: %u", adc5);  
        // RCLCPP_INFO(this->get_logger(), "ADC6: %u", adc6);  
    }
};

int main(int argc, char ** argv) {
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<SPINode>());
    rclcpp::shutdown();
    return 0;
}
