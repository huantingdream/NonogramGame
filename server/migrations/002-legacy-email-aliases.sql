ALTER TABLE users ADD COLUMN login_email VARCHAR(254) NULL;
UPDATE users SET login_email=email;
ALTER TABLE users DROP INDEX email, ADD INDEX account_email (email), ADD UNIQUE KEY unique_login_email (login_email);
