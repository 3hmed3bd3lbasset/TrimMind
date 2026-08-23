import { Request, Response } from 'express';
import { container } from '../../container.js';

export class BookingController {
  public async create(req: Request, res: Response): Promise<void> {
    try {
      const actor = (req as any).user;
      const booking = await container.createBookingUseCase.execute(req.body, actor?.id);
      res.status(201).json({ success: true, data: booking });
    } catch (err: any) {
      console.error('[BookingController.create Error]:', err);
      res.status(400).json({ success: false, error: err.message || 'فشل إنشاء الحجز' });
    }
  }

  public async getById(req: Request, res: Response): Promise<void> {
    try {
      const booking = await container.bookingRepo.findById(req.params.id);
      if (!booking) {
        res.status(404).json({ success: false, error: 'الحجز غير موجود' });
        return;
      }
      res.json({ success: true, data: booking });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async cancel(req: Request, res: Response): Promise<void> {
    try {
      const actor = (req as any).user;
      const success = await container.cancelBookingUseCase.execute(
        req.params.id,
        req.body.reason,
        actor?.id
      );
      if (!success) {
        res.status(404).json({ success: false, error: 'الحجز غير موجود' });
        return;
      }
      res.json({ success: true, message: 'تم إلغاء الحجز بنجاح' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async search(req: Request, res: Response): Promise<void> {
    try {
      const q = (req.query.q as string) || '';
      const branchId = req.query.branchId as string | undefined;
      const results = await container.bookingRepo.search(q, branchId);
      res.json({ success: true, data: results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async reviewPaymentProof(req: Request, res: Response): Promise<void> {
    try {
      const actor = (req as any).user;
      const { status, rejectionReason } = req.body;
      const booking = await container.bookingRepo.reviewPaymentProof(
        req.params.id,
        status,
        rejectionReason,
        actor?.id
      );
      container.realtimeNotifier.broadcastToBranch(booking.branchId, 'PAYMENT_PROOF_REVIEWED', { bookingId: booking.id, status });
      container.realtimeNotifier.broadcastGlobal('SYNC_STATE');
      res.json({ success: true, data: booking });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const actor = (req as any).user;
      const { status, note } = req.body;
      const booking = await container.bookingRepo.updateStatus(req.params.id, status, note, actor?.id);
      container.realtimeNotifier.broadcastToBranch(booking.branchId, 'BOOKING_STATUS_CHANGED', { bookingId: booking.id, status });
      container.realtimeNotifier.broadcastGlobal('SYNC_STATE');
      res.json({ success: true, data: booking });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export const bookingController = new BookingController();
