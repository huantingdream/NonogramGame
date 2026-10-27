CREATE TABLE IF NOT EXISTS personal_plays (
  user_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  game VARCHAR(20) CHARACTER SET ascii NOT NULL,
  size INT NOT NULL,
  difficulty VARCHAR(10) CHARACTER SET ascii NOT NULL,
  elapsed_seconds INT UNSIGNED NOT NULL,
  game_over BOOLEAN NOT NULL,
  average_ms INT UNSIGNED NULL,
  hits INT UNSIGNED NULL,
  shots INT UNSIGNED NULL,
  points BIGINT UNSIGNED NULL,
  played_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, id),
  INDEX personal_recent (user_id, played_at DESC, id),
  INDEX personal_best (user_id, game_over, game),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
