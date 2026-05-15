/*
 * Developed by Nerdshouse Technologies LLP — https://nerdshouse.com
 * © 2026 WhiteRock (Royal Enterprise). All rights reserved.
 *
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */
import axios from 'axios';

const API_URL = import.meta.env.VITE_11ZA_API_URL || 'https://app.11za.in/apis/template/sendTemplate';
const ORIGIN_WEBSITE = import.meta.env.VITE_11ZA_ORIGIN_WEBSITE || 'https://whiterock.co.in/';
const AUTH_TOKEN = import.meta.env.VITE_11ZA_AUTH_TOKEN;

export interface SendTaskAssignmentParams {
  phone: string;
  templateName?: string;
  taskName: string;
  dueDate: string;
  description: string;
  link: string;
  assignedBy: string;
}

export interface SendOverdueNotificationParams {
  phone: string;
  overdueCount: number;
  templateName?: string;
}

export interface SendVerificationRequestParams {
  phone: string;
  taskName: string;
  doerName: string;
  doerRemark: string;
}

class WhatsappService {
  /**
   * Helper to format phone numbers properly (ensures country code and strips special characters)
   */
  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10 && !digits.startsWith('0')) return '91' + digits;
    if (digits.startsWith('91') && digits.length === 12) return digits;
    return digits; // Fallback to raw digits if format is unknown
  }

  /**
   * Utility to sanitize the originWebsite (removes backticks or spaces)
   */
  private sanitizeOrigin(origin: string): string {
    return origin.replace(/[`"' ]/g, '').trim();
  }

  /**
   * Send a WhatsApp template message specifically for task assignments.
   */
  public async sendTaskAssignment(params: SendTaskAssignmentParams): Promise<void> {
    const { phone, templateName, taskName, dueDate, description, link, assignedBy } = params;
    const normalizedPhone = this.normalizePhone(phone);
    const sanitizedOrigin = this.sanitizeOrigin(ORIGIN_WEBSITE);

    if (!AUTH_TOKEN) {
      console.warn('[WhatsappService] VITE_11ZA_AUTH_TOKEN not set; skipping WhatsApp send');
      return;
    }

    const payload = {
      sendto: normalizedPhone,
      authToken: AUTH_TOKEN,
      originWebsite: sanitizedOrigin,
      language: "en",
      templateName: templateName || 'task_assignment',
      name: taskName,
      data: [
        taskName,
        dueDate,
        assignedBy,
        description,
        link
      ]
    };

    try {
      await axios.post(API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
        }
      });
    } catch (error: any) {
      // Catch and rethrow to allow the caller to handle it gracefully
      console.error('[WhatsappService] Error sending WhatsApp message:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send a WhatsApp notification about overdue tasks.
   */
  public async sendOverdueNotification(params: SendOverdueNotificationParams): Promise<void> {
    const { phone, overdueCount, templateName } = params;
    const normalizedPhone = this.normalizePhone(phone);
    const sanitizedOrigin = this.sanitizeOrigin(ORIGIN_WEBSITE);

    if (!AUTH_TOKEN) {
      console.warn('[WhatsappService] VITE_11ZA_AUTH_TOKEN not set; skipping WhatsApp send');
      return;
    }

    const payload = {
      sendto: normalizedPhone,
      authToken: AUTH_TOKEN,
      originWebsite: sanitizedOrigin,
      language: "en",
      templateName: templateName,
      data: [overdueCount.toString()]
    };

    try {
      await axios.post(API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
        }
      });
    } catch (error: any) {
      console.error('[WhatsappService] Error sending overdue notification:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Notify a verifier that a task is pending their verification.
   */
  public async sendVerificationRequest(params: SendVerificationRequestParams): Promise<void> {
    const { phone, taskName, doerName, doerRemark } = params;
    const normalizedPhone = this.normalizePhone(phone);
    const sanitizedOrigin = this.sanitizeOrigin(ORIGIN_WEBSITE);

    if (!AUTH_TOKEN) {
      console.warn('[WhatsappService] VITE_11ZA_AUTH_TOKEN not set; skipping WhatsApp send');
      return;
    }

    const payload = {
      sendto: normalizedPhone,
      authToken: AUTH_TOKEN,
      originWebsite: sanitizedOrigin,
      language: 'en',
      templateName: import.meta.env.VITE_11ZA_TEMPLATE_VERIFICATION_REQUEST || 'task_verification_request',
      name: doerName,
      data: [taskName, doerName, doerRemark],
    };

    try {
      await axios.post(API_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('[WhatsappService] Error sending verification request:', error?.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send a WhatsApp OTP verification message.
   */
  public async sendOtp(params: { phone: string; otp: string }): Promise<void> {
    const { phone, otp } = params;
    const normalizedPhone = this.normalizePhone(phone);
    const sanitizedOrigin = this.sanitizeOrigin(ORIGIN_WEBSITE);

    if (!AUTH_TOKEN) {
      console.warn('[WhatsappService] VITE_11ZA_AUTH_TOKEN not set; skipping OTP send');
      return;
    }

    const payload = {
      sendto: normalizedPhone,
      authToken: AUTH_TOKEN,
      originWebsite: sanitizedOrigin,
      language: "en",
      templateName: 'otp_verification',
      data: [otp],
    };

    try {
      await axios.post(API_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('[WhatsappService] Error sending OTP:', error?.response?.data || error.message);
      throw error;
    }
  }
}

export const whatsappService = new WhatsappService();
