import axios from 'axios';
import type { Slot, User, BookingRecord, CreateSlotRequest, CreateUserRequest, CreateBookingRequest, UpdateSlotRequest, UpdateUserRequest } from './types';

const API_BASE_URL = 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Slots API
export const slotsApi = {
  getAll: async (): Promise<Slot[]> => {
    const response = await api.get<Slot[]>('/slots');
    return response.data;
  },

  create: async (slot: CreateSlotRequest): Promise<Slot> => {
    const response = await api.post<Slot>('/slots', slot);
    return response.data;
  },

  update: async (id: number, slot: UpdateSlotRequest): Promise<Slot> => {
    const response = await api.put<Slot>(`/slots/${id}`, slot);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/slots/${id}`);
  },
};

// Users API
export const usersApi = {
  getAll: async (): Promise<User[]> => {
    const response = await api.get<User[]>('/users');
    return response.data;
  },

  create: async (user: CreateUserRequest): Promise<User> => {
    const response = await api.post<User>('/users', user);
    return response.data;
  },

  update: async (id: number, user: UpdateUserRequest): Promise<User> => {
    const response = await api.put<User>(`/users/${id}`, user);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`);
  },
};

// Bookings API
export const bookingsApi = {
  getAll: async (): Promise<BookingRecord[]> => {
    const response = await api.get<BookingRecord[]>('/bookings');
    return response.data;
  },

  create: async (booking: CreateBookingRequest): Promise<BookingRecord> => {
    const response = await api.post<BookingRecord>('/bookings', booking);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/bookings/${id}`);
  },
};
