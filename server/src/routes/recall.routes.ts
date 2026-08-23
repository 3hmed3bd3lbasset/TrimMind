import { Router, Response } from 'express';
import {
  findRecallCandidates,
  sendRecallCampaign,
  getRecallCampaigns,
} from '../services/recall.service.js';
import { requireAuth, requireRoles, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Protect all recall routes - Manager Only
router.use(requireAuth, requireRoles('manager'));

// 1. GET /api/recall/candidates
router.get('/candidates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const branchId = (req.query.branchId as string) || 'branch-elhdad';
    const thresholdDays = parseInt((req.query.thresholdDays as string) || '30', 10);
    const candidates = await findRecallCandidates(branchId, thresholdDays);
    return res.json({ success: true, data: candidates });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. POST /api/recall/send
router.post('/send', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { branchId, thresholdDays, candidatePhones, customMessageTemplate } = req.body;

    if (!Array.isArray(candidatePhones) || candidatePhones.length === 0) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار عميل واحد على الأقل لإرسال التذكير.' });
    }

    const result = await sendRecallCampaign(
      branchId || 'branch-elhdad',
      thresholdDays || 30,
      candidatePhones,
      customMessageTemplate,
      req.user?.id
    );

    return res.json({
      success: true,
      message: `تم إرسال رسائل التذكير بنجاح إلى ${result.sentCount} عميل!`,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 3. GET /api/recall/campaigns
router.get('/campaigns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const branchId = (req.query.branchId as string) || 'branch-elhdad';
    const campaigns = await getRecallCampaigns(branchId);
    return res.json({ success: true, data: campaigns });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
