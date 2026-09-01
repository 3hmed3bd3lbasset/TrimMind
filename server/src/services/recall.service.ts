import { container } from '../container.js';
export { RecallCandidate } from '../domain/entities/RecallCampaign.entity.js';

export async function findRecallCandidates(branchId: string, thresholdDays: number = 30) {
  return await container.findRecallCandidatesUseCase.execute(branchId, thresholdDays);
}

export function generateRecallMessage(customerName: string, lastBarber: string, lastService: string): string {
  const name = (customerName || 'يا فندم').replace(/عميل واتساب|\(|\)|\d+/g, '').trim() || 'يا فندم';
  const barberText = lastBarber ? ` مع كابتن ${lastBarber}` : '';
  const serviceText = lastService ? ` لخدمة ${lastService}` : '';

  return `أهلاً بك يا ${name}، وحشتنا في صالون الحداد. بقالك فترة ما شرفتناش من بعد آخر زيارة${serviceText}${barberText}.

جاهزين لك دائماً ومجهزين لك أفضل تجربة واهتمام يليق بحضرتك.

تقدر تختار ميعادك القادم وخدمتك بكل سهولة من خلال موقعنا الرسمي:
https://trimmind.up.railway.app/booking

مستنيينك تنورنا ونتمنى لك يوم جميل ومميز ❤️`;
}

export async function sendRecallCampaign(
  branchId: string,
  thresholdDays: number,
  candidatePhones: string[],
  customMessageTemplate?: string,
  actorId?: string
) {
  return await container.sendRecallCampaignUseCase.execute(
    branchId,
    thresholdDays,
    candidatePhones,
    customMessageTemplate,
    actorId
  );
}

export async function getBranchRecallCampaigns(branchId: string) {
  return await container.recallRepo.getCampaigns(branchId);
}

export const getRecallCampaigns = getBranchRecallCampaigns;
