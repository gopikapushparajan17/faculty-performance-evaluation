-- MySQL schema for Faculty Evaluation System

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ef','hod','principal') NOT NULL,
  college_name VARCHAR(255) NOT NULL,
  department VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE faculty_details (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dept VARCHAR(255) NOT NULL,
  emp_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  orcid VARCHAR(50) DEFAULT '',
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  INDEX idx_emp_id (emp_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE evaluations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  faculty_id BIGINT UNSIGNED NOT NULL,
  ef_id BIGINT UNSIGNED NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  status ENUM('draft','pending','approved') NOT NULL DEFAULT 'draft',
  students_feedback_points INT NOT NULL DEFAULT 0,
  journal_index TEXT,
  conference_points INT NOT NULL DEFAULT 0,
  book_chapter_points INT NOT NULL DEFAULT 0,
  book_points INT NOT NULL DEFAULT 0,
  ipr_points INT NOT NULL DEFAULT 0,
  funded_points INT NOT NULL DEFAULT 0,
  fdp_attended_points INT NOT NULL DEFAULT 0,
  talks_points INT NOT NULL DEFAULT 0,
  dept_activity_points INT NOT NULL DEFAULT 0,
  inst_activity_points INT NOT NULL DEFAULT 0,
  fdp_organized_points INT NOT NULL DEFAULT 0,
  grand_total INT NOT NULL DEFAULT 0,
  notes TEXT,
  submit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  faculty_sign VARCHAR(255) DEFAULT NULL,
  hod_sign VARCHAR(255) DEFAULT NULL,
  principal_sign VARCHAR(255) DEFAULT NULL,
  CONSTRAINT fk_eval_faculty FOREIGN KEY (faculty_id) REFERENCES faculty_details(id),
  CONSTRAINT fk_eval_ef FOREIGN KEY (ef_id) REFERENCES users(id),
  INDEX idx_eval_status (status),
  INDEX idx_eval_faculty (faculty_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE proofs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluation_id BIGINT UNSIGNED NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  scopus_link VARCHAR(1024) NOT NULL,
  points_contributed INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_proof_eval FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
  INDEX idx_proof_eval (evaluation_id),
  INDEX idx_proof_metric (metric_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

