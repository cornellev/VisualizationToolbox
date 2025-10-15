import json

def parse_message(raw, csv_headers=None):
    """
    Normalize input messages into flat {key: value} dicts.
    """
    try:
        data = json.loads(raw)

        # Case 1: JSON already
        if isinstance(data, dict):
            # If it has "_data", it's a CSV string inside JSON
            if "_data" in data:
                values = data["_data"].split(",")
                if csv_headers and len(values) == len(csv_headers):
                    return {
                        h: _maybe_number(v) for h, v in zip(csv_headers, values)
                    }
                return {"raw_data": data["_data"]}

            # Otherwise, flatten and strip underscores
            return _flatten_and_clean(data)

    except json.JSONDecodeError:
        # Case 2: raw CSV line
        values = raw.strip().split(",")
        if csv_headers and len(values) == len(csv_headers):
            return {h: _maybe_number(v) for h, v in zip(csv_headers, values)}
        return {"raw_data": raw}


def _flatten_and_clean(obj, parent_key=""):
    """
    Recursively flatten nested dicts and remove leading underscores.
    """
    items = {}
    for k, v in obj.items():
        clean_key = (parent_key + "_" + k.lstrip("_")).strip("_")
        if isinstance(v, dict):
            items.update(_flatten_and_clean(v, clean_key))
        else:
            items[clean_key] = v
    return items


def _maybe_number(s):
    try:
        return float(s)
    except ValueError:
        return s
