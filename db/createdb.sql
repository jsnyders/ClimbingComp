-- createdb.sql
-- Create database for Climbing Comp web app
-- Copyright

-- Use consistent text limits
-- Small user supplied name, property name or small string: 100
-- Large user supplied name: 200
-- File path: 1000
-- Description: 1000

DROP TABLE IF EXISTS config;
CREATE TABLE config (
  name VARCHAR(100) PRIMARY KEY,
  nvalue INTEGER,
  tvalue VARCHAR(1000)
) ENGINE=Aria DEFAULT CHARSET=utf8;

-- the schema version
INSERT INTO config VALUES('VersionMajor',0,NULL);
INSERT INTO config VALUES('VersionMinor',1,NULL);
-- default session timeout
INSERT INTO config VALUES('SessionIdleTime',2 * 60 * 60,NULL); -- 2 hr
INSERT INTO config VALUES('SessionMaxTime',8 * 60 * 60,NULL); -- 8 hr

DROP TABLE IF EXISTS event;
CREATE TABLE event (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version INTEGER DEFAULT 1,
  region VARCHAR(100),  -- Example "503 (New England East)", todo consider region/division id
  location VARCHAR(200) NOT NULL, -- Example 'Boston Rock Gym'
  event_date DATE NOT NULL,
  series ENUM('SCS', 'ABS','CCS', 'Other'),  -- todo consider if/how to extend series
  sanctioning ENUM('Local', 'Regional', 'Divisional', 'National', 'None') NOT NULL,  -- todo consider if/how to extend sanctioning
  type ENUM('Red Point', 'On Sight', 'Speed') NOT NULL, -- todo support types other than RedPoint
  state ENUM('Open', 'Active', 'Preliminary', 'Closed'),
  record_falls_per_climb BOOLEAN NOT NULL,
  routes_have_location BOOLEAN NOT NULL,
  routes_have_color BOOLEAN NOT NULL,
  score_card_columns INTEGER DEFAULT 2,
  notes VARCHAR(1000),
  updated_by VARCHAR(100),
  updated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=Aria DEFAULT CHARSET=utf8;

CREATE TRIGGER event_update
  BEFORE UPDATE ON event
    FOR EACH ROW
      set NEW.version = NEW.version + 1;

DROP TABLE IF EXISTS climber;
CREATE TABLE climber (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version INTEGER,
  usac_member_id INTEGER,
  first_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  gender ENUM('Male', 'Female'),
  category ENUM('Youth-D', 'Youth-C', 'Youth-B', 'Youth-A', 'Junior', 'Adult', 'Open', 'Master'), -- todo consider if/how to extend category
  birth_year INTEGER,
  region VARCHAR(100),  -- Example "503 (New England East)" todo consider region/division id
  team VARCHAR(100),
  coach VARCHAR(100),

  UNIQUE INDEX usac_member_id_ndx (usac_member_id),
  INDEX name_ndx (first_name, last_name)
) ENGINE=Aria DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS event_route;
CREATE TABLE event_route (
  number INTEGER(3) NOT NULL,
  event_id INTEGER NOT NULL,
  color VARCHAR(20),
  location VARCHAR(20),
  points INTEGER NOT NULL,
  sheet_row INTEGER,
  sheet_column INTEGER,

  PRIMARY KEY id (number, event_id)
) ENGINE=Aria DEFAULT CHARSET=utf8;

DROP TABLE IF EXISTS event_climber;
CREATE TABLE event_climber (
  climber_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  number INTEGER(4) NOT NULL,
  version INTEGER,
  total INTEGER, -- xxx is this before or after total_falls is subtracted??? either way it too could be calculated
  place INTEGER, -- xxx this will be generated
  top1 INTEGER,
  top2 INTEGER,
  top3 INTEGER,
  top4 INTEGER,
  top5 INTEGER,
  total_falls INTEGER,
  climbs VARCHAR(6000), -- data for the client use only
  updated_by VARCHAR(100),
  updated_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scored_by VARCHAR(100),
  scored_on TIMESTAMP NULL DEFAULT NULL,

  PRIMARY KEY id (climber_id, event_id),
  UNIQUE INDEX event_number (number, event_id)
) ENGINE=Aria DEFAULT CHARSET=utf8;


-- users and sessions
DROP TABLE IF EXISTS app_user;
CREATE TABLE `app_user` (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version INTEGER DEFAULT 1,
  username VARCHAR(100) NOT NULL, -- name of user (required and non empty)
  pwd_hash VARCHAR(100) NOT NULL, -- one way encrypted value of password
  role ENUM('Reader', 'Contributor', 'Admin') NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),

  UNIQUE INDEX username_idx (username)
) ENGINE=Aria DEFAULT CHARSET=utf8;

CREATE TRIGGER app_user_update
  BEFORE UPDATE ON app_user
    FOR EACH ROW
      set NEW.version = NEW.version + 1;

-- Must have an initial default admin user
INSERT INTO app_user (username, pwd_hash, role) VALUES ('admin', password('admin'), 'Admin');

DROP TABLE IF EXISTS app_session;
CREATE TABLE `app_session` (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(256) NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accessed_on TIMESTAMP NULL DEFAULT NULL,
  username VARCHAR(100) NOT NULL,
  role ENUM('Reader', 'Contributor', 'Admin') NOT NULL,

  UNIQUE INDEX session_idx (session_id)
) ENGINE=Aria DEFAULT CHARSET=utf8;
