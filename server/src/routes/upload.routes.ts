import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { getUploadDir } from '../services/persistentStorage.service.js';
import { validateImageSignature, stripJpegExif } from '../services/imageSecurity.service.js';

const router = Router();

// In-Memory Storage for Deep Inspection before writing to disk
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
    files: 1,
  },
});

/**
 * PUBLIC UPLOAD ENDPOINT ARCHITECTURAL RATIONALE:
 * This endpoint is intentionally accessible to unauthenticated guests to allow customers to upload
 * payment transfer screenshots (InstaPay / Vodafone Cash) during the public booking workflow.
 *
 * HARDENED DEFENSE LAYERS:
 * 1. Distributed Rate Limiter: uploadLimiter (Prevents DoS / flood attacks).
 * 2. In-Memory Buffering (Zero disk write before validation).
 * 3. Deep Magic Bytes Header Inspection (Blocks WebShells, Polyglots, SVG XSS, and executable binaries).
 * 4. Automatic EXIF / GPS location metadata stripping.
 * 5. Deterministic random UUID filename generation (Blocks Path Traversal & overwrite attacks).
 */
router.post('/', uploadLimiter, upload.single('file'), (req, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'لم يتم اختيار أي ملف لرفعه' });
    }

    // 1. Magic Bytes & Polyglot Payload Inspection
    const validation = validateImageSignature(req.file.buffer);
    if (!validation.isValid || !validation.safeExt) {
      return res.status(400).json({
        success: false,
        error: validation.rejectionReason || 'الملف المرفوع غير صالح أو يحتوي على كود غير مصرح به',
      });
    }

    // 2. EXIF & GPS Location Metadata Stripping (Privacy Protection)
    let processedBuffer = req.file.buffer;
    if (validation.detectedMime === 'image/jpeg') {
      processedBuffer = stripJpegExif(req.file.buffer);
    }

    // 3. Deterministic UUID Filename (Prevents Path Traversal / Execution attacks)
    const safeFilename = `proof_${Date.now()}_${uuidv4().replace(/-/g, '')}${validation.safeExt}`;
    const destinationPath = path.join(getUploadDir(), safeFilename);

    // 4. Secure Write to Persistent Storage
    fs.writeFileSync(destinationPath, processedBuffer);

    const publicPath = `/uploads/${safeFilename}`;
    return res.status(201).json({
      success: true,
      message: 'تم فحص الصورة واعتمادها وحفظها بأمان',
      data: {
        filename: safeFilename,
        path: publicPath,
        size: processedBuffer.length,
        mimetype: validation.detectedMime,
      },
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || 'فشل معالجة ورفع الصورة' });
  }
});

export default router;
