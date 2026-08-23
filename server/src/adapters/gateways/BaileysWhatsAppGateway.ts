import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';
import { sendWhatsAppText } from '../../services/whatsapp.service.js';

export class BaileysWhatsAppGateway implements INotificationGateway {
  public async sendWhatsApp(toPhone: string, message: string): Promise<boolean> {
    try {
      await sendWhatsAppText(toPhone, message);
      return true;
    } catch (err: any) {
      console.warn(`[BaileysWhatsAppGateway] Failed to send message to ${toPhone}:`, err.message);
      return false;
    }
  }
}
