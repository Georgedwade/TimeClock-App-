import { Employee, PTORequest } from '../types';

export interface EmailDispatchResult {
  success: boolean;
  recipient: string;
  subject: string;
  body: string;
  mailtoUrl: string;
}

class NotificationService {
  /**
   * Primary email dispatch handler.
   * Sends HTTP request if an email API key or webhook is available,
   * logs to console, and constructs a clean mailto URL for direct dispatch.
   */
  async sendEmail(to: string, subject: string, body: string): Promise<EmailDispatchResult> {
    console.log('✉️ DISPATCHING EMAIL:');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Attempt HTTP email dispatch via webhook/API if available in environment
    try {
      const webhookUrl = (import.meta as any).env?.VITE_EMAIL_WEBHOOK_URL;
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, body, app: 'ZRG Time Clock' })
        });
      }
    } catch (err) {
      console.warn('HTTP Email Webhook dispatch skipped or failed:', err);
    }

    return {
      success: true,
      recipient: to,
      subject,
      body,
      mailtoUrl
    };
  }

  /**
   * Notifies manager Dylan (dylan@zrgmedical.com) when a new PTO request is entered into the app.
   */
  async notifyManagersOfPTORequest(request: PTORequest, additionalManagers: Employee[] = []): Promise<EmailDispatchResult[]> {
    const results: EmailDispatchResult[] = [];
    const managerEmails = new Set<string>();

    // Always include Dylan
    managerEmails.add('dylan@zrgmedical.com');

    // Also include any other configured managers with emails
    additionalManagers.forEach(m => {
      if (m.role === 'manager' && m.email) {
        managerEmails.add(m.email.toLowerCase().trim());
      }
    });

    const subject = `New PTO Request Submitted: ${request.employeeName} (${request.hoursRequested} Hours)`;
    const body = `Hello Dylan,

A new Time Off (PTO) request has been submitted in the ZRG Medical Time Clock app:

• Employee Name: ${request.employeeName}
• Start Date: ${request.startDate}
• End Date: ${request.endDate}
• Total Hours: ${request.hoursRequested} Hours
• Employee Note: ${request.note ? `"${request.note}"` : 'None provided'}
• Status: Pending Approval

Please log in to the ZRG Admin Dashboard to approve or deny this request.

--
ZRG Medical Time Clock System`;

    for (const email of managerEmails) {
      const res = await this.sendEmail(email, subject, body);
      results.push(res);
    }

    return results;
  }

  /**
   * Notifies employee when their PTO request is approved or denied.
   */
  async notifyEmployeeOfPTOStatus(request: PTORequest, employee: Partial<Employee>): Promise<EmailDispatchResult> {
    const toEmail = employee.email || request.employeeEmail || 'dylan@zrgmedical.com';
    const statusUpper = (request.status || 'updated').toUpperCase();

    const subject = `ZRG Time Off Request ${statusUpper}: ${request.startDate} to ${request.endDate}`;
    const body = `Hello ${employee.name || request.employeeName},

Your Time Off (PTO) request has been ${statusUpper} by management:

• Dates: ${request.startDate} to ${request.endDate}
• Total Hours: ${request.hoursRequested} Hours
• Decision Note: ${request.managerNote ? `"${request.managerNote}"` : 'N/A'}
• Decision Date: ${new Date().toLocaleDateString()}

If you have any questions regarding this decision, please speak with your supervisor.

Best regards,
ZRG Medical Management`;

    return await this.sendEmail(toEmail, subject, body);
  }
}

export const notificationService = new NotificationService();

