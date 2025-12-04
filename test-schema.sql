-- Test Database Schema for DBAgent
-- E-commerce sample data

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active'
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'pending',
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Order Items table
CREATE TABLE IF NOT EXISTS order_items (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Insert sample customers
INSERT INTO customers (name, email, phone, status) VALUES
('John Doe', 'john.doe@example.com', '555-0101', 'active'),
('Jane Smith', 'jane.smith@example.com', '555-0102', 'active'),
('Bob Wilson', 'bob.wilson@example.com', '555-0103', 'active'),
('Alice Johnson', 'alice.j@example.com', '555-0104', 'active'),
('Charlie Brown', 'charlie.b@example.com', '555-0105', 'active'),
('Diana Prince', 'diana.p@example.com', '555-0106', 'inactive'),
('Eve Davis', 'eve.davis@example.com', '555-0107', 'active'),
('Frank Miller', 'frank.m@example.com', '555-0108', 'active');

-- Insert sample products
INSERT INTO products (name, description, price, stock_quantity, category) VALUES
('Premium Widget', 'High-quality widget for professional use', 49.99, 100, 'Widgets'),
('Deluxe Gadget', 'Advanced gadget with premium features', 39.99, 150, 'Gadgets'),
('Standard Tool', 'Reliable tool for everyday tasks', 29.99, 200, 'Tools'),
('Pro Equipment', 'Professional-grade equipment', 199.99, 50, 'Equipment'),
('Basic Accessory', 'Essential accessory kit', 19.99, 300, 'Accessories'),
('Elite Package', 'Complete elite package bundle', 299.99, 25, 'Bundles'),
('Starter Kit', 'Perfect starter kit for beginners', 59.99, 120, 'Kits'),
('Advanced Set', 'Advanced set for experts', 149.99, 75, 'Sets');

-- Insert sample orders
INSERT INTO orders (customer_id, total_amount, status, order_date) VALUES
(1, 245.00, 'completed', datetime('now', '-30 days')),
(1, 189.00, 'completed', datetime('now', '-25 days')),
(1, 312.00, 'shipped', datetime('now', '-5 days')),
(2, 156.00, 'completed', datetime('now', '-20 days')),
(2, 89.00, 'completed', datetime('now', '-15 days')),
(2, 234.00, 'pending', datetime('now', '-2 days')),
(3, 445.00, 'completed', datetime('now', '-28 days')),
(3, 123.00, 'shipped', datetime('now', '-7 days')),
(4, 567.00, 'completed', datetime('now', '-18 days')),
(4, 234.00, 'cancelled', datetime('now', '-10 days')),
(5, 389.00, 'completed', datetime('now', '-22 days')),
(5, 156.00, 'shipped', datetime('now', '-4 days')),
(7, 678.00, 'completed', datetime('now', '-12 days')),
(8, 234.00, 'pending', datetime('now', '-1 day'));

-- Insert sample order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
-- Order 1 (John - $245)
(1, 1, 3, 49.99),
(1, 5, 2, 19.99),
-- Order 2 (John - $189)
(2, 2, 4, 39.99),
(2, 3, 1, 29.99),
-- Order 3 (John - $312)
(3, 4, 1, 199.99),
(3, 7, 1, 59.99),
-- Order 4 (Jane - $156)
(4, 3, 4, 29.99),
(4, 5, 2, 19.99),
-- Order 5 (Jane - $89)
(5, 5, 3, 19.99),
(5, 3, 1, 29.99),
-- Order 6 (Jane - $234)
(6, 1, 2, 49.99),
(6, 2, 3, 39.99),
-- Order 7 (Bob - $445)
(7, 4, 2, 199.99),
(7, 5, 2, 19.99),
-- Order 8 (Bob - $123)
(8, 2, 2, 39.99),
(8, 5, 2, 19.99),
-- Order 9 (Alice - $567)
(9, 6, 1, 299.99),
(9, 1, 4, 49.99),
-- Order 10 (Alice - cancelled)
(10, 7, 3, 59.99),
-- Order 11 (Charlie - $389)
(11, 8, 2, 149.99),
(11, 2, 2, 39.99),
-- Order 12 (Charlie - $156)
(12, 3, 4, 29.99),
-- Order 13 (Eve - $678)
(13, 6, 2, 299.99),
(13, 7, 1, 59.99),
-- Order 14 (Frank - $234)
(14, 1, 4, 49.99);
