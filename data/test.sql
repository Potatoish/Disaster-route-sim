USE aco_evacuation;

-- 1. First, delete all roads connected to the Sta. Lucia area
DELETE FROM edges 
WHERE source_id IN (SELECT id FROM nodes WHERE name LIKE '%Sta. Lucia%' OR name LIKE '%De Castro%' OR name LIKE '%Mabuhay%')
   OR target_id IN (SELECT id FROM nodes WHERE name LIKE '%Sta. Lucia%' OR name LIKE '%De Castro%' OR name LIKE '%Mabuhay%');

-- 2. Next, delete the actual locations
DELETE FROM nodes 
WHERE name LIKE '%Sta. Lucia%' OR name LIKE '%De Castro%' OR name LIKE '%Mabuhay%';