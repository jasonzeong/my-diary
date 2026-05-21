/**
 * 数据库操作模块
 * 优先使用 IndexedDB，不支持时回退到 localStorage
 */

(function() {
    'use strict';

    const DB_NAME = 'DiaryApp';
    const DB_VERSION = 1;
    const STORE_NAME = 'entries';
    const STORAGE_KEY = 'diary_entries';

    // 数据库连接实例
    let db = null;
    let useIndexedDB = false;
    let storageAvailable = false;
    let memoryStore = [];

    /**
     * 检查 IndexedDB 是否可用
     */
    function checkIndexedDBSupport() {
        try {
            return typeof window !== 'undefined' &&
                   window.indexedDB !== null &&
                   window.indexedDB !== undefined;
        } catch (e) {
            return false;
        }
    }

    /**
     * 检查存储是否可用
     */
    function checkStorageSupport() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 从 localStorage 获取数据
     */
    function getLocalStorageData() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('读取 localStorage 失败:', e);
            return [];
        }
    }

    /**
     * 保存数据到 localStorage（带容量检查和错误处理）
     */
    function setLocalStorageData(entries) {
        try {
            const data = JSON.stringify(entries);
            const dataSize = new Blob([data]).size;
            const MAX_SIZE = 5 * 1024 * 1024; // 5MB 警告阈值

            if (dataSize > MAX_SIZE) {
                console.warn('数据大小超过 5MB，可能导致存储失败');
                // 继续尝试保存，让用户知道问题
            }

            localStorage.setItem(STORAGE_KEY, data);
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.error('localStorage 存储空间不足，请导出备份后清理数据');
                throw new Error('存储空间不足，请导出备份后清理部分日记');
            }
            console.error('保存到 localStorage 失败:', e);
            return false;
        }
    }

    /**
     * 初始化数据库
     * 返回存储模式：'indexedDB' | 'localStorage' | 'memory'
     */
    async function initDB() {
        console.log('开始初始化存储...');

        storageAvailable = false;
        useIndexedDB = false;

        // 检查 localStorage 是否可用
        const hasLocalStorage = checkStorageSupport();
        console.log('localStorage 可用:', hasLocalStorage);

        // 尝试 IndexedDB
        if (checkIndexedDBSupport()) {
            console.log('尝试 IndexedDB...');
            try {
                const result = await new Promise((resolve, reject) => {
                    try {
                        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

                        // 5秒超时
                        const timeout = setTimeout(() => {
                            reject(new Error('IndexedDB 超时'));
                        }, 5000);

                        request.onerror = function() {
                            clearTimeout(timeout);
                            console.warn('IndexedDB error:', request.error);
                            reject(request.error);
                        };

                        request.onsuccess = function() {
                            clearTimeout(timeout);
                            db = request.result;
                            console.log('IndexedDB 连接成功');
                            resolve(true);
                        };

                        request.onupgradeneeded = function(event) {
                            const database = event.target.result;
                            if (!database.objectStoreNames.contains(STORE_NAME)) {
                                const store = database.createObjectStore(STORE_NAME, {
                                    keyPath: 'id',
                                    autoIncrement: true
                                });
                                store.createIndex('dateKey', 'dateKey', { unique: false });
                                store.createIndex('isPinned', 'isPinned', { unique: false });
                                store.createIndex('createdAt', 'createdAt', { unique: false });
                                console.log('IndexedDB 表创建成功');
                            }
                        };
                    } catch (e) {
                        clearTimeout(timeout);
                        reject(e);
                    }
                });

                if (result) {
                    useIndexedDB = true;
                    storageAvailable = true;
                    console.log('使用 IndexedDB 存储');
                    return 'indexedDB';
                }
            } catch (e) {
                console.warn('IndexedDB 不可用:', e.message);
            }
        } else {
            console.log('浏览器不支持 IndexedDB');
        }

        // 回退到 localStorage
        if (hasLocalStorage) {
            storageAvailable = true;
            console.log('使用 localStorage 存储');
            return 'localStorage';
        }

        // 最终回退：内存模式
        console.warn('使用内存模式（数据不会持久化）');
        return 'memory';
    }

    /**
     * 保存日记条目
     */
    async function saveEntry(entry) {
        const now = new Date();

        // 如果没有指定日期，使用当前日期
        if (!entry.dateKey) {
            entry.dateKey = now.toISOString().split('T')[0];
        }

        // 如果没有指定创建时间，使用当前时间
        if (!entry.createdAt) {
            entry.createdAt = now.toISOString();
        }

        entry.updatedAt = now.toISOString();

        if (useIndexedDB && db) {
            return new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.add(entry);

                    request.onsuccess = function() {
                        resolve(request.result);
                    };
                    request.onerror = function() {
                        reject(request.error);
                    };
                } catch (e) {
                    reject(e);
                }
            });
        } else {
            // localStorage 或内存模式
            const entries = storageAvailable ? getLocalStorageData() : memoryStore;
            const newId = entries.length > 0 ? Math.max(...entries.map(function(e) { return e.id || 0; })) + 1 : 1;
            entry.id = newId;
            entries.push(entry);

            if (storageAvailable) {
                setLocalStorageData(entries);
            } else {
                memoryStore = entries;
            }
            return newId;
        }
    }

    /**
     * 获取所有日记
     */
    async function getAllEntries() {
        let entries;

        if (useIndexedDB && db) {
            entries = await new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction([STORE_NAME], 'readonly');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.getAll();

                    request.onsuccess = function() {
                        resolve(request.result || []);
                    };
                    request.onerror = function() {
                        reject(request.error);
                    };
                } catch (e) {
                    resolve([]);
                }
            });
        } else {
            entries = storageAvailable ? getLocalStorageData() : memoryStore;
        }

        // 排序：置顶优先，然后按时间降序
        // 预解析所有日期为时间戳，避免排序中重复创建 Date 对象
        var timeCache = new Map();
        function getTime(entry) {
            if (timeCache.has(entry)) {
                return timeCache.get(entry);
            }
            var time = new Date(entry.createdAt).getTime();
            timeCache.set(entry, time);
            return time;
        }

        return entries.sort(function(a, b) {
            if (a.isPinned !== b.isPinned) {
                return a.isPinned ? -1 : 1;
            }
            return getTime(b) - getTime(a);
        });
    }

    /**
     * 更新日记
     */
    async function updateEntry(entry) {
        entry.updatedAt = new Date().toISOString();

        if (useIndexedDB && db) {
            return new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.put(entry);

                    request.onsuccess = function() {
                        resolve();
                    };
                    request.onerror = function() {
                        reject(request.error);
                    };
                } catch (e) {
                    reject(e);
                }
            });
        } else {
            const entries = storageAvailable ? getLocalStorageData() : memoryStore;
            const index = entries.findIndex(function(e) { return e.id === entry.id; });
            if (index !== -1) {
                entries[index] = entry;
                if (storageAvailable) {
                    setLocalStorageData(entries);
                } else {
                    memoryStore = entries;
                }
            }
        }
    }

    /**
     * 删除日记
     */
    async function deleteEntry(id) {
        if (useIndexedDB && db) {
            return new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction([STORE_NAME], 'readwrite');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.delete(id);

                    request.onsuccess = function() {
                        resolve();
                    };
                    request.onerror = function() {
                        reject(request.error);
                    };
                } catch (e) {
                    reject(e);
                }
            });
        } else {
            const entries = storageAvailable ? getLocalStorageData() : memoryStore;
            const filtered = entries.filter(function(e) { return e.id !== id; });
            if (storageAvailable) {
                setLocalStorageData(filtered);
            } else {
                memoryStore = filtered;
            }
        }
    }

    /**
     * 获取日记数量
     */
    async function getEntryCount() {
        if (useIndexedDB && db) {
            return new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction([STORE_NAME], 'readonly');
                    const store = transaction.objectStore(STORE_NAME);
                    const request = store.count();

                    request.onsuccess = function() {
                        resolve(request.result);
                    };
                    request.onerror = function() {
                        reject(request.error);
                    };
                } catch (e) {
                    resolve(0);
                }
            });
        } else {
            const entries = storageAvailable ? getLocalStorageData() : memoryStore;
            return entries.length;
        }
    }

    /**
     * 切换置顶状态
     */
    async function togglePin(id, isPinned) {
        const entries = await getAllEntries();
        const entry = entries.find(function(e) { return e.id === id; });

        if (entry) {
            entry.isPinned = isPinned;
            await updateEntry(entry);
        }
    }

    /**
     * 导出所有数据
     */
    async function exportData() {
        const entries = await getAllEntries();
        return {
            version: '1.0',
            exportDate: new Date().toISOString(),
            entries: entries,
            metadata: {
                totalCount: entries.length
            }
        };
    }

    /**
     * 导入数据
     */
    async function importData(data, merge) {
        merge = merge !== false; // 默认为 true

        if (!data || !data.entries || !Array.isArray(data.entries)) {
            throw new Error('数据格式错误');
        }

        let entries = data.entries;

        if (merge) {
            const existing = await getAllEntries();
            const existingIds = new Set(existing.map(function(e) { return e.id; }));
            const newEntries = entries.filter(function(e) { return !existingIds.has(e.id); });
            entries = existing.concat(newEntries);
        }

        // 重新分配ID避免冲突
        const maxId = entries.length > 0 ? Math.max.apply(null, entries.map(function(e) { return e.id || 0; })) : 0;
        entries.forEach(function(entry, index) {
            if (!entry.id) {
                entry.id = maxId + index + 1;
            }
        });

        // 保存
        if (useIndexedDB && db) {
            await new Promise(function(resolve, reject) {
                const transaction = db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                var successCount = 0;
                var failCount = 0;

                transaction.oncomplete = function() {
                    if (failCount > 0) {
                        console.warn('导入完成，' + successCount + ' 条成功，' + failCount + ' 条失败');
                    }
                    resolve();
                };
                transaction.onerror = function(e) {
                    console.error('导入事务失败:', e.target.error);
                    // 事务已失败，不再 reject 让部分数据保留
                };
                transaction.onabort = function() {
                    console.error('导入事务被中止');
                    reject(new Error('导入被中止'));
                };

                // 先清空
                store.clear();

                // 批量添加（带错误隔离）
                entries.forEach(function(entry) {
                    try {
                        const request = store.put(entry);
                        request.onsuccess = function() {
                            successCount++;
                        };
                        request.onerror = function() {
                            failCount++;
                            console.error('单条导入失败:', entry.id, request.error);
                            // 继续处理下一条
                        };
                    } catch (e) {
                        failCount++;
                        console.error('单条处理异常:', entry.id, e);
                    }
                });
            });
        } else {
            if (storageAvailable) {
                setLocalStorageData(entries);
            } else {
                memoryStore = entries;
            }
        }

        return entries.length;
    }

    // 导出到 window.db
    window.db = {
        init: initDB,
        save: saveEntry,
        getAll: getAllEntries,
        update: updateEntry,
        delete: deleteEntry,
        count: getEntryCount,
        togglePin: togglePin,
        export: exportData,
        importData: importData
    };

    console.log('db.js 加载完成，window.db =', typeof window.db);
})();
