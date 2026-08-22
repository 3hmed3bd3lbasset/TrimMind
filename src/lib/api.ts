import axios from 'axios';

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:5000/api');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor: Attach JWT token from localStorage if present
apiClient.interceptors.request.use(
  (config) => {
    try {
      const storedToken = localStorage.getItem('salon_auth_token');
      if (storedToken && config.headers) {
        config.headers.Authorization = `Bearer ${storedToken}`;
      }
    } catch (e) {}
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Uniform error extractor
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorMsg =
      error.response?.data?.error ||
      error.response?.data?.message ||
      (error.response?.status === 401 ? 'يرجى تسجيل الدخول' : 'تعذر الاتصال بالسيرفر، يرجى المحاولة لاحقاً');

    return Promise.reject(new Error(errorMsg));
  }
);

// API Service Endpoints
export const api = {
  // Auth
  login: (credentials: { identifier: string; password: string }) =>
    apiClient.post('/auth/login', credentials),
  getMe: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
  createStaff: (staffData: any) => apiClient.post('/auth/create-staff', staffData),

  // Bookings
  createBooking: (bookingData: any) => apiClient.post('/bookings', bookingData),
  getBookings: (params?: { branchId?: string; date?: string }) =>
    apiClient.get('/bookings', { params }),
  getBookingById: (id: string) => apiClient.get(`/bookings/${id}`),
  trackBooking: (queryStr: string) => apiClient.get('/bookings/track', { params: { q: queryStr } }),
  cancelBooking: (id: string, reason?: string) =>
    apiClient.post(`/bookings/${id}/cancel`, { reason }),
  updateBookingStatus: (id: string, status: string, note?: string) =>
    apiClient.patch(`/bookings/${id}/status`, { status, note }),
  rateBooking: (id: string, ratingData: any) => apiClient.post(`/bookings/${id}/rate`, ratingData),
  reviewPaymentProof: (id: string, status: string, reason?: string) =>
    apiClient.patch(`/bookings/${id}/payment-proof`, { status, reason }),

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

  // Upload
  uploadProof: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
