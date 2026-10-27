CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  password_hash VARCHAR(512) NULL,
  legacy_hash VARCHAR(512) NULL,
  legacy_salt VARCHAR(128) NULL,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_as_ci;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX session_expiry (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS scores (
  id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nickname VARCHAR(80) NOT NULL,
  game VARCHAR(20) CHARACTER SET ascii NOT NULL,
  size INT NOT NULL,
  difficulty VARCHAR(10) CHARACTER SET ascii NOT NULL,
  elapsed_seconds INT UNSIGNED NOT NULL,
  puzzle_id INT UNSIGNED NOT NULL,
  puzzle_seed BIGINT UNSIGNED NOT NULL,
  average_ms INT UNSIGNED NULL,
  hits INT UNSIGNED NULL,
  shots INT UNSIGNED NULL,
  points BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY score_round (user_id, game, size, difficulty, puzzle_seed),
  INDEX ranking_time (game, size, difficulty, elapsed_seconds, created_at),
  INDEX ranking_reaction (game, size, difficulty, average_ms, created_at),
  INDEX ranking_aim (game, size, difficulty, hits DESC, shots, created_at),
  INDEX ranking_points (game, size, difficulty, points DESC, elapsed_seconds, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
