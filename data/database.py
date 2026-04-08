import pyodbc

CONNECTION_STRING = (
    r'DRIVER={SQL Server};'
    r'SERVER=localhost\SQLEXPRESS;'
    r'DATABASE=aco_evacuation;'
    r'Trusted_Connection=yes;'
)

def get_locations(barangay=None):
    try:
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()

        if barangay:
            cursor.execute("""
                SELECT name, lat, lng, barangay, node_type
                FROM nodes
                WHERE barangay = ?
                ORDER BY name
            """, (barangay,))
        else:
            cursor.execute("""
                SELECT name, lat, lng, barangay, node_type
                FROM nodes
                ORDER BY barangay, name
            """)

        rows = cursor.fetchall()
        conn.close()

        return [
            {
                "name": row[0],
                "lat": float(row[1]),
                "lng": float(row[2]),
                "barangay": row[3],
                "node_type": row[4]
            }
            for row in rows
        ]

    except Exception as e:
        print(f"Database connection failed: {e}")
        return []


def get_location_by_name(name, barangay=None):
    try:
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()

        if barangay:
            cursor.execute("""
                SELECT name, lat, lng, barangay, node_type
                FROM nodes
                WHERE name = ? AND barangay = ?
            """, (name, barangay))
        else:
            cursor.execute("""
                SELECT name, lat, lng, barangay, node_type
                FROM nodes
                WHERE name = ?
            """, (name,))

        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        return {
            "name": row[0],
            "lat": float(row[1]),
            "lng": float(row[2]),
            "barangay": row[3],
            "node_type": row[4]
        }

    except Exception as e:
        print(f"Database connection failed: {e}")
        return None