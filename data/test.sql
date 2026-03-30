USE aco_evacuation;

-- 1. Delete the flood hazard data attached to the Sta. Lucia area
DELETE FROM flood_hazard
WHERE node_id IN (SELECT id FROM nodes WHERE name LIKE '%Sta. Lucia%' OR name LIKE '%De Castro%' OR name LIKE '%Mabuhay%');

-- 2. NOW we can safely delete the actual locations
DELETE FROM nodes 
WHERE name LIKE '%Sta. Lucia%' OR name LIKE '%De Castro%' OR name LIKE '%Mabuhay%';