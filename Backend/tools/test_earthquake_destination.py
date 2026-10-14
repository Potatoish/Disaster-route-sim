"""Earthquake destination regressions: python Backend/tools/test_earthquake_destination.py."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import networkx as nx
from shapely.geometry import LineString, box
from shapely.prepared import prep
import earthquake_service as service
from osm_routing import restrict_graph_to_hazard_coverage


class EarthquakeDestinationTests(unittest.TestCase):
    def setUp(self):
        graph = nx.MultiDiGraph(crs="EPSG:4326")
        for node, (lng, lat) in enumerate(
            [(121.100, 14.580), (121.101, 14.580),
             (121.101, 14.581), (121.100, 14.581)], start=1
        ):
            graph.add_node(node, x=lng, y=lat)
        for u, v in [(1, 2), (2, 3), (3, 4), (4, 1)]:
            points = [(graph.nodes[n]["x"], graph.nodes[n]["y"]) for n in (u, v)]
            length = 108 if points[0][1] == points[1][1] else 111
            for a, b in [(u, v), (v, u)]:
                coords = points if a == u else list(reversed(points))
                graph.add_edge(a, b, length=length, geometry=LineString(coords),
                               name="Test Street", osmid=a * 10 + b)
        coverage = box(121.099, 14.579, 121.102, 14.582)
        self.graph = restrict_graph_to_hazard_coverage(graph, coverage)
        self.dataset = {
            "canonical_barangay": "sta lucia", "display_barangay": "Sta. Lucia",
            "evacuation_sites": [
                {"id": "auto-east", "name": "East site", "lat": 14.580, "lng": 121.101},
                {"id": "auto-north", "name": "North site", "lat": 14.581, "lng": 121.100},
            ],
            "layer_zones": {key: [{"severity": level, "prepared": prep(coverage),
                                   "tolerance_prepared": prep(coverage)}]
                            for key, level in [("liquefaction", 5), ("ground_shaking", 4)]},
            "layer_payloads": {}, "shaking_intensity": {}, "scenario": {},
        }
        self.start = {"lat": 14.580, "lng": 121.100, "label": "Start"}
        self.end = {"lat": 14.581, "lng": 121.101, "label": "My destination"}
        self.addCleanup(patch.stopall)
        patch.object(service, "get_earthquake_dataset", return_value=self.dataset).start()
        patch.object(service, "_get_earthquake_graph", return_value=self.graph).start()

    def simulate(self, end=None):
        return service.simulate_earthquake(self.start, "Sta. Lucia", end=end)

    def test_custom_destination_is_routed_in_every_hazard_view(self):
        result = self.simulate(self.end)
        self.assertFalse(result["error"], result)
        self.assertFalse(result["to_evacuation_site"])
        self.assertEqual(result["end"], "My destination")
        self.assertEqual(result["reachable_evacuation_sites"], [])
        self.assertEqual(set(result["views"]), set(service.EARTHQUAKE_VIEW_CONFIG))
        for key, view in result["views"].items():
            with self.subTest(view=key):
                self.assertTrue(view["routes"])
                self.assertIsNone(view["summary"]["selected_evacuation_site"])
                self.assertEqual(view["summary"]["candidate_sites_considered"], 0)
                self.assertEqual(view["summary"]["destination"]["name"], "My destination")
                for route in view["routes"]:
                    self.assertFalse(route["destination_is_evacuation_site"])
                    self.assertEqual(route["destination_lat"], self.end["lat"])
                    self.assertEqual(route["destination_lng"], self.end["lng"])
                    self.assertGreater(route["unsafe_distance"], 0)
                    self.assertEqual(route["category"], "eliminated")
                    self.assertEqual(route["info_rows"][0][0], "Destination")
        self.assertIsNotNone(result["replay"])
        self.assertEqual(result["replay"]["sites_searched"], 0)

    def test_default_destination_still_selects_a_real_evacuation_site(self):
        result = self.simulate()
        self.assertFalse(result["error"], result)
        self.assertTrue(result["to_evacuation_site"])
        for view in result["views"].values():
            self.assertIsNotNone(view["summary"]["selected_evacuation_site"])
            self.assertEqual(view["summary"]["candidate_sites_considered"], 2)
            self.assertTrue(all(route["destination_is_evacuation_site"] for route in view["routes"]))

    def test_custom_destination_is_repeatable_and_changes_with_the_end_point(self):
        first = self.simulate(self.end)
        second = self.simulate(self.end)
        other = self.simulate({"lat": 14.580, "lng": 121.101, "label": "Another destination"})
        self.assertFalse(first["error"], first)
        self.assertFalse(second["error"], second)
        self.assertFalse(other["error"], other)
        for key in first["views"]:
            self.assertEqual(first["views"][key]["routes"], second["views"][key]["routes"])
        self.assertNotEqual(first["views"]["overall"]["routes"][0]["path"],
                            other["views"]["overall"]["routes"][0]["path"])

    def test_invalid_destination_is_rejected(self):
        for end in [{}, "", {"lat": float("nan"), "lng": 121.101}]:
            with self.subTest(end=end):
                result = self.simulate(end)
                self.assertTrue(result["error"])
                self.assertIn("Destination", result["message"])

    def test_destination_outside_hazard_coverage_is_rejected(self):
        result = self.simulate({"lat": 14.6, "lng": 121.2})
        self.assertTrue(result["error"])
        self.assertIn("destination", result["message"].lower())
        self.assertIn("outside", result["message"].lower())

    def test_destination_at_the_same_road_access_point_is_rejected(self):
        result = self.simulate(self.start)
        self.assertTrue(result["error"])
        self.assertIn("same spot", result["message"])

    def test_unreachable_destination_does_not_fall_back_to_a_site(self):
        # Keep one weakly connected road network, with bridges that can only
        # be crossed toward the start. Both pins still meet their own roads.
        for u, v in [(2, 3), (1, 4)]:
            self.graph.remove_edge(u, v)
        result = self.simulate(self.end)
        self.assertTrue(result["error"])
        self.assertIn("destination", result["message"])
        self.assertNotIn("No evacuation site", result["message"])


if __name__ == "__main__":
    unittest.main()
