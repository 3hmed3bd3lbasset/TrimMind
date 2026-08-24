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
      const clientName = c.customer_name || 'عزيزنا العميل';
      const barberName = c.last_barber || 'محمد الحداد';
      const serviceName = c.last_service || 'قص شعر وتصفيف كلاسيكي';

      let msg = customMessageTemplate || `أهلاً يا [اسم العميل]! 💈✨\nوحشتنا في صالون TrimMind (الحداد VIP).. بقالك فترة ما شرفتناش من بعد آخر [الخدمة] مع كابتن [الكابتن]!\n\nجاهزين لك دائماً بأفضل تجربة عناية وحلاقة ملكية تليق بك 👑✂️\n\n👉 احجز موعدك القادم بضغطة واحدة من هنا:\nhttps://trimmind.up.railway.app\n\nنتشرف بزيارتك دائماً! ❤️`;

      msg = msg
        .replace(/\[اسم العميل\]/g, clientName)
        .replace(/\[العميل\]/g, clientName)
        .replace(/\{name\}/g, clientName)
        .replace(/\{customer_name\}/g, clientName)
        .replace(/\[الكابتن\]/g, barberName)
        .replace(/\[كابتن\]/g, barberName)
        .replace(/\[الحلاق\]/g, barberName)
        .replace(/\{barber\}/g, barberName)
        .replace(/\[الخدمة\]/g, serviceName)
        .replace(/\[خدمة\]/g, serviceName)
        .replace(/\[الباقة\]/g, serviceName)
        .replace(/\{service\}/g, serviceName);

      await this.recallRepo.recordSend(campaignId, c.customer_phone, clientName, msg);
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
