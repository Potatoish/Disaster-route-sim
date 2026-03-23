import json
import pyodbc
from shapely.geometry import shape, Point

def update_hazards():
    print("Connecting to database...")
    conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=aco_evacuation;Trusted_Connection=yes;')
    cursor = conn.cursor()

    print("Loading Metro Manila flood map... (This might take a few seconds)")
    # changed this line to look in the exact same folder
    with open('flood_data.json', 'r') as f:
        flood_data = json.load(f)

    # Convert the JSON shapes into mathematical objects we can check
    flood_zones = []
    for feature in flood_data['features']:
        geom = shape(feature['geometry'])
        hazard = feature['properties'].get('Var', 1) 
        flood_zones.append((geom, hazard))

    print("Fetching Pasig locations from SQL...")
    cursor.execute("SELECT id, name, lng, lat FROM nodes")
    nodes = cursor.fetchall()

    print(f"Checking {len(nodes)} locations against flood zones...")
    
    # Loop through every node and check if it sits inside a flood zone
    for node in nodes:
        node_id, name, lng, lat = node
        
        # Shapely uses (longitude, latitude) for X, Y math
        point = Point(float(lng), float(lat)) 
        node_hazard = 1 # Default is 1 (Safe)
        
        for geom, hazard in flood_zones:
            if geom.contains(point):
                node_hazard = hazard
                break # Found the flood zone, stop checking!
                
        print(f"Location: {name} | Hazard Level: {node_hazard}")
        
        # Update the SQL database with the correct hazard level
        cursor.execute("UPDATE nodes SET hazard_level = ? WHERE id = ?", (node_hazard, node_id))
        
    # Lock in the changes to the database
    conn.commit()
    print("Database successfully updated with real flood data!")

if __name__ == "__main__":
    update_hazards()