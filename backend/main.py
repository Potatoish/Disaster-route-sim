import networkx as nx
import random
import csv
from datetime import datetime

HAZARD_THRESHOLD = 3
EVAPORATION_RATE = 0.5

def create_graph():
    G = nx.Graph()
    
    locations = [
        "Novo Pinagbuhatan",
        "Kenneth Talipapa",
        "Pinagbuhatan High School",
        "Pinagbuhatan Ferry station",
        "Pinagbuhatan Barangay Hall",
        "2 Centennial Street, Pinagbuhatan"
    ]
    G.add_nodes_from(locations)
    
    edges = [
        ("Novo Pinagbuhatan", "Kenneth Talipapa", 0.6, 3),
        ("Kenneth Talipapa", "Pinagbuhatan Barangay Hall", 0.4, 2),
        ("Pinagbuhatan Barangay Hall", "Pinagbuhatan High School", 0.5, 2),
        ("Pinagbuhatan High School", "Pinagbuhatan Ferry station", 0.7, 5),
        ("Pinagbuhatan Ferry station", "2 Centennial Street, Pinagbuhatan", 0.6, 5),
        ("Pinagbuhatan Barangay Hall", "2 Centennial Street, Pinagbuhatan", 2.5, 2),
        ("Kenneth Talipapa", "Pinagbuhatan Ferry station", 0.9, 5),
        ("Novo Pinagbuhatan", "Pinagbuhatan High School", 1.8, 2),
        ("Kenneth Talipapa", "2 Centennial Street, Pinagbuhatan", 3.0, 2),
        ("Novo Pinagbuhatan", "Pinagbuhatan Barangay Hall", 1.0, 2),
        ("Pinagbuhatan High School", "2 Centennial Street, Pinagbuhatan", 1.5, 3),
        ("Kenneth Talipapa", "Pinagbuhatan High School", 0.8, 2),
        ("Novo Pinagbuhatan", "Pinagbuhatan Ferry station", 2.0, 4)
    ]
    
    for u, v, dist, haz in edges:
        G.add_edge(u, v, distance=dist, hazard=haz, pheromone=1.0)
    
    return G

def reset_pheromones(G):
    for u, v in G.edges():
        G[u][v]['pheromone'] = 1.0

def get_max_hazard(G, path):
    max_haz = 0
    for i in range(len(path) - 1):
        hazard = G[path[i]][path[i+1]]['hazard']
        if hazard > max_haz:
            max_haz = hazard
    return max_haz

class Ant:
    def __init__(self, start, end, G):
        self.start = start
        self.end = end
        self.G = G
        self.path = [start]
        self.visited = {start}
        self.distance = 0
        self.hazard = 0
    
    def build_path(self):
        while self.path[-1] != self.end:
            next_node = self.select_next()
            if next_node is None:
                return False
            self.move_to(next_node)
        return True
    
    def select_next(self):
        current = self.path[-1]
        neighbors = [n for n in self.G.neighbors(current) if n not in self.visited]
        
        if not neighbors:
            return None
        if self.end in neighbors:
            return self.end
        
        safe_neighbors = [n for n in neighbors 
                         if self.G[current][n]['hazard'] <= HAZARD_THRESHOLD]
        candidates = safe_neighbors if safe_neighbors else neighbors
        
        if self.end in candidates:
            return self.end
        
        probs = []
        for neighbor in candidates:
            edge = self.G[current][neighbor]
            pheromone = edge['pheromone']
            heuristic = 1.0 / edge['distance']
            prob = pheromone * (heuristic ** 2)
            probs.append(prob)
        
        total = sum(probs)
        probs = [p / total for p in probs]
        
        return random.choices(candidates, weights=probs)[0]
    
    def move_to(self, next_node):
        current = self.path[-1]
        edge = self.G[current][next_node]
        self.distance += edge['distance']
        self.hazard += edge['hazard']
        self.path.append(next_node)
        self.visited.add(next_node)

def update_pheromones(G, ants):
    for u, v in G.edges():
        G[u][v]['pheromone'] *= (1 - EVAPORATION_RATE)
    
    for ant in ants:
        if ant.path[-1] == ant.end:
            deposit = 100 / ant.distance if ant.distance > 0 else 0
            for i in range(len(ant.path) - 1):
                u, v = ant.path[i], ant.path[i + 1]
                G[u][v]['pheromone'] += deposit

def find_routes(G, start, end, num_routes=20, num_ants=20, iterations=50):
    all_routes = []
    unique_paths = set()
    
    print(f"Searching for routes from {start} to {end}...")
    
    for run in range(num_routes):
        reset_pheromones(G)
        
        for iteration in range(iterations):
            ants = []
            
            for _ in range(num_ants):
                ant = Ant(start, end, G)
                if ant.build_path():
                    ants.append(ant)
                    
                    path_tuple = tuple(ant.path)
                    if path_tuple not in unique_paths:
                        unique_paths.add(path_tuple)
                        all_routes.append({
                            'path': ant.path,
                            'distance': round(ant.distance, 1),
                            'total_hazard': ant.hazard,
                            'max_hazard': get_max_hazard(G, ant.path)
                        })
            
            update_pheromones(G, ants)
    
    print(f"Found {len(all_routes)} unique routes\n")
    
    all_routes.sort(key=lambda x: (x['max_hazard'], x['distance']))
    return all_routes

def classify_routes(routes):
    if not routes:
        return []
    
    # Show at least 3 routes regardless of hazard level
    classified = []
    
    safe = [r for r in routes if r['max_hazard'] <= HAZARD_THRESHOLD]
    unsafe = [r for r in routes if r['max_hazard'] > HAZARD_THRESHOLD]
    
    # Ensure we have at least 3 routes
    if len(safe) >= 3:
        safe[0]['category'] = 'best'
        safe[0]['color'] = 'green'
        classified.append(safe[0])
        
        for route in safe[1:3]:
            route['category'] = 'available'
            route['color'] = 'yellow'
            classified.append(route)
        
        for route in safe[3:]:
            route['category'] = 'available'
            route['color'] = 'yellow'
            classified.append(route)
    
    elif len(safe) == 2:
        safe[0]['category'] = 'best'
        safe[0]['color'] = 'green'
        classified.append(safe[0])
        
        safe[1]['category'] = 'available'
        safe[1]['color'] = 'yellow'
        classified.append(safe[1])
        
        if unsafe:
            unsafe[0]['category'] = 'eliminated'
            unsafe[0]['color'] = 'red'
            classified.append(unsafe[0])
    
    elif len(safe) == 1:
        safe[0]['category'] = 'best'
        safe[0]['color'] = 'green'
        classified.append(safe[0])
        
        for route in unsafe[:2]:
            route['category'] = 'eliminated'
            route['color'] = 'red'
            classified.append(route)
    
    else:
        for i, route in enumerate(unsafe[:3]):
            if i == 0:
                route['category'] = 'best'
                route['color'] = 'green'
            else:
                route['category'] = 'eliminated'
                route['color'] = 'red'
            classified.append(route)
    
    for route in unsafe:
        if route not in classified:
            route['category'] = 'eliminated'
            route['color'] = 'red'
            classified.append(route)
    
    return classified[:10]

def export_csv(routes, start, end, filename=None):
    if filename is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"routes_{timestamp}.csv"
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Route', 'Distance (km)', 'Max Hazard', 'Category', 'Path'])
        
        for i, route in enumerate(routes, 1):
            path_str = ' -> '.join(route['path'])
            writer.writerow([i, route['distance'], route['max_hazard'], 
                           route['category'], path_str])
    
    return filename

def simulate(start, end, hazard_type="Flood"):
    G = create_graph()
    
    # Validate that start and end nodes exist in the graph
    if start not in G.nodes():
        return {
            'error': True,
            'message': f"Start location '{start}' not found in graph",
            'valid_locations': list(G.nodes())
        }
    
    if end not in G.nodes():
        return {
            'error': True,
            'message': f"End location '{end}' not found in graph",
            'valid_locations': list(G.nodes())
        }
    
    if start == end:
        return {
            'error': True,
            'message': "Start and end locations must be different"
        }
    
    # Check if start and end are connected
    if not nx.has_path(G, start, end):
        return {
            'error': True,
            'message': f"No path exists between '{start}' and '{end}'"
        }
    
    routes = find_routes(G, start, end)
    classified = classify_routes(routes)
    
    return {
        'error': False,
        'start': start,
        'end': end,
        'hazard_type': hazard_type,
        'routes': classified
    }

if __name__ == "__main__":
    # Test with hardcoded values
    result = simulate("Novo Pinagbuhatan", "2 Centennial Street, Pinagbuhatan")
    
    if result.get('error'):
        print(f"Error: {result['message']}")
    else:
        print("\nEvacuation Route Simulation")
        print(f"From: {result['start']}")
        print(f"To: {result['end']}")
        print(f"Hazard: {result['hazard_type']}\n")
        
        if not result['routes']:
            print("No routes found!")
        else:
            for i, route in enumerate(result['routes'], 1):
                print(f"Route {i}: {route['distance']} km | Hazard: {route['max_hazard']} | {route['category'].upper()}")
            
            csv_file = export_csv(result['routes'], result['start'], result['end'])
            print(f"\nExported to: {csv_file}")