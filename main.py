import networkx as nx
import random

def create_graph():
    G = nx.Graph()
    G.add_node("Novo Pinagbuhatan")
    G.add_node("Kenneth Talipapa")
    G.add_node("Pinagbuhatan High School")
    G.add_node("Pinagbuhatan Ferry station")
    G.add_node("Pinagbuhatan Barangay Hall")
    G.add_node("2 Centinnial Street, Pinagbuhatan")
    G.add_node("Sta. Lucia Barangay Hall")
    G.add_node("St Jude Thaddeus Sta. Lucia")
    G.add_node("Sta. Lucia High School")
    G.add_node("De Castro Elementary School")
    G.add_node("Barangay Sta. Lucia Health Center")
    G.add_node("Mabuhay Subdivision")

    G.add_edge("Novo Pinagbuhatan", "Kenneth Talipapa", distance=0.6, hazard=3)
    G.add_edge("Kenneth Talipapa", "Pinagbuhatan Barangay Hall", distance=0.4, hazard=2)
    G.add_edge("Pinagbuhatan Barangay Hall", "Pinagbuhatan High School", distance=0.5, hazard=2)
    G.add_edge("Pinagbuhatan High School", "Pinagbuhatan Ferry station", distance=0.7, hazard=5)
    G.add_edge("Pinagbuhatan Ferry station", "2 Centinnial Street, Pinagbuhatan", distance=0.6, hazard=5)
    G.add_edge("2 Centinnial Street, Pinagbuhatan", "Sta. Lucia Barangay Hall", distance=1.2, hazard=3)
    G.add_edge("Sta. Lucia Barangay Hall", "Barangay Sta. Lucia Health Center", distance=0.4, hazard=1)
    G.add_edge("Barangay Sta. Lucia Health Center", "St Jude Thaddeus Sta. Lucia", distance=0.3, hazard=1)
    G.add_edge("St Jude Thaddeus Sta. Lucia", "Sta. Lucia High School", distance=0.5, hazard=2)
    G.add_edge("Sta. Lucia High School", "De Castro Elementary School", distance=0.6, hazard=2)
    G.add_edge("De Castro Elementary School", "Mabuhay Subdivision", distance=0.8, hazard=1)
    G.add_edge("Pinagbuhatan Barangay Hall", "2 Centinnial Street, Pinagbuhatan", distance=2.5, hazard=2)
    G.add_edge("Pinagbuhatan High School", "Sta. Lucia Barangay Hall", distance=2.8, hazard=1)
    G.add_edge("Kenneth Talipapa", "Pinagbuhatan Ferry station", distance=0.9, hazard=5)
    G.add_edge("Kenneth Talipapa", "Sta. Lucia Barangay Hall", distance=3.2, hazard=1)
    G.add_edge("Novo Pinagbuhatan", "Pinagbuhatan High School", distance=1.8, hazard=2)

    return G

def calculate_cost(distance, hazard):
    return (0.3 * distance) + (0.7 * hazard)

def initialize_pheromones(G):
    for u, v in G.edges():
        G[u][v]['pheromone'] = 1.0

class Ant:
    def __init__(self, start, end, G):
        self.start = start
        self.end = end
        self.G = G
        self.path = [start]
        self.visited = {start}
        self.total_cost = 0

    def select_next(self):
        current = self.path[-1]
        neighbors = [n for n in self.G.neighbors(current) if n not in self.visited]

        if not neighbors:
            return None
        if self.end in neighbors:
            return self.end

        probs = []
        for neighbor in neighbors:
            edge = self.G[current][neighbor]
            pheromone = edge['pheromone']
            cost = calculate_cost(edge['distance'], edge['hazard'])
            heuristic = 1.0 / cost if cost > 0 else 1.0
            prob = pheromone * (heuristic ** 2)
            probs.append(prob)

        total = sum(probs)
        probs = [p / total for p in probs]
        return random.choices(neighbors, weights=probs)[0]

    def build_path(self):
        while self.path[-1] != self.end:
            next_node = self.select_next()
            if next_node is None:
                return False

            current = self.path[-1]
            edge = self.G[current][next_node]
            self.total_cost += calculate_cost(edge['distance'], edge['hazard'])
            self.path.append(next_node)
            self.visited.add(next_node)
        return True

def update_pheromones(G, ants):
    for u, v in G.edges():
        G[u][v]['pheromone'] *= 0.5

    for ant in ants:
        if len(ant.path) > 1 and ant.path[-1] == ant.end:
            deposit = 100 / ant.total_cost if ant.total_cost > 0 else 0
            for i in range(len(ant.path) - 1):
                u, v = ant.path[i], ant.path[i + 1]
                G[u][v]['pheromone'] += deposit

def get_metrics(G, path):
    total_dist = 0
    total_hazard = 0
    for i in range(len(path) - 1):
        edge = G[path[i]][path[i + 1]]
        total_dist += edge['distance']
        total_hazard += edge['hazard']
    return total_dist, total_hazard

def ant_colony_optimization(G, start, end, num_ants=10, iterations=50):
    initialize_pheromones(G)
    best_path = None
    best_cost = float('inf')

    for iteration in range(iterations):
        ants = []
        for _ in range(num_ants):
            ant = Ant(start, end, G)
            if ant.build_path():
                ants.append(ant)
                if ant.total_cost < best_cost:
                    best_cost = ant.total_cost
                    best_path = ant.path.copy()

        update_pheromones(G, ants)

        if (iteration + 1) % 10 == 0:
            dist, haz = get_metrics(G, best_path)
            print(f"Iteration {iteration + 1}: Cost {best_cost:.2f}, Distance {dist:.1f} km, Hazard {haz}")

    return best_path

G = create_graph()

routes = [
    ("Novo Pinagbuhatan", "Mabuhay Subdivision"),
    ("Kenneth Talipapa", "Sta. Lucia High School")
]

print("\nACO EVACUATION ROUTE (SAFETY FIRST)\n")

for i, (start, end) in enumerate(routes, 1):
    print(f"\nROUTE {i}")
    print(f"Start: {start}")
    print(f"End: {end}\n")

    best_path = ant_colony_optimization(G, start, end, num_ants=10, iterations=50)

    dist, haz = get_metrics(G, best_path)

    print ("")
    print ("optimal route:")
    print(", ".join(best_path))
    print(f"\nDistance: {dist:.1f} km")
    print(f"Hazard Level: {haz}")
    print("\n" + "-" * 70)