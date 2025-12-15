/**
 * Video KYC API Service
 * Handles video KYC session management and verification
 */

import { apiRequest } from './client';

/**
 * Video KYC Types
 */
export enum VideoKYCStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export interface VideoKYCSession {
  session_id: string;
  user_id: string;
  kyc_application_id: string;
  status: VideoKYCStatus;
  scheduled_time?: string;
  started_at?: string;
  completed_at?: string;
  agent_id?: string;
  agent_name?: string;
  meeting_url?: string;
  recording_url?: string;
  verification_result?: {
    identity_verified: boolean;
    liveness_verified: boolean;
    document_verified: boolean;
    notes: string;
  };
}

export interface ScheduleVideoKYCRequest {
  kyc_application_id: string;
  preferred_date: string;
  preferred_time: string;
  timezone: string;
}

export interface VideoKYCAvailability {
  date: string;
  available_slots: string[];
}

/**
 * Video KYC Service
 */
export const videoKYCService = {
  /**
   * Get available time slots for video KYC
   */
  getAvailableSlots: async (
    startDate: string,
    endDate: string
  ): Promise<VideoKYCAvailability[]> => {
    return apiRequest({
      method: 'GET',
      url: '/video-kyc/availability',
      params: { start_date: startDate, end_date: endDate },
    });
  },

  /**
   * Schedule a video KYC session
   */
  scheduleSession: async (
    data: ScheduleVideoKYCRequest
  ): Promise<VideoKYCSession> => {
    return apiRequest({
      method: 'POST',
      url: '/video-kyc/schedule',
      data,
    });
  },

  /**
   * Get video KYC session by ID
   */
  getSession: async (sessionId: string): Promise<VideoKYCSession> => {
    return apiRequest({
      method: 'GET',
      url: `/video-kyc/sessions/${sessionId}`,
    });
  },

  /**
   * Get user's video KYC sessions
   */
  getUserSessions: async (): Promise<VideoKYCSession[]> => {
    return apiRequest({
      method: 'GET',
      url: '/video-kyc/sessions',
    });
  },

  /**
   * Start video KYC session
   */
  startSession: async (sessionId: string): Promise<{
    meeting_url: string;
    session_token: string;
  }> => {
    return apiRequest({
      method: 'POST',
      url: `/video-kyc/sessions/${sessionId}/start`,
    });
  },

  /**
   * Complete video KYC session
   */
  completeSession: async (
    sessionId: string,
    verificationData: {
      identity_verified: boolean;
      liveness_verified: boolean;
      document_verified: boolean;
      notes: string;
    }
  ): Promise<VideoKYCSession> => {
    return apiRequest({
      method: 'POST',
      url: `/video-kyc/sessions/${sessionId}/complete`,
      data: verificationData,
    });
  },

  /**
   * Cancel video KYC session
   */
  cancelSession: async (
    sessionId: string,
    reason: string
  ): Promise<{ message: string }> => {
    return apiRequest({
      method: 'POST',
      url: `/video-kyc/sessions/${sessionId}/cancel`,
      data: { reason },
    });
  },

  /**
   * Reschedule video KYC session
   */
  rescheduleSession: async (
    sessionId: string,
    newDate: string,
    newTime: string
  ): Promise<VideoKYCSession> => {
    return apiRequest({
      method: 'POST',
      url: `/video-kyc/sessions/${sessionId}/reschedule`,
      data: { new_date: newDate, new_time: newTime },
    });
  },

  /**
   * Get session recording
   */
  getRecording: async (sessionId: string): Promise<{
    recording_url: string;
    duration: number;
    size: number;
  }> => {
    return apiRequest({
      method: 'GET',
      url: `/video-kyc/sessions/${sessionId}/recording`,
    });
  },
};

export default videoKYCService;
