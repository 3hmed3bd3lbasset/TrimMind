import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeExt = MIME_TO_EXT[file.mimetype.toLowerCase()] || '.jpg';
    const safeName = `proof_${Date.now()}_${uuidv4().slice(0, 8)}${safeExt}`;
    cb(null, safeName);
  },
});

// File filter (Only JPEG, PNG, WEBP allowed)
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowedMimes = Object.keys(MIME_TO_EXT);
  const origExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];

  if (allowedMimes.includes(file.mimetype.toLowerCase()) && (allowedExts.includes(origExt) || origExt === '')) {
    cb(null, true);
  } else {
    cb(new Error('صيغة الملف غير مدعومة. يرجى رفع صورة بصيغة PNG أو JPG أو WEBP فقط.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
    files: 1,
  },
});

// POST /api/upload (Public upload for payment receipt screenshots)
router.post('/', uploadLimiter, upload.single('file'), (req, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'لم يتم اختيار أي ملف لرفعه' });
    }

    const publicPath = `/uploads/${req.file.filename}`;
    return res.status(201).json({
      success: true,
      message: 'تم رفع الصورة بنجاح',
      data: {
        filename: req.file.filename,
        path: publicPath,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || 'فشل رفع الملف' });
  }
});

export default router;
