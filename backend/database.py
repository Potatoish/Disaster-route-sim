import pyodbc

# The key to specific SQL Server engine
CONNECTION_STRING = (
    r'DRIVER={SQL Server};'
    r'SERVER=localhost\SQLEXPRESS;'
    r'DATABASE=aco_evacuation;'
    r'Trusted_Connection=yes;'
)

def get_graph_data():
    """Fetches nodes and edges from the SQL database."""
    print("Connecting to SQL Server database...")
    try:
        # Open the door to the database
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()

        # 1. Get all locations (Nodes)
        cursor.execute("SELECT id, name, lat, lng FROM nodes;")
        nodes = cursor.fetchall()

        # 2. Get all roads (Edges) and match them to the location names
        cursor.execute("""
            SELECT n1.name AS source_name, n2.name AS target_name, e.distance_km
            FROM edges e
            JOIN nodes n1 ON e.source_id = n1.id
            JOIN nodes n2 ON e.target_id = n2.id;
        """)
        edges = cursor.fetchall()

        # Close the door
        conn.close()
        return nodes, edges

    except Exception as e:
        print(f"Database connection failed: {e}")
        return [], []

# --- Quick Test ---
# If you run this specific file, it will print your locations to prove it works.
if __name__ == "__main__":
    my_nodes, my_edges = get_graph_data()
    
    if my_nodes:
        print(f"\nSuccess! Pulled {len(my_nodes)} locations and {len(my_edges)} roads.")
        print("Here are your Pasig City locations:")
        for node in my_nodes:
            # node[1] is the name column
            print(f" - {node[1]}")