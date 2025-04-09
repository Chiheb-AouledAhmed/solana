import json

def sum_net_values(json_file_path: str, array_key: str) -> float:
    """
    Reads a JSON file, calculates net values for elements in the specified array, and returns the sum.

    :param json_file_path: Path to the JSON file.
    :param array_key: Key of the array in the JSON file to process.
    :return: Sum of all net values.
    """
    try:
        # Load the JSON file
        with open(json_file_path, 'r') as file:
            data = json.load(file)
        
        # Calculate net values and their sum
        total_net_value = 0
        for item in data:
            # Ensure required keys exist
            if 'buys' in item and 'sells' in item:
                net_value = item['buys'] - item['sells']
                total_net_value += net_value
            else:
                raise ValueError("Each element in the array must have 'buys' and 'sells' keys.")
        
        return total_net_value
    
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error reading JSON file: {e}")
        return 0.0

# Example usage
if __name__ == "__main__":
    # Path to your JSON file
    json_file_path = "token_logs/address_data_sorted_Fuj1qhp4YbE1TkcryGrck7UZqzdY6mAPRPNLBTri6E5m.json"
    
    # Key of the array in your JSON file
    array_key = "addressArray"
    
    # Calculate and print the sum of net values
    result = sum_net_values(json_file_path, array_key)
    print(f"The total sum of net values is: {result}")
