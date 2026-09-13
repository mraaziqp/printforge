/**
 * PrintForge IndexedDB Large-Mesh & Asset Cache
 * Provides high-performance client-side offline persistence for binary STL/GLB assets,
 * slice profiles, and high-res studio snapshot thumbnails without hitting LocalStorage limits.
 */

import { StorageStats } from '../types';

const DB_NAME = 'PrintForge_IndexedDB';
const DB_VERSION = 1;

export interface CachedMeshRecord {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  byteSize: number;
  triangleCount: number;
  filamentType: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface CachedSliceRecord {
  id: string;
  filament: string;
  layerHeight: number;
  infill: number;
  printSpeed: number;
  supportType: string;
  createdAt: number;
  layerCount: number;
}

export interface CachedSnapshotRecord {
  id: string;
  dataUrl: string;
  preset: string;
  createdAt: number;
}

// Open or initialize IndexedDB
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('meshes')) {
        const meshStore = db.createObjectStore('meshes', { keyPath: 'id' });
        meshStore.createIndex('name', 'name', { unique: false });
        meshStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('slices')) {
        db.createObjectStore('slices', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Cache binary mesh ArrayBuffer to IndexedDB
 */
export async function cacheMeshBinary(
  id: string,
  name: string,
  buffer: ArrayBuffer,
  triangleCount: number = 0,
  filamentType: string = 'PLA',
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meshes', 'readwrite');
      const store = tx.objectStore('meshes');

      const record: CachedMeshRecord = {
        id,
        name,
        buffer,
        byteSize: buffer.byteLength,
        triangleCount,
        filamentType,
        createdAt: Date.now(),
        metadata,
      };

      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to cache mesh binary:', err);
  }
}

/**
 * Retrieve cached binary mesh ArrayBuffer by ID
 */
export async function getCachedMeshBinary(id: string): Promise<CachedMeshRecord | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meshes', 'readonly');
      const store = tx.objectStore('meshes');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        resolve(getReq.result || null);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to get cached mesh:', err);
    return null;
  }
}

/**
 * List all cached meshes (without transferring heavy ArrayBuffers)
 */
export async function listCachedMeshes(): Promise<
  Array<Omit<CachedMeshRecord, 'buffer'> & { hasBuffer: boolean }>
> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meshes', 'readonly');
      const store = tx.objectStore('meshes');
      const request = store.openCursor();
      const results: Array<Omit<CachedMeshRecord, 'buffer'> & { hasBuffer: boolean }> = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const val = cursor.value as CachedMeshRecord;
          results.push({
            id: val.id,
            name: val.name,
            byteSize: val.byteSize || (val.buffer ? val.buffer.byteLength : 0),
            triangleCount: val.triangleCount || 0,
            filamentType: val.filamentType || 'PLA',
            createdAt: val.createdAt,
            metadata: val.metadata,
            hasBuffer: Boolean(val.buffer),
          });
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to list cached meshes:', err);
    return [];
  }
}

/**
 * Delete a single cached mesh by ID
 */
export async function deleteCachedMesh(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('meshes', 'readwrite');
      const store = tx.objectStore('meshes');
      const delReq = store.delete(id);

      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to delete mesh:', err);
  }
}

/**
 * Cache Slicer Profile
 */
export async function cacheSliceProfile(record: CachedSliceRecord): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('slices', 'readwrite');
      const store = tx.objectStore('slices');
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to cache slice profile:', err);
  }
}

/**
 * Cache High-Res Studio Snapshot Thumbnail
 */
export async function cacheStudioSnapshot(
  id: string,
  dataUrl: string,
  preset: string = 'cyber_studio'
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');
      const record: CachedSnapshotRecord = {
        id,
        dataUrl,
        preset,
        createdAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to cache snapshot:', err);
  }
}

/**
 * Get cached Snapshot thumbnail
 */
export async function getCachedSnapshot(id: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const store = tx.objectStore('snapshots');
      const req = store.get(id);
      req.onsuccess = () => {
        resolve(req.result ? (req.result as CachedSnapshotRecord).dataUrl : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to get snapshot:', err);
    return null;
  }
}

/**
 * Get Total Storage Stats across all IndexedDB stores
 */
export async function getStorageStats(): Promise<StorageStats> {
  try {
    const db = await openDatabase();
    const meshStats = await new Promise<{ count: number; totalBytes: number }>((resolve) => {
      const tx = db.transaction('meshes', 'readonly');
      const store = tx.objectStore('meshes');
      const cursorReq = store.openCursor();
      let count = 0;
      let totalBytes = 0;

      cursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          count++;
          const val = cursor.value as CachedMeshRecord;
          totalBytes += val.byteSize || (val.buffer ? val.buffer.byteLength : 0);
          cursor.continue();
        } else {
          resolve({ count, totalBytes });
        }
      };
      cursorReq.onerror = () => resolve({ count: 0, totalBytes: 0 });
    });

    const sliceCount = await new Promise<number>((resolve) => {
      const tx = db.transaction('slices', 'readonly');
      const store = tx.objectStore('slices');
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });

    const snapshotCount = await new Promise<number>((resolve) => {
      const tx = db.transaction('snapshots', 'readonly');
      const store = tx.objectStore('snapshots');
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });

    // Approximate snapshot & profile bytes (150KB per snapshot dataUrl)
    const snapshotApproxBytes = snapshotCount * 180000;
    const totalBytes = meshStats.totalBytes + snapshotApproxBytes;

    let formatted = '0 B';
    if (totalBytes > 1024 * 1024) {
      formatted = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    } else if (totalBytes > 1024) {
      formatted = `${(totalBytes / 1024).toFixed(1)} KB`;
    } else if (totalBytes > 0) {
      formatted = `${totalBytes} B`;
    }

    return {
      totalBytes,
      formattedSize: formatted,
      meshCount: meshStats.count,
      profileCount: sliceCount,
      snapshotCount,
    };
  } catch (err) {
    console.warn('[IndexedDB] Could not calculate storage stats:', err);
    return {
      totalBytes: 0,
      formattedSize: '0 B',
      meshCount: 0,
      profileCount: 0,
      snapshotCount: 0,
    };
  }
}

/**
 * Clear All Data in PrintForge IndexedDB
 */
export async function clearIndexedDatabase(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['meshes', 'slices', 'snapshots'], 'readwrite');
      tx.objectStore('meshes').clear();
      tx.objectStore('slices').clear();
      tx.objectStore('snapshots').clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to clear database:', err);
  }
}
