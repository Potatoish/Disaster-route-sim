USE aco_evacuation;
GO

-- 1. Nodes (Sta. Lucia ONLY)
INSERT INTO nodes (name, lat, lng, barangay, node_type)
SELECT v.name, v.lat, v.lng, v.barangay, v.node_type
FROM (VALUES
    ('Sta. Lucia Barangay Hall',           14.588305813024784, 121.10059477816179, 'Sta. Lucia', 'landmark'),
    ('De Castro Elementary School',        14.587299317821408, 121.09888701920387, 'Sta. Lucia', 'evacuation_center'),
    ('Sta. Lucia Bliss Multipurpose Hall', 14.579498397619826, 121.10277475864685, 'Sta. Lucia', 'evacuation_center'),
    ('Santa Lucia High School (Tramo St.)',14.583107716145452, 121.10404790145412, 'Sta. Lucia', 'landmark'),
    ('Brgy. Sta. Lucia Health Center',     14.584959232442822, 121.10178292289898, 'Sta. Lucia', 'health_facility'),
    ('East Ortigas Mansions',              14.58632175410495, 121.10358111094102, 'Sta. Lucia', 'start_node')
) AS v(name, lat, lng, barangay, node_type)
WHERE NOT EXISTS (
    SELECT 1
    FROM nodes n
    WHERE n.barangay = v.barangay
      AND n.name = v.name
);
GO
