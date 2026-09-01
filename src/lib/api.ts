import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:5000/api');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true, // Automatically sends and receives HttpOnly Cookies
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Mutex & Queue for Automatic Silent Token Refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

// Response Interceptor with Automatic Silent Token Refresh & Uniform Error Extraction
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError<any>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Check if error is 401 and request hasn't been retried yet
    const status = error.response?.status;
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/me') ||
      originalRequest?.url?.includes('/auth/logout');

    if (status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Queue concurrent requests while refresh is in flight
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Trigger silent token refresh (HttpOnly cookie will be sent automatically)
        await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        processQueue(null);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr);
        // Clear session if refresh failed completely
        return Promise.reject(new Error('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً'));
      } finally {
        isRefreshing = false;
      }
    }

    const errorMsg =
      error.response?.data?.error ||
      error.response?.data?.message ||
      (status === 401 ? 'يرجى تسجيل الدخول' : 'تعذر الاتصال بالسيرفر، يرجى المحاولة لاحقاً');

    return Promise.reject(new Error(errorMsg));
  }
);

// API Service Endpoints
export const api = {
  // Auth & Staff
  login: (credentials: { identifier: string; password: string }) =>
    apiClient.post('/auth/login', credentials),
  forgotPassword: (data: { identifier: string }) =>
    apiClient.post('/auth/forgot-password', data),
  verifyOtp: (data: { identifier: string; otp: string }) =>
    apiClient.post('/auth/verify-otp', data),
  resetPassword: (data: { identifier: string; otp: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', data),
  getMe: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
  getProfiles: () => apiClient.get('/auth/profiles'),
  createStaff: (staffData: any) => apiClient.post('/auth/create-staff', staffData),
  updateProfile: (id: string, data: any) => apiClient.patch(`/auth/profiles/${id}`, data),
  deleteProfile: (id: string) => apiClient.delete(`/auth/profiles/${id}`),

  // Bookings
  createBooking: (bookingData: any) => apiClient.post('/bookings', bookingData),
  getBookings: (params?: { branchId?: string; date?: string }) =>
    apiClient.get('/bookings', { params }),
  getBookingById: (id: string) => apiClient.get(`/bookings/${id}`),
  trackBooking: (queryStr: string) => apiClient.get('/bookings/track', { params: { q: queryStr } }),
  cancelBooking: (id: string, reason?: string) =>
    apiClient.post(`/bookings/${id}/cancel`, { reason }),
  updateBookingStatus: (id: string, status: string, note?: string, booking?: any) =>
    apiClient.patch(`/bookings/${id}/status`, { status, note, booking }),
  rateBooking: (id: string, ratingData: any) => apiClient.post(`/bookings/${id}/rate`, ratingData),
  reviewPaymentProof: (id: string, status: string, reason?: string, booking?: any) =>
    apiClient.patch(`/bookings/${id}/payment-proof`, { status, reason, booking }),
  customizeAndDispatchBooking: (id: string, data: any) =>
    apiClient.post(`/bookings/${id}/customize-and-dispatch`, data),
  toggleHumanHandoff: (phone: string, enable: boolean) =>
    apiClient.post('/bookings/toggle-handoff', { phone, enable }),
  getWhatsAppAnalytics: () =>
    apiClient.get('/bookings/analytics/whatsapp'),

  // Queue
  getQueue: (branchId: string) => apiClient.get(`/queue/${branchId}`),
  callNextForBarber: (barberId: string) => apiClient.post('/queue/call-next', { barberId }),
  callEntryToChair: (bookingId: string, chairId?: string) =>
    apiClient.post('/queue/call-entry', { bookingId, chairId }),

  // Resources
  getBranches: () => apiClient.get('/branches'),
  createBranch: (data: any) => apiClient.post('/branches', data),
  updateBranch: (id: string, data: any) => apiClient.patch(`/branches/${id}`, data),
  deleteBranch: (id: string) => apiClient.delete(`/branches/${id}`),

  getBarbers: (branchId?: string) => apiClient.get('/barbers', { params: { branchId } }),
  createBarber: (data: any) => apiClient.post('/barbers', data),
  updateBarber: (id: string, data: any) => apiClient.patch(`/barbers/${id}`, data),
  deleteBarber: (id: string) => apiClient.delete(`/barbers/${id}`),

  getChairs: (branchId?: string) => apiClient.get('/chairs', { params: { branchId } }),
  createChair: (data: any) => apiClient.post('/chairs', data),
  updateChair: (id: string, data: any) => apiClient.patch(`/chairs/${id}`, data),
  deleteChair: (id: string) => apiClient.delete(`/chairs/${id}`),

  getServices: (branchId?: string) => apiClient.get('/services', { params: { branchId } }),
  createService: (data: any) => apiClient.post('/services', data),
  updateService: (id: string, data: any) => apiClient.patch(`/services/${id}`, data),
  deleteService: (id: string) => apiClient.delete(`/services/${id}`),

  getProducts: (branchId?: string) => apiClient.get('/products', { params: { branchId } }),
  createProduct: (data: any) => apiClient.post('/products', data),
  updateProduct: (id: string, data: any) => apiClient.patch(`/products/${id}`, data),
  deleteProduct: (id: string) => apiClient.delete(`/products/${id}`),

  getSettings: () => apiClient.get('/settings'),
  updateSettings: (settings: any) => apiClient.patch('/settings', settings),
  getAuditLogs: (action?: string) => apiClient.get('/audit-logs', { params: { action } }),

  // Smart Waitlist
  joinWaitlist: (data: any) => apiClient.post('/waitlist', data),
  getBranchWaitlist: (branchId: string, date?: string) =>
    apiClient.get(`/waitlist/branch/${branchId}`, { params: { date } }),
  promoteWaitlistEntry: (id: string) => apiClient.post(`/waitlist/${id}/promote`),
  getWaitlistClaim: (token: string) => apiClient.get(`/waitlist/claim/${token}`),
  claimWaitlistOffer: (token: string) => apiClient.post(`/waitlist/claim/${token}`),

  // AI Customer Recall
  getRecallCandidates: (branchId?: string, thresholdDays?: number) =>
    apiClient.get('/recall/candidates', { params: { branchId, thresholdDays } }),
  sendRecallCampaign: (data: any) => apiClient.post('/recall/send', data),
  getRecallCampaigns: (branchId?: string) =>
    apiClient.get('/recall/campaigns', { params: { branchId } }),

  // AI Business Insights
  getInsightsSummary: (branchId?: string, periodDays?: number) =>
    apiClient.get('/insights/summary', { params: { branchId, periodDays } }),
  askInsightsAssistant: (branchId: string, question: string) =>
    apiClient.post('/insights/ask', { branchId, question }),

  // Upload
  uploadProof: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // WhatsApp Session Management
  getWhatsAppStatus: () => apiClient.get('/whatsapp-session/status'),
  getWhatsAppQR: (force = false) => apiClient.post('/whatsapp-session/get-qr', { force }),
  pairWhatsAppPhone: (phone: string) => apiClient.post('/whatsapp-session/pair', { phone }),
  resetWhatsAppSession: () => apiClient.post('/whatsapp-session/reset'),
};
