import sanitizeHtml from 'sanitize-html';
import { Request, Response, NextFunction } from 'express';

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [], // Strip all HTML tags
  allowedAttributes: {},
};

function deepSanitize(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeHtml(obj.trim(), sanitizeOptions);
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSanitize);
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Don't sanitize passwords or base64 binary chunks
      if (key.toLowerCase().includes('password') || key === 'imagePath' || key === 'imageData') {
        cleaned[key] = value;
      } else {
        cleaned[key] = deepSanitize(value);
      }
    }
    return cleaned;
  }
  return obj;
}

export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.body) {
    req.body = deepSanitize(req.body);
  }
  if (req.query) {
    req.query = deepSanitize(req.query);
  }
  if (req.params) {
    req.params = deepSanitize(req.params);
  }
  next();
}
