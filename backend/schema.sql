CREATE DATABASE IF NOT EXISTS faculty_evaluation;
USE faculty_evaluation;

-- =========================
-- USERS
-- =========================

CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('faculty','hod','principal') NOT NULL,
    college_name VARCHAR(255) NOT NULL,
    department VARCHAR(255)
);

-- =========================
-- FACULTY DETAILS
-- =========================

CREATE TABLE faculty_details (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dept VARCHAR(255) NOT NULL,
    emp_id VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    orcid VARCHAR(50),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL
);

-- =========================
-- EVALUATIONS
-- =========================

CREATE TABLE evaluations_new (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    faculty_id BIGINT UNSIGNED NOT NULL,
    ef_id BIGINT UNSIGNED NOT NULL,

    academic_year VARCHAR(20),
    status VARCHAR(20),

    modules JSON,

    total_points INT DEFAULT 0,

    approved_at VARCHAR(50),
    approved_by VARCHAR(50),

    reject_reason TEXT,

    faculty_signature TEXT,
    hod_signature TEXT,
    principal_signature TEXT
);

-- =========================
-- DEMO USERS
-- =========================

INSERT INTO users
(username, password_hash, role, college_name, department)
VALUES
(
    'hod@demo.com',
    '$2b$12$yV1mFX3N3opzXgi.kv8X8eDt4AxKTGDC78CAPt8C4wxs2dbINzbXS',
    'hod',
    'Demo College',
    'CSE'
),
(
    'faculty@demo.com',
    '$2b$12$yV1mFX3N3opzXgi.kv8X8eDt4AxKTGDC78CAPt8C4wxs2dbINzbXS',
    'faculty',
    'Demo College',
    'CSE'
),
(
    'principal@demo.com',
    '$2b$12$yV1mFX3N3opzXgi.kv8X8eDt4AxKTGDC78CAPt8C4wxs2dbINzbXS',
    'principal',
    'Demo College',
    NULL
);