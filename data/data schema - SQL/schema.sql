-- 1. CREATE DATABASE
IF DB_ID('aco_evacuation') IS NULL
BEGIN
    CREATE DATABASE aco_evacuation;
END
GO

USE aco_evacuation;
GO

-- 2. CORE GRAPH TABLES
CREATE TABLE nodes (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  lat          DECIMAL(9,6) NOT NULL,
  lng          DECIMAL(9,6) NOT NULL,
  barangay     VARCHAR(50),
  node_type    VARCHAR(50) DEFAULT ('landmark') CHECK (node_type IN ('road','landmark','evacuation','ferry','school','health','hall')),
  hazard_level INT DEFAULT 1,
  created_at   DATETIME DEFAULT (GETDATE())
);
GO

CREATE TABLE edges (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  source_id     INT NOT NULL,
  target_id     INT NOT NULL,
  distance_km   DECIMAL(5,2) NOT NULL,
  created_at    DATETIME DEFAULT (GETDATE()),
  FOREIGN KEY (source_id) REFERENCES nodes(id),
  FOREIGN KEY (target_id) REFERENCES nodes(id)
);
GO

-- 3. HAZARD DATA TABLES
CREATE TABLE flood_hazard (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  node_id         INT NOT NULL,
  water_level_m   DECIMAL(4,2) NOT NULL,
  rainfall_scenario VARCHAR(50) NOT NULL CHECK (rainfall_scenario IN ('5yr','25yr','100yr')),
  hazard_level    INT NOT NULL CHECK (hazard_level BETWEEN 1 AND 5),
  source          VARCHAR(50) DEFAULT ('Project NOAH'),
  updated_at      DATETIME DEFAULT (GETDATE()),
  FOREIGN KEY (node_id) REFERENCES nodes(id)
);
GO

CREATE TABLE earthquake_hazard (
  id                  INT IDENTITY(1,1) PRIMARY KEY,
  node_id             INT NOT NULL,
  fault_name          VARCHAR(100),
  distance_to_fault_km DECIMAL(6,3),
  liquefaction_risk   VARCHAR(50) DEFAULT ('low') CHECK (liquefaction_risk IN ('low','moderate','high','very high')),
  hazard_level        INT NOT NULL CHECK (hazard_level BETWEEN 1 AND 5),
  source              VARCHAR(50) DEFAULT ('PHIVOLCS'),
  updated_at          DATETIME DEFAULT (GETDATE()),
  FOREIGN KEY (node_id) REFERENCES nodes(id)
);
GO

-- 4. RESPONSE & RECOVERY TABLES
CREATE TABLE evacuation_centers (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  lat           DECIMAL(9,6) NOT NULL,
  lng           DECIMAL(9,6) NOT NULL,
  barangay      VARCHAR(50),
  capacity      INT,
  hazard_type   VARCHAR(50) DEFAULT ('all') CHECK (hazard_type IN ('flood','earthquake','fire','all')),
  is_active     BIT DEFAULT (1),
  created_at    DATETIME DEFAULT (GETDATE())
);
GO

CREATE TABLE responder_teams (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  team_name      VARCHAR(100) NOT NULL,
  hazard_type    VARCHAR(50) DEFAULT ('all') CHECK (hazard_type IN ('flood','earthquake','fire','all')),
  barangay       VARCHAR(50),
  contact_no     VARCHAR(20),
  alt_contact_no VARCHAR(20),
  head_name      VARCHAR(100),
  designation    VARCHAR(100),
  evacuation_center_id INT,
  created_at     DATETIME DEFAULT (GETDATE()),
  FOREIGN KEY (evacuation_center_id) REFERENCES evacuation_centers(id)
);
GO

CREATE TABLE responder_personnel (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  team_id      INT NOT NULL,
  full_name    VARCHAR(100) NOT NULL,
  role         VARCHAR(100),
  contact_no   VARCHAR(20),
  is_available BIT DEFAULT (1),
  created_at   DATETIME DEFAULT (GETDATE()),
  FOREIGN KEY (team_id) REFERENCES responder_teams(id)
);
GO

CREATE TABLE fire_stations (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  lat           DECIMAL(9,6) NOT NULL,
  lng           DECIMAL(9,6) NOT NULL,
  district      VARCHAR(50),
  contact_no    VARCHAR(20),
  station_head  VARCHAR(100),
  created_at    DATETIME DEFAULT (GETDATE())
);
GO

CREATE TABLE fire_hazard (
  id                   INT IDENTITY(1,1) PRIMARY KEY,
  node_id              INT NOT NULL,
  nearest_station_id   INT,
  distance_to_station_km DECIMAL(6,3),
  hazard_level         INT NOT NULL CHECK (hazard_level BETWEEN 1 AND 5),
  source               VARCHAR(50) DEFAULT ('BFP'),
  updated_at           DATETIME DEFAULT (GETDATE()),
  FOREIGN KEY (node_id) REFERENCES nodes(id),
  FOREIGN KEY (nearest_station_id) REFERENCES fire_stations(id)
);
GO

CREATE TABLE fire_incidents (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  node_id        INT NOT NULL,
  incident_date  DATE NOT NULL,
  cause          VARCHAR(200),
  alarm_level    VARCHAR(50) DEFAULT ('first') CHECK (alarm_level IN ('first','second','third','fourth','fifth')),
  casualties     INT DEFAULT (0),
  structures_burned INT DEFAULT (0),
  responding_station_id INT,
  reported_by    VARCHAR(100) DEFAULT ('BFP'),
  notes          TEXT,
  created_at     DATETIME DEFAULT (GETDATE()),
  FOREIGN KEY (node_id) REFERENCES nodes(id),
  FOREIGN KEY (responding_station_id) REFERENCES fire_stations(id)
);
GO

-- 5. COMBINED HAZARD VIEW
CREATE VIEW node_hazard_summary AS
SELECT
  n.id,
  n.name,
  n.lat,
  n.lng,
  ISNULL(f.hazard_level, 1)  AS flood_level,
  ISNULL(e.hazard_level, 1)  AS earthquake_level,
  ISNULL(fi.hazard_level, 1) AS fire_level,
  (SELECT MAX(v) FROM (VALUES
    (ISNULL(f.hazard_level, 1)),
    (ISNULL(e.hazard_level, 1)),
    (ISNULL(fi.hazard_level, 1))
  ) AS value(v)) AS max_hazard_level
FROM nodes n
LEFT JOIN flood_hazard f        ON f.node_id = n.id AND f.rainfall_scenario = '25yr'
LEFT JOIN earthquake_hazard e   ON e.node_id = n.id
LEFT JOIN fire_hazard fi        ON fi.node_id = n.id;
GO