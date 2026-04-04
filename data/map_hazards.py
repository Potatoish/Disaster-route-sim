import json
import pyodbc
from shapely.geometry import shape, Point

def convert_noah_to_system_scale(noah_var):
    """
    Kino-convert ang Project NOAH Hazard Level (1-3)
    papunta sa System Hazard Level (1-5) niyo.
    """
    if noah_var == 3: # NOAH High (> 1.5m)
        return 5      # System Extreme Hazard
    elif noah_var == 2: # NOAH Medium (0.5m - 1.5m)
        return 3      # System Moderate Hazard
    elif noah_var == 1: # NOAH Low (< 0.5m)
        return 2      # System Low Hazard
    else:
        return 1      # Safe / No Flood

def update_hazards():
    print("Connecting to database...")
    # Make sure your connection string matches your actual SQL Server setup!
    conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=aco_evacuation;Trusted_Connection=yes;')
    cursor = conn.cursor()

    print("Loading Project NOAH flood map... (This might take a few seconds)")
    try:
        with open('flood_data.json', 'r', encoding='utf-8') as f:
            flood_data = json.load(f)
    except FileNotFoundError:
        print("ERROR: Hindi mahanap ang 'flood_data.json'. Siguraduhing nasa iisang folder ito.")
        return

    # Convert the JSON shapes into mathematical objects we can check
    flood_zones = []
    print("Processing geometries...")
    for feature in flood_data['features']:
        geom = shape(feature['geometry'])
        # Project NOAH usually stores the hazard level in a property called 'Var'
        noah_hazard = feature['properties'].get('Var', 0) 
        flood_zones.append((geom, noah_hazard))

    print("Fetching Pinagbuhatan locations from SQL nodes table...")
    cursor.execute("SELECT id, name, lng, lat FROM nodes")
    nodes = cursor.fetchall()

    print(f"Checking {len(nodes)} locations against NOAH flood zones...\n")
    print("-" * 50)
    
    # Loop through every node and check if it sits inside a flood zone
    for node in nodes:
        node_id, name, lng, lat = node
        
        # Shapely uses (longitude, latitude) for X, Y math
        point = Point(float(lng), float(lat)) 
        raw_noah_level = 0 # Default is 0 (Safe)
        
        # Hanapin kung saang polygon/baha nakapatong ang kalsada
        for geom, hazard in flood_zones:
            if geom.contains(point):
                raw_noah_level = hazard
                break # Found the highest flood zone, stop checking!
        
        # Convert it to your system's 1-5 scale
        final_system_hazard = convert_noah_to_system_scale(raw_noah_level)
                
        print(f"Location: {name}")
        print(f"  -> NOAH Raw Var: {raw_noah_level} | System Hazard Level: {final_system_hazard}")
        
        # THE FIX: Ipasok sa 'flood_hazard' table, hindi sa 'nodes' table
        cursor.execute("SELECT node_id FROM flood_hazard WHERE node_id = ?", (node_id,))
        exists = cursor.fetchone()

        if exists:
            # Update the existing record
            cursor.execute("""
                UPDATE flood_hazard 
                SET hazard_level = ?, rainfall_scenario = '25yr_NOAH' 
                WHERE node_id = ?
            """, (final_system_hazard, node_id))
        else:
            # Insert a brand new record
            cursor.execute("""
                INSERT INTO flood_hazard (node_id, water_level_m, rainfall_scenario, hazard_level) 
                VALUES (?, 0.0, '25yr_NOAH', ?)
            """, (node_id, final_system_hazard))
            
    # Lock in the changes to the database
    conn.commit()
    print("-" * 50)
    print("Database successfully updated with real Project NOAH flood data!")

if __name__ == "__main__":
    update_hazards()