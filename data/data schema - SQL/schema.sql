USE aco_evacuation;
GO

-- Drop child tables first
DROP TABLE IF EXISTS flood_hazard;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;
GO

CREATE TABLE nodes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    lat DECIMAL(11,8) NOT NULL,
    lng DECIMAL(11,8) NOT NULL,
    barangay VARCHAR(50) NOT NULL,
    node_type VARCHAR(50) NOT NULL,

    CONSTRAINT UQ_nodes_barangay_name UNIQUE (barangay, name)
);
GO

CREATE TABLE edges (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_id INT NOT NULL,
    target_id INT NOT NULL,
    distance_km DECIMAL(6,3) NOT NULL,

    CONSTRAINT FK_edges_source FOREIGN KEY (source_id) REFERENCES nodes(id),
    CONSTRAINT FK_edges_target FOREIGN KEY (target_id) REFERENCES nodes(id),
    CONSTRAINT CHK_edges_distance_positive CHECK (distance_km > 0),
    CONSTRAINT CHK_edges_not_same_node CHECK (source_id <> target_id)
);
GO

CREATE TABLE flood_hazard (
    id INT IDENTITY(1,1) PRIMARY KEY,
    node_id INT NOT NULL,
    water_level_m DECIMAL(5,2) NOT NULL,
    rainfall_scenario VARCHAR(20) NOT NULL,
    hazard_level INT NOT NULL,

    CONSTRAINT FK_flood_hazard_node FOREIGN KEY (node_id) REFERENCES nodes(id),
    CONSTRAINT UQ_flood_hazard_node_scenario UNIQUE (node_id, rainfall_scenario),
    CONSTRAINT CHK_flood_hazard_level CHECK (hazard_level BETWEEN 1 AND 5),
    CONSTRAINT CHK_flood_water_level_nonnegative CHECK (water_level_m >= 0)
);
GO