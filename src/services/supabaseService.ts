import { LogType, Employee, TimeLog, PTORequest, HolidayRecord } from '../types';
import { isPTODatePassed } from '../utils/ptoUtils';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  setLogLevel,
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  getDocFromServer,
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  Timestamp 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Configure log level to suppress harmless internal transport retry warnings
try {
  setLogLevel('error');
} catch (e) {
  // ignore if already configured
}

// Initialize Firebase App safely with fallback
let app: any;
export let db: any = null;
export let auth: any = null;
let isFirebaseBlocked = false;

try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    // Initialize Firestore with long-polling transport to prevent RPC Listen stream disconnect errors in sandboxed iframes
    try {
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
      }, firebaseConfig.firestoreDatabaseId);
    } catch {
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
    auth = getAuth(app);
  } else {
    throw new Error("firebaseConfig properties are missing in configuration file.");
  }
} catch (e) {
  console.error("Firebase initialization failed. Directing to Safe Local Storage fallback mode.", e);
  isFirebaseBlocked = true;
}

// Validate connection to Firestore as specified in skill guidelines
async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client is currently offline. Safe local storage fallback active.");
    }
  }
}
testConnection();

// Memory Cache Fallback for sandboxed iframes or environments blocking cookies/localstorage
const memoryCache: Record<string, string> = {};

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      const item = localStorage.getItem(key);
      if (item !== null) return item;
    } catch (e) {
      console.warn(`localStorage READ blocked for key "${key}". Falling back to in-memory state.`, e);
    }
    return memoryCache[key] || null;
  },
  setItem: (key: string, value: string): void => {
    memoryCache[key] = value;
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`localStorage WRITE blocked or quota exceeded for key "${key}". Preserved in memory cache.`, e);
    }
  }
};

// Pub/Sub listeners for reactive offline support
type SubCallback = (data: any) => void;
const listeners: { [table: string]: Set<SubCallback> } = {
  employees: new Set(),
  logs: new Set(),
  pto_requests: new Set(),
  settings: new Set(),
  holiday_records: new Set(),
};

// Shared active stream registry to prevent redundant listeners from opening multiple RPC streams
const activeFirestoreUnsubs: { [table: string]: (() => void) | null } = {
  employees: null,
  logs: null,
  pto_requests: null,
  settings: null,
  holiday_records: null,
};

function triggerListeners(table: string, data: any) {
  listeners[table]?.forEach(cb => {
    try {
      cb(data);
    } catch (e) {
      console.error(`Error in local offline ${table} listener callback:`, e);
    }
  });
}

// Robust Safe Deserializers
function parseEmployees(raw: any): Employee[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(e => ({
    id: e.id || String(e.email || Date.now()),
    name: e.name || '',
    email: e.email || '',
    pin: e.pin || '',
    role: (e.role === 'manager' ? 'manager' : 'staff') as 'staff' | 'manager',
    title: e.title || '',
    ptoBalance: e.ptoBalance !== undefined ? Number(e.ptoBalance) : (e.pto_balance !== undefined ? Number(e.pto_balance) : 0),
  }));
}

function parseLogs(raw: any): TimeLog[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(l => {
    let dateObj = new Date();
    if (l.timestamp) {
      if (l.timestamp.seconds !== undefined) {
        dateObj = new Date(l.timestamp.seconds * 1000);
      } else if (typeof l.timestamp.toDate === 'function') {
        dateObj = l.timestamp.toDate();
      } else {
        dateObj = new Date(l.timestamp);
      }
    }
    return {
      id: l.id,
      employeeId: l.employeeId || '',
      employeeName: l.employeeName || '',
      type: l.type as LogType,
      timestamp: dateObj,
      photoUrl: l.photoUrl || '',
      note: l.note || '',
      isHoliday: !!l.isHoliday,
      holidayName: l.holidayName || '',
    };
  }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function parseHolidayRecords(raw: any): HolidayRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(h => ({
    id: h.id,
    employeeId: h.employeeId || '',
    employeeName: h.employeeName || '',
    date: h.date || '',
    holidayName: h.holidayName || 'Holiday',
    hours: Number(h.hours || 0),
    note: h.note || '',
    createdAt: h.createdAt || (h.created_at ? (typeof h.created_at === 'object' && h.created_at.seconds ? new Date(h.created_at.seconds * 1000).toISOString() : String(h.created_at)) : undefined)
  })).sort((a, b) => b.date.localeCompare(a.date));
}

function parsePTORequests(raw: any): PTORequest[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(p => ({
    id: p.id,
    employeeId: p.employeeId || '',
    employeeName: p.employeeName || '',
    employeeEmail: p.employeeEmail || '',
    startDate: p.startDate || '',
    endDate: p.endDate || '',
    hoursRequested: Number(p.hoursRequested || 0),
    status: (p.status || 'pending') as 'pending' | 'approved' | 'rejected',
    note: p.note || '',
    managerNote: p.managerNote || '',
    createdAt: p.createdAt || undefined,
    isDeducted: p.isDeducted !== undefined ? Boolean(p.isDeducted) : undefined,
    deductedAt: p.deductedAt || undefined,
  }));
}

// Error handling specification matching standard requirements
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMess = error instanceof Error ? error.message : String(error);
  if (errMess.toLowerCase().includes('quota exceeded') || errMess.toLowerCase().includes('offline')) {
    isFirebaseBlocked = true;
  }
  const errInfo: FirestoreErrorInfo = {
    error: errMess,
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Code:', JSON.stringify(errInfo));
  return errInfo;
}

// Unified Data Service Object implementing smooth hybrid syncing
export const supabaseService = {
  
  // Seed initial values in Firebase (and seed offline localStorage as well if Firebase is down)
  seedDataIfEmpty: async () => {
    const initialEmployees = [
      { name: 'Alma Carreno', email: 'alma.carreno@zrg.com', pin: '093695', role: 'staff', title: 'eCommerce Representative', ptoBalance: 105.12 },
      { name: 'Doug Schneider', email: 'doug.schneider@zrg.com', pin: '949620', role: 'staff', title: 'Biomedical Equipment Technician', ptoBalance: 27.90 },
      { name: 'George Wade', email: 'George.Dylan.Wade@gmail.com', pin: '587475', role: 'manager', title: 'General Manager', ptoBalance: 24.28 },
      { name: 'Jennifer Milam', email: 'jennifer.milam@zrg.com', pin: '114082', role: 'staff', title: 'Logistics Coordinator', ptoBalance: 75.03 },
      { name: 'Jesus Yanez', email: 'jesus.yanez@zrg.com', pin: '037325', role: 'staff', title: 'Warehouse', ptoBalance: 32.13 },
      { name: 'Jorge Lopez', email: 'jorge.lopez@zrg.com', pin: '588384', role: 'staff', title: 'Warehouse', ptoBalance: 28.48 },
      { name: 'Kyle Johnson', email: 'kyle.johnson@zrg.com', pin: '764763', role: 'staff', title: 'CBET Inventory Specialist', ptoBalance: 76.69 },
      { name: 'Selena Macias', email: 'selena.macias@zrg.com', pin: '022663', role: 'staff', title: 'Biomedical Equipment Technician', ptoBalance: 26.63 },
    ];

    // Seed browser local cache first if empty, so the app always boots instantly even without internet/quota
    const rawLocalEmps = safeLocalStorage.getItem('zrg_employees');
    if (!rawLocalEmps) {
      const seededLocal = initialEmployees.map((emp, idx) => ({ id: `seed_${idx + 1}`, ...emp }));
      safeLocalStorage.setItem('zrg_employees', JSON.stringify(seededLocal));
    }

    if (isFirebaseBlocked || !db) {
      return;
    }

    try {
      const q = query(collection(db, 'employees'), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        return; // already seeded in cloud
      }

      for (const emp of initialEmployees) {
        await addDoc(collection(db, 'employees'), {
          name: emp.name,
          email: emp.email || '',
          pin: emp.pin,
          role: emp.role || 'staff',
          title: emp.title || '',
          ptoBalance: Number(emp.ptoBalance) || 0
        });
      }

      // Seed configuration settings
      const settingsRef = doc(db, 'settings', 'config');
      await setDoc(settingsRef, { requirePhotoVerification: true });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'seed');
    }
  },

  // Employees Functions
  getEmployees: async (): Promise<Employee[]> => {
    if (!isFirebaseBlocked && db) {
      try {
        const q = query(collection(db, 'employees'));
        const querySnapshot = await getDocs(q);
        const emps = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || '',
            email: data.email || '',
            pin: data.pin || '',
            role: data.role || 'staff',
            title: data.title || '',
            ptoBalance: data.ptoBalance !== undefined ? Number(data.ptoBalance || 0) : Number(data.pto_balance || 0),
          } as Employee;
        });

        // Mirror in localStorage
        safeLocalStorage.setItem('zrg_employees', JSON.stringify(emps));
        return emps;
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'employees');
      }
    }

    // Fallback to local
    const raw = safeLocalStorage.getItem('zrg_employees');
    return raw ? parseEmployees(JSON.parse(raw)) : [];
  },

  addEmployee: async (employee: Omit<Employee, 'id'>) => {
    const payload = {
      name: (employee.name || '').trim(),
      email: (employee.email || '').trim(),
      pin: (employee.pin || '').trim(),
      role: (employee.role === 'manager' ? 'manager' : 'staff') as 'staff' | 'manager',
      title: (employee.title || '').trim(),
      ptoBalance: Number(employee.ptoBalance) || 0,
    };

    if (!isFirebaseBlocked && db) {
      try {
        const docRef = await addDoc(collection(db, 'employees'), payload);
        const newEmp: Employee = { id: docRef.id, ...payload };
        
        // Update local memory & storage immediately
        const raw = safeLocalStorage.getItem('zrg_employees');
        const emps = raw ? parseEmployees(JSON.parse(raw)) : [];
        const existingIdx = emps.findIndex(e => e.id === docRef.id || e.pin === payload.pin);
        if (existingIdx >= 0) {
          emps[existingIdx] = newEmp;
        } else {
          emps.push(newEmp);
        }
        safeLocalStorage.setItem('zrg_employees', JSON.stringify(emps));
        triggerListeners('employees', emps);
        return newEmp;
      } catch (e) {
        console.error('Failed to create employee in Firestore:', e);
        handleFirestoreError(e, OperationType.CREATE, 'employees');
        throw e;
      }
    }

    // Local Fallback (only when offline or Firebase blocked)
    const raw = safeLocalStorage.getItem('zrg_employees');
    const emps = raw ? parseEmployees(JSON.parse(raw)) : [];
    const newEmp: Employee = { id: `local_${Date.now()}`, ...payload };
    emps.push(newEmp);
    safeLocalStorage.setItem('zrg_employees', JSON.stringify(emps));
    triggerListeners('employees', emps);
    return newEmp;
  },

  updateEmployee: async (employeeId: string, data: Partial<Employee>) => {
    const payload: any = {};
    if (data.name !== undefined) payload.name = (data.name || '').trim();
    if (data.email !== undefined) payload.email = (data.email || '').trim();
    if (data.pin !== undefined) payload.pin = (data.pin || '').trim();
    if (data.role !== undefined) payload.role = data.role === 'manager' ? 'manager' : 'staff';
    if (data.title !== undefined) payload.title = (data.title || '').trim();
    if (data.ptoBalance !== undefined) payload.ptoBalance = Number(data.ptoBalance) || 0;

    if (!isFirebaseBlocked && db && !employeeId.startsWith('local_') && !employeeId.startsWith('seed_')) {
      try {
        const docRef = doc(db, 'employees', employeeId);
        await updateDoc(docRef, payload);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `employees/${employeeId}`);
        throw e;
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_employees');
    let emps = raw ? parseEmployees(JSON.parse(raw)) : [];
    emps = emps.map(emp => emp.id === employeeId ? { ...emp, ...payload } : emp);
    safeLocalStorage.setItem('zrg_employees', JSON.stringify(emps));
    triggerListeners('employees', emps);
  },

  updateEmployeeRole: async (employeeId: string, role: 'staff' | 'manager') => {
    return supabaseService.updateEmployee(employeeId, { role });
  },

  updateEmployeePTO: async (employeeId: string, hours: number) => {
    if (!isFirebaseBlocked && db && !employeeId.startsWith('local_') && !employeeId.startsWith('seed_')) {
      try {
        const docRef = doc(db, 'employees', employeeId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const currentBalance = Number(docSnap.data().ptoBalance || 0);
          await updateDoc(docRef, {
            ptoBalance: Number((currentBalance + hours).toFixed(2))
          });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `employees/${employeeId}`);
        throw e;
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_employees');
    let emps = raw ? parseEmployees(JSON.parse(raw)) : [];
    emps = emps.map(emp => {
      if (emp.id === employeeId) {
        const balance = Number(emp.ptoBalance || 0);
        return { ...emp, ptoBalance: Number((balance + hours).toFixed(2)) };
      }
      return emp;
    });
    safeLocalStorage.setItem('zrg_employees', JSON.stringify(emps));
    triggerListeners('employees', emps);
  },

  deleteEmployee: async (employeeId: string) => {
    if (!isFirebaseBlocked && db && !employeeId.startsWith('local_') && !employeeId.startsWith('seed_')) {
      try {
        await deleteDoc(doc(db, 'employees', employeeId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `employees/${employeeId}`);
        throw e;
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_employees');
    let emps = raw ? parseEmployees(JSON.parse(raw)) : [];
    emps = emps.filter(emp => emp.id !== employeeId);
    safeLocalStorage.setItem('zrg_employees', JSON.stringify(emps));
    triggerListeners('employees', emps);
  },

  subscribeToEmployees: (callback: (employees: Employee[]) => void) => {
    listeners.employees.add(callback);

    // Provide initial render from cache immediately for rapid loading
    const raw = safeLocalStorage.getItem('zrg_employees');
    if (raw) {
      try {
        callback(parseEmployees(JSON.parse(raw)));
      } catch (e) {
        console.error('Error parsing cached employees:', e);
      }
    }

    if (!activeFirestoreUnsubs.employees && !isFirebaseBlocked && db) {
      try {
        activeFirestoreUnsubs.employees = onSnapshot(collection(db, 'employees'), (snapshot) => {
          isFirebaseBlocked = false;
          const emps = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || '',
              email: data.email || '',
              pin: data.pin || '',
              role: data.role || 'staff',
              title: data.title || '',
              ptoBalance: data.ptoBalance !== undefined ? Number(data.ptoBalance || 0) : Number(data.pto_balance || 0),
            } as Employee;
          });
          safeLocalStorage.setItem('zrg_employees', JSON.stringify(emps));
          triggerListeners('employees', emps);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'employees');
          // Silently return existing cache
          const localStr = safeLocalStorage.getItem('zrg_employees');
          if (localStr) triggerListeners('employees', parseEmployees(JSON.parse(localStr)));
        });
      } catch (e) {
        console.warn('Subscription setup failed:', e);
      }
    }

    return () => {
      listeners.employees.delete(callback);
      if (listeners.employees.size === 0 && activeFirestoreUnsubs.employees) {
        activeFirestoreUnsubs.employees();
        activeFirestoreUnsubs.employees = null;
      }
    };
  },

  // Time Logs / Shift Record Functions
  addLog: async (log: Omit<TimeLog, 'id'>) => {
    const payload = {
      employeeId: (log.employeeId || '').trim(),
      employeeName: (log.employeeName || '').trim(),
      type: log.type,
      timestamp: Timestamp.fromDate(log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp)),
      photoUrl: log.photoUrl || '',
      note: log.note || '',
      ...(log.isHoliday !== undefined ? { isHoliday: log.isHoliday } : {}),
      ...(log.holidayName ? { holidayName: log.holidayName } : {}),
    };

    if (!isFirebaseBlocked && db && !log.employeeId.startsWith('local_') && !log.employeeId.startsWith('seed_')) {
      try {
        const docRef = await addDoc(collection(db, 'logs'), payload);
        const newLog = { id: docRef.id, ...log };
        
        const logs = await supabaseService.getLogs();
        const existingIdx = logs.findIndex(l => l.id === docRef.id);
        if (existingIdx >= 0) {
          logs[existingIdx] = newLog;
        } else {
          logs.unshift(newLog);
        }
        safeLocalStorage.setItem('zrg_logs', JSON.stringify(logs));
        triggerListeners('logs', logs);
        return newLog;
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'logs');
        throw e;
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_logs');
    const logs = raw ? parseLogs(JSON.parse(raw)) : [];
    const newLog = { id: `local_${Date.now()}`, ...log };
    logs.unshift(newLog);
    safeLocalStorage.setItem('zrg_logs', JSON.stringify(logs));
    triggerListeners('logs', logs);
    return newLog;
  },

  getLogs: async (startDate?: Date, endDate?: Date): Promise<TimeLog[]> => {
    if (!isFirebaseBlocked && db) {
      try {
        let q;
        if (startDate && endDate) {
          q = query(
            collection(db, 'logs'),
            where('timestamp', '>=', Timestamp.fromDate(startDate)),
            where('timestamp', '<=', Timestamp.fromDate(endDate)),
            orderBy('timestamp', 'desc')
          );
        } else {
          q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
        }
        const querySnapshot = await getDocs(q);
        const logs = querySnapshot.docs.map(doc => {
          const data = doc.data() as Record<string, any>;
          let dateObj = new Date();
          if (data.timestamp) {
            if (typeof data.timestamp.toDate === 'function') {
              dateObj = data.timestamp.toDate();
            } else {
              dateObj = new Date(data.timestamp);
            }
          }
          return {
            id: doc.id,
            employeeId: data.employeeId || '',
            employeeName: data.employeeName || '',
            type: data.type as LogType,
            timestamp: dateObj,
            photoUrl: data.photoUrl || '',
            note: data.note || '',
            isHoliday: !!data.isHoliday,
            holidayName: data.holidayName || '',
          };
        });
        
        logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        try {
          const light = logs.map(l => (l.photoUrl && l.photoUrl.length > 500 ? { ...l, photoUrl: '' } : l));
          safeLocalStorage.setItem('zrg_logs', JSON.stringify(light));
        } catch (e) {
          console.warn('Could not cache logs to storage:', e);
        }
        
        if (startDate && endDate) {
          return logs.filter(log => log.timestamp >= startDate && log.timestamp <= endDate);
        }
        return logs;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'logs');
      }
    }

    // Fallback to local
    const raw = safeLocalStorage.getItem('zrg_logs');
    let logs = raw ? parseLogs(JSON.parse(raw)) : [];
    if (startDate && endDate) {
      logs = logs.filter(log => log.timestamp >= startDate && log.timestamp <= endDate);
    }
    return logs;
  },

  updateLog: async (logId: string, data: Partial<TimeLog>) => {
    if (!isFirebaseBlocked && !logId.startsWith('local_')) {
      try {
        const docRef = doc(db, 'logs', logId);
        const payload: any = {};
        if (data.employeeId !== undefined) payload.employeeId = data.employeeId;
        if (data.employeeName !== undefined) payload.employeeName = data.employeeName;
        if (data.type !== undefined) payload.type = data.type;
        if (data.photoUrl !== undefined) payload.photoUrl = data.photoUrl;
        if (data.note !== undefined) payload.note = data.note;
        if (data.isHoliday !== undefined) payload.isHoliday = data.isHoliday;
        if (data.holidayName !== undefined) payload.holidayName = data.holidayName;
        if (data.timestamp !== undefined) {
          payload.timestamp = Timestamp.fromDate(data.timestamp);
        }
        await updateDoc(docRef, payload);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `logs/${logId}`);
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_logs');
    let logs = raw ? parseLogs(JSON.parse(raw)) : [];
    logs = logs.map(l => l.id === logId ? { ...l, ...data } : l);
    safeLocalStorage.setItem('zrg_logs', JSON.stringify(logs));
    triggerListeners('logs', logs);
  },

  updateLogNote: async (logId: string, note: string) => {
    return supabaseService.updateLog(logId, { note });
  },

  deleteLog: async (logId: string) => {
    if (!isFirebaseBlocked && !logId.startsWith('local_')) {
      try {
        await deleteDoc(doc(db, 'logs', logId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `logs/${logId}`);
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_logs');
    let logs = raw ? parseLogs(JSON.parse(raw)) : [];
    logs = logs.filter(l => l.id !== logId);
    safeLocalStorage.setItem('zrg_logs', JSON.stringify(logs));
    triggerListeners('logs', logs);
  },

  subscribeToLogs: (callback: (logs: TimeLog[]) => void) => {
    listeners.logs.add(callback);

    const raw = safeLocalStorage.getItem('zrg_logs');
    if (raw) {
      try {
        callback(parseLogs(JSON.parse(raw)));
      } catch (e) {
        console.error('Error parsing cached logs:', e);
      }
    }

    if (!activeFirestoreUnsubs.logs && !isFirebaseBlocked && db) {
      try {
        activeFirestoreUnsubs.logs = onSnapshot(query(collection(db, 'logs'), orderBy('timestamp', 'desc')), (snapshot) => {
          isFirebaseBlocked = false;
          const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            let dateObj = new Date();
            if (data.timestamp) {
              if (typeof data.timestamp.toDate === 'function') {
                dateObj = data.timestamp.toDate();
              } else {
                dateObj = new Date(data.timestamp);
              }
            }
            return {
              id: doc.id,
              employeeId: data.employeeId || '',
              employeeName: data.employeeName || '',
              type: data.type as LogType,
              timestamp: dateObj,
              photoUrl: data.photoUrl || '',
              note: data.note || '',
              isHoliday: !!data.isHoliday,
              holidayName: data.holidayName || '',
            };
          }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          
          try {
            const light = logs.map(l => (l.photoUrl && l.photoUrl.length > 500 ? { ...l, photoUrl: '' } : l));
            safeLocalStorage.setItem('zrg_logs', JSON.stringify(light));
          } catch (e) {
            console.warn('Could not cache logs to storage:', e);
          }
          triggerListeners('logs', logs);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'logs');
          const localStr = safeLocalStorage.getItem('zrg_logs');
          if (localStr) triggerListeners('logs', parseLogs(JSON.parse(localStr)));
        });
      } catch (e) {
        console.warn('Logs subscription setup error:', e);
      }
    }

    return () => {
      listeners.logs.delete(callback);
      if (listeners.logs.size === 0 && activeFirestoreUnsubs.logs) {
        activeFirestoreUnsubs.logs();
        activeFirestoreUnsubs.logs = null;
      }
    };
  },

  // PTO Requests Functions
  getPTORequests: async (): Promise<PTORequest[]> => {
    if (!isFirebaseBlocked) {
      try {
        const q = query(collection(db, 'pto_requests'));
        const querySnapshot = await getDocs(q);
        const requests = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            employeeId: data.employeeId || '',
            employeeName: data.employeeName || '',
            employeeEmail: data.employeeEmail || '',
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            hoursRequested: Number(data.hoursRequested || 0),
            status: data.status || 'pending',
            note: data.note || '',
            managerNote: data.managerNote || '',
            createdAt: data.createdAt || undefined,
            isDeducted: data.isDeducted !== undefined ? Boolean(data.isDeducted) : undefined,
            deductedAt: data.deductedAt || undefined,
          } as PTORequest;
        });

        safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(requests));
        return requests;
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'pto_requests');
      }
    }

    const raw = safeLocalStorage.getItem('zrg_pto_requests');
    return raw ? parsePTORequests(JSON.parse(raw)) : [];
  },

  addPTORequest: async (request: Omit<PTORequest, 'id'>) => {
    const payload: any = {
      employeeId: (request.employeeId || '').trim(),
      employeeName: (request.employeeName || '').trim(),
      employeeEmail: (request.employeeEmail || '').trim(),
      startDate: (request.startDate || '').trim(),
      endDate: (request.endDate || '').trim(),
      hoursRequested: Number(request.hoursRequested || 0),
      status: (request.status || 'pending') as 'pending' | 'approved' | 'rejected',
      note: request.note || '',
      managerNote: request.managerNote || '',
      createdAt: request.createdAt || new Date().toISOString(),
      isDeducted: request.isDeducted !== undefined ? Boolean(request.isDeducted) : false,
    };
    if (request.deductedAt) {
      payload.deductedAt = request.deductedAt;
    }

    if (!isFirebaseBlocked && db && !request.employeeId.startsWith('local_') && !request.employeeId.startsWith('seed_')) {
      try {
        const docRef = await addDoc(collection(db, 'pto_requests'), payload);
        const newReq = { id: docRef.id, ...payload } as PTORequest;
        
        const reqs = await supabaseService.getPTORequests();
        const existingIdx = reqs.findIndex(r => r.id === docRef.id);
        if (existingIdx >= 0) {
          reqs[existingIdx] = newReq;
        } else {
          reqs.push(newReq);
        }
        safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(reqs));
        triggerListeners('pto_requests', reqs);
        return newReq;
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'pto_requests');
        throw e;
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_pto_requests');
    const reqs = raw ? parsePTORequests(JSON.parse(raw)) : [];
    const newReq = { id: `local_${Date.now()}`, ...payload } as PTORequest;
    reqs.push(newReq);
    safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(reqs));
    triggerListeners('pto_requests', reqs);
    return newReq;
  },

  updatePTORequestStatus: async (
    requestId: string, 
    status: 'approved' | 'rejected', 
    managerNote?: string,
    isDeducted?: boolean,
    deductedAt?: string
  ) => {
    const updatePayload: Record<string, any> = {
      status,
      managerNote: managerNote || '',
      updatedAt: Timestamp.now()
    };
    if (isDeducted !== undefined) {
      updatePayload.isDeducted = isDeducted;
    }
    if (deductedAt !== undefined) {
      updatePayload.deductedAt = deductedAt;
    }

    if (!isFirebaseBlocked && !requestId.startsWith('local_')) {
      try {
        const docRef = doc(db, 'pto_requests', requestId);
        await updateDoc(docRef, updatePayload);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `pto_requests/${requestId}`);
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_pto_requests');
    let reqs = raw ? parsePTORequests(JSON.parse(raw)) : [];
    reqs = reqs.map(req => req.id === requestId ? { 
      ...req, 
      status, 
      managerNote: managerNote || '',
      ...(isDeducted !== undefined ? { isDeducted } : {}),
      ...(deductedAt !== undefined ? { deductedAt } : {})
    } : req);
    safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(reqs));
    triggerListeners('pto_requests', reqs);
  },

  updatePTORequest: async (requestId: string, updates: Partial<PTORequest>) => {
    const updatePayload: Record<string, any> = {
      ...updates,
      updatedAt: Timestamp.now()
    };

    if (!isFirebaseBlocked && !requestId.startsWith('local_')) {
      try {
        const docRef = doc(db, 'pto_requests', requestId);
        await updateDoc(docRef, updatePayload);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `pto_requests/${requestId}`);
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_pto_requests');
    let reqs = raw ? parsePTORequests(JSON.parse(raw)) : [];
    reqs = reqs.map(req => req.id === requestId ? { ...req, ...updates } : req);
    safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(reqs));
    triggerListeners('pto_requests', reqs);
  },

  /**
   * Automatically checks for approved PTO requests whose date has passed (strictly after
   * the date the PTO was taken) and executes the deduction from employee.ptoBalance.
   */
  processDuePTODeductions: async (): Promise<number> => {
    try {
      const ptoRequests = await supabaseService.getPTORequests();
      // Find approved requests where the PTO date has now passed and hours have not been deducted yet
      const dueRequests = ptoRequests.filter(req => {
        if (req.status !== 'approved') return false;
        if (req.isDeducted === true) return false;
        // If isDeducted was not explicitly set, legacy requests from before today were already deducted historically
        if (req.isDeducted === undefined) {
          return false;
        }
        // Check if strictly after the date the PTO was taken
        return isPTODatePassed(req.endDate, req.startDate);
      });

      if (dueRequests.length === 0) return 0;

      for (const req of dueRequests) {
        // 1. Deduct requested hours from employee PTO balance
        await supabaseService.updateEmployeePTO(req.employeeId, -req.hoursRequested);
        // 2. Mark request as deducted
        await supabaseService.updatePTORequestStatus(
          req.id!,
          'approved',
          req.managerNote,
          true,
          new Date().toISOString()
        );
      }
      return dueRequests.length;
    } catch (err) {
      console.error('Error processing due PTO deductions:', err);
      return 0;
    }
  },

  deletePTORequest: async (requestId: string) => {
    if (!isFirebaseBlocked && !requestId.startsWith('local_')) {
      try {
        await deleteDoc(doc(db, 'pto_requests', requestId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `pto_requests/${requestId}`);
      }
    }

    // Local Fallback
    const raw = safeLocalStorage.getItem('zrg_pto_requests');
    let reqs = raw ? parsePTORequests(JSON.parse(raw)) : [];
    reqs = reqs.filter(req => req.id !== requestId);
    safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(reqs));
    triggerListeners('pto_requests', reqs);
  },

  subscribeToPTORequests: (callback: (requests: PTORequest[]) => void) => {
    listeners.pto_requests.add(callback);

    const raw = safeLocalStorage.getItem('zrg_pto_requests');
    if (raw) {
      try {
        callback(parsePTORequests(JSON.parse(raw)));
      } catch (e) {
        console.error('Error parsing cached pto requests:', e);
      }
    }

    if (!activeFirestoreUnsubs.pto_requests && !isFirebaseBlocked && db) {
      try {
        activeFirestoreUnsubs.pto_requests = onSnapshot(collection(db, 'pto_requests'), (snapshot) => {
          isFirebaseBlocked = false;
          const reqs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              employeeId: data.employeeId || '',
              employeeName: data.employeeName || '',
              startDate: data.startDate || '',
              endDate: data.endDate || '',
              hoursRequested: Number(data.hoursRequested || 0),
              status: data.status || 'pending',
              note: data.note || '',
              managerNote: data.managerNote || '',
            } as PTORequest;
          });
          safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(reqs));
          triggerListeners('pto_requests', reqs);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'pto_requests');
          const localStr = safeLocalStorage.getItem('zrg_pto_requests');
          if (localStr) triggerListeners('pto_requests', parsePTORequests(JSON.parse(localStr)));
        });
      } catch (e) {
        console.warn('PTO sub setup failed:', e);
      }
    }

    return () => {
      listeners.pto_requests.delete(callback);
      if (listeners.pto_requests.size === 0 && activeFirestoreUnsubs.pto_requests) {
        activeFirestoreUnsubs.pto_requests();
        activeFirestoreUnsubs.pto_requests = null;
      }
    };
  },

  // Holiday Records Functions
  getHolidayRecords: async (): Promise<HolidayRecord[]> => {
    if (!isFirebaseBlocked && db) {
      try {
        const q = query(collection(db, 'holiday_records'), orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);
        const records = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            employeeId: data.employeeId || '',
            employeeName: data.employeeName || '',
            date: data.date || '',
            holidayName: data.holidayName || 'Holiday',
            hours: Number(data.hours || 0),
            note: data.note || '',
            createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : String(data.createdAt)) : undefined
          } as HolidayRecord;
        });

        safeLocalStorage.setItem('zrg_holiday_records', JSON.stringify(records));
        return records;
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'holiday_records');
      }
    }

    const raw = safeLocalStorage.getItem('zrg_holiday_records');
    return raw ? parseHolidayRecords(JSON.parse(raw)) : [];
  },

  addHolidayRecord: async (record: Omit<HolidayRecord, 'id'>): Promise<HolidayRecord> => {
    const payload = {
      employeeId: (record.employeeId || '').trim(),
      employeeName: (record.employeeName || '').trim(),
      date: (record.date || '').trim(),
      holidayName: (record.holidayName || 'Holiday').trim(),
      hours: Number(record.hours || 0),
      note: record.note || '',
      createdAt: Timestamp.now()
    };

    if (!isFirebaseBlocked && db && !record.employeeId.startsWith('local_')) {
      try {
        const docRef = await addDoc(collection(db, 'holiday_records'), payload);
        const newRecord: HolidayRecord = {
          id: docRef.id,
          employeeId: payload.employeeId,
          employeeName: payload.employeeName,
          date: payload.date,
          holidayName: payload.holidayName,
          hours: payload.hours,
          note: payload.note,
          createdAt: new Date().toISOString()
        };

        const existing = await supabaseService.getHolidayRecords();
        const updated = [newRecord, ...existing.filter(r => r.id !== docRef.id)];
        safeLocalStorage.setItem('zrg_holiday_records', JSON.stringify(updated));
        triggerListeners('holiday_records', updated);
        return newRecord;
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'holiday_records');
      }
    }

    // Local fallback
    const raw = safeLocalStorage.getItem('zrg_holiday_records');
    const records = raw ? parseHolidayRecords(JSON.parse(raw)) : [];
    const newRecord: HolidayRecord = {
      id: `local_hol_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      date: payload.date,
      holidayName: payload.holidayName,
      hours: payload.hours,
      note: payload.note,
      createdAt: new Date().toISOString()
    };
    records.unshift(newRecord);
    safeLocalStorage.setItem('zrg_holiday_records', JSON.stringify(records));
    triggerListeners('holiday_records', records);
    return newRecord;
  },

  addBatchHolidayRecords: async (records: Omit<HolidayRecord, 'id'>[]): Promise<HolidayRecord[]> => {
    const created: HolidayRecord[] = [];
    for (const rec of records) {
      try {
        const res = await supabaseService.addHolidayRecord(rec);
        created.push(res);
      } catch (err) {
        console.error('Error adding individual holiday record in batch:', rec, err);
      }
    }
    return created;
  },

  deleteHolidayRecord: async (recordId: string): Promise<void> => {
    if (!isFirebaseBlocked && db && !recordId.startsWith('local_')) {
      try {
        await deleteDoc(doc(db, 'holiday_records', recordId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `holiday_records/${recordId}`);
      }
    }

    // Local fallback
    const raw = safeLocalStorage.getItem('zrg_holiday_records');
    let records = raw ? parseHolidayRecords(JSON.parse(raw)) : [];
    records = records.filter(r => r.id !== recordId);
    safeLocalStorage.setItem('zrg_holiday_records', JSON.stringify(records));
    triggerListeners('holiday_records', records);
  },

  subscribeToHolidayRecords: (callback: (records: HolidayRecord[]) => void) => {
    listeners.holiday_records.add(callback);

    const raw = safeLocalStorage.getItem('zrg_holiday_records');
    if (raw) {
      try {
        callback(parseHolidayRecords(JSON.parse(raw)));
      } catch (e) {
        console.error('Error parsing cached holiday records:', e);
      }
    }

    if (!activeFirestoreUnsubs.holiday_records && !isFirebaseBlocked && db) {
      try {
        activeFirestoreUnsubs.holiday_records = onSnapshot(collection(db, 'holiday_records'), (snapshot) => {
          isFirebaseBlocked = false;
          const records = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              employeeId: data.employeeId || '',
              employeeName: data.employeeName || '',
              date: data.date || '',
              holidayName: data.holidayName || 'Holiday',
              hours: Number(data.hours || 0),
              note: data.note || '',
              createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : String(data.createdAt)) : undefined
            } as HolidayRecord;
          }).sort((a, b) => b.date.localeCompare(a.date));

          safeLocalStorage.setItem('zrg_holiday_records', JSON.stringify(records));
          triggerListeners('holiday_records', records);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'holiday_records');
          const localStr = safeLocalStorage.getItem('zrg_holiday_records');
          if (localStr) triggerListeners('holiday_records', parseHolidayRecords(JSON.parse(localStr)));
        });
      } catch (e) {
        console.warn('Holiday sub setup failed:', e);
      }
    }

    return () => {
      listeners.holiday_records.delete(callback);
      if (listeners.holiday_records.size === 0 && activeFirestoreUnsubs.holiday_records) {
        activeFirestoreUnsubs.holiday_records();
        activeFirestoreUnsubs.holiday_records = null;
      }
    };
  },

  // Settings Functions
  getSettings: async (): Promise<{ requirePhotoVerification: boolean }> => {
    if (!isFirebaseBlocked) {
      try {
        const settingsRef = doc(db, 'settings', 'config');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          const rpv = data.requirePhotoVerification !== false;
          safeLocalStorage.setItem('zrg_settings', JSON.stringify({ requirePhotoVerification: rpv }));
          return { requirePhotoVerification: rpv };
        }
      } catch (e) {
        console.warn('Failed to fetch settings from Firestore:', e);
      }
    }

    const raw = safeLocalStorage.getItem('zrg_settings');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return { requirePhotoVerification: true };
      }
    }
    return { requirePhotoVerification: true };
  },

  updateSettings: async (requirePhotoVerification: boolean) => {
    if (!isFirebaseBlocked) {
      try {
        const settingsRef = doc(db, 'settings', 'config');
        await setDoc(settingsRef, { requirePhotoVerification }, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'settings/config');
      }
    }

    safeLocalStorage.setItem('zrg_settings', JSON.stringify({ requirePhotoVerification }));
    triggerListeners('settings', { requirePhotoVerification });
  },

  subscribeToSettings: (callback: (settings: { requirePhotoVerification: boolean }) => void) => {
    listeners.settings.add(callback);

    const raw = safeLocalStorage.getItem('zrg_settings');
    if (raw) {
      try {
        callback(JSON.parse(raw));
      } catch {}
    }

    if (!activeFirestoreUnsubs.settings && !isFirebaseBlocked && db) {
      try {
        activeFirestoreUnsubs.settings = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
          isFirebaseBlocked = false;
          if (docSnap.exists()) {
            const data = docSnap.data();
            const setting = { requirePhotoVerification: data.requirePhotoVerification !== false };
            safeLocalStorage.setItem('zrg_settings', JSON.stringify(setting));
            triggerListeners('settings', setting);
          }
        }, (error) => {
          console.warn('Settings subscription error fallback:', error);
          const localStr = safeLocalStorage.getItem('zrg_settings');
          if (localStr) {
            try {
              triggerListeners('settings', JSON.parse(localStr));
            } catch {}
          }
        });
      } catch (e) {
        console.warn('Settings sub setup failed:', e);
      }
    }

    return () => {
      listeners.settings.delete(callback);
      if (listeners.settings.size === 0 && activeFirestoreUnsubs.settings) {
        activeFirestoreUnsubs.settings();
        activeFirestoreUnsubs.settings = null;
      }
    };
  },

  isLive: () => {
    return !isFirebaseBlocked;
  },

  // Reset/force restore Firebase blocked state if user wants to retry connection
  forceRetryFirebase: () => {
    isFirebaseBlocked = false;
  },

  // Import local data back to Live Firestore Database
  importBackupData: async (backup: {
    employees?: any[];
    logs?: any[];
    pto_requests?: any[];
    holiday_records?: any[];
    settings?: any;
  }) => {
    let empCount = 0;
    let logCount = 0;
    let ptoCount = 0;

    // Reset block flag to attempt writing to cloud
    isFirebaseBlocked = false;

    // Store in LocalStorage first as an instant backup fallback on this device
    if (backup.employees && backup.employees.length > 0) {
      safeLocalStorage.setItem('zrg_employees', JSON.stringify(backup.employees));
    }
    if (backup.logs && backup.logs.length > 0) {
      safeLocalStorage.setItem('zrg_logs', JSON.stringify(backup.logs));
    }
    if (backup.pto_requests && backup.pto_requests.length > 0) {
      safeLocalStorage.setItem('zrg_pto_requests', JSON.stringify(backup.pto_requests));
    }
    if (backup.settings) {
      safeLocalStorage.setItem('zrg_settings', JSON.stringify(backup.settings));
    }

    try {
      const querySnapshot = await getDocs(collection(db, 'employees'));
      const liveEmps = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const liveEmailMap = new Map<string, any>();
      liveEmps.forEach(emp => {
        if (emp.email) {
          liveEmailMap.set(emp.email.toLowerCase(), emp);
        }
      });

      const idMap = new Map<string, string>();

      // Import and map employees
      if (backup.employees && backup.employees.length > 0) {
        for (const emp of backup.employees) {
          try {
            const emailKey = emp.email?.toLowerCase() || '';
            let liveEmp = liveEmailMap.get(emailKey);

            if (!liveEmp && emailKey) {
              const payload = {
                name: emp.name,
                email: emp.email,
                pin: emp.pin,
                role: emp.role || 'staff',
                title: emp.title || '',
                ptoBalance: emp.ptoBalance !== undefined ? Number(emp.ptoBalance) : (emp.pto_balance !== undefined ? Number(emp.pto_balance) : 0)
              };

              const docRef = await addDoc(collection(db, 'employees'), payload);
              liveEmp = { id: docRef.id, ...payload };
              liveEmailMap.set(emailKey, liveEmp);
              empCount++;
            }

            if (liveEmp) {
              idMap.set(String(emp.id), liveEmp.id);
            }
          } catch (e) {
            console.error('Error importing employee to firebase:', emp, e);
          }
        }
      }

      const getLiveEmployeeId = (oldId: any, name?: string): string | null => {
        const idStr = String(oldId);
        if (idMap.has(idStr)) {
          return idMap.get(idStr) || null;
        }

        if (backup.employees) {
          const matched = backup.employees.find(e => String(e.id) === idStr);
          if (matched?.email) {
            const live = liveEmailMap.get(matched.email.toLowerCase());
            if (live) {
              idMap.set(idStr, live.id);
              return live.id;
            }
          }
        }

        if (name) {
          const nameLower = name.toLowerCase();
          const matchByName = liveEmps.find(e => e.name?.toLowerCase() === nameLower);
          if (matchByName) {
            idMap.set(idStr, matchByName.id);
            return matchByName.id;
          }
        }

        return null;
      };

      // Import logs
      if (backup.logs && backup.logs.length > 0) {
        for (const log of backup.logs) {
          try {
            const oldId = log.employeeId || log.employee_id;
            const empName = log.employeeName || log.employee_name;
            const liveEmpId = getLiveEmployeeId(oldId, empName);

            if (!liveEmpId) {
              continue;
            }

            const ts = typeof log.timestamp === 'string' ? new Date(log.timestamp) : log.timestamp;
            const tsDateObj = ts instanceof Date && !isNaN(ts.getTime()) ? ts : null;
            if (!tsDateObj) continue;

            const payload = {
              employeeId: liveEmpId,
              employeeName: empName || '',
              type: log.type,
              timestamp: Timestamp.fromDate(tsDateObj),
              photoUrl: log.photoUrl || log.photo_url || '',
              note: log.note || '',
            };

            await addDoc(collection(db, 'logs'), payload);
            logCount++;
          } catch (e) {
            console.error('Error importing log to firebase:', log, e);
          }
        }
      }

      // Import PTO requests
      if (backup.pto_requests && backup.pto_requests.length > 0) {
        for (const pto of backup.pto_requests) {
          try {
            const oldId = pto.employeeId || pto.employee_id;
            const empName = pto.employeeName || pto.employee_name;
            const liveEmpId = getLiveEmployeeId(oldId, empName);

            if (!liveEmpId) {
              continue;
            }

            const payload = {
              employeeId: liveEmpId,
              employeeName: empName || '',
              startDate: pto.startDate || pto.start_date || '',
              endDate: pto.endDate || pto.end_date || '',
              hoursRequested: Number(pto.hoursRequested !== undefined ? pto.hoursRequested : (pto.hours_requested || 0)),
              status: pto.status || 'pending',
              note: pto.note || '',
              managerNote: pto.managerNote || pto.manager_note || '',
            };

            await addDoc(collection(db, 'pto_requests'), payload);
            ptoCount++;
          } catch (e) {
            console.error('Error importing PTO request to firebase:', pto, e);
          }
        }
      }

      // Import Holiday records
      let holidayCount = 0;
      if (backup.holiday_records && backup.holiday_records.length > 0) {
        for (const hol of backup.holiday_records) {
          try {
            const oldId = hol.employeeId || hol.employee_id;
            const empName = hol.employeeName || hol.employee_name;
            const liveEmpId = oldId === 'ALL' ? 'ALL' : getLiveEmployeeId(oldId, empName);

            if (!liveEmpId && oldId !== 'ALL') {
              continue;
            }

            const payload = {
              employeeId: liveEmpId || 'ALL',
              employeeName: empName || '',
              date: hol.date || '',
              holidayName: hol.holidayName || 'Holiday',
              hours: Number(hol.hours || 0),
              note: hol.note || '',
              createdAt: Timestamp.now()
            };

            await addDoc(collection(db, 'holiday_records'), payload);
            holidayCount++;
          } catch (e) {
            console.error('Error importing holiday record to firebase:', hol, e);
          }
        }
      }

      // Sync settings
      if (backup.settings) {
        const rpv = backup.settings.requirePhotoVerification !== undefined ? backup.settings.requirePhotoVerification : backup.settings.require_photo_verification;
        await setDoc(doc(db, 'settings', 'config'), { requirePhotoVerification: rpv !== false }, { merge: true });
      }

    } catch (err: any) {
      console.warn('Failed to completely import backup into live Firestore database (saving locally instead):', err);
      // We still return success: true because it was saved locally!
    }

    // Refresh memory listeners with the imported data
    triggerListeners('employees', backup.employees || []);
    triggerListeners('logs', backup.logs || []);
    triggerListeners('pto_requests', backup.pto_requests || []);
    if (backup.holiday_records) {
      safeLocalStorage.setItem('zrg_holiday_records', JSON.stringify(backup.holiday_records));
      triggerListeners('holiday_records', backup.holiday_records);
    }
    if (backup.settings) {
      triggerListeners('settings', backup.settings);
    }

    return {
      success: true,
      count: {
        employees: empCount || (backup.employees?.length || 0),
        logs: logCount || (backup.logs?.length || 0),
        pto_requests: ptoCount || (backup.pto_requests?.length || 0)
      }
    };
  }
};
