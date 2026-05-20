import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp, addDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without specifying firestoreDatabaseId if it's provided in config
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId); 
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');

let cachedAccessToken: string | null = null;

export const getAccessToken = () => cachedAccessToken;
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Cache the access token for Picker
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    
    // Sync user to firestore, wrapped in a try/catch to avoid breaking sign-in when offline/un-deployed
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnapshot = await getDoc(userDocRef);
      
      if (!userDocSnapshot.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp()
        });
      } else {
        await setDoc(userDocRef, {
          lastLogin: serverTimestamp()
        }, { merge: true });
      }
    } catch (syncError: any) {
      console.warn("Gagal menyinkronkan profil ke Firestore (mungkin offline atau rules belum siap):", syncError);
    }
    
    return user;
  } catch (error: any) {
    if (
      error.code === 'auth/popup-closed-by-user' || 
      error.code === 'auth/cancelled-popup-request' ||
      error.name === 'AbortError' ||
      error.message?.includes('abort') ||
      error.message?.includes('auth/cancelled-popup-request') ||
      error.message?.includes('auth/popup-closed-by-user') ||
      error.message?.toLowerCase().includes('cancel') ||
      error.message?.toLowerCase().includes('close')
    ) {
      console.warn("Sign-in aborted or closed by user:", error?.message || error);
      throw error;
    }
    if (error.message?.includes('offline') || error.code === 'unavailable') {
      console.warn("Sign-in network issue (offline):", error.message);
      throw error;
    }
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const logout = () => {
  cachedAccessToken = null;
  return signOut(auth);
};

export const updateProfileData = async (uid: string, data: { displayName?: string, photoURL?: string, motivation?: string, email?: string }) => {
  const userDocRef = doc(db, 'users', uid);
  try {
    await updateDoc(userDocRef, {
      ...data,
      lastLogin: serverTimestamp() // Update timestamp on profile change
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
};

// Helper for error handling as per instructions
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }

  // Only throw if it's a security/permission failure (not offline, transient, or cancelled error)
  const isPermissionError = 
    errorMessage.toLowerCase().includes('permission') || 
    errorMessage.toLowerCase().includes('insufficient') ||
    (error && typeof error === 'object' && 'code' in error && (error as any).code === 'permission-denied');

  if (isPermissionError) {
    console.error('Firestore Security/Permission Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  } else {
    // For network/offline/unavailable errors, log a warning and don't throw to prevent unhandled crashing
    console.warn(`Firestore Transient/Offline Error during ${operationType} on ${path}:`, errorMessage);
  }
}
