USE aco_evacuation;
GO

SELECT n.id, n.name, n.barangay, fh.water_level_m, fh.rainfall_scenario, fh.hazard_level
FROM flood_hazard fh
JOIN nodes n ON fh.node_id = n.id
WHERE n.barangay = 'Sta. Lucia'
ORDER BY n.name;
GO