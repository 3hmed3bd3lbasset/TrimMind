-- ==========================================================
-- ELITE SALON PLATFORM (منصة صالون النخبة VIP)
-- MySQL Production Schema with Security Constraints & Indexes
-- ==========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. الفروع (Branches)
CREATE TABLE IF NOT EXISTS `branches` (
    `id` VARCHAR(64) PRIMARY KEY,
    `name` VARCHAR(200) NOT NULL,
    `address` TEXT NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `opening_time` VARCHAR(10) DEFAULT '10:00',
    `closing_time` VARCHAR(10) DEFAULT '23:00',
    `is_active` TINYINT(1) DEFAULT 1,
    `image_url` TEXT,
    `instapay_username` VARCHAR(100),
    `vodafone_cash_number` VARCHAR(20),
    `bank_account_info` TEXT,
    `settings` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. الموظفون والمديرون (Staff & Manager Profiles)
CREATE TABLE IF NOT EXISTS `profiles` (
    `id` VARCHAR(64) PRIMARY KEY,
    `full_name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(20) UNIQUE,
    `email` VARCHAR(200) UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('customer', 'receptionist', 'manager', 'barber') NOT NULL DEFAULT 'customer',
    `is_super_admin` TINYINT(1) DEFAULT 0,
    `assigned_branch_ids` JSON,
    `branch_id` VARCHAR(64),
    `barber_id` VARCHAR(64),
    `is_active` TINYINT(1) DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. كباتن الحلاقة (Barbers)
CREATE TABLE IF NOT EXISTS `barbers` (
    `id` VARCHAR(64) PRIMARY KEY,
    `branch_id` VARCHAR(64) NOT NULL,
    `full_name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(20),
    `photo_url` TEXT,
    `rating` DECIMAL(3,2) DEFAULT 4.90,
    `rating_count` INT DEFAULT 0,
    `specialty` VARCHAR(300),
    `is_active` TINYINT(1) DEFAULT 1,
    `service_ids` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. كراسي ومحطات الحلاقة (Chairs)
CREATE TABLE IF NOT EXISTS `chairs` (
    `id` VARCHAR(64) PRIMARY KEY,
    `branch_id` VARCHAR(64) NOT NULL,
    `barber_id` VARCHAR(64),
    `name` VARCHAR(100) NOT NULL,
    `mode` ENUM('normal', 'vip', 'both') DEFAULT 'normal',
    `is_active` TINYINT(1) DEFAULT 1,
    `status` ENUM('available', 'in_service', 'cleaning', 'offline') DEFAULT 'available',
    `current_booking_id` VARCHAR(64),
    `service_ends_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. الخدمات (Services)
CREATE TABLE IF NOT EXISTS `services` (
    `id` VARCHAR(64) PRIMARY KEY,
    `branch_id` VARCHAR(64),
    `name` VARCHAR(200) NOT NULL,
    `description` TEXT,
    `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `duration_minutes` INT NOT NULL DEFAULT 30,
    `category` ENUM('hair', 'beard', 'skin', 'vip_package', 'kids') DEFAULT 'hair',
    `is_vip_only` TINYINT(1) DEFAULT 0,
    `is_active` TINYINT(1) DEFAULT 1,
    `image_url` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. المنتجات والكافيه (Products & Cafe)
CREATE TABLE IF NOT EXISTS `products` (
    `id` VARCHAR(64) PRIMARY KEY,
    `branch_id` VARCHAR(64),
    `name` VARCHAR(200) NOT NULL,
    `category` ENUM('hot_drink', 'cold_drink', 'care_product', 'cigar_shisha') DEFAULT 'hot_drink',
    `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `is_active` TINYINT(1) DEFAULT 1,
    `image_url` TEXT,
    `description` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. الحجوزات (Bookings)
CREATE TABLE IF NOT EXISTS `bookings` (
    `id` VARCHAR(64) PRIMARY KEY,
    `customer_id` VARCHAR(64),
    `customer_name` VARCHAR(150) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `branch_id` VARCHAR(64) NOT NULL,
    `barber_id` VARCHAR(64),
    `chair_id` VARCHAR(64),
    `service_id` VARCHAR(64) NOT NULL,
    `additional_service_ids` JSON,
    `booking_type` ENUM('normal', 'vip') DEFAULT 'normal',
    `status` ENUM('draft', 'awaiting_payment', 'payment_submitted', 'pending_review', 'confirmed', 'customer_arrived', 'in_service', 'completed', 'rejected', 'cancelled', 'expired', 'no_show') DEFAULT 'awaiting_payment',
    `starts_at` VARCHAR(50) NOT NULL,
    `ends_at` VARCHAR(50),
    `booking_date` DATE,
    `queue_number` INT,
    `service_price_at_booking` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `booking_fee_at_booking` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `discount_at_booking` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `items_total_at_booking` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `total_at_booking` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `secure_token` VARCHAR(64) NOT NULL UNIQUE,
    `notes` TEXT,
    `completed_at` VARCHAR(50),
    `cancelled_at` VARCHAR(50),
    `cancellation_reason` TEXT,
    `last_modified_by` JSON,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`),
    FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`),
    INDEX idx_customer_phone (`customer_phone`),
    INDEX idx_branch_date_queue (`branch_id`, `booking_date`, `queue_number`),
    INDEX idx_status (`status`),
    INDEX idx_starts_at (`starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. بنود ومشتريات الحجز (Booking Items)
CREATE TABLE IF NOT EXISTS `booking_items` (
    `id` VARCHAR(64) PRIMARY KEY,
    `booking_id` VARCHAR(64) NOT NULL,
    `product_id` VARCHAR(64),
    `name` VARCHAR(200) NOT NULL,
    `price_at_booking` DECIMAL(10,2) NOT NULL,
    `quantity` INT NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. إيصالات الدفع والتحويل (Payment Proofs)
CREATE TABLE IF NOT EXISTS `payment_proofs` (
    `id` VARCHAR(64) PRIMARY KEY,
    `booking_id` VARCHAR(64) NOT NULL UNIQUE,
    `image_path` VARCHAR(500) NOT NULL,
    `payment_method` ENUM('instapay', 'vodafone_cash', 'card', 'cash') NOT NULL,
    `sender_phone` VARCHAR(20) NOT NULL,
    `transferred_amount` DECIMAL(10,2) NOT NULL,
    `status` ENUM('pending_review', 'approved', 'rejected') DEFAULT 'pending_review',
    `reviewed_by` VARCHAR(64),
    `rejection_reason` TEXT,
    `submitted_at` VARCHAR(50),
    `reviewed_at` VARCHAR(50),
    `is_image_purged` TINYINT(1) DEFAULT 0,
    `purged_at` VARCHAR(50),
    FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. التقييمات (Ratings)
CREATE TABLE IF NOT EXISTS `ratings` (
    `id` VARCHAR(64) PRIMARY KEY,
    `booking_id` VARCHAR(64) NOT NULL UNIQUE,
    `customer_id` VARCHAR(64),
    `customer_name` VARCHAR(150),
    `barber_id` VARCHAR(64) NOT NULL,
    `branch_id` VARCHAR(64) NOT NULL,
    `stars` DECIMAL(2,1) NOT NULL,
    `barber_score` DECIMAL(2,1) DEFAULT 5.0,
    `place_score` DECIMAL(2,1) DEFAULT 5.0,
    `experience_score` DECIMAL(2,1) DEFAULT 5.0,
    `comment` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. طابور الانتظار الحي (Queue Entries)
CREATE TABLE IF NOT EXISTS `queue_entries` (
    `id` VARCHAR(64) PRIMARY KEY,
    `branch_id` VARCHAR(64) NOT NULL,
    `chair_id` VARCHAR(64),
    `booking_id` VARCHAR(64),
    `customer_name` VARCHAR(150) NOT NULL,
    `service_name` VARCHAR(200) NOT NULL,
    `barber_name` VARCHAR(150) NOT NULL,
    `position` INT NOT NULL,
    `estimated_wait_minutes` INT DEFAULT 25,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. سجل الأمان والتدقيق (Immutable Security Audit Logs)
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` VARCHAR(64) PRIMARY KEY,
    `actor_id` VARCHAR(64),
    `actor_name` VARCHAR(150),
    `actor_role` ENUM('customer', 'receptionist', 'manager', 'barber'),
    `action` VARCHAR(100) NOT NULL,
    `target_table` VARCHAR(50),
    `target_id` VARCHAR(64),
    `metadata` JSON,
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. إعدادات النظام وهوية الصالون (System Settings)
CREATE TABLE IF NOT EXISTS `settings` (
    `setting_key` VARCHAR(100) PRIMARY KEY,
    `setting_value` JSON NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. سجل محاولات الدخول لحماية Brute-Force (Login Attempts)
CREATE TABLE IF NOT EXISTS `login_attempts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `identifier` VARCHAR(200) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `attempted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ident_ip (`identifier`, `ip_address`),
    INDEX idx_time (`attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
