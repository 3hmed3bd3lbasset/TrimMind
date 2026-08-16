-- ==========================================================
-- ELITE SALON PLATFORM - SEED DATA
-- Default initial branches, barbers, chairs, services, products, and admin accounts
-- ==========================================================

SET NAMES utf8mb4;

-- 1. الفروع (Branches)
INSERT INTO `branches` (`id`, `name`, `address`, `phone`, `opening_time`, `closing_time`, `is_active`, `image_url`, `instapay_username`, `vodafone_cash_number`, `bank_account_info`) VALUES
('b1111111-1111-4111-a111-111111111111', 'فرع التجمع الخامس - VIP Lounge', 'شارع التسعين الشمالي، مول النخبة، التجمع الخامس، القاهرة', '01012345678', '10:00', '23:00', 1, 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&auto=format&fit=crop&q=80', 'tagamoa.vip@instapay', '01012345678', 'CIB - فرع التجمع الخامس - حساب رقم 1000492837'),
('b2222222-2222-4222-a222-222222222222', 'فرع المعادي - Classic Gentlemen', 'شارع 9، دجلة، المعادي، القاهرة', '01023456789', '11:00', '23:30', 1, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop&q=80', 'maadi.barber@instapay', '01023456789', 'QNB - فرع دجلة المعادي - حساب رقم 2000582910'),
('b3333333-3333-4333-a333-333333333333', 'فرع الشيخ زايد - Arkan Plaza', 'أركان بلازا، المحور المركزي، الشيخ زايد، الجيزة', '01034567890', '10:00', '00:00', 1, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&auto=format&fit=crop&q=80', 'zayed.arkan@instapay', '01034567890', 'HSBC - فرع الشيخ زايد - حساب رقم 3000918273'),
('b4444444-4444-4444-a444-444444444444', 'فرع الإسكندرية - Sea View Suite', 'طريق الكورنيش، لوران، الإسكندرية', '01045678901', '11:00', '23:00', 1, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&auto=format&fit=crop&q=80', 'alex.seaview@instapay', '01045678901', 'البنك الأهلي المصري - فرع لوران - حساب رقم 4000192837')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 2. الكباتن (Barbers)
INSERT INTO `barbers` (`id`, `branch_id`, `full_name`, `phone`, `photo_url`, `rating`, `rating_count`, `specialty`, `is_active`) VALUES
('barber-1', 'b1111111-1111-4111-a111-111111111111', 'كريم صقر (Master Barber)', '01111223344', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80', 4.95, 148, 'قصات كلاسيكية ونحت اللحية الملكية', 1),
('barber-2', 'b1111111-1111-4111-a111-111111111111', 'طارق الشامي', '01122334455', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80', 4.88, 94, 'تدريج عالي (Fade) وسيشوار وتصفيف حديث', 1),
('barber-3', 'b1111111-1111-4111-a111-111111111111', 'أحمد فؤاد (VIP Specialist)', '01133445566', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80', 4.98, 210, 'باقات كبار الشخصيات وعلاجات البشرة', 1),
('barber-4', 'b2222222-2222-4222-a222-222222222222', 'حسام المغربي', '01144556677', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&auto=format&fit=crop&q=80', 4.91, 82, 'علاجات البشرة بالبخار وتحديد اللحية الدقيق', 1),
('barber-5', 'b2222222-2222-4222-a222-222222222222', 'يوسف الألفي', '01155667788', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80', 4.85, 67, 'قصات شبابية عصرية وماسكات تنظيف عميق', 1),
('barber-6', 'b3333333-3333-4333-a333-333333333333', 'عمر عبد العزيز', '01166778899', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=80', 4.96, 175, 'جلسات استرخاء VIP وعناية ملكية متكاملة', 1),
('barber-7', 'b3333333-3333-4333-a333-333333333333', 'سامر الدسوقي', '01177889900', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80', 4.89, 112, 'حلاقة إيطالية كلاسيكية ومساج للرأس', 1),
('barber-8', 'b4444444-4444-4444-a444-444444444444', 'مصطفى السكندري', '01188990011', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80', 4.94, 130, 'سشوار احترافي وقصات أوروبية حديثة', 1)
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

-- 3. الكراسي (Chairs)
INSERT INTO `chairs` (`id`, `branch_id`, `barber_id`, `name`, `mode`, `is_active`, `status`) VALUES
('chair-1', 'b1111111-1111-4111-a111-111111111111', 'barber-1', 'كرسي الماستر #1 (كريم صقر)', 'both', 1, 'available'),
('chair-2', 'b1111111-1111-4111-a111-111111111111', 'barber-2', 'كرسي التدريج الحديث #2 (طارق)', 'normal', 1, 'available'),
('chair-3', 'b1111111-1111-4111-a111-111111111111', 'barber-3', 'الجناح الملكي الملكي VIP #3 (أحمد فؤاد)', 'vip', 1, 'available'),
('chair-4', 'b2222222-2222-4222-a222-222222222222', 'barber-4', 'كرسي المعادي الملكي #1', 'both', 1, 'available'),
('chair-5', 'b2222222-2222-4222-a222-222222222222', 'barber-5', 'كرسي كلاسيك #2', 'normal', 1, 'available'),
('chair-6', 'b3333333-3333-4333-a333-333333333333', 'barber-6', 'جناح أركان VIP الملكي #1', 'vip', 1, 'available'),
('chair-7', 'b3333333-3333-4333-a333-333333333333', 'barber-7', 'كرسي أركان الذهبي #2', 'normal', 1, 'available'),
('chair-8', 'b4444444-4444-4444-a444-444444444444', 'barber-8', 'جناح البحر الملكي #1', 'both', 1, 'available')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 4. الخدمات (Services)
INSERT INTO `services` (`id`, `name`, `description`, `price`, `duration_minutes`, `category`, `is_vip_only`, `is_active`, `image_url`) VALUES
('srv-1', 'قص شعر ملكي وتصفيف VIP', 'قص شعر كلاسيكي أو عصري بأيدي خبراء، غسيل بالشامبو الإيطالي، وسشوار احترافي', 250.00, 35, 'hair', 0, 1, 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&auto=format&fit=crop&q=80'),
('srv-2', 'نحت وتشذيب اللحية الملكية', 'تحديد اللحية بالموس الحار، تدليك بالزيوت الطبيعية، وفوطة ساخنة بالبخار المعطر', 180.00, 25, 'beard', 0, 1, 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=500&auto=format&fit=crop&q=80'),
('srv-3', 'باقة النخبة الملكية الشاملة (Hair + Beard + Steam)', 'قص وتصفيف الشعر + نحت اللحية + ماسك بخار تنظيف عميق للبشرة + مساج للرأس والكتفين', 450.00, 60, 'vip_package', 0, 1, 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=500&auto=format&fit=crop&q=80'),
('srv-4', 'جلسة تنظيف البشرة بالبخار والأوزون', 'ماسك فحم طبيعي لإزالة الرؤوس السوداء، تقشير سكراب، وجلسة بخار ساخن مع ترطيب هيدروجيني', 280.00, 40, 'skin', 0, 1, 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=500&auto=format&fit=crop&q=80'),
('srv-5', 'باقة الجناح الملكي الخاص VIP Executive', 'جلسة حلاقة خاصة داخل الجناح المعزول تشمل كافة الخدمات + مشروب فاخر + سيجار وسناك', 750.00, 90, 'vip_package', 1, 1, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'),
('srv-6', 'حلاقة الأطفال والأمراء الصغار (Junior VIP)', 'قص شعر ممتع للأطفال مع ألعاب وشاشات كرتون وهدية خاصة بعد الجلسة', 160.00, 25, 'kids', 0, 1, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 5. منتجات الكافيه والعناية (Products)
INSERT INTO `products` (`id`, `name`, `category`, `price`, `is_active`, `image_url`, `description`) VALUES
('prod-1', 'إسبريسو دبل إيطالي فاخر', 'hot_drink', 45.00, 1, 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&auto=format&fit=crop&q=80', 'حبوب بن أرابيكا 100% طازجة التحميص'),
('prod-2', 'قهوة كولومبية مقطرة V60', 'hot_drink', 65.00, 1, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&auto=format&fit=crop&q=80', 'مقطرة بعناية بإيحاءات الشوكولاتة والمكسرات'),
('prod-3', 'موهيتو ليمون ونعناع منعش', 'cold_drink', 55.00, 1, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=80', 'مشروب صيفي مثلج مع الصودا والنعناع البلدي'),
('prod-4', 'ماتشا لاتيه مثلجة بحليب اللوز', 'cold_drink', 75.00, 1, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&auto=format&fit=crop&q=80', 'ماتشا عضوية مستوردة من اليابان'),
('prod-5', 'سيروم اللحية الفاخر بخلاصة الأرجان', 'care_product', 220.00, 1, 'https://images.unsplash.com/photo-1608248597359-002d2ec2f768?w=400&auto=format&fit=crop&q=80', 'يرطب وينعم شعر اللحية ويمنحها لمعاناً ورائحة فواحة'),
('prod-6', 'واكس تصفيف مطفي فائق الثبات (Matte Clay)', 'care_product', 180.00, 1, 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&auto=format&fit=crop&q=80', 'ثبات يدوم 24 ساعة دون أي مظهر دهني')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 6. حسابات الموظفين والمديرين (كلمة المرور الافتراضية للجميع: Admin@123456)
-- Hash: $2b$12$e8YnZc6.zE5Gf0rS.rK5euH0jZ0H9R3Z2rT4x0mJ9x9F8vP7m4N1q
INSERT INTO `profiles` (`id`, `full_name`, `phone`, `email`, `password_hash`, `role`, `is_super_admin`, `branch_id`, `barber_id`, `is_active`) VALUES
('prof-1', 'المهندس أحمد المنشاوي (المدير العام)', '01011122233', 'admin@salon.com', '$2b$12$K89O.n9NnU.f8u7s4Jk5gOeQ0tJg9.Z8W3A2sQ6h1L5K9M4V8C1fG', 'manager', 1, 'b1111111-1111-4111-a111-111111111111', NULL, 1),
('prof-2', 'سارة محمود (استقبال التجمع)', '01022233344', 'reception@salon.com', '$2b$12$K89O.n9NnU.f8u7s4Jk5gOeQ0tJg9.Z8W3A2sQ6h1L5K9M4V8C1fG', 'receptionist', 0, 'b1111111-1111-4111-a111-111111111111', NULL, 1),
('prof-3', 'كريم صقر (كابتن حلاقة)', '01111223344', 'karim@salon.com', '$2b$12$K89O.n9NnU.f8u7s4Jk5gOeQ0tJg9.Z8W3A2sQ6h1L5K9M4V8C1fG', 'barber', 0, 'b1111111-1111-4111-a111-111111111111', 'barber-1', 1),
('prof-4', 'طارق الشامي (كابتن حلاقة)', '01122334455', 'tarek@salon.com', '$2b$12$K89O.n9NnU.f8u7s4Jk5gOeQ0tJg9.Z8W3A2sQ6h1L5K9M4V8C1fG', 'barber', 0, 'b1111111-1111-4111-a111-111111111111', 'barber-2', 1)
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

-- 7. إعدادات النظام (Settings)
INSERT INTO `settings` (`setting_key`, `setting_value`) VALUES
('general', JSON_OBJECT(
    'salon_name', 'صالون النخبة VIP',
    'tagline', 'أرقى تجربة حلاقة وعناية رجالية ملكية في مصر',
    'about_text', 'صالون النخبة VIP يقدم أرقى خدمات الحلاقة والعناية الشخصية للرجال، بخبرة تمتد لأكثر من 15 عاماً بأحدث التقنيات وأجود المنتجات العالمية.',
    'primary_phone', '01012345678',
    'secondary_phone', '01023456789',
    'whatsapp_number', '01012345678',
    'working_hours_text', 'يومياً من 10:00 صباحاً حتى 11:30 مساءً',
    'booking_fee_normal', 50.00,
    'booking_fee_vip', 150.00,
    'cancellation_grace_hours', 2,
    'max_advance_days', 7,
    'vodafone_cash_number', '01012345678',
    'instapay_username', 'elite.salon@instapay',
    'bank_account_info', 'البنك التجاري الدولي CIB - حساب رقم 1000492837'
))
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`);
