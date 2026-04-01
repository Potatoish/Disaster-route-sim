USE aco_evacuation;
GO

-- 1. Nodes (Pinagbuhatan ONLY)
INSERT INTO nodes (name, lat, lng, barangay, node_type) VALUES
('Novo Pinagbuhatan',                 14.557978282772257, 121.0854886231309, 'Pinagbuhatan', 'landmark'),
('Kenneth Talipapa',                  14.541756513268828, 121.10554860625739, 'Pinagbuhatan', 'road'),
('Pinagbuhatan Barangay Hall',        14.557458218288385, 121.09139261048277, 'Pinagbuhatan', 'hall'),
('Pinagbuhatan High School',          14.555077084549803, 121.09194585752782, 'Pinagbuhatan', 'school'),
('Pinagbuhatan Ferry station',        14.546081909369192, 121.09493313662196, 'Pinagbuhatan', 'ferry'),
('2 Centennial Street, Pinagbuhatan', 14.545954717564475, 121.10306063821729, 'Pinagbuhatan', 'road');
GO

-- 2. Edges (Pinagbuhatan ONLY)
INSERT INTO edges (source_id, target_id, distance_km) VALUES
(1,2,0.6), (2,3,0.4), (3,4,0.5), (4,5,0.7), 
(5,6,0.6), (3,6,2.5), (2,5,0.9), (1,4,1.8);
GO

-- 3. Flood Hazard 
INSERT INTO flood_hazard (node_id, water_level_m, rainfall_scenario, hazard_level) VALUES
(1,  0.80, '25yr', 3), (2,  0.45, '25yr', 2), (3,  0.30, '25yr', 2),
(4,  0.55, '25yr', 3), (5,  2.10, '25yr', 5), (6,  1.20, '25yr', 4);
GO

-- 4. Evacuation Centers
INSERT INTO evacuation_centers (name, lat, lng, barangay, capacity, hazard_type) VALUES
('Pinagbuhatan Barangay Hall Gym',       14.5605, 121.0923, 'Pinagbuhatan', 300, 'flood');
GO

-- 5. Responder Teams
INSERT INTO responder_teams (team_name, hazard_type, barangay, contact_no, alt_contact_no, head_name, designation, evacuation_center_id) VALUES
('BDRRMC Pinagbuhatan',    'flood',   'Pinagbuhatan', '0917-XXX-XXXX', '02-XXXX-XXXX', 'Juan Dela Cruz',  'Barangay Captain',    1),
('Rescue Team Pbuhatan',   'flood',   'Pinagbuhatan', '0919-XXX-XXXX', NULL,           'Pedro Reyes',     'DRRM Officer',        1);
GO

-- 6. Responder Personnel 
INSERT INTO responder_personnel (team_id, full_name, role, contact_no) VALUES
(1, 'Jose Ramos',     'Team Leader',    '0917-111-1111'),
(1, 'Maria Cruz',     'Medic',          '0917-222-2222'),
(1, 'Carlos Santos',  'Rescue Diver',   '0917-333-3333'),
(2, 'Ben Villanueva', 'Boat Operator',  '0919-111-1111');
GO