import { IRecallRepository } from '../../domain/repositories/IRecallRepository.js';
import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';

export class SendRecallCampaignUseCase {
  constructor(
    private readonly recallRepo: IRecallRepository,
    private readonly notificationGateway: INotificationGateway
  ) {}

  public async execute(
    branchId: string,
    thresholdDays: number,
    candidatePhones: string[],
    customMessageTemplate?: string,
    actorId?: string
  ): Promise<{ campaignId: string; totalTargeted: number; sentCount: number }> {
    const campaignId = await this.recallRepo.createCampaign(
      branchId,
      thresholdDays,
      `حملة إعادة جذب عملاء منقطعين منذ ${thresholdDays} يوماً`,
      actorId
    );

    const candidates = await this.recallRepo.findCandidates(branchId, thresholdDays);
    const selected = candidates.filter((c) => candidatePhones.includes(c.customer_phone));

    let sentCount = 0;
    for (const c of selected) {
      const msg = customMessageTemplate
        ? customMessageTemplate.replace('{name}', c.customer_name).replace('{barber}', c.last_barber).replace('{service}', c.last_service)
        : `أهلاً يا ${c.customer_name || 'عزيزنا العميل'}! 💈✨\nوحشتنا في صالون TrimMind (الحداد VIP).. بقالك فترة ما شرفتناش من بعد آخر ${c.last_service} مع كابتن ${c.last_barber}!\n\nجاهزين لك دائماً بأفضل تجربة عناية وحلاقة ملكية تليق بك 👑✂️\n\n👉 احجز موعدك القادم بضغطة واحدة من هنا:\nhttps://trimmind.up.railway.app\n\nنتشرف بزيارتك دائماً! ❤️`;

      await this.recallRepo.recordSend(campaignId, c.customer_phone, c.customer_name, msg);
      this.notificationGateway.sendWhatsApp(c.customer_phone, msg).catch(() => {});
      sentCount++;
    }

    return {
      campaignId,
      totalTargeted: selected.length,
      sentCount,
    };
  }
}
