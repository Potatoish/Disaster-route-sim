USE aco_evacuation;
GO

-- 1. Wipe out the old database tables if they exist
DROP TABLE IF EXISTS responder_personnel;
DROP TABLE IF EXISTS responder_teams;
DROP TABLE IF EXISTS fire_incidents;
DROP TABLE IF EXISTS fire_hazard;
DROP TABLE IF EXISTS fire_stations;
DROP TABLE IF EXISTS earthquake_hazard;
DROP TABLE IF EXISTS flood_hazard;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS evacuation_centers;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS flood_hazard;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;
GO

-- 2. Build the exact tables needed for Flood Simulation
CREATE TABLE nodes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    lat DECIMAL(9,6) NOT NULL,
    lng DECIMAL(9,6) NOT NULL,
    barangay VARCHAR(50) NOT NULL,
    node_type VARCHAR(50) NOT NULL
);
GO

CREATE TABLE edges (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_id INT NOT NULL FOREIGN KEY REFERENCES nodes(id),
    target_id INT NOT NULL FOREIGN KEY REFERENCES nodes(id),
    distance_km DECIMAL(5,2) NOT NULL
);
GO

CREATE TABLE flood_hazard (
    id INT IDENTITY(1,1) PRIMARY KEY,
    node_id INT NOT NULL FOREIGN KEY REFERENCES nodes(id),
    water_level_m DECIMAL(5,2) NOT NULL,
    rainfall_scenario VARCHAR(20) NOT NULL,
    hazard_level INT NOT NULL
);
GO