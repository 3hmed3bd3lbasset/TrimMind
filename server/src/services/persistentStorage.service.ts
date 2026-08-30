import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface PersistentDatabaseSchema {
  branches: any[];
  barbers: any[];
  chairs: any[];
  services: any[];
  products: any[];
  bookings: any[];
  profiles: any[];
  settings: Record<string, any>;
  payment_proofs: any[];
  audit_logs: any[];
  last_updated_at: string;
}

// 1. Resolve persistent volume upload directory
export function getUploadDir(): string {
  const custom = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.UPLOAD_DIR;
  if (custom && fs.existsSync(custom)) return custom;
  if (custom && (custom.startsWith('/') || custom.includes(':'))) {
    try {
      fs.mkdirSync(custom, { recursive: true });
      return custom;
    } catch {}
  }

  // Check Railway volume mount location (/app/server/uploads)
  const railwayMount = '/app/server/uploads';
  if (fs.existsSync('/app/server')) {
    try {
      fs.mkdirSync(railwayMount, { recursive: true });
      return railwayMount;
    } catch {}
  }

  const serverUploads = path.resolve('server/uploads');
  if (fs.existsSync(path.resolve('server'))) {
    try {
      fs.mkdirSync(serverUploads, { recursive: true });
      return serverUploads;
    } catch {}
  }

  const fallback = path.resolve('uploads');
  if (!fs.existsSync(fallback)) {
    fs.mkdirSync(fallback, { recursive: true });
  }
  return fallback;
}

const DB_FILE_NAME = 'trimmind_persistent_db.json';

function getDbFilePath(): string {
  return path.join(getUploadDir(), DB_FILE_NAME);
}

// Default initial seed if completely fresh
const DEFAULT_SEED_DATA: PersistentDatabaseSchema = {
  branches: [
    {
      id: 'branch-elhdad',
      name: 'صالون الحداد VIP - المقر الرئيسي',
      phone: '01285694670',
      address: 'شارع الهرم الرئيسي - الجيزة',
      city: 'الجيزة',
      is_active: true,
      open_time: '11:00',
      close_time: '01:00',
    },
  ],
  barbers: [
    {
      id: 'barber-mohamed',
      branch_id: 'branch-elhdad',
      full_name: 'محمد الحداد (كابتن رئيسي)',
      phone: '01285694670',
      photo_url: '',
      specialty: 'قصات كلاسيكية ومودرن ملكية VIP',
      is_active: true,
      rating: 4.95,
      rating_count: 120,
    },
    {
      id: 'barber-ahmed',
      branch_id: 'branch-elhdad',
      full_name: 'أحمد علي (كابتن تصفيف ولحية)',
      phone: '01005437633',
      photo_url: '',
      specialty: 'تحديد وتدريج اللحية والعناية بالبشرة',
      is_active: true,
      rating: 4.88,
      rating_count: 95,
    },
  ],
  chairs: [
    { id: 'chair-vip-1', branch_id: 'branch-elhdad', name: 'كرسي VIP الملكي (1)', chair_number: 1, is_active: true, is_vip: true },
    { id: 'chair-std-2', branch_id: 'branch-elhdad', name: 'محطة الحلاقة الماسية (2)', chair_number: 2, is_active: true, is_vip: false },
  ],
  services: [
    { id: 'srv-haircut', name: 'قص شعر وتصفيف كلاسيكي', price: 180, duration_minutes: 30, is_active: true, category: 'hair' },
    { id: 'srv-beard', name: 'تحديد واستشوار وحلاقة اللحية', price: 100, duration_minutes: 20, is_active: true, category: 'beard' },
    { id: 'srv-vip-package', name: 'باقة VIP الملكية الشاملة', price: 450, duration_minutes: 60, is_active: true, category: 'vip' },
    { id: 'srv-facial-steam', name: 'تنظيف بشرة وماسك بخار كولاجين', price: 150, duration_minutes: 25, is_active: true, category: 'treatment' },
  ],
  products: [
    { id: 'prod-espresso', branch_id: 'branch-elhdad', name: 'إسبريسو دبل فاخر', category: 'hot_drink', price: 35, is_active: true },
    { id: 'prod-beard-oil', branch_id: 'branch-elhdad', name: 'زيت اللحية الفاخر بالأرجان', category: 'care_product', price: 150, is_active: true },
  ],
  bookings: [],
  profiles: [],
  settings: {
    salon_name: 'صالون الحداد VIP',
    primary_phone: '01285694670',
    address: 'شارع الهرم الرئيسي - الجيزة',
    normal_deposit: 50,
    vip_deposit: 100,
    instapay_address: '01005437633 / elhdad@instapay',
  },
  payment_proofs: [],
  audit_logs: [],
  last_updated_at: new Date().toISOString(),
};

// 2. Read Persistent Database from Volume
export function getPersistentDb(): PersistentDatabaseSchema {
  const filePath = getDbFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SEED_DATA,
        ...parsed,
        branches: Array.isArray(parsed.branches) && parsed.branches.length > 0 ? parsed.branches : DEFAULT_SEED_DATA.branches,
        barbers: Array.isArray(parsed.barbers) && parsed.barbers.length > 0 ? parsed.barbers : DEFAULT_SEED_DATA.barbers,
        chairs: Array.isArray(parsed.chairs) && parsed.chairs.length > 0 ? parsed.chairs : DEFAULT_SEED_DATA.chairs,
        services: Array.isArray(parsed.services) && parsed.services.length > 0 ? parsed.services : DEFAULT_SEED_DATA.services,
        products: Array.isArray(parsed.products) && parsed.products.length > 0 ? parsed.products : DEFAULT_SEED_DATA.products,
        bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        settings: parsed.settings ? { ...DEFAULT_SEED_DATA.settings, ...parsed.settings } : DEFAULT_SEED_DATA.settings,
      };
    }
  } catch (err: any) {
    console.warn('⚠️ Error reading persistent DB file, using in-memory default:', err?.message);
  }

  // Initialize file if not exists
  savePersistentDb(DEFAULT_SEED_DATA);
  return DEFAULT_SEED_DATA;
}

// 3. Save Persistent Database to Volume atomically
export function savePersistentDb(data: Partial<PersistentDatabaseSchema>): boolean {
  const uploadDir = getUploadDir();
  const filePath = getDbFilePath();
  const tempPath = path.join(uploadDir, `db_temp_${Date.now()}.json`);

  try {
    const current = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : DEFAULT_SEED_DATA;
    const merged: PersistentDatabaseSchema = {
      ...current,
      ...data,
      last_updated_at: new Date().toISOString(),
    };

    fs.writeFileSync(tempPath, JSON.stringify(merged, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err: any) {
    console.error('❌ Failed to save persistent DB file:', err?.message);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    return false;
  }
}

// 4. Save Base64 Image to Physical File on Volume
export function saveBase64ImageToVolume(base64Data: string, prefix = 'img'): string {
  if (!base64Data || typeof base64Data !== 'string') return '';
  if (!base64Data.startsWith('data:image/')) {
    // It's already a regular URL
    return base64Data;
  }

  try {
    const uploadDir = getUploadDir();
    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length < 3) return base64Data;

    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    if (ext === 'svg+xml') ext = 'svg';

    const buffer = Buffer.from(matches[2], 'base64');
    const fileName = `${prefix}_${Date.now()}_${uuidv4().substring(0, 8)}.${ext}`;
    const fullPath = path.join(uploadDir, fileName);

    fs.writeFileSync(fullPath, buffer);
    return `/uploads/${fileName}`;
  } catch (err: any) {
    console.error('Failed to save base64 image to persistent volume:', err?.message);
    return base64Data;
  }
}

// 5. Bookings Persistent Operations
export function addOrUpdatePersistentBooking(booking: any) {
  const db = getPersistentDb();
  const existingIdx = db.bookings.findIndex((b) => b.id === booking.id);
  if (existingIdx >= 0) {
    db.bookings[existingIdx] = { ...db.bookings[existingIdx], ...booking, updated_at: new Date().toISOString() };
  } else {
    db.bookings.unshift({ ...booking, created_at: booking.created_at || new Date().toISOString() });
  }
  savePersistentDb({ bookings: db.bookings });
}

// 6. Barbers Persistent Operations
export function addOrUpdatePersistentBarber(barber: any) {
  const db = getPersistentDb();
  let finalPhoto = barber.photo_url || '';
  if (finalPhoto.startsWith('data:image/')) {
    finalPhoto = saveBase64ImageToVolume(finalPhoto, `barber_${barber.id || 'new'}`);
  }

  const barberObj = { ...barber, photo_url: finalPhoto };
  const existingIdx = db.barbers.findIndex((b) => b.id === barber.id);
  if (existingIdx >= 0) {
    db.barbers[existingIdx] = { ...db.barbers[existingIdx], ...barberObj, updated_at: new Date().toISOString() };
  } else {
    db.barbers.push(barberObj);
  }
  savePersistentDb({ barbers: db.barbers });
  return barberObj;
}

export function deletePersistentBarber(barberId: string) {
  const db = getPersistentDb();
  const filtered = db.barbers.filter((b) => b.id !== barberId);
  savePersistentDb({ barbers: filtered });
}

// 7. Services Persistent Operations
export function addOrUpdatePersistentService(service: any) {
  const db = getPersistentDb();
  if (!db.services) db.services = [];
  const existingIdx = db.services.findIndex((s) => s.id === service.id);
  if (existingIdx >= 0) {
    db.services[existingIdx] = { ...db.services[existingIdx], ...service, updated_at: new Date().toISOString() };
  } else {
    db.services.push(service);
  }
  savePersistentDb({ services: db.services });
  return service;
}

export function deletePersistentService(serviceId: string) {
  const db = getPersistentDb();
  if (!db.services) db.services = [];
  const filtered = db.services.filter((s) => s.id !== serviceId);
  savePersistentDb({ services: filtered });
}

// 8. Branches Persistent Operations
export function addOrUpdatePersistentBranch(branch: any) {
  const db = getPersistentDb();
  if (!db.branches) db.branches = [];
  const existingIdx = db.branches.findIndex((b) => b.id === branch.id);
  if (existingIdx >= 0) {
    db.branches[existingIdx] = { ...db.branches[existingIdx], ...branch, updated_at: new Date().toISOString() };
  } else {
    db.branches.push(branch);
  }
  savePersistentDb({ branches: db.branches });
  return branch;
}

export function deletePersistentBranch(branchId: string) {
  const db = getPersistentDb();
  if (!db.branches) db.branches = [];
  const filtered = db.branches.filter((b) => b.id !== branchId);
  savePersistentDb({ branches: filtered });
}

// 9. Chairs Persistent Operations
export function addOrUpdatePersistentChair(chair: any) {
  const db = getPersistentDb();
  if (!db.chairs) db.chairs = [];
  const existingIdx = db.chairs.findIndex((c) => c.id === chair.id);
  if (existingIdx >= 0) {
    db.chairs[existingIdx] = { ...db.chairs[existingIdx], ...chair, updated_at: new Date().toISOString() };
  } else {
    db.chairs.push(chair);
  }
  savePersistentDb({ chairs: db.chairs });
  return chair;
}

export function deletePersistentChair(chairId: string) {
  const db = getPersistentDb();
  if (!db.chairs) db.chairs = [];
  const filtered = db.chairs.filter((c) => c.id !== chairId);
  savePersistentDb({ chairs: filtered });
}

// 10. Products Persistent Operations
export function addOrUpdatePersistentProduct(product: any) {
  const db = getPersistentDb();
  if (!db.products) db.products = [];
  const existingIdx = db.products.findIndex((p) => p.id === product.id);
  if (existingIdx >= 0) {
    db.products[existingIdx] = { ...db.products[existingIdx], ...product, updated_at: new Date().toISOString() };
  } else {
    db.products.push(product);
  }
  savePersistentDb({ products: db.products });
  return product;
}

export function deletePersistentProduct(productId: string) {
  const db = getPersistentDb();
  if (!db.products) db.products = [];
  const filtered = db.products.filter((p) => p.id !== productId);
  savePersistentDb({ products: filtered });
}
