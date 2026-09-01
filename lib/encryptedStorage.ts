import CryptoJS from 'crypto-js';
import { StateStorage } from 'zustand/middleware';

// Helper to get environment variables across Next.js and Vite environments
const getEnvVar = (name: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name] as string;
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    // @ts-ignore
    return import.meta.env[name];
  }
  return '';
};

// Use a secure key, gracefully degrading to a fallback if not provided in env
const SECRET_KEY = getEnvVar('NEXT_PUBLIC_STORAGE_SECRET') || getEnvVar('VITE_STORAGE_SECRET') || 'erp-secure-storage-fallback-key-2026';

export const encryptedStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const value = localStorage.getItem(name);
    if (!value) return null;

    try {
      // 1. GRACEFUL FALLBACK: Intelligently check if it's unencrypted JSON
      // If it's pure JSON, it will parse without error or typically start with { or [
      if (value.startsWith('{') || value.startsWith('[')) {
        // It's unencrypted plain-text JSON from old version.
        // Clear stale cache and return null to force re-fetch from Supabase
        localStorage.removeItem(name);
        return null;
      }

      // 2. ATTEMPT DECRYPTION
      const bytes = CryptoJS.AES.decrypt(value, SECRET_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      // If decryption yields an empty string, the key might be wrong
      if (!decrypted) {
        localStorage.removeItem(name);
        return null;
      }

      return decrypted;
    } catch (err) {
      // 3. COMPLETE DECRYPTION FAILURE: Clear cache and return null
      localStorage.removeItem(name);
      return null;
    }
  },
  
  setItem: (name: string, value: string): void => {
    try {
      const encrypted = CryptoJS.AES.encrypt(value, SECRET_KEY).toString();
      localStorage.setItem(name, encrypted);
    } catch (err) {
      console.error('Failed to encrypt state:', err);
    }
  },
  
  removeItem: (name: string): void => {
    localStorage.removeItem(name);
  },
};
