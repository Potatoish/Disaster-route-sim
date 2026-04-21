import pyodbc
import time

DB_CONNECT_ATTEMPTS = 2
DB_CONNECT_RETRY_DELAY_SECONDS = 0.35
DB_CONNECT_TIMEOUT_SECONDS = 5

CONNECTION_STRING = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=DESKTOP-THN5GFN\\SQLEXPRESS;" 
    "DATABASE=Disaster_route_Simulationn;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
    f"Connection Timeout={DB_CONNECT_TIMEOUT_SECONDS};"
    #SQL
    #disaster_route_sim - pearl sql server database name
    #PRLY04\\SQLEXPRESS - pearl sql server instance name
    #------------------
    #DESKTOP-THN5GFN\\SQLEXPRESS - jeff sql server instance name
    #Disaster_route_Simulationn- jeff sql server database name
    #------------------
    #SERVER=localhost\\SQLEXPRESS - jess sql server instance name
    #DATABASE=aco_evacuation - jess sql server database name
)

def get_connection():
    last_error = None

    for attempt in range(DB_CONNECT_ATTEMPTS):
        try:
            return pyodbc.connect(CONNECTION_STRING)
        except pyodbc.Error as e:
            last_error = e
            if attempt >= DB_CONNECT_ATTEMPTS - 1:
                raise
            time.sleep(DB_CONNECT_RETRY_DELAY_SECONDS)

    raise last_error


def _fetch_nodes(cursor):
    cursor.execute("""
        SELECT id, name, lat, lng, barangay
        FROM nodes
    """)
    return cursor.fetchall()


def _fetch_edges(cursor):
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
    return cursor.fetchall()


def get_nodes():
    print("Fetching node locations from SQL Server...")

    try:
        conn = get_connection()
        cursor = conn.cursor()
        nodes = _fetch_nodes(cursor)
        conn.close()
        print(f"Fetched {len(nodes)} node location(s).")
        return nodes
    except Exception as e:
        print("Node fetch error:", e)
        return None

def get_graph_data():
    print("Loading graph data from SQL Server...")

    try:
        conn = get_connection()
        cursor = conn.cursor()
        nodes = _fetch_nodes(cursor)
        edges = _fetch_edges(cursor)

        conn.close()
        return nodes, edges

    except Exception as e:
        print("Database error:", e)
        return [], []

def get_location_by_name(name):
    try:
        normalized_name = (name or "").strip()
        if not normalized_name:
            return None

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT TOP 1 id, name, lat, lng, barangay
            FROM nodes
            WHERE LTRIM(RTRIM(name)) = ?
        """, (normalized_name,))

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
