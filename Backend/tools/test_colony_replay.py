"""Replay regressions: run with python Backend/tools/test_colony_replay.py."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import networkx as nx
from osm_routing import build_colony_replay, flood_replay_span_levels


class ColonyReplayTests(unittest.TestCase):
    def setUp(self):
        graph = nx.MultiDiGraph()
        for node, (lat, lng) in enumerate(
            [(14.558, 121.084), (14.559, 121.085), (14.560, 121.086)], start=1
        ):
            graph.add_node(node, y=lat, x=lng)
        for u, v in [(1, 2), (2, 1), (2, 3), (3, 2)]:
            graph.add_edge(u, v, length=150, route_cost=945, hazard=5, flood_var=3)
        self.route = {
            "path": [1, 2, 3], "distance": 300, "max_hazard": 5,
            "unsafe_distance": 300, "flood_vars_encountered": [3],
            "found_by": "shortest_path",
        }
        self.round = {
            "sent": 40, "arrived": 0, "untouched": 0.7,
            "trail": {}, "best": None, "improved": False,
            "walks": [([1, 2, 1], False)],
        }
        self.colony = {
            "G": graph, "start": 1, "end": 3, "best": None,
            "replay_record": {"rounds": [self.round], "found": set()},
        }

    def replay(self, span_levels=flood_replay_span_levels):
        return build_colony_replay(self.colony, self.route, span_levels)

    def test_dijkstra_route_keeps_unsuccessful_ant_search(self):
        replay = self.replay()
        self.assertIsNotNone(replay)
        self.assertEqual(replay["route1"]["source"], "shortest_path")
        self.assertEqual(replay["route1"]["spans"], [[300.0, 3]])
        self.assertEqual(replay["rounds"][0]["arrived"], 0)
        self.assertIsNone(replay["rounds"][0]["best"])
        self.assertEqual(replay["rounds"][0]["trail"], [])
        self.assertEqual(replay["rounds"][0]["walks"], [[0, 1, -1]])

    def test_backup_route_keeps_its_source(self):
        self.route["found_by"] = "backup_search"
        replay = self.replay()
        self.assertIsNotNone(replay)
        self.assertEqual(replay["route1"]["source"], "backup_search")

    def test_no_recorded_roads_uses_route_endpoints(self):
        self.round["walks"] = []
        replay = self.replay()
        self.assertIsNotNone(replay)
        self.assertEqual(replay["edges"], [])
        self.assertEqual(replay["rounds"][0]["walks"], [])
        self.assertEqual(replay["start"], [14.558, 121.084])
        self.assertEqual(replay["end"], [14.560, 121.086])
        self.assertEqual(len(replay["origin"]), 2)

    def test_earthquake_dijkstra_keeps_both_hazard_levels(self):
        replay = self.replay(lambda edge: [4, 5])
        self.assertIsNotNone(replay)
        self.assertEqual(replay["route1"]["spans"], [[300.0, 4, 5]])
        self.assertEqual(replay["route1"]["source"], "shortest_path")

    def test_successful_main_colony_keeps_ant_source(self):
        self.route["found_by"] = "aco"
        self.colony["best"] = self.route
        self.colony["replay_record"]["found"] = {tuple(self.route["path"])}
        self.round.update(best=self.route, arrived=1, improved=True,
                          trail={(1, 2): 0.1}, walks=[([1, 2, 3], True)])
        replay = self.replay()
        self.assertEqual(replay["route1"]["source"], "main")
        self.assertEqual(replay["rounds"][0]["walks"][0][0], 1)
        self.assertEqual(replay["rounds"][0]["best"]["flood_var"], 3)

    def test_repeated_serialization_keeps_the_replay(self):
        first = self.replay()
        second = self.replay()
        self.assertIsNotNone(first)
        self.assertEqual(first, second)
        self.assertEqual(self.round["walks"], [([1, 2, 1], False)])

    def test_absent_record_or_result_still_skips_replay(self):
        for record in [None, {"rounds": [], "found": set()}]:
            with self.subTest(record=record):
                self.colony["replay_record"] = record
                self.assertIsNone(self.replay())
        self.colony["replay_record"] = {"rounds": [self.round], "found": set()}
        self.assertIsNone(build_colony_replay(self.colony, None, flood_replay_span_levels))


if __name__ == "__main__":
    unittest.main()
