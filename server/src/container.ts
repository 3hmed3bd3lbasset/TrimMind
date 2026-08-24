// ============================================================================
// Composition Root - Dependency Injection Container (Clean Architecture)
// ============================================================================

// Gateways
import { BcryptPasswordHasher } from './adapters/gateways/BcryptPasswordHasher.js';
import { JwtTokenService } from './adapters/gateways/JwtTokenService.js';
import { BaileysWhatsAppGateway } from './adapters/gateways/BaileysWhatsAppGateway.js';
import { SocketRealtimeNotifier } from './adapters/gateways/SocketRealtimeNotifier.js';

// Repositories
import { MySQLBookingRepository } from './adapters/repositories/MySQLBookingRepository.js';
import { MySQLProfileRepository } from './adapters/repositories/MySQLProfileRepository.js';
import { MySQLChairRepository } from './adapters/repositories/MySQLChairRepository.js';
import { MySQLWaitlistRepository } from './adapters/repositories/MySQLWaitlistRepository.js';
import { MySQLRecallRepository } from './adapters/repositories/MySQLRecallRepository.js';
import { MySQLInsightsRepository } from './adapters/repositories/MySQLInsightsRepository.js';
import { MySQLWebhookEventRepository } from './adapters/repositories/MySQLWebhookEventRepository.js';
import { MySQLConversationSessionRepository } from './adapters/repositories/MySQLConversationSessionRepository.js';
import { MySQLPaymentProofRepository } from './adapters/repositories/MySQLPaymentProofRepository.js';

// Use Cases
import { CreateBookingUseCase } from './usecases/bookings/CreateBookingUseCase.js';
import { CancelBookingUseCase } from './usecases/bookings/CancelBookingUseCase.js';
import { ApplyCustomPricingUseCase } from './usecases/bookings/ApplyCustomPricingUseCase.js';
import { UpdateBookingDraftUseCase } from './usecases/bookings/UpdateBookingDraftUseCase.js';
import { SubmitPaymentProofUseCase } from './usecases/payments/SubmitPaymentProofUseCase.js';
import { AuthenticateStaffUseCase } from './usecases/auth/AuthenticateStaffUseCase.js';
import { ProcessNoShowsUseCase } from './usecases/noshow/ProcessNoShowsUseCase.js';
import { JoinWaitlistUseCase } from './usecases/waitlist/JoinWaitlistUseCase.js';
import { ClaimWaitlistOfferUseCase } from './usecases/waitlist/ClaimWaitlistOfferUseCase.js';
import { PromoteWaitlistEntryUseCase } from './usecases/waitlist/PromoteWaitlistEntryUseCase.js';
import { FindRecallCandidatesUseCase } from './usecases/recall/FindRecallCandidatesUseCase.js';
import { SendRecallCampaignUseCase } from './usecases/recall/SendRecallCampaignUseCase.js';
import { GenerateInsightsReportUseCase } from './usecases/insights/GenerateInsightsReportUseCase.js';
import { AskInsightsAssistantUseCase } from './usecases/insights/AskInsightsAssistantUseCase.js';

export class AppContainer {
  // Gateways
  public readonly passwordHasher = new BcryptPasswordHasher();
  public readonly tokenService = new JwtTokenService();
  public readonly notificationGateway = new BaileysWhatsAppGateway();
  public readonly realtimeNotifier = new SocketRealtimeNotifier();

  // Repositories
  public readonly bookingRepo = new MySQLBookingRepository();
  public readonly profileRepo = new MySQLProfileRepository();
  public readonly chairRepo = new MySQLChairRepository();
  public readonly waitlistRepo = new MySQLWaitlistRepository();
  public readonly recallRepo = new MySQLRecallRepository();
  public readonly insightsRepo = new MySQLInsightsRepository();
  public readonly webhookEventRepo = new MySQLWebhookEventRepository();
  public readonly conversationSessionRepo = new MySQLConversationSessionRepository();
  public readonly paymentProofRepo = new MySQLPaymentProofRepository();

  // Use Cases
  public readonly createBookingUseCase = new CreateBookingUseCase(
    this.bookingRepo,
    this.notificationGateway,
    this.realtimeNotifier
  );

  public readonly cancelBookingUseCase = new CancelBookingUseCase(
    this.bookingRepo,
    this.chairRepo,
    this.waitlistRepo,
    this.notificationGateway,
    this.realtimeNotifier
  );

  public readonly applyCustomPricingUseCase = new ApplyCustomPricingUseCase(
    this.bookingRepo,
    this.realtimeNotifier,
    this.notificationGateway
  );

  public readonly updateBookingDraftUseCase = new UpdateBookingDraftUseCase(
    this.bookingRepo,
    this.realtimeNotifier
  );

  public readonly submitPaymentProofUseCase = new SubmitPaymentProofUseCase(
    this.bookingRepo,
    this.paymentProofRepo,
    this.realtimeNotifier
  );

  public readonly authenticateStaffUseCase = new AuthenticateStaffUseCase(
    this.profileRepo,
    this.passwordHasher,
    this.tokenService
  );

  public readonly processNoShowsUseCase = new ProcessNoShowsUseCase(
    this.bookingRepo,
    this.chairRepo,
    this.waitlistRepo,
    this.notificationGateway,
    this.realtimeNotifier
  );

  public readonly joinWaitlistUseCase = new JoinWaitlistUseCase(
    this.waitlistRepo,
    this.realtimeNotifier
  );

  public readonly claimWaitlistOfferUseCase = new ClaimWaitlistOfferUseCase(
    this.waitlistRepo,
    this.bookingRepo,
    this.realtimeNotifier
  );

  public readonly promoteWaitlistEntryUseCase = new PromoteWaitlistEntryUseCase(
    this.waitlistRepo,
    this.notificationGateway,
    this.realtimeNotifier
  );

  public readonly findRecallCandidatesUseCase = new FindRecallCandidatesUseCase(
    this.recallRepo
  );

  public readonly sendRecallCampaignUseCase = new SendRecallCampaignUseCase(
    this.recallRepo,
    this.notificationGateway
  );

  public readonly generateInsightsReportUseCase = new GenerateInsightsReportUseCase(
    this.insightsRepo
  );

  public readonly askInsightsAssistantUseCase = new AskInsightsAssistantUseCase(
    this.insightsRepo
  );
}

export const container = new AppContainer();
