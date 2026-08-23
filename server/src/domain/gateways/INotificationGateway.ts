export interface INotificationGateway {
  sendWhatsApp(toPhone: string, message: string): Promise<boolean>;
}
