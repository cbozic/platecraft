/**
 * Crypto service for encrypting sensitive data
 * Uses Web Crypto API (SubtleCrypto) for all cryptographic operations
 */

const DEVICE_KEY_STORAGE_KEY = 'platecraft_device_key';
const PBKDF2_ITERATIONS = 600000; // OWASP recommended for 2024+

export interface EncryptedField {
  _encrypted: true;
  iv: string; // base64
  data: string; // base64
}

export interface EncryptedExport {
  encrypted: true;
  version: string;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2';
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64
}

// Helper functions for base64 encoding/decoding
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export const cryptoService = {
  /**
   * Get or create a device-bound encryption key
   * Stored in localStorage for persistence across sessions
   */
  async getOrCreateDeviceKey(): Promise<CryptoKey> {
    const stored = localStorage.getItem(DEVICE_KEY_STORAGE_KEY);

    if (stored) {
      // Import existing key
      const keyData = base64ToArrayBuffer(stored);
      return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
      ]);
    }

    // Generate new key
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);

    // Export and store
    const exported = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(DEVICE_KEY_STORAGE_KEY, arrayBufferToBase64(exported));

    // Re-import as non-extractable for security
    return crypto.subtle.importKey('raw', exported, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
  },

  /**
   * Check if a value is an encrypted field
   */
  isEncryptedField(value: unknown): value is EncryptedField {
    return (
      typeof value === 'object' &&
      value !== null &&
      '_encrypted' in value &&
      (value as EncryptedField)._encrypted === true &&
      'iv' in value &&
      'data' in value
    );
  },

  /**
   * Encrypt a string field using the device key
   */
  async encryptField(plaintext: string): Promise<EncryptedField> {
    const key = await this.getOrCreateDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    return {
      _encrypted: true,
      iv: arrayBufferToBase64(iv.buffer),
      data: arrayBufferToBase64(encrypted),
    };
  },

  /**
   * Decrypt an encrypted field using the device key
   */
  async decryptField(encrypted: EncryptedField): Promise<string> {
    const key = await this.getOrCreateDeviceKey();
    const iv = new Uint8Array(base64ToArrayBuffer(encrypted.iv));
    const data = base64ToArrayBuffer(encrypted.data);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

    return new TextDecoder().decode(decrypted);
  },

  /**
   * Check if data is an encrypted export
   */
  isEncryptedExport(data: unknown): data is EncryptedExport {
    return (
      typeof data === 'object' &&
      data !== null &&
      'encrypted' in data &&
      (data as EncryptedExport).encrypted === true &&
      'algorithm' in data &&
      'kdf' in data &&
      'salt' in data &&
      'iv' in data &&
      'data' in data
    );
  },

  /**
   * Derive an encryption key from a password using PBKDF2
   */
  async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoded = new TextEncoder().encode(password);

    const keyMaterial = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, [
      'deriveKey',
    ]);

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Encrypt export data with a user-provided password
   */
  async encryptExport(json: string, password: string): Promise<EncryptedExport> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKeyFromPassword(password, salt);

    const encoded = new TextEncoder().encode(json);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    return {
      encrypted: true,
      version: '1.0',
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2',
      iterations: PBKDF2_ITERATIONS,
      salt: arrayBufferToBase64(salt.buffer),
      iv: arrayBufferToBase64(iv.buffer),
      data: arrayBufferToBase64(encrypted),
    };
  },

  /**
   * Decrypt export data with a user-provided password
   * Throws an error if the password is incorrect
   */
  async decryptExport(encrypted: EncryptedExport, password: string): Promise<string> {
    const salt = new Uint8Array(base64ToArrayBuffer(encrypted.salt));
    const iv = new Uint8Array(base64ToArrayBuffer(encrypted.iv));
    const data = base64ToArrayBuffer(encrypted.data);

    // Use stored iterations if available, otherwise use current default
    const iterations = encrypted.iterations || PBKDF2_ITERATIONS;
    const encoded = new TextEncoder().encode(password);

    const keyMaterial = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, [
      'deriveKey',
    ]);

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    try {
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch {
      throw new Error('Incorrect password or corrupted data');
    }
  },
};
