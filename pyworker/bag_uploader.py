import rosbag2_py
import rclpy
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message
import json
import sys
import os
import numpy as np
import psycopg2
from psycopg2.extras import execute_batch
import yaml
from datetime import datetime
import time
from sensor_msgs.msg import PointField
import array


DB_HOST = os.getenv("DB_HOST", "db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "mypass")
DB_NAME = os.getenv("DB_NAME", "cat_db")
DB_PORT = int(os.getenv("DB_PORT", 5432))

max_retries = 10
for attempt in range(max_retries):
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            port=DB_PORT,
        )
        print("✅ Connected to Postgres")
        break
    except psycopg2.OperationalError as e:
        print(f"DB not ready (attempt {attempt+1}/{max_retries}): {e}")
        time.sleep(2)
else:
    raise Exception(f"Failed to connect to Postgres after {max_retries} attempts")


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, array.array):
            return list(obj)
        if isinstance(obj, PointField):
            return str(obj)  # or convert to dict manually
        return super().default(obj)


def msg_to_dict(msg):
    if hasattr(msg, "__slots__"):
        return {slot: msg_to_dict(getattr(msg, slot)) for slot in msg.__slots__}
    elif isinstance(msg, (list, tuple)):
        return [msg_to_dict(v) for v in msg]
    elif isinstance(msg, dict):
        return {k: msg_to_dict(v) for k, v in msg.items()}
    else:
        return msg


def bag_to_postgres(bag_path, bag_name, conn, yaml_path=None, batch_size=500):
    # Insert metadata into rosbags table
    cur = conn.cursor()
    yaml_data = None
    if yaml_path and os.path.exists(yaml_path):
        with open(yaml_path, "r") as f:
            yaml_data = yaml.safe_load(f)
    cur.execute(
        "INSERT INTO rosbags (folder_name, yaml_data, created_at) VALUES (%s, %s, %s) ON CONFLICT (folder_name) DO NOTHING;",
        (bag_name, json.dumps(yaml_data) if yaml_data else None, datetime.utcnow())
    )
    conn.commit()
    
    # Now process messages into rosbag_messages
    reader = rosbag2_py.SequentialReader()
    storage_options = rosbag2_py.StorageOptions(uri=bag_path, storage_id="sqlite3")
    converter_options = rosbag2_py.ConverterOptions(
        input_serialization_format="cdr", output_serialization_format="cdr"
    )
    reader.open(storage_options, converter_options)

    topic_types = {}
    for topic_metadata in reader.get_all_topics_and_types():
        topic_types[topic_metadata.name] = get_message(topic_metadata.type)

    batch = []
    total_msgs = 0

    while reader.has_next():
        topic, data, t = reader.read_next()
        msg_type = topic_types[topic]
        msg = deserialize_message(data, msg_type)
        msg_dict = msg_to_dict(msg)
        msg_json = json.dumps(msg_dict, cls=NumpyEncoder)
        batch.append((bag_name, topic, t, msg_json))

        if len(batch) >= batch_size:
            execute_batch(
                cur,
                "INSERT INTO rosbag_messages (bag_name, topic, timestamp, data) VALUES (%s, %s, %s, %s)",
                batch,
            )
            conn.commit()
            total_msgs += len(batch)
            print(f"Inserted {total_msgs} messages...")
            batch.clear()

    if batch:
        execute_batch(
            cur,
            "INSERT INTO rosbag_messages (bag_name, topic, timestamp, data) VALUES (%s, %s, %s, %s)",
            batch,
        )
        conn.commit()
        total_msgs += len(batch)

    print(f"Finished inserting {total_msgs} messages from {bag_name}")
    cur.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python script.py <folder>")
        sys.exit(1)

    folder = sys.argv[1]
    folder_path = os.path.join("uploads-folder", folder)

    db3_file = next((f for f in os.listdir(folder_path) if f.endswith(".db3")), None)
    yaml_file = next((f for f in os.listdir(folder_path) if f.endswith(".yaml")), None)
    if not db3_file:
        print("Error: No .db3 file found in folder")
        sys.exit(1)

    bag_file_path = os.path.join(folder_path, db3_file)
    yaml_file_path = os.path.join(folder_path, yaml_file) if yaml_file else None

    try:
        bag_to_postgres(bag_file_path, folder, conn, yaml_path=yaml_file_path)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()
