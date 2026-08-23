import { container } from '../container.js';
export { RecallCandidate } from '../domain/entities/RecallCampaign.entity.js';

export async function findRecallCandidates(branchId: string, thresholdDays: number = 30) {
  return await container.findRecallCandidatesUseCase.execute(branchId, thresholdDays);
}

export function generateRecallMessage(customerName: string, lastBarber: string, lastService: string): string {
  const name = customerName || 'عزيزنا العميل';
  return `أهلاً يا ${name}! 💈✨\nوحشتنا في صالون TrimMind (الحداد VIP).. بقالك فترة ما شرفتناش من بعد آخر ${lastService} مع كابتن ${lastBarber}!\n\nجاهزين لك دائماً بأفضل تجربة عناية وحلاقة ملكية تليق بك 👑✂️\n\n👉 احجز موعدك القادم بضغطة واحدة من هنا:\nhttps://trimmind.up.railway.app\n\nنتشرف بزيارتك دائماً! ❤️`;
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
