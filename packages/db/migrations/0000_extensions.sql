-- citext: case-insensitive usernames. It's a "trusted" extension (PG13+),
-- so the database owner can create it without superuser rights (works on Neon).
CREATE EXTENSION IF NOT EXISTS citext;
