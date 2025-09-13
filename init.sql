CREATE TABLE rosbag_messages (
    id SERIAL PRIMARY KEY,
    bag_name TEXT NOT NULL,
    topic TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    data JSONB NOT NULL
);

CREATE INDEX idx_rosbag_bag ON rosbag_messages(bag_name);
CREATE INDEX idx_rosbag_time ON rosbag_messages(timestamp);

CREATE TABLE rosbags (
    id SERIAL PRIMARY KEY,
    folder_name TEXT NOT NULL UNIQUE,
    yaml_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
