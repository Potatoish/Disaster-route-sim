from flask import Flask, request, jsonify
from flask_cors import CORS
import math

app = Flask(__name__)
CORS(app)

BARANGAY_DATA = {
    'Pinagbuhatan': {
        'nodes': [
            {'id': 'Novo Pinagbuhatan', 'lat': 14.5631, 'lng': 121.0891, 'haz': 3},
            {'id': 'Kenneth Talipapa', 'lat': 14.5618, 'lng': 121.0912, 'haz': 3},
            {'id': 'Pinagbuhatan High School', 'lat': 14.5592, 'lng': 121.0934, 'haz': 2},
            {'id': 'Pinagbuhatan Ferry Station', 'lat': 14.5578, 'lng': 121.0958, 'haz': 5},
            {'id': 'Pinagbuhatan Barangay Hall', 'lat': 14.5605, 'lng': 121.0923, 'haz': 2},
            {'id': '2 Centennial Street, Pinagbuhatan', 'lat': 14.5598, 'lng': 121.0952, 'haz': 2},
        ],
        'edges': [
            {'from': 'Novo Pinagbuhatan', 'to': 'Kenneth Talipapa', 'haz': 3},
            {'from': 'Kenneth Talipapa', 'to': 'Pinagbuhatan Barangay Hall', 'haz': 2},
            {'from': 'Pinagbuhatan Barangay Hall', 'to': 'Pinagbuhatan High School', 'haz': 2},
            {'from': 'Pinagbuhatan High School', 'to': 'Pinagbuhatan Ferry Station', 'haz': 5},
            {'from': 'Pinagbuhatan Ferry Station', 'to': '2 Centennial Street, Pinagbuhatan', 'haz': 5},
            {'from': 'Pinagbuhatan Barangay Hall', 'to': '2 Centennial Street, Pinagbuhatan', 'haz': 2},
            {'from': 'Kenneth Talipapa', 'to': 'Pinagbuhatan Ferry Station', 'haz': 5},
            {'from': 'Novo Pinagbuhatan', 'to': 'Pinagbuhatan High School', 'haz': 2},
        ]
    },
    'Sta. Lucia': {
        'nodes': [
            {'id': 'Sta. Lucia Barangay Hall', 'lat': 14.5601, 'lng': 121.0978, 'haz': 2},
            {'id': 'St Jude Thaddeus, Sta. Lucia', 'lat': 14.5582, 'lng': 121.0995, 'haz': 1},
            {'id': 'Sta. Lucia High School', 'lat': 14.5571, 'lng': 121.0998, 'haz': 2},
            {'id': 'De Castro Elementary School', 'lat': 14.5563, 'lng': 121.1012, 'haz': 2},
            {'id': 'Barangay Sta. Lucia Health Center', 'lat': 14.5589, 'lng': 121.0980, 'haz': 1},
            {'id': 'Mabuhay Subdivision', 'lat': 14.5555, 'lng': 121.1028, 'haz': 1},
        ],
        'edges': [
            {'from': 'Sta. Lucia Barangay Hall', 'to': 'Barangay Sta. Lucia Health Center', 'haz': 1},
            {'from': 'Barangay Sta. Lucia Health Center', 'to': 'St Jude Thaddeus, Sta. Lucia', 'haz': 1},
            {'from': 'St Jude Thaddeus, Sta. Lucia', 'to': 'Sta. Lucia High School', 'haz': 2},
            {'from': 'Sta. Lucia High School', 'to': 'De Castro Elementary School', 'haz': 2},
            {'from': 'De Castro Elementary School', 'to': 'Mabuhay Subdivision', 'haz': 1},
            {'from': 'Sta. Lucia Barangay Hall', 'to': 'Sta. Lucia High School', 'haz': 2},
            {'from': 'Barangay Sta. Lucia Health Center', 'to': 'Mabuhay Subdivision', 'haz': 1},
        ]
    }
}

SAFE_THRESHOLD = 3


def get_node_by_id(barangay, node_id):
    for node in BARANGAY_DATA[barangay]['nodes']:
        if node['id'] == node_id:
            return node
    return None


def get_barangay_of_node(node_id):
    for barangay, data in BARANGAY_DATA.items():
        if any(node['id'] == node_id for node in data['nodes']):
            return barangay
    return None


def build_graph(barangay):
    graph = {}
    data = BARANGAY_DATA[barangay]

    for node in data['nodes']:
        graph[node['id']] = []

    for edge in data['edges']:
        graph[edge['from']].append({
            'to': edge['to'],
            'haz': edge['haz']
        })
        graph[edge['to']].append({
            'to': edge['from'],
            'haz': edge['haz']
        })

    return graph


def get_edge_info(barangay, node_a, node_b):
    for edge in BARANGAY_DATA[barangay]['edges']:
        if (
            (edge['from'] == node_a and edge['to'] == node_b) or
            (edge['from'] == node_b and edge['to'] == node_a)
        ):
            return edge
    return None


def get_distance(node1, node2):
    r = 6371
    lat1, lng1 = math.radians(node1['lat']), math.radians(node1['lng'])
    lat2, lng2 = math.radians(node2['lat']), math.radians(node2['lng'])

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return r * c


def find_all_paths(graph, start, end, max_depth=10):
    paths = []

    def dfs(current, target, path, visited):
        if len(path) > max_depth:
            return

        if current == target:
            paths.append(path[:])
            return

        for neighbor in graph.get(current, []):
            nxt = neighbor['to']
            if nxt not in visited:
                visited.add(nxt)
                path.append(nxt)
                dfs(nxt, target, path, visited)
                path.pop()
                visited.remove(nxt)

    dfs(start, end, [start], {start})
    return paths


def evaluate_path(path, barangay):
    if len(path) < 2:
        return {
            'distance': 0,
            'max_hazard': 0,
            'total_hazard': 0,
            'segments': 0
        }

    total_distance = 0
    max_hazard = 0
    total_hazard = 0
    segments = len(path) - 1

    for i in range(len(path) - 1):
        node_a = get_node_by_id(barangay, path[i])
        node_b = get_node_by_id(barangay, path[i + 1])
        edge = get_edge_info(barangay, path[i], path[i + 1])

        if not node_a or not node_b or not edge:
            continue

        total_distance += get_distance(node_a, node_b)

        edge_hazard = edge['haz']
        max_hazard = max(max_hazard, edge_hazard)
        total_hazard += edge_hazard

    return {
        'distance': round(total_distance, 2),
        'max_hazard': max_hazard,
        'total_hazard': total_hazard,
        'segments': segments
    }


def rank_routes(routes):
    return sorted(
        routes,
        key=lambda r: (
            r['max_hazard'],
            r['total_hazard'],
            r['distance'],
            r['segments']
        )
    )


def categorize_routes(routes):
    ranked = rank_routes(routes)

    categorized = []
    best_assigned = False

    for route in ranked:
        route_copy = route.copy()

        if route_copy['max_hazard'] > SAFE_THRESHOLD:
            route_copy['category'] = 'eliminated'
        elif not best_assigned:
            route_copy['category'] = 'best'
            best_assigned = True
        else:
            route_copy['category'] = 'available'

        categorized.append(route_copy)

    return categorized


@app.route('/', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/simulate', methods=['POST'])
def simulate():
    try:
        data = request.get_json() or {}

        start = data.get('start')
        end = data.get('end')
        hazard_type = data.get('hazard_type', 'Flood')

        if not start or not end:
            return jsonify({'error': 'Start and end nodes are required.'}), 400

        if start == end:
            return jsonify({'error': 'Start and end nodes must be different.'}), 400

        start_barangay = get_barangay_of_node(start)
        end_barangay = get_barangay_of_node(end)

        if not start_barangay or not end_barangay:
            return jsonify({'error': 'Invalid node selection.'}), 400

        if start_barangay != end_barangay:
            return jsonify({'error': 'Start and end nodes must belong to the same barangay.'}), 400

        barangay = start_barangay
        graph = build_graph(barangay)
        paths = find_all_paths(graph, start, end)

        if not paths:
            return jsonify({'error': 'No path found.'}), 404

        routes = []
        for path in paths:
            metrics = evaluate_path(path, barangay)
            routes.append({
                'path': path,
                'distance': metrics['distance'],
                'max_hazard': metrics['max_hazard'],
                'total_hazard': metrics['total_hazard'],
                'segments': metrics['segments']
            })

        categorized_routes = categorize_routes(routes)

        return jsonify({
            'start': start,
            'end': end,
            'barangay': barangay,
            'hazard_type': hazard_type,
            'safe_threshold': SAFE_THRESHOLD,
            'routes': categorized_routes[:10]
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)