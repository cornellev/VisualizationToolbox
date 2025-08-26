import rosbag2_py
import rclpy
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message
import json
import sys
import os

def bag_to_json(bag_path, json_path):
    reader = rosbag2_py.SequentialReader()
    storage_options = rosbag2_py.StorageOptions(uri=bag_path, storage_id='sqlite3')
    converter_options = rosbag2_py.ConverterOptions(
        input_serialization_format='cdr', output_serialization_format='cdr')
    reader.open(storage_options, converter_options)

    topic_types = dict()
    for topic_metadata in reader.get_all_topics_and_types():
        topic_types[topic_metadata.name] = get_message(topic_metadata.type)

    
    all_messages = []
    while reader.has_next():
        (topic, data, t) = reader.read_next()
        msg_type = topic_types[topic]
        msg = deserialize_message(data, msg_type)
        
        msg_dict = {
            'topic': topic,
            'timestamp': t,
            'data': str(msg)
        }
        all_messages.append(msg_dict)
    
    with open(json_path, 'w') as f:
        json.dump(all_messages, f, indent=2)

if __name__ == '__main__':
    folder = sys.argv[1]
    folder_path = os.path.join('uploads-folder', folder)

    db3_file = next((f for f in os.listdir(folder_path) if f.endswith(".db3")), None)
    if not db3_file:
        print("Error: No .db3 file found in folder")
        sys.exit(1)

    bag_file_path = os.path.join(folder_path, db3_file)
    json_file_path = f'saved_data/{folder}.json'

    try:
        bag_to_json(bag_file_path, json_file_path)
    except Exception as e:
        print(f"Error: {e}")