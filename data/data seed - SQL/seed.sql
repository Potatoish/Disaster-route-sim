USE aco_evacuation;
GO

-- 1. Nodes (12 locations)
INSERT INTO nodes (name, lat, lng, barangay, node_type) VALUES
('Novo Pinagbuhatan',                 14.5631, 121.0891, 'Pinagbuhatan', 'landmark'),
('Kenneth Talipapa',                  14.5618, 121.0912, 'Pinagbuhatan', 'road'),
('Pinagbuhatan Barangay Hall',        14.5605, 121.0923, 'Pinagbuhatan', 'hall'),
('Pinagbuhatan High School',          14.5592, 121.0934, 'Pinagbuhatan', 'school'),
('Pinagbuhatan Ferry station',        14.5578, 121.0958, 'Pinagbuhatan', 'ferry'),
('2 Centennial Street, Pinagbuhatan', 14.5598, 121.0952, 'Pinagbuhatan', 'road'),
('Sta. Lucia Barangay Hall',          14.5601, 121.0978, 'Sta. Lucia',   'hall'),
('Barangay Sta. Lucia Health Center', 14.5589, 121.0980, 'Sta. Lucia',   'health'),
('St Jude Thaddeus Sta. Lucia',       14.5582, 121.0995, 'Sta. Lucia',   'landmark'),
('Sta. Lucia High School',            14.5571, 121.0998, 'Sta. Lucia',   'school'),
('De Castro Elementary School',       14.5563, 121.1012, 'Sta. Lucia',   'school'),
('Mabuhay Subdivision',               14.5555, 121.1028, 'Sta. Lucia',   'evacuation');
GO

-- 2. Edges (Roads connecting nodes)
INSERT INTO edges (source_id, target_id, distance_km) VALUES
(1,2,0.6),(2,3,0.4),(3,4,0.5),(4,5,0.7),(5,6,0.6),
(6,7,1.2),(7,8,0.4),(8,9,0.3),(9,10,0.5),(10,11,0.6),
(11,12,0.8),(3,6,2.5),(4,7,2.8),(2,5,0.9),(2,7,3.2),(1,4,1.8);
GO

-- 3. Flood Hazard (NOAH data)
INSERT INTO flood_hazard (node_id, water_level_m, rainfall_scenario, hazard_level) VALUES
(1,  0.80, '25yr', 3), (2,  0.45, '25yr', 2), (3,  0.30, '25yr', 2),
(4,  0.55, '25yr', 3), (5,  2.10, '25yr', 5), (6,  1.20, '25yr', 4),
(7,  0.20, '25yr', 1), (8,  0.15, '25yr', 1), (9,  0.25, '25yr', 2),
(10, 0.35, '25yr', 2), (11, 0.40, '25yr', 2), (12, 0.10, '25yr', 1);
GO

-- 4. Earthquake Hazard (PHIVOLCS data)
INSERT INTO earthquake_hazard (node_id, fault_name, distance_to_fault_km, liquefaction_risk, hazard_level) VALUES
(1,  'Valley Fault System - East', 2.1, 'high',      3),
(2,  'Valley Fault System - East', 1.9, 'high',      3),
(3,  'Valley Fault System - East', 1.7, 'high',      3),
(4,  'Valley Fault System - East', 1.5, 'very high', 4),
(5,  'Valley Fault System - East', 1.2, 'very high', 4),
(6,  'Valley Fault System - East', 1.4, 'very high', 4),
(7,  'Valley Fault System - East', 2.3, 'moderate',  2),
(8,  'Valley Fault System - East', 2.5, 'moderate',  2),
(9,  'Valley Fault System - East', 2.8, 'moderate',  2),
(10, 'Valley Fault System - East', 3.1, 'low',       1),
(11, 'Valley Fault System - East', 3.4, 'low',       1),
(12, 'Valley Fault System - East', 3.8, 'low',       1);
GO

-- 5. Evacuation Centers
INSERT INTO evacuation_centers (name, lat, lng, barangay, capacity, hazard_type) VALUES
('Mabuhay Subdivision Evacuation Area', 14.5555, 121.1028, 'Sta. Lucia',   500, 'all'),
('Pinagbuhatan Barangay Hall Gym',       14.5605, 121.0923, 'Pinagbuhatan', 300, 'all'),
('Sta. Lucia Barangay Hall Grounds',     14.5601, 121.0978, 'Sta. Lucia',   250, 'all'),
('De Castro Elementary School Grounds',  14.5563, 121.1012, 'Sta. Lucia',   400, 'flood');
GO

-- 6. Responder Teams
INSERT INTO responder_teams (team_name, hazard_type, barangay, contact_no, alt_contact_no, head_name, designation, evacuation_center_id) VALUES
('BDRRMC Pinagbuhatan',    'all',        'Pinagbuhatan', '0917-XXX-XXXX', '02-XXXX-XXXX', 'Juan Dela Cruz',  'Barangay Captain',    1),
('BDRRMC Sta. Lucia',      'all',        'Sta. Lucia',   '0918-XXX-XXXX', '02-XXXX-XXXX', 'Maria Santos',    'Barangay Captain',    2),
('Rescue Team Pbuhatan',   'flood',      'Pinagbuhatan', '0919-XXX-XXXX', NULL,            'Pedro Reyes',    'DRRM Officer',        1),
('Earthquake Response SL', 'earthquake', 'Sta. Lucia',   '0920-XXX-XXXX', NULL,            'Ana Gonzales',    'DRRM Coordinator',    3);
GO

-- 7. Responder Personnel
INSERT INTO responder_personnel (team_id, full_name, role, contact_no) VALUES
(1, 'Jose Ramos',     'Team Leader',    '0917-111-1111'),
(1, 'Maria Cruz',     'Medic',          '0917-222-2222'),
(1, 'Carlos Santos',  'Rescue Diver',   '0917-333-3333'),
(2, 'Ana Reyes',      'Team Leader',    '0918-111-1111'),
(2, 'Luis Torres',    'Search & Rescue','0918-222-2222'),
(3, 'Ben Villanueva', 'Boat Operator',  '0919-111-1111'),
(4, 'Clara Mendoza',  'First Responder','0920-111-1111');
GO

-- 8. Fire Stations
INSERT INTO fire_stations (name, lat, lng, district, contact_no, station_head) VALUES
('Pasig City Fire Station - Main',    14.5764, 121.0851, 'Pasig City',    '02-8641-XXXX', 'SFO IV Juan B.'),
('Pasig Fire Sub-Station Pinagbuhatan',14.5600, 121.0940, 'Pinagbuhatan', '02-XXXX-XXXX', 'FO III Pedro L.');
GO

-- 9. Fire Hazard Data
INSERT INTO fire_hazard (node_id, nearest_station_id, distance_to_station_km, hazard_level) VALUES
(1,  2, 0.4, 1),(2,  2, 0.2, 1),(3,  2, 0.1, 1),
(4,  2, 0.3, 1),(5,  2, 0.6, 2),(6,  2, 0.5, 2),
(7,  2, 0.8, 2),(8,  2, 0.9, 2),(9,  1, 1.8, 3),
(10, 1, 2.0, 3),(11, 1, 2.2, 3),(12, 1, 2.5, 3);
GO

-- 10. Fire Incidents
INSERT INTO fire_incidents (node_id, incident_date, cause, alarm_level, casualties, structures_burned, responding_station_id) VALUES
(5, '2023-03-15', 'Electrical short circuit',   'first',  0, 2, 2),
(6, '2022-11-08', 'Unattended cooking fire',    'first',  1, 1, 2),
(9, '2023-07-22', 'LPG explosion',              'second', 2, 4, 1),
(3, '2021-06-10', 'Electrical short circuit',   'first',  0, 1, 2),
(1, '2023-01-30', 'Illegal electrical connection','first', 0, 3, 2);
GO