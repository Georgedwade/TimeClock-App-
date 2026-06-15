import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, Timestamp, orderBy, doc, updateDoc, onSnapshot, increment, deleteDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { LogType, Employee, TimeLog, PTORequest } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firebaseService = {
  getEmployees: async (): Promise<Employee[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'employees'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'employees');
      return [];
    }
  },

  addLog: async (log: Omit<TimeLog, 'id'>) => {
    try {
      return await addDoc(collection(db, 'logs'), {
        ...log,
        timestamp: Timestamp.fromDate(log.timestamp)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'logs');
    }
  },

  getLogs: async (startDate?: Date, endDate?: Date): Promise<TimeLog[]> => {
    try {
      let q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'));
      if (startDate && endDate) {
        q = query(collection(db, 'logs'), 
          where('timestamp', '>=', Timestamp.fromDate(startDate)),
          where('timestamp', '<=', Timestamp.fromDate(endDate)),
          orderBy('timestamp', 'desc')
        );
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate()
        } as TimeLog;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'logs');
      return [];
    }
  },

  updateLogNote: async (logId: string, note: string) => {
    try {
      const logRef = doc(db, 'logs', logId);
      return await updateDoc(logRef, { note });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `logs/${logId}`);
    }
  },

  deleteLog: async (logId: string) => {
    try {
      const logRef = doc(db, 'logs', logId);
      return await deleteDoc(logRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `logs/${logId}`);
    }
  },

  updateLog: async (logId: string, data: Partial<TimeLog>) => {
    try {
      const logRef = doc(db, 'logs', logId);
      const updateData = { ...data };
      if (updateData.timestamp) {
        (updateData as any).timestamp = Timestamp.fromDate(updateData.timestamp);
      }
      delete (updateData as any).id;
      return await updateDoc(logRef, updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `logs/${logId}`);
    }
  },

  getPTORequests: async (): Promise<PTORequest[]> => {
    try {
      const snapshot = await getDocs(collection(db, 'pto_requests'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PTORequest));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'pto_requests');
      return [];
    }
  },

  addPTORequest: async (request: Omit<PTORequest, 'id'>) => {
    try {
      return await addDoc(collection(db, 'pto_requests'), request);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'pto_requests');
    }
  },

  updateEmployeePTO: async (employeeId: string, hours: number) => {
    try {
      const empRef = doc(db, 'employees', employeeId);
      return await updateDoc(empRef, {
        ptoBalance: increment(hours)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `employees/${employeeId}`);
    }
  },

  updateEmployeeRole: async (employeeId: string, role: 'staff' | 'manager') => {
    try {
      const empRef = doc(db, 'employees', employeeId);
      return await updateDoc(empRef, { role });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `employees/${employeeId}`);
    }
  },

  updateEmployee: async (employeeId: string, data: Partial<Employee>) => {
    try {
      const empRef = doc(db, 'employees', employeeId);
      const cleanData = { ...data };
      delete (cleanData as any).id;
      return await updateDoc(empRef, cleanData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `employees/${employeeId}`);
    }
  },

  addEmployee: async (employee: Omit<Employee, 'id'>) => {
    try {
      return await addDoc(collection(db, 'employees'), employee);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'employees');
    }
  },

  deleteEmployee: async (employeeId: string) => {
    try {
      const empRef = doc(db, 'employees', employeeId);
      return await deleteDoc(empRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `employees/${employeeId}`);
    }
  },

  updatePTORequestStatus: async (requestId: string, status: 'approved' | 'rejected', managerNote?: string) => {
    try {
      const reqRef = doc(db, 'pto_requests', requestId);
      return await updateDoc(reqRef, { 
        status,
        managerNote: managerNote || "",
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `pto_requests/${requestId}`);
    }
  },

  deletePTORequest: async (requestId: string) => {
    try {
      const reqRef = doc(db, 'pto_requests', requestId);
      return await deleteDoc(reqRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pto_requests/${requestId}`);
    }
  },

  subscribeToEmployees: (callback: (employees: Employee[]) => void) => {
    return onSnapshot(collection(db, 'employees'), (snapshot) => {
      const employees = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Employee));
      callback(employees);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'employees');
    });
  },

  subscribeToLogs: (callback: (logs: TimeLog[]) => void) => {
    return onSnapshot(query(collection(db, 'logs'), orderBy('timestamp', 'desc')), (snapshot) => {
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp.toDate()
        } as TimeLog;
      });
      callback(logs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'logs');
    });
  },

  subscribeToPTORequests: (callback: (requests: PTORequest[]) => void) => {
    return onSnapshot(collection(db, 'pto_requests'), (snapshot) => {
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as PTORequest));
      callback(requests);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pto_requests');
    });
  },

  getSettings: async (): Promise<{ requirePhotoVerification: boolean }> => {
    try {
      const docRef = doc(db, 'settings', 'config');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { requirePhotoVerification: data.requirePhotoVerification !== false };
      }
      return { requirePhotoVerification: true };
    } catch (error) {
      return { requirePhotoVerification: true };
    }
  },

  updateSettings: async (requirePhotoVerification: boolean) => {
    try {
      const docRef = doc(db, 'settings', 'config');
      return await setDoc(docRef, { requirePhotoVerification });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/config');
    }
  },

  subscribeToSettings: (callback: (settings: { requirePhotoVerification: boolean }) => void) => {
    const docRef = doc(db, 'settings', 'config');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback({ requirePhotoVerification: data.requirePhotoVerification !== false });
      } else {
        callback({ requirePhotoVerification: true });
      }
    }, (error) => {
      callback({ requirePhotoVerification: true });
    });
  }
};
