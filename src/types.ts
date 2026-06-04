export enum LogType {
  CLOCK_IN = 'clock_in',
  CLOCK_OUT = 'clock_out',
  BREAK_START = 'break_start',
  BREAK_END = 'break_end'
}

export interface Employee {
  id: string;
  name: string;
  email?: string;
  pin: string;
  role: 'staff' | 'manager';
  title?: string;
  ptoBalance?: number;
}

export interface TimeLog {
  id?: string;
  employeeId: string;
  employeeName: string;
  type: LogType;
  timestamp: Date;
  photoUrl: string;
  note?: string;
}

export interface PTORequest {
  id?: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  hoursRequested: number;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  managerNote?: string;
}
