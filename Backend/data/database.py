import pyodbc

CONNECTION_STRING = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=PRLY04\\SQLEXPRESS;"
    "DATABASE=disaster_route_sim;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)


def get_connection():
    return pyodbc.connect(CONNECTION_STRING)


def get_graph_data():
    """Fetch nodes and edges from SQL Server."""
    print("Connecting to SQL Server database...")

    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id, name, lat, lng FROM nodes")
        nodes = cursor.fetchall()

        cursor.execute("""
            SELECT
                n1.name AS source_name,
                n2.name AS target_name,
                e.distance_km
            FROM edges e
            JOIN nodes n1 ON e.source_id = n1.id
            JOIN nodes n2 ON e.target_id = n2.id
        """)
        edges = cursor.fetchall()

        conn.close()
        return nodes, edges

    except Exception as e:
        print("Database error:", e)
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