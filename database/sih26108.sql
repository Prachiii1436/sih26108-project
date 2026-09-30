-- =============================================================================
--  SIH26108 - AI-Powered Recommendation Engine for Identifying Applicable
--  Indian Standards for Procurement Specifications
--
--  DATABASE SCHEMA + DEMONSTRATION DATA SEED
--
--  This is a Smart India Hackathon prototype / research decision-support
--  system. It is NOT an official Bureau of Indian Standards (BIS) product
--  and does not claim official endorsement or certification.
--
--  ---------------------------------------------------------------------------
--  HOW TO IMPORT (XAMPP)
--  ---------------------------------------------------------------------------
--  1. Start Apache and MySQL in the XAMPP Control Panel.
--  2. Confirm MySQL is listening on port 3307 (Config -> my.ini -> [mysqld] port=3307).
--  3. Open  http://localhost/phpmyadmin
--  4. Click the "Import" tab, choose this file, and press "Go".
--     (You do NOT need to create the database first - it is created below.)
--  5. Verify tables exist under the `sih26108` schema.
--
--  Command-line alternative (note the port!):
--    C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3307 -u root < database\sih26108.sql
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

CREATE DATABASE IF NOT EXISTS `sih26108`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `sih26108`;

-- Drop in reverse-dependency order so re-importing is idempotent.
DROP TABLE IF EXISTS `recommendations`;
DROP TABLE IF EXISTS `saved_standards`;
DROP TABLE IF EXISTS `procurement_queries`;
DROP TABLE IF EXISTS `standard_requirements`;
DROP TABLE IF EXISTS `standard_keywords`;
DROP TABLE IF EXISTS `standards`;
DROP TABLE IF EXISTS `users`;
-- Auxiliary bookkeeping table created by the backend/import tooling.
DROP TABLE IF EXISTS `engine_state`;
-- Legacy tables from earlier revisions of this prototype (harmless to drop).
DROP TABLE IF EXISTS `search_history`;
DROP TABLE IF EXISTS `indian_standards`;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
--  users  -  Authentication-ready. Passwords are bcrypt hashes (never plaintext).
--  =============================================================================
CREATE TABLE `users` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`          VARCHAR(191) NOT NULL,
  `full_name`      VARCHAR(120) NOT NULL,
  `password_hash`  VARCHAR(255) DEFAULT NULL,
  `organization`   VARCHAR(160) DEFAULT NULL,
  `department`     VARCHAR(160) DEFAULT NULL,
  `role`           ENUM('officer','engineer','reviewer','admin') NOT NULL DEFAULT 'officer',
  `is_active`      TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at`  DATETIME DEFAULT NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  standards  -  The Indian Standards knowledge base.
--
--  The `embedding` column stores a JSON array of floats (the sentence
--  embedding of the composed document). Keeping the vector in MySQL means the
--  app can run with zero external vector DBs. FAISS is used as a fast
--  in-process index that is rebuilt automatically from these rows.
--
--  `is_demonstration = 1` marks placeholder metadata authored for the SIH
--  prototype. It is NOT a verified BIS record. Replace with verified data
--  before any real-world deployment.
-- =============================================================================
CREATE TABLE `standards` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `is_number`         VARCHAR(64)  NOT NULL,
  `title`             VARCHAR(400) NOT NULL,
  `sector`            VARCHAR(120) NOT NULL DEFAULT 'General',
  `category`          VARCHAR(120) NOT NULL DEFAULT 'General',
  `product`           VARCHAR(200) DEFAULT NULL,
  `scope`             TEXT,
  `description`       TEXT,
  `keywords`          TEXT,          -- comma separated, mirrored in standard_keywords
  `requirements`      TEXT,          -- natural language, mirrored in standard_requirements
  `source`            VARCHAR(400) DEFAULT NULL,
  `source_url`        VARCHAR(500) DEFAULT NULL,
  `year`              SMALLINT UNSIGNED DEFAULT NULL,
  `status`            ENUM('Active','Superseded','Under Revision','Withdrawn','Draft') NOT NULL DEFAULT 'Active',
  `revision`          VARCHAR(32) DEFAULT NULL,
  `replacement_code`  VARCHAR(64) DEFAULT NULL,
  `is_demonstration`  TINYINT(1) NOT NULL DEFAULT 1,
  `embedding`         LONGTEXT DEFAULT NULL,   -- JSON list[float]
  `embedding_model`   VARCHAR(160) DEFAULT NULL,
  `embedding_dim`     SMALLINT UNSIGNED DEFAULT NULL,
  `embedding_updated_at` DATETIME DEFAULT NULL,
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_standards_is_number` (`is_number`),
  KEY `ix_standards_sector` (`sector`),
  KEY `ix_standards_category` (`category`),
  KEY `ix_standards_status` (`status`),
  KEY `ix_standards_year` (`year`),
  KEY `ix_standards_product` (`product`),
  FULLTEXT KEY `ft_standards_search` (`is_number`,`title`,`product`,`scope`,`description`,`keywords`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  standard_keywords  -  One row per keyword. Used by the keyword-similarity
--  factor and by keyword filters in Standards Explorer.
-- =============================================================================
CREATE TABLE `standard_keywords` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `standard_id` INT UNSIGNED NOT NULL,
  `keyword`     VARCHAR(191) NOT NULL,
  `weight`      DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_std_keyword` (`standard_id`,`keyword`),
  KEY `ix_keyword_value` (`keyword`),
  CONSTRAINT `fk_keyword_standard`
    FOREIGN KEY (`standard_id`) REFERENCES `standards` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  standard_requirements  -  Clause-level requirements extracted per standard.
--  Drives the "matched requirements" evidence shown in explanations.
-- =============================================================================
CREATE TABLE `standard_requirements` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `standard_id`      INT UNSIGNED NOT NULL,
  `requirement_code` VARCHAR(32) DEFAULT NULL,
  `requirement_text` TEXT NOT NULL,
  `requirement_type` ENUM('technical','performance','safety','material','testing','marking','inspection','durability','other')
                     NOT NULL DEFAULT 'technical',
  `is_mandatory`     TINYINT(1) NOT NULL DEFAULT 1,
  `notes`            VARCHAR(255) DEFAULT NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_requirement_standard` (`standard_id`),
  KEY `ix_requirement_type` (`requirement_type`),
  FULLTEXT KEY `ft_requirement_text` (`requirement_text`),
  CONSTRAINT `fk_requirement_standard`
    FOREIGN KEY (`standard_id`) REFERENCES `standards` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  procurement_queries  -  Every analysed specification is persisted here.
--  This is the persistent search history.
-- =============================================================================
CREATE TABLE `procurement_queries` (
  `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`                  INT UNSIGNED DEFAULT NULL,
  `specification`            TEXT NOT NULL,
  `product_category`         VARCHAR(200) DEFAULT NULL,
  `sector`                   VARCHAR(120) DEFAULT NULL,
  `quantity`                 VARCHAR(120) DEFAULT NULL,
  `technical_requirements`   TEXT,
  `material`                 VARCHAR(200) DEFAULT NULL,
  `application`              VARCHAR(200) DEFAULT NULL,
  `additional_requirements`  TEXT,
  `extracted_product`        VARCHAR(200) DEFAULT NULL,
  `extracted_material`       VARCHAR(200) DEFAULT NULL,
  `extracted_application`    VARCHAR(200) DEFAULT NULL,
  `extracted_sector`         VARCHAR(120) DEFAULT NULL,
  `extracted_requirements`   TEXT,          -- JSON list[str]
  `extracted_parameters`     TEXT,          -- JSON dict, e.g. {"pressure_mpa": 16}
  `extraction_confidence`    DECIMAL(4,3) NOT NULL DEFAULT 0.000,
  `status`                   ENUM('analyzed','partial','failed') NOT NULL DEFAULT 'analyzed',
  `recommendation_count`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `top_is_number`            VARCHAR(64) DEFAULT NULL,
  `top_match_score`          DECIMAL(5,2) DEFAULT NULL,
  `processing_ms`            INT UNSIGNED DEFAULT NULL,
  `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_query_created` (`created_at`),
  KEY `ix_query_user` (`user_id`),
  KEY `ix_query_sector` (`sector`),
  KEY `ix_query_product` (`extracted_product`),
  CONSTRAINT `fk_query_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  recommendations  -  Ranked engine output for each analysed query.
--  Every scoring factor is stored so results are fully explainable/auditable.
-- =============================================================================
CREATE TABLE `recommendations` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `query_id`             INT UNSIGNED NOT NULL,
  `standard_id`          INT UNSIGNED NOT NULL,
  `rank`                 SMALLINT UNSIGNED NOT NULL,
  `match_score`          DECIMAL(5,2) NOT NULL,   -- final relevance 0-100
  `semantic_score`       DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `keyword_score`        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `product_score`        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `sector_score`         DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `requirement_score`    DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `application_score`    DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `matched_requirements` TEXT,   -- JSON list[str]
  `matched_keywords`     TEXT,   -- JSON list[str]
  `reason`               TEXT,   -- plain-language explanation
  `created_at`           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_recommendation` (`query_id`,`standard_id`),
  KEY `ix_recommendation_rank` (`query_id`,`rank`),
  KEY `ix_recommendation_standard` (`standard_id`),
  CONSTRAINT `fk_recommendation_query`
    FOREIGN KEY (`query_id`) REFERENCES `procurement_queries` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_recommendation_standard`
    FOREIGN KEY (`standard_id`) REFERENCES `standards` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  saved_standards  -  Bookmarks / shortlist per user.
-- =============================================================================
CREATE TABLE `saved_standards` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED DEFAULT NULL,
  `standard_id` INT UNSIGNED NOT NULL,
  `query_id`    INT UNSIGNED DEFAULT NULL,
  `notes`       TEXT,
  `tag`         VARCHAR(80) DEFAULT NULL,
  `saved_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_saved_user_standard` (`user_id`,`standard_id`),
  KEY `ix_saved_standard` (`standard_id`),
  KEY `ix_saved_saved_at` (`saved_at`),
  CONSTRAINT `fk_saved_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_saved_standard`
    FOREIGN KEY (`standard_id`) REFERENCES `standards` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_saved_query`
    FOREIGN KEY (`query_id`) REFERENCES `procurement_queries` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  =============================================================================
-- =============================================================================
--  engine_state  -  small key/value table used by the backend to record
--  vector-index build state (which ids are indexed, with which model, when).
-- =============================================================================
CREATE TABLE `engine_state` (
  `key`        VARCHAR(64) NOT NULL,
  `value`      TEXT NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
--  DEMONSTRATION DATA
--  ---------------------------------------------------------------------------
--  Generated from data/sample_standards.csv via scripts/import_standards.py.
--  Regenerate with:  python scripts/export_sql.py
--
--  >>> DEMONSTRATION DATA - placeholder metadata written for the SIH26108
--  >>> prototype so the application runs out of the box.
--  >>> These are NOT verified BIS records. Replace with verified / licensed
--  >>> metadata before any real-world deployment. Verify any real requirement
--  >>> against https://www.bis.gov.in
--  =============================================================================

-- IS 1015:2019 | High strength deformed steel bars for concrete reinforcement - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1015:2019','High strength deformed steel bars for concrete reinforcement - specification','Construction','Construction','Reinforcing steel bar (TMT)','Covers high strength deformed steel bars used as reinforcement in concrete structures, including chemical composition, mechanical properties, dimensional tolerances and surface condition.','This specification covers requirements for high strength deformed steel bars used in reinforced concrete, including grade identification, tensile and yield strength testing, elongation requirements, bend and re-bend test criteria, dimensional tolerances, mass per unit length, surface condition and permissible chloride, sulphur and phosphorus content. Applies to bars supplied in straight lengths or coils for use in slabs, beams, columns, footings and other reinforced concrete structural elements.','reinforcement;rebar;tmt;deformed steel;high strength steel;concrete;yield strength;tensile strength;bend test;re-bend test;corrosion;bar;structural steel;grade 500','Minimum yield strength of 500 MPa for Grade 500;Minimum tensile strength of 550 MPa;Minimum elongation of 12 percent;Maximum carbon content of 0.30 percent;Maximum sulphur of 0.06 percent;Maximum phosphorus of 0.05 percent;Maximum chloride of 0.04 percent;Free bend test at 180 degrees to be passed;Re-bend test to be passed;Rib geometry and pitch to be uniform;Mass per unit length within specified tolerance','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2019,'Active','Rev. 4',1);

-- keywords for IS 1015:2019
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'reinforcement' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'rebar' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tmt' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'deformed steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'high strength steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'concrete' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'yield strength' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tensile strength' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bend test' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 're-bend test' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'corrosion' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bar' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'grade 500' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1015:2019';

-- requirements for IS 1015:2019
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum yield strength of 500 MPa for Grade 500' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Minimum tensile strength of 550 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Minimum elongation of 12 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Maximum carbon content of 0.30 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Maximum sulphur of 0.06 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Maximum phosphorus of 0.05 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Maximum chloride of 0.04 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Free bend test at 180 degrees to be passed' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Re-bend test to be passed' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_10' AS `requirement_code`, 'Rib geometry and pitch to be uniform' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_11' AS `requirement_code`, 'Mass per unit length within specified tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1015:2019';

-- IS 1031:1982 | Specification of industrial luminaires
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1031:1982','Specification of industrial luminaires','Electrical','Electrical','LED luminaire','Covers general purpose lighting luminaires for industrial premises, specifying photometric, electrical and performance requirements including energy efficiency.','This specification covers industrial luminaires for general lighting and includes requirements for luminous flux, power consumption, colour rendering index, power factor, harmonic distortion, thermal performance and durability of the fitting.','led luminaire;light fixture;led light;industrial lighting;illumination;energy efficient led;lamp;electrical;photometry;luminaire','Luminous flux efficacy of at least 100 lumens per watt;Correlated colour temperature between 3000 K and 6500 K;Colour rendering index of at least 70;Power factor of at least 0.9;Total harmonic distortion below 10 percent;Luminaire to be rated for 220 V, 50 Hz;Ingress protection as per declared class;Warranty of minimum 2 years on driver','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1982,'Active','Rev. 1',1);

-- keywords for IS 1031:1982
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'led luminaire' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'light fixture' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'led light' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial lighting' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'illumination' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'energy efficient led' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'lamp' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electrical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'photometry' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'luminaire' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1031:1982';

-- requirements for IS 1031:1982
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Luminous flux efficacy of at least 100 lumens per watt' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Correlated colour temperature between 3000 K and 6500 K' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Colour rendering index of at least 70' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Power factor of at least 0.9' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Total harmonic distortion below 10 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Luminaire to be rated for 220 V, 50 Hz' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Ingress protection as per declared class' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Warranty of minimum 2 years on driver' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1031:1982';

-- IS 1057:1983 | Specification for wrought iron upstands, handrails and ladders
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1057:1983','Specification for wrought iron upstands, handrails and ladders','Construction','Construction','MS handrail','Covers wrought iron and mild steel handrails, balustrades, ladders and gratings for industrial, commercial and domestic use, including load and dimensional requirements.','This specification covers mild steel and wrought iron structural components such as handrails, balustrades, staircases, ladders and gratings used in buildings and industrial structures, and includes material, fabrication, weld, finish and load requirements.','handrail;balustrade;grating;ladder;staircase;structural steel;mild steel;galvanised;walkway;construction','Minimum yield strength of 250 MPa for structural members;Galvanising of not less than 65 microns;Weld quality as per standard practice;Dimensions and tolerances as per design;Load carrying capacity to be verified;Free from sharp edges;Marking of grade and batch','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1983,'Active','Rev. 1',1);

-- keywords for IS 1057:1983
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'handrail' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'balustrade' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'grating' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ladder' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'staircase' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mild steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'galvanised' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'walkway' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'construction' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1057:1983';

-- requirements for IS 1057:1983
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum yield strength of 250 MPa for structural members' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Galvanising of not less than 65 microns' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Weld quality as per standard practice' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Dimensions and tolerances as per design' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Load carrying capacity to be verified' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Free from sharp edges' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Marking of grade and batch' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1057:1983';

-- IS 11380:1978 | V-belts - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 11380:1978','V-belts - specification','Mechanical','Mechanical','Industrial V-belt','Covers dimensions, tolerances and quality requirements for V-belts of trapezoidal cross section used for power transmission in industrial drives.','This specification covers V-belts of trapezoidal cross section used in power transmission applications and sets requirements for section dimensions, pitch lengths, tensile strength, pulley groove tolerances and quality.','v belt;belt drive;rubber belt;power transmission;industrial belt;pulley;mechanical;drive;conveyor;polyester','Pitch length within specified tolerance;Tensile strength of cord layer;Section height and groove angle as per standard;Rib number count for higher horsepower;Pulleys to conform to groove dimensions;Oil and heat resistance;Static friction and flex fatigue testing;Marking of pitch length, section and date','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1978,'Active','Rev. 1',1);

-- keywords for IS 11380:1978
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'v belt' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'belt drive' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'rubber belt' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'power transmission' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial belt' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pulley' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mechanical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'drive' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'conveyor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'polyester' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 11380:1978';

-- requirements for IS 11380:1978
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Pitch length within specified tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Tensile strength of cord layer' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Section height and groove angle as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Rib number count for higher horsepower' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Pulleys to conform to groove dimensions' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Oil and heat resistance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Static friction and flex fatigue testing' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of pitch length, section and date' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 11380:1978';

-- IS 12288:1987 | Valves - specification for malleable iron and cast iron gate valves
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 12288:1987','Valves - specification for malleable iron and cast iron gate valves','Water','Mechanical','Gate valve','Covers gate valves of cast iron and malleable iron for water and steam service, specifying pressure classes, materials, dimensions and test requirements.','This specification covers gate valves of cast iron and malleable iron suitable for water and steam services and sets requirements for pressure rating, materials, design, dimensions, face to face dimension, hydrostatic test, seat leakage test and marking.','gate valve;valve;water valve;cast iron valve;malleable iron;pipe fitting;flow control;hydraulic;isolation valve;water service','Hydrostatic shell test at 1.5 times rating pressure;Seat leakage test as per class;Face to face dimensions as per standard;Body material of cast iron grade;Spindle of non corrosive material;Maximum temperature rating of 200 degree C;Operating torque to be specified;Marking of size, pressure class and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1987,'Active','Rev. 1',1);

-- keywords for IS 12288:1987
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'gate valve' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'valve' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water valve' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cast iron valve' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'malleable iron' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pipe fitting' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'flow control' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hydraulic' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'isolation valve' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water service' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12288:1987';

-- requirements for IS 12288:1987
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Hydrostatic shell test at 1.5 times rating pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Seat leakage test as per class' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Face to face dimensions as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Body material of cast iron grade' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Spindle of non corrosive material' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Maximum temperature rating of 200 degree C' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Operating torque to be specified' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of size, pressure class and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12288:1987';

-- IS 12540:2013 | Soda ash - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 12540:2013','Soda ash - specification','Food','Chemical','Chemicals for water treatment','Covers soda ash used in water treatment and other industrial applications, specifying purity, bulk density and loss on ignition.','This specification covers soda ash used in water softening and industrial applications and specifies chemical purity, bulk density, loss on ignition, iron content, insoluble matter and packaging requirements.','chemical;soda ash;water treatment;industrial chemical;softening;powder;bulk density;chemical grade;plant;treatment','Minimum purity of 98.5 percent Na2CO3;Bulk density of 0.9 to 1.1 g per ml;Loss on ignition not above 2 percent;Iron content within limits;Insoluble matter below 0.1 percent;Moisture below 1 percent;Packaging in airtight bags;Batch marking and traceable records;Shelf life of 12 months','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2013,'Active','Rev. 1',1);

-- keywords for IS 12540:2013
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'chemical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'soda ash' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water treatment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial chemical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'softening' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'powder' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bulk density' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'chemical grade' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'plant' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'treatment' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12540:2013';

-- requirements for IS 12540:2013
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum purity of 98.5 percent Na2CO3' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Bulk density of 0.9 to 1.1 g per ml' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Loss on ignition not above 2 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Iron content within limits' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Insoluble matter below 0.1 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Moisture below 1 percent' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Packaging in airtight bags' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Batch marking and traceable records' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Shelf life of 12 months' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12540:2013';

-- IS 12640:2010 | Miniature circuit breakers - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 12640:2010','Miniature circuit breakers - specification','Electrical','Electrical','MCB / circuit breaker','Covers miniature circuit breakers for household and similar applications including ratings, breaking capacity, trip characteristics and endurance tests.','This specification covers miniature circuit breakers used for protection of household and similar installations against overloads and short circuits, and includes rating, breaking capacity, number of operations, temperature rise, mechanical strength and terminal arrangement requirements.','mcb;circuit breaker;miniature circuit breaker;switchgear;electrical protection;trip unit;distribution board;residential wiring;overcurrent','Rated breaking capacity of 6 kA or 9 kA;Tripping characteristic per B or C curve;1000 electrical operations at rated current;50 mechanical operations;Dielectric strength at 1500 V AC for one minute;Terminals to accept specified conductor sizes;Temperature rise limit of 40 K;Marking of rated current, curve and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2010,'Active','Rev. 1',1);

-- keywords for IS 12640:2010
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'mcb' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'circuit breaker' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'miniature circuit breaker' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'switchgear' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electrical protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'trip unit' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'distribution board' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'residential wiring' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'overcurrent' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12640:2010';

-- requirements for IS 12640:2010
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Rated breaking capacity of 6 kA or 9 kA' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Tripping characteristic per B or C curve' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, '1000 electrical operations at rated current' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, '50 mechanical operations' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Dielectric strength at 1500 V AC for one minute' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Terminals to accept specified conductor sizes' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Temperature rise limit of 40 K' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of rated current, curve and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12640:2010';

-- IS 12834:2010 | Energy efficient electric motors - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 12834:2010','Energy efficient electric motors - specification','Electrical','Electrical','Three phase induction motor','Covers energy efficient three phase squirrel cage induction motors for industrial use, including efficiency grades, performance and testing requirements.','This specification covers energy efficient three phase induction motors up to a defined output range used in industrial applications, and specifies efficiency grades, power factor, starting performance, insulation class, enclosure, noise and test methods.','induction motor;electric motor;energy efficient motor;three phase motor;industrial motor;motors;electrical equipment;prime mover;efficiency','Efficiency conforming to IS 12647 defined grades;Minimum power factor of 0.85;Insulation class B;Continuous rated duty S1;Enclosure protection as declared;Noise level limit as per standard;Star rating labelling;Vibration limits;Marking of kW, HP, efficiency class and IS number','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2010,'Active','Rev. 1',1);

-- keywords for IS 12834:2010
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'induction motor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electric motor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'energy efficient motor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'three phase motor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial motor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'motors' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electrical equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'prime mover' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'efficiency' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12834:2010';

-- requirements for IS 12834:2010
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Efficiency conforming to IS 12647 defined grades' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Minimum power factor of 0.85' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Insulation class B' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Continuous rated duty S1' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Enclosure protection as declared' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Noise level limit as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Star rating labelling' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Vibration limits' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of kW, HP, efficiency class and IS number' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 12834:2010';

-- IS 13662:2002 | Drip irrigation system - specification and components
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 13662:2002','Drip irrigation system - specification and components','Agriculture','Agriculture','Drip irrigation lateral','Covers drip irrigation systems, laterals, laterals emitters, filters and control equipment used for water saving irrigation in agriculture.','This specification covers drip irrigation equipment including lateral pipes, emitters, filters, valves and control devices, and specifies hydraulic characteristics, emission uniformity, filtration requirements, materials and test methods.','drip irrigation;irrigation;emitter;lateral;agriculture;water saving;micro irrigation;farming;pipe;pressure system;farm','Uniformity of discharge not less than 90 percent;Emitter discharge rate within tolerance;Bursting pressure of at least 2 times working pressure;Clogging resistance;Filtration micron level as required;UV resistant material;Emitter spacing flexibility;Marking of emitter type and flow rate','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2002,'Active','Rev. 1',1);

-- keywords for IS 13662:2002
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'drip irrigation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'irrigation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'emitter' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'lateral' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'agriculture' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water saving' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'micro irrigation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'farming' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pressure system' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'farm' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 13662:2002';

-- requirements for IS 13662:2002
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Uniformity of discharge not less than 90 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Emitter discharge rate within tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Bursting pressure of at least 2 times working pressure' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Clogging resistance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Filtration micron level as required' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'UV resistant material' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Emitter spacing flexibility' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of emitter type and flow rate' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 13662:2002';

-- IS 1389:2001 | Personal protective equipment - safety helmets
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1389:2001','Personal protective equipment - safety helmets','Safety','Safety','Safety helmet','Covers industrial safety helmets used for protection of the wearer against impact from falling objects and against penetration by sharp projections, specifying materials, construction, tests and marking.','This specification covers industrial safety helmets for protection of the wearer against mechanical impact and penetration, and specifies shell construction, material requirements, shock absorption, resistance to penetration, flame resistance, field of vision, retention system and test methods.','safety helmet;hard hat;head protection;personal protective equipment;ppe;industrial safety;impact protection;penetration resistance;worker safety;construction safety','Resistance to impact by steel ball dropped from height;Resistance to penetration by pointed rod;Flame resistance test;Field of vision of at least 120 degrees;Retention system of chin strap;Mass of helmet below 450 grams;Headband of HDPE or similar;Electrical insulation up to 1000 V;Marking of IS number, size and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2001,'Active','Rev. 2',1);

-- keywords for IS 1389:2001
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'safety helmet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hard hat' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'head protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'personal protective equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ppe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'impact protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'penetration resistance' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'worker safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'construction safety' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1389:2001';

-- requirements for IS 1389:2001
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Resistance to impact by steel ball dropped from height' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Resistance to penetration by pointed rod' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Flame resistance test' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Field of vision of at least 120 degrees' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Retention system of chin strap' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Mass of helmet below 450 grams' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Headband of HDPE or similar' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Electrical insulation up to 1000 V' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of IS number, size and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1389:2001';

-- IS 1409:2015 | Corrosion resistant steel bars - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1409:2015','Corrosion resistant steel bars - specification','Construction','Construction','Stainless steel reinforcement bar','Covers corrosion resistant steel bars including stainless steel and epoxy coated bars used as reinforcement in concrete, specifying material, coating and bond strength.','This specification covers corrosion resistant reinforcing bars including stainless steel bars and epoxy coated bars used in concrete and specifies steel grade, coating thickness, coating quality, bond strength and bend tests.','stainless steel rebar;corrosion resistant steel;epoxy coated rebar;reinforcement;concrete;construction;bar;coated steel;structural;marine structure','Tensile strength of at least 500 MPa;Epoxy coating thickness of 600 to 800 microns;Coating to be free from holidays and pinholes;Bond strength of coating;Bend test after coating;Chloride resistance of stainless steel grade;Coating repair at damaged areas;Marking of grade and batch','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2015,'Active','Rev. 1',1);

-- keywords for IS 1409:2015
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'stainless steel rebar' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'corrosion resistant steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'epoxy coated rebar' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'reinforcement' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'concrete' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'construction' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bar' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'coated steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'marine structure' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1409:2015';

-- requirements for IS 1409:2015
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Tensile strength of at least 500 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Epoxy coating thickness of 600 to 800 microns' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Coating to be free from holidays and pinholes' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Bond strength of coating' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Bend test after coating' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Chloride resistance of stainless steel grade' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Coating repair at damaged areas' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of grade and batch' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1409:2015';

-- IS 1411:2019 | Textiles - fire retardant fabrics - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1411:2019','Textiles - fire retardant fabrics - specification','Textiles','Safety','Fire retardant fabric','Covers fire retardant treatment of cotton, polyester and blended fabrics for protective clothing, curtains and upholstery, specifying flame resistance tests.','This specification covers fire retardant finished fabrics of cotton, polyester and cotton polyester blends used for protective apparel, curtains and upholstered furniture and specifies limits of flame resistance, heat release and smoke emission with test methods.','fire retardant fabric;flame retardant;textile;protective clothing;curtain fabric;upholstery;fire safety;industrial textile;flame resistance;blended fabric','Flame resistance to vertical and 45 degree burning test;Char length limit after removal of flame;After flame duration not to exceed 2 seconds;Heat release index limits;Smoke density limits;Wash durability of flame retardant finish for 20 washes;No toxic emissions on burning;Marking of treatment and test report','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2019,'Active','Rev. 1',1);

-- keywords for IS 1411:2019
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'fire retardant fabric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'flame retardant' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'textile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'protective clothing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'curtain fabric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'upholstery' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fire safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial textile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'flame resistance' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'blended fabric' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1411:2019';

-- requirements for IS 1411:2019
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Flame resistance to vertical and 45 degree burning test' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Char length limit after removal of flame' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'After flame duration not to exceed 2 seconds' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Heat release index limits' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Smoke density limits' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Wash durability of flame retardant finish for 20 washes' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'No toxic emissions on burning' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of treatment and test report' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1411:2019';

-- IS 14505:1998 | Personal protective equipment - fall arrest systems
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 14505:1998','Personal protective equipment - fall arrest systems','Safety','Safety','Safety harness / fall protection','Covers full body harness, lanyards and anchor systems for protection against falls from height, specifying materials, static strength and dynamic testing requirements.','This specification covers full body harnesses, lanyards, anchorages and other components of fall protection systems for working at height, and specifies requirements for webbing, hardware, static strength testing, dynamic performance and marking.','safety harness;fall protection;fall arrest;work at height;lanyard;personal protective equipment;industrial safety;confined space;height safety;anchor','Static load test on harness to 6 kN for 3 minutes;Dynamic fall test with 100 kg test mass;Webbing tensile strength requirement;Hardware to have a minimum breaking load;Corrosion resistance of hardware;Lanyard maximum length;Self retracting lifeline as per standard;Marking of standard, size and inspection date','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1998,'Active','Rev. 1',1);

-- keywords for IS 14505:1998
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'safety harness' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fall protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fall arrest' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'work at height' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'lanyard' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'personal protective equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'confined space' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'height safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'anchor' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 14505:1998';

-- requirements for IS 14505:1998
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Static load test on harness to 6 kN for 3 minutes' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Dynamic fall test with 100 kg test mass' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Webbing tensile strength requirement' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Hardware to have a minimum breaking load' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Corrosion resistance of hardware' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Lanyard maximum length' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Self retracting lifeline as per standard' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of standard, size and inspection date' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 14505:1998';

-- IS 14543:2011 | Packaged drinking water - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 14543:2011','Packaged drinking water - specification','Food','Food','Packaged drinking water','Covers packaged drinking water processed and packaged in containers up to 20 litres, specifying quality, testing and packaging requirements.','This specification covers packaged drinking water processed in an approved plant and packaged in containers of capacity not exceeding 20 litres and specifies requirements for source water, treatment, microbiological and chemical quality, packaging and labelling.','drinking water;packaged water;water bottle;potable water;food safety;water quality;purified water;hygiene;mineral water','Total coliform count not detectable in 100 ml;Residual chlorine between 0.1 and 0.5 mg per litre;Heavy metals within permissible limits;Packaging material food grade;Batch identification and manufacture date;Source water quality to be monitored;Plant hygiene and cleaning schedule;No pesticide residue above limits;Marking of net volume, batch and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2011,'Active','Rev. 1',1);

-- keywords for IS 14543:2011
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'drinking water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'packaged water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water bottle' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'potable water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'food safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water quality' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'purified water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hygiene' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mineral water' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 14543:2011';

-- requirements for IS 14543:2011
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Total coliform count not detectable in 100 ml' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Residual chlorine between 0.1 and 0.5 mg per litre' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Heavy metals within permissible limits' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Packaging material food grade' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Batch identification and manufacture date' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Source water quality to be monitored' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Plant hygiene and cleaning schedule' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'No pesticide residue above limits' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of net volume, batch and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 14543:2011';

-- IS 1522:1960 | Personal protective equipment - safety shoes
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1522:1960','Personal protective equipment - safety shoes','Safety','Safety','Safety footwear','Covers industrial safety footwear with steel toe protection, specifying construction, materials, tests for impact, compression, puncture and slip resistance.','This specification covers industrial safety shoes used for protection of the feet and legs of workers against impact, compression, penetration by nails, and slipping, and sets requirements for upper, sole, toe cap, penetration resistant insole and testing.','safety shoes;safety footwear;steel toe cap;industrial footwear;personal protective equipment;worker safety;anti slip sole;foot protection;leather shoe','Impact test on toe cap;Compression test to be passed;Penetration resistance of sole at 110 N;Anti slip resistance of sole compound;Minimum energy absorption of sole;Upper of leather or synthetic material;Heel and sole separation strength;Marking of size, manufacturer and IS number','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1960,'Active','Rev. 1',1);

-- keywords for IS 1522:1960
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'safety shoes' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'safety footwear' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel toe cap' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial footwear' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'personal protective equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'worker safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'anti slip sole' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'foot protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'leather shoe' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1522:1960';

-- requirements for IS 1522:1960
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Impact test on toe cap' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Compression test to be passed' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Penetration resistance of sole at 110 N' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Anti slip resistance of sole compound' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Minimum energy absorption of sole' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Upper of leather or synthetic material' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Heel and sole separation strength' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of size, manufacturer and IS number' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1522:1960';

-- IS 15712:2004 | Unplasticised polyvinyl chloride pipes for potable water supplies - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 15712:2004','Unplasticised polyvinyl chloride pipes for potable water supplies - specification','Water','Water','uPVC drinking water pipe','Covers unplasticised PVC pipes intended for potable water supply including dimensions, wall thickness, hydraulic pressure, tensile strength and chlorine resistance requirements.','This specification covers solid wall unplasticised polyvinyl chloride pipes for potable water supplies and specifies materials, dimensions, tolerances, physical and mechanical properties, resistance to internal pressure, chlorine resistance, jointing and marking requirements.','pvc pipe;upvc;potable water;drinking water;water supply;pressure pipe;hdpe;piping;sanitation;chlorine resistance;water','Minimum burst pressure of 6.9 MPa at test pressure;Hydrostatic test pressure of 6 MPa for 1 hour;Tensile strength of at least 41 MPa;Minimum impact strength as per standard;Chlorine resistance at 1 ppm chlorine for 300 hours;Maximum lead content of 0.01 percent;Wall thickness as per class of pressure;Bore of pipes to be free from defects','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2004,'Active','Rev. 2',1);

-- keywords for IS 15712:2004
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'pvc pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'upvc' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'potable water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'drinking water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water supply' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pressure pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hdpe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'piping' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'sanitation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'chlorine resistance' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 15712:2004';

-- requirements for IS 15712:2004
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum burst pressure of 6.9 MPa at test pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Hydrostatic test pressure of 6 MPa for 1 hour' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Tensile strength of at least 41 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Minimum impact strength as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Chlorine resistance at 1 ppm chlorine for 300 hours' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Maximum lead content of 0.01 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Wall thickness as per class of pressure' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Bore of pipes to be free from defects' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 15712:2004';

-- IS 1578:2005 | Spices - turmeric powder - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1578:2005','Spices - turmeric powder - specification','Food','Food','Turmeric powder','Covers turmeric powder including pure turmeric and blends, specifying quality parameters, curcumin content, moisture and contaminants.','This specification covers turmeric powder offered for human consumption and specifies requirements for curcumin content, moisture, total ash, acid insoluble ash, foreign matter, and freedom from adulterants and contaminants.','turmeric;spice;powder;food;curcumin;food grade;agriculture produce;kitchen;herbal;haldi;food processing','Minimum curcumin content of 3 percent for pure turmeric;Moisture content not above 10 percent;Total ash not above 9 percent;Acid insoluble ash not above 0.5 percent;Absence of starch adulteration;No sulphur or colour additives;Clean and hygienic processing;Packaging in food grade material;Marking of net weight, batch and best before date','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2005,'Active','Rev. 1',1);

-- keywords for IS 1578:2005
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'turmeric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'spice' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'powder' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'food' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'curcumin' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'food grade' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'agriculture produce' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'kitchen' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'herbal' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'haldi' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'food processing' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1578:2005';

-- requirements for IS 1578:2005
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum curcumin content of 3 percent for pure turmeric' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Moisture content not above 10 percent' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Total ash not above 9 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Acid insoluble ash not above 0.5 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Absence of starch adulteration' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'No sulphur or colour additives' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Clean and hygienic processing' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Packaging in food grade material' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of net weight, batch and best before date' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1578:2005';

-- IS 1633:1992 | Mosquito netting - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 1633:1992','Mosquito netting - specification','Textiles','Healthcare','Mosquito net','Covers mosquito nets of synthetic and cotton fabrics including dimensions, mesh size, strength and treatment requirements.','This specification covers mosquito nets used for personal protection against mosquito bites in cotton, polyester and blended fabrics and specifies mesh size, dimensions, tensile strength, colour, treatment and marking.','mosquito net;net;cotton net;polyester net;textile;bed net;healthcare;insect net;household textile;mesh','Mesh size of not less than 20 holes per square cm;Tensile strength of fabric warp and weft;Dimensions as declared;Colour fastness to washing;Treatment with insecticide to be declared;Hem and selvedge strength;Free from defects;Marking of size, material and batch;Durable stitching throughout','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1992,'Active','Rev. 1',1);

-- keywords for IS 1633:1992
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'mosquito net' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'net' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cotton net' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'polyester net' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'textile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bed net' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'healthcare' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'insect net' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'household textile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mesh' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1633:1992';

-- requirements for IS 1633:1992
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Mesh size of not less than 20 holes per square cm' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Tensile strength of fabric warp and weft' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Dimensions as declared' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Colour fastness to washing' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Treatment with insecticide to be declared' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Hem and selvedge strength' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Free from defects' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of size, material and batch' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Durable stitching throughout' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 1633:1992';

-- IS 2525:1981 | Fire resistant plywood - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 2525:1981','Fire resistant plywood - specification','Construction','Safety','Fire resistant plywood','Covers fire resistant plywood, plywood jointing and panel boards for use in building construction, testing fire resistance to IS 1708 flame spread.','This specification covers fire resistant plywood used in building construction for interior applications and specifies construction, bonding, veneer quality, flame spread rating, screw holding strength and dimensions.','fire resistant plywood;plywood;flame retardant;fire safety;wood panel;interior panel;construction material;board;fire rating;wood product','Flame spread rating per IS 1708 test;Minimum veneer thickness and bond quality;Moisture content below 12 percent;Screw holding strength requirement;Free from defects and warp;Panel sizes as per standard;Marking of grade, size and manufacturer;Surface sealed;No knots in structural layers','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1981,'Active','Rev. 1',1);

-- keywords for IS 2525:1981
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'fire resistant plywood' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'plywood' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'flame retardant' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fire safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'wood panel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'interior panel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'construction material' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'board' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fire rating' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'wood product' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 2525:1981';

-- requirements for IS 2525:1981
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Flame spread rating per IS 1708 test' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Minimum veneer thickness and bond quality' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Moisture content below 12 percent' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Screw holding strength requirement' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Free from defects and warp' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Panel sizes as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Marking of grade, size and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Surface sealed' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'No knots in structural layers' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 2525:1981';

-- IS 2543:1991 | Textiles - cotton canvas, duck and sheet - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 2543:1991','Textiles - cotton canvas, duck and sheet - specification','Textiles','Textiles','Cotton canvas','Covers cotton canvas, duck and sheet woven fabrics for industrial and domestic use, specifying construction, thread count, tensile strength and shrinkage requirements.','This specification covers cotton canvas, cotton duck and cotton sheet fabrics used for industrial, tarpaulin, belting and domestic applications and specifies warp and weft counts, mass, tensile and tear strength, abrasion and dimensional stability.','cotton canvas;duck;cotton fabric;textile;woven fabric;canvas sheet;industrial fabric;tarpaulin;home furnishing;fabric','Warp and weft threads per centimetre as declared;Mass per square metre within tolerance;Minimum tensile strength warp and weft;Tear strength requirement;Shrinkage after washing below 4 percent;Colour fastness to washing;Marking of fabric code, composition and batch;Free from defects and stains','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1991,'Active','Rev. 1',1);

-- keywords for IS 2543:1991
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'cotton canvas' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'duck' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cotton fabric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'textile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'woven fabric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'canvas sheet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial fabric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tarpaulin' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'home furnishing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fabric' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 2543:1991';

-- requirements for IS 2543:1991
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Warp and weft threads per centimetre as declared' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Mass per square metre within tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Minimum tensile strength warp and weft' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Tear strength requirement' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Shrinkage after washing below 4 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Colour fastness to washing' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Marking of fabric code, composition and batch' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Free from defects and stains' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 2543:1991';

-- IS 3006:1990 | Specification for electrical switchgear and controlgear
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 3006:1990','Specification for electrical switchgear and controlgear','Electrical','Electrical','Distribution switchgear','Covers low voltage switchgear and controlgear assemblies used for distribution of electrical power, specifying construction, performance and test requirements.','This specification covers low voltage switchgear and controlgear assemblies and specifies requirements for enclosures, busbars, insulation, creepage distances, short circuit withstand, temperature rise and routine verification tests.','switchgear;controlgear;panel;distribution board;electrical panel;busbar;low voltage;switchboard;circuit protection;electrical enclosure','Rated short circuit withstand of 25 kA for 1 second;Temperature rise limit of 55 K;Clearance and creepage distances as per insulation level;Busbar to be of electrolytic copper;Enclosure sheet thickness of 1.6 mm;Routine dielectric strength test at 1000 V AC;Ingress protection of IP 54 for indoor;Marking of rated current and system','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1990,'Active','Rev. 2',1);

-- keywords for IS 3006:1990
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'switchgear' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'controlgear' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'panel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'distribution board' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electrical panel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'busbar' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'low voltage' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'switchboard' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'circuit protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electrical enclosure' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3006:1990';

-- requirements for IS 3006:1990
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Rated short circuit withstand of 25 kA for 1 second' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Temperature rise limit of 55 K' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Clearance and creepage distances as per insulation level' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Busbar to be of electrolytic copper' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Enclosure sheet thickness of 1.6 mm' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Routine dielectric strength test at 1000 V AC' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Ingress protection of IP 54 for indoor' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of rated current and system' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3006:1990';

-- IS 3025:2015 | Mild steel tubes, pipes and fittings
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 3025:2015','Mild steel tubes, pipes and fittings','Mechanical','Mechanical','MS pipe (structural)','Covers mild steel tubes, pipes and fittings of rectangular and circular sections used for structural, mechanical and general engineering purposes.','This specification covers mild steel tubes, pipes, hollow sections and fittings used in structural and general engineering work and specifies material grade, dimensions, tolerances, surface condition, weld quality and mechanical tests.','ms pipe;steel tube;structural pipe;hollow section;steel fitting;mechanical;general engineering;structural steel;galvanised pipe;framework','Yield strength of at least 240 MPa;Elongation of at least 20 percent;Weld quality as per standard;Flattening and flaring tests;Dimensions within tolerance;Surface free from defects;Galvanised coating where required;Marking of grade, size and standard','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2015,'Active','Rev. 2',1);

-- keywords for IS 3025:2015
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'ms pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel tube' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hollow section' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel fitting' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mechanical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'general engineering' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'galvanised pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'framework' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3025:2015';

-- requirements for IS 3025:2015
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Yield strength of at least 240 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Elongation of at least 20 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Weld quality as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Flattening and flaring tests' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Dimensions within tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Surface free from defects' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Galvanised coating where required' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of grade, size and standard' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3025:2015';

-- IS 3075:1994 | Rolling bearings - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 3075:1994','Rolling bearings - specification','Mechanical','Mechanical','Ball bearing','Covers boundary dimensions, accuracy, life and internal design of rolling bearings, and specifies requirements for dynamic load rating, fatigue life, materials and inspection.','This specification covers boundary dimensions, accuracy classes, internal clearances, dynamic and static load ratings, fatigue life, materials and inspection requirements for rolling bearings used in industrial machinery.','ball bearing;roller bearing;bearing;rolling bearing;bearing life;mechanical;industrial bearing;lube;skid;steel;chrome steel','Dynamic load rating based on basic rating life of 1 million revolutions;Materials of high carbon chromium steel;Bore and outside diameter tolerance classes;Radial clearance per class;Static load rating to be specified;Hardness of rolling elements;Lubrication and sealing arrangements;Marking of size, class and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1994,'Active','Rev. 2',1);

-- keywords for IS 3075:1994
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'ball bearing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'roller bearing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bearing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'rolling bearing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bearing life' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mechanical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial bearing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'lube' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'skid' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'chrome steel' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3075:1994';

-- requirements for IS 3075:1994
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Dynamic load rating based on basic rating life of 1 million revolutions' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Materials of high carbon chromium steel' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Bore and outside diameter tolerance classes' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Radial clearance per class' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Static load rating to be specified' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Hardness of rolling elements' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Lubrication and sealing arrangements' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of size, class and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3075:1994';

-- IS 3346:1993 | Hospital beds - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 3346:1993','Hospital beds - specification','Healthcare','Healthcare','Hospital bed','Covers hospital beds used in healthcare institutions, specifying construction, materials, load capacity, dimensions and functional accessories.','This specification covers hospital beds, including intensive care, recovery and general ward beds used in healthcare institutions, and stipulates construction, material, dimensional, load, mattress, accessory and finish requirements.','hospital bed;medical equipment;healthcare;bed;patient bed;icu bed;ward;medical furniture;stretcher;clinical equipment','Safe working load of at least 150 kg static;Height adjustment range of 400 to 800 mm;Stainless steel or epoxy coated steel frame;Lockable castors of 125 mm;Removable head and foot boards;Mattress platform of pressed steel;Emergency CPR release function;Epoxy powder coating with 60 micron thickness;Marking of manufacturer and model','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1993,'Active','Rev. 1',1);

-- keywords for IS 3346:1993
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'hospital bed' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'medical equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'healthcare' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bed' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'patient bed' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'icu bed' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ward' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'medical furniture' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'stretcher' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'clinical equipment' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3346:1993';

-- requirements for IS 3346:1993
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Safe working load of at least 150 kg static' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Height adjustment range of 400 to 800 mm' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Stainless steel or epoxy coated steel frame' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Lockable castors of 125 mm' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Removable head and foot boards' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Mattress platform of pressed steel' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Emergency CPR release function' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Epoxy powder coating with 60 micron thickness' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of manufacturer and model' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3346:1993';

-- IS 3362:1977 | Electric cables for underground or outdoor use - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 3362:1977','Electric cables for underground or outdoor use - specification','Electrical','Electrical','XLPE power cable','Covers multicore and single core cross linked polyethylene insulated and sheathed cables for underground and outdoor installation, specifying construction, dimensions, insulation resistance and test requirements.','This specification covers single core and multicore cross linked polyethylene insulated and sheathed power cables for use in underground and outdoor locations and sets requirements for conductor size, insulation, sheath, armouring, voltage grade, dimensional tolerances and electrical and mechanical tests.','cable;power cable;xlpe cable;electric cable;underground cable;insulation;conductor;armoured cable;electricity;multicore cable;voltage','Conductor of stranded annealed copper;Insulation resistance test at 500 V DC;Conductor resistance at 20 degree C;Voltage test at 3 kV for 5 minutes;Water penetration test on sample;Maximum partial discharge;Armour of galvanised steel wire;Dimensions to be within specified tolerances;Marking of length and voltage grade','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1977,'Active','Rev. 2',1);

-- keywords for IS 3362:1977
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'power cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'xlpe cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electric cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'underground cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'insulation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'conductor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'armoured cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electricity' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'multicore cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'voltage' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3362:1977';

-- requirements for IS 3362:1977
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Conductor of stranded annealed copper' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Insulation resistance test at 500 V DC' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Conductor resistance at 20 degree C' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Voltage test at 3 kV for 5 minutes' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Water penetration test on sample' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Maximum partial discharge' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Armour of galvanised steel wire' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Dimensions to be within specified tolerances' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of length and voltage grade' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 3362:1977';

-- IS 355:2016 | Vitreous enamelled tiles - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 355:2016','Vitreous enamelled tiles - specification','Construction','Construction','Glazed ceramic floor tile','Covers ceramic tiles with vitreous glaze used for flooring and wall lining including dimensional tolerances, water absorption, scratch hardness, chemical resistance and thermal shock resistance.','This specification covers glazed ceramic tiles intended for flooring and wall lining, and sets out requirements and methods of test for dimensional tolerances, thickness, water absorption, crazing, scratch hardness, chemical and stain resistance, thermal shock and abrasion resistance.','floor tile;ceramic tile;glazed tile;vitreous enamel;water absorption;scratch hardness;thermal shock;abrasion;flooring;wall tile','Water absorption not to exceed 0.5 percent by weight;Minimum thickness of 8 mm for floor tiles;Dimensional tolerance on length and width of plus or minus 0.5 mm;Scratch hardness Grade G;Resistance to thermal shock cycle test;Stain resistance of glazed surface;Abrasion resistance to be declared by manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2016,'Active','Rev. 1',1);

-- keywords for IS 355:2016
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'floor tile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ceramic tile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'glazed tile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'vitreous enamel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water absorption' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'scratch hardness' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'thermal shock' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'abrasion' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'flooring' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'wall tile' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 355:2016';

-- requirements for IS 355:2016
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Water absorption not to exceed 0.5 percent by weight' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Minimum thickness of 8 mm for floor tiles' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Dimensional tolerance on length and width of plus or minus 0.5 mm' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Scratch hardness Grade G' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Resistance to thermal shock cycle test' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Stain resistance of glazed surface' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Abrasion resistance to be declared by manufacturer' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 355:2016';

-- IS 372:1961 | Specification for brass and copper pipe and fitting
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 372:1961','Specification for brass and copper pipe and fitting','Water','Water','Brass pipe and fitting','Covers brass and copper pipes and fittings used for water, gas and compressed air, specifying composition, dimensions, surface finish and test requirements.','This specification covers brass and copper pipes and fittings intended for general use including potable water, gas and compressed air applications. It sets out composition requirements, dimensional tolerances, surface quality, test pressure and marking requirements.','brass;copper;pipe;fitting;water supply;gas line;plumbing;taps;faucet;valve;metallic pipe','Lead content of free cutting brass to be controlled;Hydrostatic test at 1.5 times working pressure;Threads and dimensions as per standard;Surface to be free from defects and pitting;Composition to match designated grade;Annealed condition for fittings;Test for leaks under pressure;Marking of grade and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1961,'Active','Rev. 1',1);

-- keywords for IS 372:1961
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'brass' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'copper' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fitting' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water supply' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'gas line' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'plumbing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'taps' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'faucet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'valve' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'metallic pipe' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 372:1961';

-- requirements for IS 372:1961
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Lead content of free cutting brass to be controlled' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Hydrostatic test at 1.5 times working pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Threads and dimensions as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Surface to be free from defects and pitting' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Composition to match designated grade' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Annealed condition for fittings' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Test for leaks under pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of grade and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 372:1961';

-- IS 40:1978 | Specification for hexagonal bolts, nuts and washers
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 40:1978','Specification for hexagonal bolts, nuts and washers','Mechanical','Mechanical','Hexagonal bolt and nut','Covers hexagonal bolts, hexagonal nuts and plain washers used in engineering and construction including dimensions, mechanical properties and tolerances.','This specification covers hexagonal bolts, nuts and washers of carbon steel used for general engineering and construction purposes and sets out dimensional requirements, mechanical properties, tolerances and marking.','hex bolt;nut;washer;fastener;bolt;mechanical fastener;engineering steel;threaded fastener;structural fastener;hardware','Grade 4.6 minimum tensile strength of 400 MPa;Property class marking on head;Width across flats as per nominal size;Thread to match specified pitch;Dimensional tolerances as per standard;Plain washer thickness as per size;Corrosion protection by electroplating;Marking of manufacturer and grade','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1978,'Active','Rev. 2',1);

-- keywords for IS 40:1978
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'hex bolt' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'nut' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'washer' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fastener' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bolt' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mechanical fastener' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'engineering steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'threaded fastener' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural fastener' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hardware' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 40:1978';

-- requirements for IS 40:1978
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Grade 4.6 minimum tensile strength of 400 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Property class marking on head' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Width across flats as per nominal size' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Thread to match specified pitch' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Dimensional tolerances as per standard' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Plain washer thickness as per size' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Corrosion protection by electroplating' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of manufacturer and grade' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 40:1978';

-- IS 4149:1991 | V-belt drives - selection and application
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 4149:1991','V-belt drives - selection and application','Mechanical','Mechanical','Belt drive system','Provides guidance on selection of V-belts and pulleys for power transmission, including factors affecting service factor, speed, centre distance and belt life.','This standard provides guidance on the selection, installation and maintenance of V-belt drives and covers service factors, belt pull, wrap angle, centre distance, tensioning, alignment and safety devices.','v belt;belt drive;pulley;power transmission;drive design;mechanical;industrial drive;service factor;alignment','Service factor to account for load shock;Minimum pulley diameter per section;Number of belts to be calculated from power rating;Centre distance between 0.5 and 2.5 times pulley diameter;Correct alignment of pulleys;Regular tension checks;Safety guard for belts;Avoid oil contamination of belt','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1991,'Active','Rev. 1',1);

-- keywords for IS 4149:1991
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'v belt' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'belt drive' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pulley' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'power transmission' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'drive design' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mechanical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial drive' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'service factor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'alignment' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4149:1991';

-- requirements for IS 4149:1991
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Service factor to account for load shock' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Minimum pulley diameter per section' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Number of belts to be calculated from power rating' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Centre distance between 0.5 and 2.5 times pulley diameter' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Correct alignment of pulleys' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Regular tension checks' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Safety guard for belts' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Avoid oil contamination of belt' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4149:1991';

-- IS 4151:2014 | Personal protective equipment - ear protection
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 4151:2014','Personal protective equipment - ear protection','Safety','Safety','Ear defender','Covers ear protectors used to reduce exposure to hazardous noise levels, specifying attenuation, construction, materials and testing.','This specification covers ear protectors including ear muffs and ear plugs used for hearing protection in industrial environments, and includes requirements for sound attenuation, comfort, materials, dimensions and test methods.','ear protection;ear defender;ear muff;ear plug;hearing protection;personal protective equipment;noise protection;industrial safety;worker health;acoustic','Attenuation of at least 20 dB at high frequency;Acoustic leakage test;Headband pressure limit for comfort;Ear cup material to resist oil and chemicals;Snake and face seal;Single number rating or octave band attenuation;Marking of attenuation and manufacturer;Cleaning and maintenance instructions','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2014,'Active','Rev. 1',1);

-- keywords for IS 4151:2014
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'ear protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ear defender' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ear muff' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ear plug' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hearing protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'personal protective equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'noise protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'worker health' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'acoustic' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4151:2014';

-- requirements for IS 4151:2014
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Attenuation of at least 20 dB at high frequency' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Acoustic leakage test' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Headband pressure limit for comfort' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Ear cup material to resist oil and chemicals' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Snake and face seal' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Single number rating or octave band attenuation' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Marking of attenuation and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Cleaning and maintenance instructions' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4151:2014';

-- IS 4462:2017 | Medical surgical examination gloves - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 4462:2017','Medical surgical examination gloves - specification','Healthcare','Healthcare','Surgical examination glove','Covers disposable medical rubber examination gloves made of natural rubber latex, specifying dimensions, tensile properties, powder content and biological and chemical test requirements.','This specification covers medical rubber examination gloves made from natural rubber latex for single use, and specifies dimensions, physical properties, chemical tests, powder content, sterility and packaging requirements.','surgical glove;medical glove;latex glove;examination glove;healthcare;ppe;medical supplies;disposable;patient care;hospital','Tensile strength of at least 14 MPa elongation at break;Protein content below limit;Powder content as declared;Uniform thickness of 0.1 mm;Waterproof leak test at 2 litres;Chemical tests for accelerators;Sterility for sterile gloves;Marking of size, batch and expiry;Suitability for single use','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2017,'Active','Rev. 1',1);

-- keywords for IS 4462:2017
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'surgical glove' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'medical glove' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'latex glove' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'examination glove' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'healthcare' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ppe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'medical supplies' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'disposable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'patient care' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hospital' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4462:2017';

-- requirements for IS 4462:2017
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Tensile strength of at least 14 MPa elongation at break' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Protein content below limit' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Powder content as declared' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Uniform thickness of 0.1 mm' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Waterproof leak test at 2 litres' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Chemical tests for accelerators' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Sterility for sterile gloves' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of size, batch and expiry' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Suitability for single use' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4462:2017';

-- IS 456:2000 | Plain and reinforced concrete - code of practice
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 456:2000','Plain and reinforced concrete - code of practice','Construction','Construction','Reinforced concrete','Covers materials, workmanship, inspection, sampling and testing of plain and reinforced concrete, together with general design considerations, durability and permissible cement and water contents.','This code of practice specifies the materials, production, placing, compaction, curing and testing requirements for plain and reinforced concrete used in structural work. It covers mix design, cement content, water-cement ratio, aggregate grading and quality, admixtures, workability, tolerance levels, sampling and compressive strength acceptance criteria.','reinforced concrete;concrete;cement;aggregate;water cement ratio;mix design;structural;durability;compressive strength;construction;curing;admixture','Minimum cement content of 300 kg per cubic metre for structural concrete;Maximum water-cement ratio of 0.45 for structural exposure;Minimum grade M20 for structural concrete;Compressive strength to be verified by 28 day cube testing;Aggregate to comply with grading requirements;Maximum chloride content in concrete;Workability to suit placing method','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2000,'Active','Rev. 2',1);

-- keywords for IS 456:2000
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'reinforced concrete' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'concrete' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cement' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'aggregate' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water cement ratio' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mix design' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'durability' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'compressive strength' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'construction' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'curing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'admixture' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 456:2000';

-- requirements for IS 456:2000
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum cement content of 300 kg per cubic metre for structural concrete' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Maximum water-cement ratio of 0.45 for structural exposure' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Minimum grade M20 for structural concrete' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Compressive strength to be verified by 28 day cube testing' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Aggregate to comply with grading requirements' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Maximum chloride content in concrete' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Workability to suit placing method' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 456:2000';

-- IS 4803:1984 | Personal protective equipment - eye protection
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 4803:1984','Personal protective equipment - eye protection','Safety','Safety','Safety goggle','Covers eye protection devices including safety spectacles, goggles and face shields, specifying optical, mechanical and material requirements.','This specification covers safety spectacles, goggles, welding goggles and face shields for protection of eyes against flying particles, chemical splash, radiant heat and optical radiation, and specifies filter lens, frame, and test requirements.','safety goggle;eye protection;goggles;safety spectacles;welding goggles;face shield;personal protective equipment;industrial safety;vision protection','Impact resistance of lens to a 22 mm ball;Optical power within tolerance;Filter shade numbers as per usage;Field of vision not less than 110 degrees;Frame material free from sharp edges;Resistance to fogging;Marking of shade number and manufacturer;Suitable side shields for goggles','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1984,'Active','Rev. 1',1);

-- keywords for IS 4803:1984
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'safety goggle' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'eye protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'goggles' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'safety spectacles' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'welding goggles' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'face shield' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'personal protective equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'vision protection' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4803:1984';

-- requirements for IS 4803:1984
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Impact resistance of lens to a 22 mm ball' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Optical power within tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Filter shade numbers as per usage' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Field of vision not less than 110 degrees' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Frame material free from sharp edges' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Resistance to fogging' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Marking of shade number and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Suitable side shields for goggles' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 4803:1984';

-- IS 498:2014 | Polyethylene pipes for potable water supplies - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 498:2014','Polyethylene pipes for potable water supplies - specification','Water','Water','HDPE water pipe','Covers high density polyethylene pipes used for potable water supply, specifying dimensions, pressure rating, tensile strength, hydrostatic test and migration requirements.','This specification covers high density polyethylene pipes for potable water supplies, and specifies the material characteristics, dimensions, wall thickness, hydrostatic strength, tensile properties, environmental stress cracking resistance and migration of substances for potable water contact.','hdpe pipe;polyethylene pipe;water supply;potable water;piping;water;high density polyethylene;plumbing;pressure pipe;hydrostatic test','Hydrostatic strength test to be carried out at working pressure;Minimum tensile strength of 20 MPa;Environmental stress cracking resistance of 1000 hours;Maximum outside diameter tolerance as per class;Pipes to comply with pressure class PN 8 or higher;Ovality tolerance;Decolourisation test for uniformity;Marking of manufacturer, size and pressure class','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2014,'Active','Rev. 2',1);

-- keywords for IS 498:2014
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'hdpe pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'polyethylene pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water supply' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'potable water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'piping' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'high density polyethylene' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'plumbing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pressure pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hydrostatic test' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 498:2014';

-- requirements for IS 498:2014
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Hydrostatic strength test to be carried out at working pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Minimum tensile strength of 20 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Environmental stress cracking resistance of 1000 hours' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Maximum outside diameter tolerance as per class' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Pipes to comply with pressure class PN 8 or higher' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Ovality tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Decolourisation test for uniformity' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of manufacturer, size and pressure class' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 498:2014';

-- IS 511:1990 | Specification for wrought iron and mild steel rivets
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 511:1990','Specification for wrought iron and mild steel rivets','Mechanical','Mechanical','Steel rivet','Covers dimensions and tolerances of wrought iron and mild steel rivets with hot and semi cold driven heads used for structural and general engineering work.','This specification covers wrought iron and mild steel rivets used in structural steel work and general engineering, covering nominal diameters, tolerances on shank and head, material properties and marking.','rivet;fastener;steel rivet;structural connection;bolted joint;mechanical;iron rivet;engineering','Nominal diameter tolerance as per grade;Shear strength of rivet material;Head dimensions as per standard pattern;Material to be mild steel or wrought iron;No sharp edges on shank;Uniformity of manufacture;Marking of size and manufacturer;Length within specified tolerance','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1990,'Active','Rev. 1',1);

-- keywords for IS 511:1990
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'rivet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fastener' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel rivet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural connection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bolted joint' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mechanical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'iron rivet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'engineering' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 511:1990';

-- requirements for IS 511:1990
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Nominal diameter tolerance as per grade' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Shear strength of rivet material' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Head dimensions as per standard pattern' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Material to be mild steel or wrought iron' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'No sharp edges on shank' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Uniformity of manufacture' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Marking of size and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Length within specified tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 511:1990';

-- IS 5142:2003 | Fire extinguishers - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 5142:2003','Fire extinguishers - specification','Safety','Safety','Fire extinguisher','Covers portable fire extinguishers of carbon dioxide, dry powder, halon and water types, specifying capacity, construction, performance and testing requirements.','This specification covers portable fire extinguishers and fire extinguishing powders and includes requirements for body, valve, hose, discharge effectiveness, pressure, gauge, working range, testing and labelling of extinguishers for various classes of fire.','fire extinguisher;fire safety;extinguisher;fire protection;co2 extinguisher;dry powder;safety;emergency equipment;fire suppression;protection','Working range of not less than 3 m for portable unit;Discharge test to verify effectiveness;Hydrostatic test pressure of 1.5 times working pressure;Burst disc or safety device;Pressure gauge with green zone marking;Body to be of carbon dioxide steel or brass;Reflective sign board;Validity of hydrostatic test every 5 years;Marking of agent, capacity and service class','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2003,'Active','Rev. 1',1);

-- keywords for IS 5142:2003
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'fire extinguisher' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fire safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'extinguisher' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fire protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'co2 extinguisher' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'dry powder' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'safety' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'emergency equipment' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fire suppression' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'protection' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 5142:2003';

-- requirements for IS 5142:2003
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Working range of not less than 3 m for portable unit' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Discharge test to verify effectiveness' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Hydrostatic test pressure of 1.5 times working pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Burst disc or safety device' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Pressure gauge with green zone marking' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Body to be of carbon dioxide steel or brass' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Reflective sign board' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Validity of hydrostatic test every 5 years' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of agent, capacity and service class' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 5142:2003';

-- IS 5512:1984 | Portland cement - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 5512:1984','Portland cement - specification','Construction','Construction','Portland cement','Specifies composition, physical and chemical characteristics of Portland cement including setting time, soundness, compressive strength and heat of hydration.','This specification covers the manufacture, composition, physical and chemical requirements, packaging and marking of Portland cement, including loss on ignition, insoluble residue, lime saturation, soundness, setting time, compressive strength and heat of hydration.','portland cement;cement;concrete;masonry;compressive strength;setting time;soundness;fineness;limesaturation;ordinary portland cement;binding material','Minimum compressive strength of 43 MPa at 28 days;Setting time to be between 30 and 600 minutes;Soundness of cement not to exceed 10 percent;Loss on ignition not to exceed 4 percent;Insoluble residue not to exceed 2.5 percent;Fineness by Blaine method;Free lime content to be controlled;Packaging in multi-layer paper bags with batch marking','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1984,'Active','Rev. 3',1);

-- keywords for IS 5512:1984
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'portland cement' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cement' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'concrete' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'masonry' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'compressive strength' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'setting time' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'soundness' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fineness' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'limesaturation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ordinary portland cement' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'binding material' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 5512:1984';

-- requirements for IS 5512:1984
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum compressive strength of 43 MPa at 28 days' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Setting time to be between 30 and 600 minutes' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Soundness of cement not to exceed 10 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Loss on ignition not to exceed 4 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Insoluble residue not to exceed 2.5 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Fineness by Blaine method' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Free lime content to be controlled' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Packaging in multi-layer paper bags with batch marking' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 5512:1984';

-- IS 6330:1992 | Guided wave type ground level radar for liquid level measurement
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 6330:1992','Guided wave type ground level radar for liquid level measurement','Mechanical','Mechanical','Radar level transmitter','Covers ground level radar and radar level measurement devices for liquids including accuracy, range and installation requirements.','This specification covers radar and guided wave radar level measurement instruments for liquids in tanks and vessels and specifies measurement range, accuracy, output signals, environmental protection and test procedures.','radar level transmitter;level measurement;instrumentation;process control;tank level;liquid level sensor;industrial automation;radar;gauge','Measurement range up to 30 m;Accuracy of at least 0.5 percent of range;4-20 mA output with HART protocol;Ingress protection IP 67;Operating temperature range of -40 to 80 degree C;Calibration on site without tools;Diagnostic and level threshold alarms;Marking of range, protocol and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1992,'Active','Rev. 1',1);

-- keywords for IS 6330:1992
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'radar level transmitter' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'level measurement' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'instrumentation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'process control' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tank level' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'liquid level sensor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial automation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'radar' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'gauge' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6330:1992';

-- requirements for IS 6330:1992
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Measurement range up to 30 m' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Accuracy of at least 0.5 percent of range' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, '4-20 mA output with HART protocol' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Ingress protection IP 67' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Operating temperature range of -40 to 80 degree C' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Calibration on site without tools' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Diagnostic and level threshold alarms' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of range, protocol and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6330:1992';

-- IS 6356:1973 | Textiles - tarpaulins, tents and shelters - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 6356:1973','Textiles - tarpaulins, tents and shelters - specification','Textiles','Textiles','Tarpaulin','Covers tarpaulins, tents and allied shelters made from coated or woven fabric including waterproofing, tensile strength and seam requirements.','This specification covers tarpaulins, tentage and allied shelters made from waterproofed or coated fabrics including cotton duck, manila and synthetic fabrics and specifies dimensions, mass, tensile and tear strength, waterproofing and seam performance.','tarpaulin;tarpaulin sheet;canvas;tent;waterproof fabric;shelter;textile;outdoor;fire retardant fabric;cotton duck','Waterproofness without leakage;Minimum tensile strength of fabric;Tear strength requirement;Mass per square metre as declared;Seam strength to match fabric;Reinforced corners and eyelets;Flame retardant treatment for tents;UV resistance;Marking of size, material and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1973,'Active','Rev. 1',1);

-- keywords for IS 6356:1973
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'tarpaulin' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tarpaulin sheet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'canvas' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tent' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'waterproof fabric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'shelter' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'textile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'outdoor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fire retardant fabric' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cotton duck' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6356:1973';

-- requirements for IS 6356:1973
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Waterproofness without leakage' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Minimum tensile strength of fabric' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Tear strength requirement' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Mass per square metre as declared' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Seam strength to match fabric' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Reinforced corners and eyelets' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Flame retardant treatment for tents' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'UV resistance' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Marking of size, material and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6356:1973';

-- IS 6595:1992 | Steel tubes for water services - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 6595:1992','Steel tubes for water services - specification','Water','Water','Steel water pipe','Covers steel tubes used for water services including welded and seamless tubes, specifying coating, dimensions, strength and test requirements.','This specification covers mild steel and carbon steel tubes used for water services including potable and non potable applications and covers coating, lining, dimensions, tolerances, tensile strength, hydrostatic test and marking.','steel pipe;water pipe;steel tube;water services;pipe;potable water;welded pipe;seamless pipe;water supply;structural tube','Minimum yield strength of 240 MPa;Hydrostatic test to demonstrate pressure rating;Internal coating with epoxy or bitumen;Corrosion protection coating on external surface;Dimensions and tolerances as per nominal size;Flattening test on welded tubes;Eddy current or hydrostatic testing;Marking of grade, size and standard','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1992,'Active','Rev. 2',1);

-- keywords for IS 6595:1992
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'steel pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel tube' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water services' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'potable water' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'welded pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'seamless pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water supply' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'structural tube' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6595:1992';

-- requirements for IS 6595:1992
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum yield strength of 240 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Hydrostatic test to demonstrate pressure rating' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Internal coating with epoxy or bitumen' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Corrosion protection coating on external surface' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Dimensions and tolerances as per nominal size' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Flattening test on welded tubes' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Eddy current or hydrostatic testing' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of grade, size and standard' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6595:1992';

-- IS 691:1992 | Unglazed ceramic floor tiles - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 691:1992','Unglazed ceramic floor tiles - specification','Construction','Construction','Ceramic floor tile','Covers unglazed and semi-vitreous ceramic tiles for flooring, specifying dimensions, water absorption, dimensional tolerances, strength and abrasion resistance requirements.','This specification covers unglazed ceramic tiles for flooring and sets out requirements and methods of test for dimensions, water absorption, transverse strength, abrasion resistance, crazing and visual appearance of unglazed ceramic flooring products.','floor tile;ceramic tile;unglazed tile;water absorption;abrasion resistance;transverse strength;flooring;tile;vitreous','Water absorption not to exceed 4 percent for vitrified tiles;Transverse strength of at least 35 N per mm;Abrasion resistance to be declared;Thickness of at least 9 mm for floor tiles;Dimensional tolerances to be declared;Surface to be free from cracks, chips and warpage;Tiles to be laid on a properly levelled substrate','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1992,'Active','Rev. 2',1);

-- keywords for IS 691:1992
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'floor tile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ceramic tile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'unglazed tile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water absorption' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'abrasion resistance' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'transverse strength' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'flooring' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tile' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'vitreous' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 691:1992';

-- requirements for IS 691:1992
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Water absorption not to exceed 4 percent for vitrified tiles' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Transverse strength of at least 35 N per mm' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Abrasion resistance to be declared' AS `requirement_text`, 'durability' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Thickness of at least 9 mm for floor tiles' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Dimensional tolerances to be declared' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Surface to be free from cracks, chips and warpage' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Tiles to be laid on a properly levelled substrate' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 691:1992';

-- IS 6911:1997 | Stainless steel tableware - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 6911:1997','Stainless steel tableware - specification','Food','Food','Stainless steel tableware','Covers stainless steel tableware such as plates, bowls, glasses and cutlery for domestic and commercial use, specifying material grade, surface finish and corrosion resistance.','This specification covers stainless steel household and commercial tableware and specifies the steel grade, dimensions, surface finish, corrosion resistance, food contact safety and marking requirements.','stainless steel;tableware;steel plate;utensil;kitchenware;food grade;cutlery;crockery;hospitality;steel utensil','Material grade of austenitic stainless steel 202 or 304;Corrosion resistance test as per standard;Food contact safety requirement;No rusting or surface pitting;Surface finish of mirror or satin;Thickness of sheet as declared;Mass within tolerance;Marking of grade, manufacturer and IS number','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1997,'Active','Rev. 1',1);

-- keywords for IS 6911:1997
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'stainless steel' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'tableware' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel plate' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'utensil' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'kitchenware' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'food grade' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cutlery' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'crockery' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hospitality' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel utensil' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6911:1997';

-- requirements for IS 6911:1997
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Material grade of austenitic stainless steel 202 or 304' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Corrosion resistance test as per standard' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Food contact safety requirement' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'No rusting or surface pitting' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Surface finish of mirror or satin' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Thickness of sheet as declared' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Mass within tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of grade, manufacturer and IS number' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 6911:1997';

-- IS 694:2010 | Polyvinyl chloride insulated and sheathed wires and cables - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 694:2010','Polyvinyl chloride insulated and sheathed wires and cables - specification','Electrical','Electrical','PVC insulated copper wire','Covers single core and multicore PVC insulated and sheathed wires and cables for general use in conduits and for power and lighting circuits up to 650 volts.','This specification covers PVC insulated and sheathed copper wires and cables used in electrical installations for power, lighting and control circuits, and specifies conductor construction, insulation thickness, sheath, resistance values, insulation resistance and flame propagation requirements.','pvc wire;copper wire;electric wire;insulated wire;cable;electrical;power cable;conduit wiring;house wiring;insulation;conductor;multicore','Conductor resistance at 20 degree C as per class;Insulation resistance at 500 V DC;Conductor of bright annealed copper wire;Insulation thickness as per voltage grade;Flame propagation in vertical mount test;Type 1 and Type 2 construction;Temperature rating of 70 degree C;Marking of size, grade and length','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2010,'Active','Rev. 3',1);

-- keywords for IS 694:2010
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'pvc wire' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'copper wire' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electric wire' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'insulated wire' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'electrical' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'power cable' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'conduit wiring' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'house wiring' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'insulation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'conductor' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'multicore' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 694:2010';

-- requirements for IS 694:2010
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Conductor resistance at 20 degree C as per class' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Insulation resistance at 500 V DC' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Conductor of bright annealed copper wire' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Insulation thickness as per voltage grade' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Flame propagation in vertical mount test' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Type 1 and Type 2 construction' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Temperature rating of 70 degree C' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of size, grade and length' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 694:2010';

-- IS 780:2011 | Galvanised iron pipes - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 780:2011','Galvanised iron pipes - specification','Water','Water','Galvanised iron pipe','Covers galvanised wrought iron and mild steel pipes used for water supply, specifying zinc coating, dimensional tolerances and hydrostatic test requirements.','This specification covers galvanised iron pipes, generally used for water supply and other general purposes, and lays down requirements for the grade of steel used, galvanising process, zinc coating weight, thread condition, hydraulic test and marking.','gi pipe;galvanised iron;mild steel pipe;water supply;steel pipe;zinc coating;plumbing;fitting;threaded pipe;piping','Zinc coating of not less than 130 g per square metre;Internal and external surface to be uniformly coated;Hydrostatic test pressure of 1.5 times working pressure;Threads to be protected with approved compound;Bore to be free from scale and pitting;Maximum outside diameter tolerance;Delivery condition of pipes in 6 m lengths;Marking of grade and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2011,'Active','Rev. 3',1);

-- keywords for IS 780:2011
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'gi pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'galvanised iron' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mild steel pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water supply' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'zinc coating' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'plumbing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fitting' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'threaded pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'piping' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 780:2011';

-- requirements for IS 780:2011
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Zinc coating of not less than 130 g per square metre' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Internal and external surface to be uniformly coated' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Hydrostatic test pressure of 1.5 times working pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Threads to be protected with approved compound' AS `requirement_text`, 'safety' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Bore to be free from scale and pitting' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Maximum outside diameter tolerance' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Delivery condition of pipes in 6 m lengths' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of grade and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 780:2011';

-- IS 8326:2014 | Steel tubes for irrigation - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 8326:2014','Steel tubes for irrigation - specification','Agriculture','Water','Irrigation steel pipe','Covers steel tubes used for irrigation, water distribution and similar applications, specifying coating, grade, dimensions and test requirements.','This specification covers steel tubes used for irrigation water distribution and similar purposes and specifies steel grade, dimensions, wall thickness, internal and external coating, mechanical properties and test procedures.','irrigation;steel pipe;agriculture;water pipe;pipe;water distribution;minion;gi pipe;farm irrigation;coated pipe','Minimum yield strength of 240 MPa;External coating of bitumen or epoxy;Internal coating with cement mortar or epoxy;Hydrostatic test on sample;Galvanising where specified;Dimensional tolerances as per nominal bore;Minimum life expectancy of coating;Marking of grade, size and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2014,'Active','Rev. 1',1);

-- keywords for IS 8326:2014
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'irrigation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'steel pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'agriculture' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water distribution' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'minion' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'gi pipe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'farm irrigation' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'coated pipe' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 8326:2014';

-- requirements for IS 8326:2014
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Minimum yield strength of 240 MPa' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'External coating of bitumen or epoxy' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Internal coating with cement mortar or epoxy' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Hydrostatic test on sample' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Galvanising where specified' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Dimensional tolerances as per nominal bore' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Minimum life expectancy of coating' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of grade, size and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 8326:2014';

-- IS 8419:2010 | Centrifugal pumps for water - specification
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 8419:2010','Centrifugal pumps for water - specification','Water','Mechanical','Centrifugal water pump','Covers horizontal split casing centrifugal pumps for pumping clean or lightly contaminated water, including performance, construction, materials and testing requirements.','This specification covers horizontal split casing centrifugal pumps for handling clean cold water and specifies materials, construction, performance parameters such as capacity, head, power absorbed and efficiency, and the tests to be carried out.','centrifugal pump;water pump;pump;irrigation pump;industrial pump;prime mover;water supply;mechanical seal;suction;discharge','Performance to be guaranteed at rated duty point;Efficiency within specified tolerance;Hydrostatic test pressure of 1.5 times working pressure;Balance test to be conducted;Noise level limits;Material of casing as cast iron or SS;Shaft to be of stainless steel;Marking of size, rating and manufacturer','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2010,'Active','Rev. 1',1);

-- keywords for IS 8419:2010
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'centrifugal pump' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water pump' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'pump' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'irrigation pump' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'industrial pump' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'prime mover' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water supply' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mechanical seal' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'suction' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'discharge' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 8419:2010';

-- requirements for IS 8419:2010
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Performance to be guaranteed at rated duty point' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Efficiency within specified tolerance' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Hydrostatic test pressure of 1.5 times working pressure' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Balance test to be conducted' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Noise level limits' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Material of casing as cast iron or SS' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Shaft to be of stainless steel' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of size, rating and manufacturer' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 8419:2010';

-- IS 903:1999 | Plumbing - specification for vitreous glazed fireclay sanitaryware
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 903:1999','Plumbing - specification for vitreous glazed fireclay sanitaryware','Water','Water','Sanitary ware (wash basin)','Covers vitreous glazed fireclay sanitary ware such as wash basins, water closets and bidets including dimensions, glazing quality and functional requirements.','This specification covers vitreous glazed fireclay sanitaryware and specifies requirements and methods of test for dimensions, appearance, crazing and cracking, water absorption, thermal shock, loading, flushing and general construction.','sanitary ware;wash basin;vitreous china;fireclay;bathroom fixture;water closet;glazed ceramic;plumbing;bathroom;ceramic','Water absorption not to exceed 10 percent;No crazing on the glazed surface;Resistant to thermal shock;Dimensions to be within specified tolerances;Internal surfaces to be smooth and glazed;Loading test for cistern type fittings;Waste fitting to be of nominal size;Marking of manufacturer and size','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',1999,'Active','Rev. 2',1);

-- keywords for IS 903:1999
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'sanitary ware' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'wash basin' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'vitreous china' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'fireclay' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bathroom fixture' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'water closet' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'glazed ceramic' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'plumbing' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'bathroom' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ceramic' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 903:1999';

-- requirements for IS 903:1999
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Water absorption not to exceed 10 percent' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'No crazing on the glazed surface' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Resistant to thermal shock' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Dimensions to be within specified tolerances' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Internal surfaces to be smooth and glazed' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Loading test for cistern type fittings' AS `requirement_text`, 'testing' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Waste fitting to be of nominal size' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of manufacturer and size' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 903:1999';

-- IS 9473:2000 | Particulate filtering respirators
INSERT INTO `standards`
(`is_number`,`title`,`sector`,`category`,`product`,`scope`,`description`,`keywords`,`requirements`,`source`,`source_url`,`year`,`status`,`revision`,`is_demonstration`)
VALUES
('IS 9473:2000','Particulate filtering respirators','Safety','Safety','N95 respirator','Covers filtering facepiece respirators used for protection against particulates, specifying filtration efficiency, breathing resistance, fit and marking.','This specification covers filtering half masks and filtering facepieces used to protect the wearer against airborne particles and specifies filtration efficiency classes, breathing resistance, total inward leakage, fit testing and marking requirements.','n95;respirator;filtering facepiece;particulate filter;healthcare;ppe;mask;respiratory protection;hospital;dust mask','Filtration efficiency of at least 95 percent for 0.3 micron particles;Inhalation resistance of at most 150 mm water column;Exhalation resistance limit;Facepiece leakage;Total inward leakage as per class;Head strap tensile strength;Nose clip material;Marking of class, efficiency and marking;Fitting instructions to be provided','DEMONSTRATION DATA - placeholder metadata authored by the SIH26108 project team; not a verified BIS record','https://www.bis.gov.in',2000,'Active','Rev. 1',1);

-- keywords for IS 9473:2000
INSERT INTO `standard_keywords` (`standard_id`,`keyword`,`weight`)
SELECT s.`id`, t.`keyword`, t.`weight`
FROM `standards` s
JOIN (
    SELECT 'n95' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'respirator' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'filtering facepiece' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'particulate filter' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'healthcare' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'ppe' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'mask' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'respiratory protection' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'hospital' AS `keyword`, 1.0 AS `weight` UNION ALL SELECT 'dust mask' AS `keyword`, 1.0 AS `weight`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 9473:2000';

-- requirements for IS 9473:2000
INSERT INTO `standard_requirements`
(`standard_id`,`requirement_code`,`requirement_text`,`requirement_type`,`is_mandatory`)
SELECT s.`id`, t.`requirement_code`, t.`requirement_text`,
       t.`requirement_type`, t.`is_mandatory`
FROM `standards` s
JOIN (
    SELECT 'clause_1' AS `requirement_code`, 'Filtration efficiency of at least 95 percent for 0.3 micron particles' AS `requirement_text`, 'performance' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_2' AS `requirement_code`, 'Inhalation resistance of at most 150 mm water column' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_3' AS `requirement_code`, 'Exhalation resistance limit' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_4' AS `requirement_code`, 'Facepiece leakage' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_5' AS `requirement_code`, 'Total inward leakage as per class' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_6' AS `requirement_code`, 'Head strap tensile strength' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_7' AS `requirement_code`, 'Nose clip material' AS `requirement_text`, 'material' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_8' AS `requirement_code`, 'Marking of class, efficiency and marking' AS `requirement_text`, 'marking' AS `requirement_type`, 1 AS `is_mandatory`
    UNION ALL     SELECT 'clause_9' AS `requirement_code`, 'Fitting instructions to be provided' AS `requirement_text`, 'technical' AS `requirement_type`, 1 AS `is_mandatory`
) AS t ON 1 = 1
WHERE s.`is_number` = 'IS 9473:2000';


-- =============================================================================
--  Optional demo user (single-user local prototype, no password => no login).
--  A real deployment must set a bcrypt hash; never store plaintext passwords.
-- =============================================================================
INSERT INTO `users` (`email`,`full_name`,`password_hash`,`organization`,`department`,`role`)
VALUES
('demo@sih26108.local','Demo Procurement Officer',NULL,'Smart India Hackathon 26108','Procurement','officer')
ON DUPLICATE KEY UPDATE `updated_at` = CURRENT_TIMESTAMP;

-- =============================================================================
--  Verification queries (run after import in phpMyAdmin)
-- =============================================================================
--  SELECT COUNT(*) AS standards    FROM standards
--  SELECT COUNT(*) AS keywords     FROM standard_keywords
--  SELECT COUNT(*) AS requirements FROM standard_requirements
--  SELECT sector, COUNT(*) AS n FROM standards GROUP BY sector ORDER BY n DESC