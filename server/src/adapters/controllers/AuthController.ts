import { Request, Response } from 'express';
import { container } from '../../container.js';

export class AuthController {
  public async login(req: Request, res: Response): Promise<void> {
    try {
      const { phone, email, password } = req.body;
      const identifier = phone || email;
      const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

      if (!identifier || !password) {
        res.status(400).json({ success: false, error: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
        return;
      }

      const result = await container.authenticateStaffUseCase.execute(identifier, password, ipAddress);
      if (!result) {
        res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
        return;
      }

      res.json({ success: true, data: result });
    } catch (err: any) {
      console.error('[AuthController.login Error]:', err);
      res.status(500).json({ success: false, error: err.message || 'خطأ في عملية تسجيل الدخول' });
    }
  }

  public async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({ success: false, error: 'غير مصرح' });
        return;
      }
      const profile = await container.profileRepo.findById(user.id);
      if (!profile) {
        res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
        return;
      }
      res.json({
        success: true,
        data: {
          id: profile.id,
          full_name: profile.fullName,
          phone: profile.phone,
          email: profile.email,
          role: profile.role,
          is_super_admin: profile.isSuperAdmin,
          branch_id: profile.branchId,
          barber_id: profile.barberId,
          assigned_branch_ids: profile.assignedBranchIds,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const authController = new AuthController();
