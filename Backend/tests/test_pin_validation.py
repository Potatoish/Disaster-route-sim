"""Regression tests for off-road/river pins and both simulation entry points."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import networkx as nx
from shapely.geometry import LineString, box
import osm_routing as routing
import earthquake_service


def road_graph(access=None):
    graph = nx.MultiDiGraph()
    graph.graph["hazard_coverage_area"] = box(121.08, 14.54, 121.10, 14.57)
    for node, lng in enumerate([121.085, 121.09, 121.095]):
        graph.add_node(node, x=lng, y=14.55)
    for u, v in [(0, 1), (1, 2)]:
        data = {"name": "Test Street", "geometry": LineString([
            (graph.nodes[u]["x"], 14.55), (graph.nodes[v]["x"], 14.55)])}
        if access:
            data["access"] = access
        graph.add_edge(u, v, **data)
        graph.add_edge(v, u, **data)
    return graph


class PinValidationTests(unittest.TestCase):
    def test_tap_near_road_returns_point_on_road(self):
        result = routing.check_route_pin(road_graph(), 14.55005, 121.087, "test coverage")
        self.assertTrue(result["valid"])
        self.assertAlmostEqual(result["road_lat"], 14.55)
        self.assertLess(result["road_distance"], routing.MAX_PIN_ROAD_DISTANCE_METERS)

    def test_off_road_and_river_like_points_are_rejected(self):
        for lat in [14.5502, 14.552, 14.56]:
            with self.subTest(lat=lat):
                result = routing.check_route_pin(road_graph(), lat, 121.087, "test coverage")
                self.assertFalse(result["valid"])
                self.assertEqual(result["reason"], "too_far_from_road")

    def test_outside_barangay_is_rejected_even_on_road_extension(self):
        self.assertEqual(routing.check_route_pin(road_graph(), 14.55, 121.11, "test")["reason"], "outside_coverage")

    def test_blocked_road_is_not_a_valid_endpoint(self):
        self.assertEqual(routing.check_route_pin(road_graph("no"), 14.55, 121.087, "test")["reason"], "no_road")

    def test_valid_private_road_stays_available_to_its_resident(self):
        self.assertTrue(routing.check_route_pin(road_graph("private"), 14.55, 121.087, "test")["valid"])

    def test_disconnected_road_does_not_allow_remote_pin(self):
        graph = road_graph()
        graph.add_node(10, x=121.085, y=14.56)
        graph.add_node(11, x=121.09, y=14.56)
        graph.add_edge(10, 11, geometry=LineString([(121.085, 14.56), (121.09, 14.56)]))
        self.assertFalse(routing.check_route_pin(graph, 14.56, 121.087, "test")["valid"])

    def test_flood_simulation_cannot_bypass_pin_validation(self):
        with patch.object(routing, "prepare_routing_graph", return_value=road_graph()):
            for start_lat, end_lat in [(14.552, 14.55), (14.55, 14.552)]:
                result = routing.simulate_osm_routes("Start", start_lat, 121.087,
                    "End", end_lat, 121.092, barangay_name="Pinagbuhatan")
                self.assertTrue(result["error"])
                self.assertIn("walkable road", result["message"])

    def test_earthquake_simulation_cannot_bypass_pin_validation(self):
        with patch.object(earthquake_service, "_get_earthquake_graph", return_value=road_graph()):
            for start_lat, end_lat in [(14.552, 14.55), (14.55, 14.552)]:
                result = earthquake_service.simulate_earthquake(
                    {"lat": start_lat, "lng": 121.087}, "Pinagbuhatan",
                    {"lat": end_lat, "lng": 121.092})
                self.assertTrue(result["error"])
                self.assertIn("walkable road", result["message"])


if __name__ == "__main__":
    unittest.main()
