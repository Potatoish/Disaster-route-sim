import networkx as nx  # Library para sa graph (nodes at edges)
import random           # Para sa random choices ng mga ants

# ============================================================
# GRAPH SETUP - Mga lugar at daan
# ============================================================

def create_graph():
    G = nx.Graph()  # Gumawa ng bagong graph

    # --- Mga NODES (lugares) ---
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

    # --- Mga EDGES (daan) ---
    # Hazard levels: 1-2 = Safe, 3 = Moderate, 4-5 = Dangerous
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

    return G  # Ibalik ang natapos na graph

# ============================================================
# HAZARD THRESHOLD - Limitasyon ng safety
# ============================================================

HAZARD_THRESHOLD = 3  # Mga daan na may hazard na 4 o 5 ay AALISIN (delikado)
                      # Tanggap lang ang 1, 2, at 3 (safe at moderate)

# ============================================================
# PHEROMONE SETUP - Simula lahat ng daan ay may pantay na pheromone
# ============================================================

def initialize_pheromones(G):
    for u, v in G.edges():          # Loop sa lahat ng edges
        G[u][v]['pheromone'] = 1.0  # Lahat nagsisimula sa 1.0 (pantay)

# ============================================================
# ANT CLASS - Ang bawat "ant" ay maghahanap ng sariling daan
# ============================================================

class Ant:
    def __init__(self, start, end, G):
        self.start = start       # Simula ng ant
        self.end = end           # Patutunguhan ng ant
        self.G = G               # Ang graph na gagamitin
        self.path = [start]      # Listahan ng mga nadaanan (simula sa start)
        self.visited = {start}   # Set ng mga lugar na napuntahan na
        self.total_distance = 0  # Kabuuang distansya ng route
        self.total_hazard = 0    # Kabuuang hazard ng route

    def is_safe_edge(self, u, v):
        """Tingnan kung ang daan ay LIGTAS (hindi lalampas sa threshold)"""
        hazard = self.G[u][v]['hazard']       # Kunin ang hazard level ng daan
        return hazard <= HAZARD_THRESHOLD     # True = ligtas, False = delikado

    def select_next(self):
        """Pumili ng susunod na lugar na pupuntahan"""
        current = self.path[-1]  # Kasalukuyang kinatatayuan ng ant

        # Kunin lahat ng kapitbahay na hindi pa napupuntahan
        neighbors = [n for n in self.G.neighbors(current) if n not in self.visited]

        if not neighbors:
            return None  # Walang pwedeng puntahan, bumalik ng None

        # -------------------------------------------------------
        # SAFETY-FIRST RULE (LEXICOGRAPHIC)
        # Una: Alisin ang mga delikadong daan (hazard 4-5)
        # -------------------------------------------------------
        safe_neighbors = [n for n in neighbors if self.is_safe_edge(current, n)]

        # Kung wala ni isang ligtas na daan, gamitin ang lahat (emergency fallback)
        candidates = safe_neighbors if safe_neighbors else neighbors

        # Kung ang end node ay nandoon sa candidates, pumunta na doon agad
        if self.end in candidates:
            return self.end  # Direktang pumunta sa katapusan

        # -------------------------------------------------------
        # PROBABILITY CALCULATION
        # Batay sa pheromone at distansya (hindi na hazard — nafilter na)
        # -------------------------------------------------------
        probs = []  # Listahan ng probability ng bawat kandidato
        for neighbor in candidates:
            edge = self.G[current][neighbor]          # Kunin ang edge data
            pheromone = edge['pheromone']             # Pheromone value ng daan
            heuristic = 1.0 / edge['distance']        # Mas maikli = mas gusto
            prob = pheromone * (heuristic ** 2)       # Final score
            probs.append(prob)                        # I-save ang score

        total = sum(probs)                            # Total ng lahat ng scores
        probs = [p / total for p in probs]            # I-normalize (0 hanggang 1)

        # Random na pumili batay sa probability (mas mataas = mas madalas mapili)
        return random.choices(candidates, weights=probs)[0]

    def build_path(self):
        """Itayo ang buong route mula start hanggang end"""
        while self.path[-1] != self.end:         # Habang hindi pa nakakarating
            next_node = self.select_next()        # Pumili ng susunod
            if next_node is None:
                return False                      # Bagsak ang ant, walang daan

            current = self.path[-1]               # Kasalukuyang node
            edge = self.G[current][next_node]     # Kunin ang edge data
            self.total_distance += edge['distance']  # Dagdag sa total distansya
            self.total_hazard += edge['hazard']      # Dagdag sa total hazard
            self.path.append(next_node)           # Idagdag sa path
            self.visited.add(next_node)           # Markahan bilang nadaanan

        return True  # Matagumpay na nakarating sa end

# ============================================================
# PHEROMONE UPDATE - I-update pagkatapos ng bawat iteration
# ============================================================

def update_pheromones(G, ants):
    # EVAPORATION: Bawasan ang pheromone ng lahat ng daan
    for u, v in G.edges():
        G[u][v]['pheromone'] *= 0.5  # Mabawasan ng 50% (evaporation)

    # REINFORCEMENT: Dagdagan ang pheromone ng mga daan na ginamit
    for ant in ants:
        if ant.path[-1] == ant.end:  # Kung nakarating ang ant sa end
            # Mas ligtas at mas maikli = mas malaki ang pheromone deposit
            deposit = 100 / ant.total_distance if ant.total_distance > 0 else 0
            for i in range(len(ant.path) - 1):    # Loop sa bawat edge ng path
                u, v = ant.path[i], ant.path[i + 1]  # Dalawang sunod na node
                G[u][v]['pheromone'] += deposit        # Dagdagan ang pheromone

# ============================================================
# METRICS - Kalkulahin ang distansya at hazard ng isang route
# ============================================================

def get_metrics(G, path):
    total_dist = 0    # Total distansya
    total_hazard = 0  # Total hazard

    for i in range(len(path) - 1):              # Loop sa bawat pair ng nodes
        edge = G[path[i]][path[i + 1]]          # Kunin ang edge data
        total_dist += edge['distance']           # Dagdag sa distansya
        total_hazard += edge['hazard']           # Dagdag sa hazard

    avg_hazard = total_hazard / (len(path) - 1) # Average hazard ng buong route
    return total_dist, total_hazard, avg_hazard  # Ibalik ang tatlo

def hazard_label(avg):
    """I-convert ang average hazard number sa label"""
    if avg <= 2:
        return "SAFE ✓"       # Hazard 1-2
    elif avg <= 3:
        return "MODERATE ⚠"   # Hazard 3
    else:
        return "DANGEROUS ✗"  # Hazard 4-5

# ============================================================
# MAIN ACO FUNCTION
# ============================================================

def ant_colony_optimization(G, start, end, num_ants=10, iterations=50):
    initialize_pheromones(G)       # I-reset ang pheromones
    best_path = None               # Pinakamahusay na route
    best_hazard = float('inf')     # Pinakamababang hazard (priority 1)
    best_distance = float('inf')   # Pinakamaikling distansya (priority 2)

    for iteration in range(iterations):   # Ulitin ng 50 beses
        ants = []                          # Listahan ng mga ants ngayong iteration

        for _ in range(num_ants):          # Bawat ant
            ant = Ant(start, end, G)       # Gumawa ng bagong ant
            if ant.build_path():           # Kung nakarating sa end
                ants.append(ant)           # I-save ang ant

                # -----------------------------------------------
                # LEXICOGRAPHIC COMPARISON
                # Una: Mas mababa ang total hazard = mas magaling
                # Pangalawa: Kung pantay ang hazard, mas maikli = mas magaling
                # -----------------------------------------------
                if (ant.total_hazard < best_hazard or
                   (ant.total_hazard == best_hazard and ant.total_distance < best_distance)):
                    best_hazard = ant.total_hazard      # I-update ang best hazard
                    best_distance = ant.total_distance  # I-update ang best distance
                    best_path = ant.path.copy()         # I-save ang best path

        update_pheromones(G, ants)  # I-update ang pheromones pagkatapos ng iteration

        # I-print ang progress tuwing ika-10 iteration
        if best_path and (iteration + 1) % 10 == 0:
            dist, haz, avg = get_metrics(G, best_path)
            print(f"  Iteration {iteration + 1:2d}: Hazard={haz}, Distance={dist:.1f}km, Avg={avg:.1f} ({hazard_label(avg)})")

    return best_path  # Ibalik ang pinakamahusay na route

# ============================================================
# RUN THE SIMULATION
# ============================================================

G = create_graph()  # Gumawa ng graph

# Mga routes na isi-simulate
routes = [
    ("Novo Pinagbuhatan", "Mabuhay Subdivision"),
    ("Kenneth Talipapa", "Sta. Lucia High School")
]

print("=" * 65)
print("   DISASTER MITIGATION ROUTE SIMULATION")
print("   Ant Colony Optimization | Safety-First (Lexicographic)")
print("=" * 65)

for i, (start, end) in enumerate(routes, 1):  # Loop sa bawat route
    print(f"\n  ROUTE {i}: {start} → {end}")
    print("-" * 65)

    best_path = ant_colony_optimization(G, start, end)  # Patakbuhin ang ACO

    if best_path:
        dist, haz, avg = get_metrics(G, best_path)  # Kalkulahin ang metrics

        print(f"\n  OPTIMAL ROUTE:")
        # I-print ang bawat stop ng route
        for j, node in enumerate(best_path):
            if j == 0:
                print(f"    START → {node}")           # Simula
            elif j == len(best_path) - 1:
                print(f"    END   → {node}")            # Katapusan
            else:
                print(f"          → {node}")            # Intermediate stops

        print(f"\n  Total Distance : {dist:.1f} km")
        print(f"  Total Hazard   : {haz}")
        print(f"  Average Hazard : {avg:.1f} ({hazard_label(avg)})")

        # Ipakita kung aling mga daan ang na-filter dahil sa hazard
        print(f"\n  NOTE: Mga daan na may hazard 4-5 ay awtomatikong inalis")
        print(f"        (Ferry station routes at iba pang delikadong daan)")
    else:
        print("  Walang ligtas na route na nahanap!")  # Kung walang route

    print("=" * 65)