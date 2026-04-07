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
    print("Connecting to SQL Server database...")

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Fetch nodes
        cursor.execute("""
            SELECT id, name, lat, lng, barangay
            FROM nodes
        """)
        nodes = cursor.fetchall()

        # Fetch edges and derive hazard from connected nodes
        cursor.execute("""
            SELECT
                n1.name AS source_name,
                n2.name AS target_name,
                e.distance_km,
                CASE
                    WHEN fh1.hazard_level IS NULL AND fh2.hazard_level IS NULL THEN 1
                    WHEN fh1.hazard_level IS NULL THEN fh2.hazard_level
                    WHEN fh2.hazard_level IS NULL THEN fh1.hazard_level
                    WHEN fh1.hazard_level >= fh2.hazard_level THEN fh1.hazard_level
                    ELSE fh2.hazard_level
                END AS hazard_level
            FROM edges e
            JOIN nodes n1 ON e.source_id = n1.id
            JOIN nodes n2 ON e.target_id = n2.id
            LEFT JOIN flood_hazard fh1 ON fh1.node_id = n1.id
            LEFT JOIN flood_hazard fh2 ON fh2.node_id = n2.id
        """)
        edges = cursor.fetchall()

        conn.close()
        return nodes, edges

    except Exception as e:
        print("Database error:", e)
        return [], []

def get_hazard_data():
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT node_id, hazard_level
            FROM flood_hazard
        """)
        hazards = cursor.fetchall()

        conn.close()
        return {row[0]: row[1] for row in hazards}

    except Exception as e:
        print("Hazard fetch error:", e)
        return {}

def get_location_by_name(name):
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT TOP 1 id, name, lat, lng, barangay
            FROM nodes
            WHERE name = ?
        """, (name,))

        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        return {
            "id": row[0],
            "name": row[1],
            "lat": float(row[2]),
            "lng": float(row[3]),
            "barangay": row[4]
        }

    except Exception as e:
        print("Location fetch error:", e)
        return None

if __name__ == "__main__":
    my_nodes, my_edges = get_graph_data()

    if my_nodes:
        print(f"\nSuccess! Pulled {len(my_nodes)} locations and {len(my_edges)} roads.")
        print("Here are your locations:")
        for node in my_nodes:
            print(f" - {node[1]}")