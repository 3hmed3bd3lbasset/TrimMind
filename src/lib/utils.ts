import { BookingStatus, UserRole, PaymentStatus } from '../types';

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ar-EG')} ج.م`;
}

export function format12Hour(timeStr: string): string {
  if (!timeStr) return '';
  // Check if string contains ISO date/time
  let timePart = timeStr;
  if (timeStr.includes('T')) {
    const timeMatch = timeStr.match(/T(\d{2}:\d{2})/);
    if (timeMatch) timePart = timeMatch[1];
  }

  const parts = timePart.split(':');
  if (parts.length < 2) return timeStr;

  let hour = parseInt(parts[0], 10);
  const minute = parts[1];

  if (isNaN(hour)) return timeStr;

  const isPM = hour >= 12;
  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour = hour - 12;
  }

  const hourStr = hour < 10 ? `0${hour}` : `${hour}`;
  const periodStr = isPM ? 'م' : 'ص';

  return `${hourStr}:${minute} ${periodStr}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ar-EG', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return `${formatDate(dateString)} - ${format12Hour(dateString)}`;
}

export function formatTime(dateString: string): string {
  return format12Hour(dateString);
}

export function generateToken(): string {
  return 'VIP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generateUUID(): string {
  return 'uuid-' + Math.random().toString(36).substring(2, 9);
}

export function calculateEstimatedWait(queuePosition: number, averageServiceTimeMinutes: number = 25): number {
  return Math.max(0, (queuePosition - 1) * averageServiceTimeMinutes);
}

export function playCallChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.4);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(440, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 1.2);
    osc2.stop(ctx.currentTime + 1.2);
  } catch (e) {
    console.log('Chime error:', e);
  }
}

/**
 * Automatically compress customer uploaded receipt images to lightweight high-quality format
 */
export async function compressImage(file: File, maxWidth: number = 1200, quality: number = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => resolve(event.target?.result as string);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * High-Definition Image Processor: Handles any image size (from 1MB to 50MB+ camera shots)
 * Produces ultra-crisp, high-definition portraits and photos with bicubic smoothing,
 * optimal contrast, and memory-safe storage for Barbers, Branches, and Services.
 */
export async function processHighQualityPhoto(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.92
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) {
        reject(new Error('Failed to read image data'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          resolve(rawDataUrl);
          return;
        }

        // Maintain crystal-clear aspect ratio without exceeding maxDimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        // Enable highest quality smoothing algorithms
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw image cleanly
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Try modern WebP first with high quality, fallback to JPEG
        try {
          const webpData = canvas.toDataURL('image/webp', quality);
          if (webpData && webpData.startsWith('data:image/webp')) {
            resolve(webpData);
            return;
          }
        } catch (e) {
          // ignore
        }

        const jpegData = canvas.toDataURL('image/jpeg', quality);
        resolve(jpegData);
      };

      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Check if a payment receipt image has expired (2 hours after review/confirmation)
 */
export function isReceiptImageExpired(proof?: any): boolean {
  if (!proof) return false;
  if (proof.is_image_purged) return true;
  if (proof.status === 'approved' && proof.reviewed_at) {
    const reviewedTime = new Date(proof.reviewed_at).getTime();
    const diffMs = Date.now() - reviewedTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours >= 2; // Expired after 2 hours
  }
  return false;
}

/**
 * Calculate remaining retention minutes for receipt image (out of 120 min)
 */
export function getRemainingReceiptImageMinutes(proof?: any): number {
  if (!proof || proof.is_image_purged || proof.status !== 'approved' || !proof.reviewed_at) {
    return 120;
  }
  const reviewedTime = new Date(proof.reviewed_at).getTime();
  const diffMs = Date.now() - reviewedTime;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  return Math.max(0, 120 - diffMinutes);
}

export const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; bg: string; text: string; border: string; step: number; description: string }
> = {
  draft: {
    label: 'مسودة',
    bg: 'bg-paper-warm',
    text: 'text-ink-mute',
    border: 'border-border',
    step: 0,
    description: 'جاري تحديد تفاصيل الحجز',
  },
  awaiting_payment: {
    label: 'بانتظار التحويل',
    bg: 'bg-terra/10',
    text: 'text-terra-deep',
    border: 'border-terra/30',
    step: 1,
    description: 'يرجى تحويل رسوم الحجز ورفع صورة الإيصال',
  },
  payment_submitted: {
    label: 'تم رفع الإيصال',
    bg: 'bg-forest/10',
    text: 'text-forest',
    border: 'border-forest/30',
    step: 2,
    description: 'تم استلام إثبات الدفع وجاري التحقق منه',
  },
  pending_review: {
    label: 'قيد مراجعة الدفع',
    bg: 'bg-paper-warm',
    text: 'text-forest',
    border: 'border-border',
    step: 2,
    description: 'موظف الاستقبال يقوم بمراجعة الإيصال ومطابقة المبلغ',
  },
  confirmed: {
    label: 'حجز مؤكد',
    bg: 'bg-forest/10',
    text: 'text-forest',
    border: 'border-forest/30',
    step: 3,
    description: 'تم تأكيد حجزك بنجاح وننتظر تشريفك في الموعد',
  },
  customer_arrived: {
    label: 'وصل للصالون',
    bg: 'bg-forest/20',
    text: 'text-forest',
    border: 'border-forest/40',
    step: 4,
    description: 'تم تسجيل وصولك إلى الصالون وأنت في طابور الكرسي',
  },
  in_service: {
    label: 'في الخدمة الآن',
    bg: 'bg-terra/15',
    text: 'text-terra-deep',
    border: 'border-terra/30',
    step: 5,
    description: 'العميل على كرسي الحلاقة والخدمة جارية',
  },
  completed: {
    label: 'مكتمل بنجاح',
    bg: 'bg-forest/15',
    text: 'text-forest',
    border: 'border-forest/30',
    step: 6,
    description: 'تم تقديم الخدمة وإتمام الحساب بنجاح، نراك قريباً!',
  },
  rejected: {
    label: 'مرفوض',
    bg: 'bg-terra/15',
    text: 'text-terra-deep',
    border: 'border-terra/30',
    step: -1,
    description: 'تم رفض الإيصال أو الحجز، يرجى التواصل مع الإدارة',
  },
  cancelled: {
    label: 'ملغي',
    bg: 'bg-paper-deep/60',
    text: 'text-ink-mute',
    border: 'border-border',
    step: -1,
    description: 'تم إلغاء هذا الحجز',
  },
  expired: {
    label: 'منتهي الصلاحية',
    bg: 'bg-paper-deep/60',
    text: 'text-ink-mute',
    border: 'border-border',
    step: -1,
    description: 'انتهت صلاحية الحجز لعدم السداد في الوقت المحدد',
  },
  no_show: {
    label: 'لم يحضر',
    bg: 'bg-paper-deep/60',
    text: 'text-ink-mute',
    border: 'border-border',
    step: -1,
    description: 'لم يحضر العميل في الموعد المحدد',
  },
};

export const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  customer: { label: 'عميل الصالون', color: 'text-forest bg-forest/10 border-forest/20' },
  barber: { label: 'كابتن الحلاق', color: 'text-forest bg-paper-warm border-border font-bold' },
  receptionist: { label: 'موظف الاستقبال', color: 'text-terra-deep bg-terra/15 border-terra/30' },
  manager: { label: 'المدير العام', color: 'text-paper bg-ink border-ink' },
};

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
  pending_review: { label: 'قيد التدقيق', color: 'text-terra-deep bg-terra/15 border-terra/30' },
  approved: { label: 'مقبول ومؤكد', color: 'text-forest bg-forest/10 border-forest/30' },
  rejected: { label: 'مرفوض', color: 'text-terra-deep bg-terra/20 border-terra/40' },
};
