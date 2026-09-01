import { BookingStatus, UserRole, PaymentStatus } from '../types';

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ar-EG')} ج.م`;
}

export function format12Hour(timeStr: string): string {
  if (!timeStr) return '';
  
  // Extract hour and minute cleanly from ISO string, SQL datetime, or pure time string
  let match = timeStr.match(/T(\d{1,2}):(\d{2})/);
  if (!match) {
    match = timeStr.match(/\s(\d{1,2}):(\d{2})/);
  }
  if (!match) {
    match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  }
  if (!match) {
    match = timeStr.match(/(\d{1,2}):(\d{2})/);
  }

  if (!match) return timeStr;

  let hour = parseInt(match[1], 10);
  const minute = match[2];

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
  if (!dateString) return '';
  // Replace space with T for cross-browser Date parsing if it's a SQL datetime
  const safeDateStr = dateString.includes(' ') && !dateString.includes('T')
    ? dateString.replace(' ', 'T')
    : dateString;
  const date = new Date(safeDateStr);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('ar-EG', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return '';
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

/**
 * Iconic Airport Announcement Attention Chime (نغمة رجاء الانتباه للمطارات)
 * Synthesizes a luxury 4-tone ascending bell arpeggio (C5 -> E5 -> G5 -> C6)
 * with authentic acoustic resonance and warm reverberant decay.
 */
export function playCallChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 4 Authentic Airport Chime Notes: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
    const notes = [
      { freq: 523.25, time: 0.0, duration: 0.85, gain: 0.32 }, // C5 (Tone 1)
      { freq: 659.25, time: 0.28, duration: 0.85, gain: 0.34 }, // E5 (Tone 2)
      { freq: 783.99, time: 0.56, duration: 0.85, gain: 0.36 }, // G5 (Tone 3)
      { freq: 1046.50, time: 0.84, duration: 1.60, gain: 0.40 }, // C6 (Tone 4 - Final Resonant Bell)
    ];

    notes.forEach(({ freq, time, duration, gain: noteGain }) => {
      const noteStartTime = now + time;

      // 1. Primary Fundamental Oscillator (Pure Warm Bell Tone)
      const oscFundamental = ctx.createOscillator();
      oscFundamental.type = 'sine';
      oscFundamental.frequency.setValueAtTime(freq, noteStartTime);

      // 2. Harmonic Overtone (Chime Bell Sheen at ~2.76x frequency)
      const oscHarmonic = ctx.createOscillator();
      oscHarmonic.type = 'sine';
      oscHarmonic.frequency.setValueAtTime(freq * 2.76, noteStartTime);

      // 3. Sub-octave Warmth (at 0.5x frequency for deep acoustic body)
      const oscSub = ctx.createOscillator();
      oscSub.type = 'triangle';
      oscSub.frequency.setValueAtTime(freq * 0.5, noteStartTime);

      // 4. Note Gain Envelope (Instant strike with smooth exponential decay)
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.0001, noteStartTime);
      gainNode.gain.exponentialRampToValueAtTime(noteGain, noteStartTime + 0.015);
      gainNode.gain.exponentialRampToValueAtTime(noteGain * 0.45, noteStartTime + 0.18);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, noteStartTime + duration);

      // Harmonic gain (subtle metallic bell shimmer)
      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(noteGain * 0.18, noteStartTime);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, noteStartTime + duration * 0.6);

      // Sub gain
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(noteGain * 0.12, noteStartTime);
      subGain.gain.exponentialRampToValueAtTime(0.0001, noteStartTime + duration * 0.7);

      // Connect audio routing graph
      oscFundamental.connect(gainNode);
      oscHarmonic.connect(harmonicGain);
      harmonicGain.connect(gainNode);
      oscSub.connect(subGain);
      subGain.connect(gainNode);

      gainNode.connect(ctx.destination);

      // Start & Stop Oscillators
      oscFundamental.start(noteStartTime);
      oscHarmonic.start(noteStartTime);
      oscSub.start(noteStartTime);

      oscFundamental.stop(noteStartTime + duration);
      oscHarmonic.stop(noteStartTime + duration);
      oscSub.stop(noteStartTime + duration);
    });
  } catch (e) {
    console.warn('Airport chime playback notice:', e);
  }
}

/**
 * Automatically compress customer uploaded receipt images to lightweight high-quality format
 * Handles any image size (from 1KB to 100MB+) using memory-efficient object URLs
 */
export async function compressImage(file: File, maxWidth: number = 1200, quality: number = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!file) {
      resolve('');
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          fallbackFileReader(file, resolve);
          return;
        }

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fallbackFileReader(file, resolve);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch {
          fallbackFileReader(file, resolve);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        fallbackFileReader(file, resolve);
      };

      img.src = objectUrl;
    } catch {
      fallbackFileReader(file, resolve);
    }
  });
}

function fallbackFileReader(file: File, resolve: (val: string) => void) {
  try {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  } catch {
    resolve('');
  }
}

/**
 * High-Definition Image Processor: Handles any image size (from 1KB to 100MB+ DSLR/Phone shots)
 * Produces ultra-crisp, high-definition portraits and photos with bicubic smoothing,
 * optimal contrast, and memory-safe storage for Barbers, Branches, and Services.
 */
export async function processHighQualityPhoto(
  file: File,
  maxDimension: number = 1200,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    if (!file) {
      resolve('');
      return;
    }

    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width <= 0 || height <= 0) {
          fallbackFileReader(file, resolve);
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
          fallbackFileReader(file, resolve);
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
          if (webpData && webpData.startsWith('data:image/webp') && webpData.length > 50) {
            resolve(webpData);
            return;
          }
        } catch {
          // fallback to jpeg
        }

        try {
          const jpegData = canvas.toDataURL('image/jpeg', quality);
          resolve(jpegData);
        } catch {
          fallbackFileReader(file, resolve);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        fallbackFileReader(file, resolve);
      };

      img.src = objectUrl;
    } catch {
      fallbackFileReader(file, resolve);
    }
  });
}

/**
 * Check if a payment receipt image has expired (30 minutes after review/confirmation)
 */
export function isReceiptImageExpired(proof?: any): boolean {
  if (!proof) return false;
  if (proof.is_image_purged) return true;
  if (proof.status === 'approved' && proof.reviewed_at) {
    const reviewedTime = new Date(proof.reviewed_at).getTime();
    const diffMs = Date.now() - reviewedTime;
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes >= 30; // Expired after 30 minutes to conserve DB storage
  }
  return false;
}

/**
 * Calculate remaining retention minutes for receipt image (out of 30 min)
 */
export function getRemainingReceiptImageMinutes(proof?: any): number {
  if (!proof || proof.is_image_purged || proof.status !== 'approved' || !proof.reviewed_at) {
    return 30;
  }
  const reviewedTime = new Date(proof.reviewed_at).getTime();
  const diffMs = Date.now() - reviewedTime;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  return Math.max(0, 30 - diffMinutes);
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
  custom_pricing_requested: {
    label: 'طلب تسعير باقة ✂️',
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-300',
    step: 0.5,
    description: 'العميل طلب باقة مخصصة بانتظار تسعير موظف الاستقبال',
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
