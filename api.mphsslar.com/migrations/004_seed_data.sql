-- Create initial admin user
-- Password: admin123
-- Email: admin@school.com

INSERT INTO users (email, password_hash, role)
VALUES ('admin@school.com', '$2a$10$YgN0YvKX9n.oqE5zX5X0WO0PH5X5X5X5X5X5X5X5X5X5X5X5X5X5X', 'ADMIN')
ON CONFLICT (email) DO NOTHING;

-- Note: You should change this password after first login
-- The hash above is a placeholder - use the register endpoint to create real users
