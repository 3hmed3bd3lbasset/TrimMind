import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorDetails = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({
          success: false,
          error: error.errors[0]?.message || 'بيانات غير صالحة',
          details: errorDetails,
        });
      }
      return res.status(400).json({ success: false, error: 'فشل التحقق من صحة البيانات' });
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: 'معاملات البحث غير صالحة',
          details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        });
      }
      return res.status(400).json({ success: false, error: 'فشل التحقق من معاملات البحث' });
    }
  };
}
