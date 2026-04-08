USE aco_evacuation;
GO

-- 1. Nodes (Sta. Lucia ONLY)
INSERT INTO nodes (name, lat, lng, barangay, node_type)
SELECT v.name, v.lat, v.lng, v.barangay, v.node_type
FROM (VALUES
    ('Sta. Lucia Barangay Hall',           14.58826428, 121.09991886, 'Sta. Lucia', 'landmark'),
    ('De Castro Elementary School',        14.58752774, 121.09887019, 'Sta. Lucia', 'evacuation_center'),
    ('Sta. Lucia Bliss Multipurpose Hall', 14.57871059, 121.09861182, 'Sta. Lucia', 'evacuation_center'),
    ('Santa Lucia High School (Tramo St.)',14.58303503, 121.10359729, 'Sta. Lucia', 'landmark'),
    ('Brgy. Sta. Lucia Health Center',     14.58497931, 121.10165443, 'Sta. Lucia', 'health_facility'),
    ('East Ortigas Mansions',              14.58633218, 121.10351134, 'Sta. Lucia', 'start_node')
) AS v(name, lat, lng, barangay, node_type)
WHERE NOT EXISTS (
    SELECT 1
    FROM nodes n
    WHERE n.barangay = v.barangay
      AND n.name = v.name
);
GO

-- 2. Edges (Sta. Lucia ONLY)
-- Fill the VALUES rows only after you finalize which named places are directly connected.
-- This version resolves source_id and target_id automatically from node names.

-- INSERT INTO edges (source_id, target_id, distance_km)
-- SELECT s.id, t.id, v.distance_km
-- FROM (VALUES
--     ('East Ortigas Mansions', 'Sta. Lucia Barangay Hall', 0.00),
--     ('Sta. Lucia Barangay Hall', 'De Castro Elementary School', 0.00),
--     ('Sta. Lucia Barangay Hall', 'Brgy. Sta. Lucia Health Center', 0.00),
--     ('Sta. Lucia Barangay Hall', 'Santa Lucia High School (Tramo St.)', 0.00),
--     ('Santa Lucia High School (Tramo St.)', 'Sta. Lucia Bliss Multipurpose Hall', 0.00)
-- ) AS v(source_name, target_name, distance_km)
-- JOIN nodes s
--   ON s.name = v.source_name AND s.barangay = 'Sta. Lucia'
-- JOIN nodes t
--   ON t.name = v.target_name AND t.barangay = 'Sta. Lucia';
-- GO

-- 3. Flood Hazard (Sta. Lucia ONLY)
INSERT INTO flood_hazard (node_id, water_level_m, rainfall_scenario, hazard_level)
SELECT n.id, v.water_level_m, v.rainfall_scenario, v.hazard_level
FROM (VALUES
    ('Sta. Lucia Barangay Hall',            0.00, '25yr', 5),
    ('De Castro Elementary School',         0.00, '25yr', 5),
    ('Sta. Lucia Bliss Multipurpose Hall',  0.00, '25yr', 5),
    ('Santa Lucia High School (Tramo St.)', 0.00, '25yr', 3),
    ('Brgy. Sta. Lucia Health Center',      0.00, '25yr', 5),
    ('East Ortigas Mansions',               0.00, '25yr', 3)
) AS v(node_name, water_level_m, rainfall_scenario, hazard_level)
JOIN nodes n
  ON n.name = v.node_name
 AND n.barangay = 'Sta. Lucia';
GO