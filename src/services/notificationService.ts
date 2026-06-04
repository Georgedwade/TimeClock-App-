import { Employee, PTORequest } from '../types';

class NotificationService {
  /**
   * Simulates sending an email by logging to the console and potentially showing a toast in the UI.
   * In a production app, this would call a backend API (like Resend, SendGrid, or Firebase Functions).
   */
  async sendEmail(to: string, subject: string, body: string) {
    console.log('--- SENT EMAIL ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);
    console.log('------------------');
  }

  async notifyManagersOfPTORequest(request: PTORequest, managers: Employee[]) {
    for (const manager of managers) {
      if (manager.email) {
        await this.sendEmail(
          manager.email,
          `New PTO Request: ${request.employeeName}`,
          `Employee ${request.employeeName} has requested PTO from ${request.startDate} to ${request.endDate} (${request.hoursRequested} hours).\n\nPlease log in to the ZRG Dashboard to approve or deny this request.`
        );
      }
    }
  }

  async notifyEmployeeOfPTOStatus(request: PTORequest, employee: Employee) {
    if (!employee.email) return;

    const status = request.status.toUpperCase();
    const subject = `PTO Request ${status}: ${request.startDate} to ${request.endDate}`;
    const body = `Hi ${employee.name},\n\nYour PTO request for ${request.hoursRequested} hours (from ${request.startDate} to ${request.endDate}) has been ${request.status}.\n\n${request.managerNote ? `Manager Note: ${request.managerNote}` : ''}\n\nThank you,\nZRG Management`;

    await this.sendEmail(employee.email, subject, body);
  }
}

export const notificationService = new NotificationService();
