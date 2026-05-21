/**
 * 日记应用主逻辑
 * 处理表单提交、日记展示、编辑删除等交互
 */

(function() {
    'use strict';

    // 当前编辑的日记ID
    var editingId = null;

    // 所有日记缓存
    var allEntries = [];

    // 标记是否已绑定事件
    var eventsBound = false;

    // 当前待上传的图片列表
    var pendingImages = [];

    // DOM 元素缓存
    var dom = {};

    // 搜索防抖定时器
    var searchDebounceTimer = null;

    /**
     * 初始化应用
     */
    async function initApp() {
        console.log('开始初始化应用...');

        try {
            if (!window.db) {
                throw new Error('window.db 未定义，db.js 可能未正确加载');
            }

            // 初始化数据库
            await window.db.init();
            console.log('数据库初始化完成');

            // 初始化日历
            if (window.calendar) {
                window.calendar.init();
            }

            // 设置日历选择回调
            window.onDateSelect = function(date) {
                filterByDate(date);
            };

            // 缓存常用 DOM 元素（必须在绑定事件前执行）
            cacheDomElements();

            // 加载日记列表
            await loadEntries();

            // 绑定表单提交事件
            bindEvents();

            // 绑定日记列表事件（只绑定一次）
            bindEntryEvents();

            showToast('应用加载成功');
        } catch (error) {
            console.error('应用初始化失败:', error);
            showToast('应用初始化失败: ' + error.message, 'error');
        }
    }

    /**
     * 缓存常用 DOM 元素
     */
    function cacheDomElements() {
        dom.writeModal = document.getElementById('writeModal');
        dom.importModal = document.getElementById('importModal');
        dom.settingsModal = document.getElementById('settingsModal');
        dom.entryList = document.getElementById('entryList');
        dom.emptyState = document.getElementById('emptyState');
        dom.toast = document.getElementById('toast');
        dom.entryCount = document.getElementById('entryCount');
        dom.diaryForm = document.getElementById('diaryForm');
        dom.diaryTitle = document.getElementById('diaryTitle');
        dom.diaryContent = document.getElementById('diaryContent');
        dom.diaryDate = document.getElementById('diaryDate');
        dom.isPinned = document.getElementById('isPinned');
        dom.imagePreviewList = document.getElementById('imagePreviewList');
        dom.importFile = document.getElementById('importFile');
        dom.mergeImport = document.getElementById('mergeImport');
        dom.searchInput = document.getElementById('searchInput');
        dom.contentTitle = document.querySelector('.content-title');
    }

    /**
     * 绑定事件处理
     */
    function bindEvents() {
        // 写日记按钮
        document.getElementById('writeBtn').addEventListener('click', function() {
            openWriteModal();
        });

        // 关闭弹窗
        document.getElementById('closeModal').addEventListener('click', closeWriteModal);
        document.getElementById('cancelBtn').addEventListener('click', closeWriteModal);

        // 表单提交
        dom.diaryForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleSubmit();
        });

        // 图片上传
        bindImageUpload();

        // 搜索（带防抖）
        document.getElementById('searchInput').addEventListener('input', function(e) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(function() {
                handleSearch(e.target.value);
            }, 300); // 300ms 防抖延迟
        });

        // 导出
        document.getElementById('exportBtn').addEventListener('click', handleExport);

        // 导入
        document.getElementById('importBtn').addEventListener('click', function() {
            dom.importModal.classList.add('active');
        });

        // 关闭导入弹窗
        document.getElementById('closeImportModal').addEventListener('click', closeImportModal);
        document.getElementById('cancelImportBtn').addEventListener('click', closeImportModal);

        // 确认导入
        document.getElementById('confirmImportBtn').addEventListener('click', handleImport);

        // 设置
        bindSettingsEvents();
    }

    /**
     * 绑定图片上传事件
     */
    function bindImageUpload() {
        var uploadArea = document.getElementById('imageUploadArea');
        var imageInput = document.getElementById('imageInput');

        if (!uploadArea || !imageInput) return;

        // 点击上传区域触发文件选择
        uploadArea.addEventListener('click', function(e) {
            if (e.target !== imageInput) {
                imageInput.click();
            }
        });

        // 文件选择
        imageInput.addEventListener('change', async function(e) {
            if (e.target.files && e.target.files.length > 0) {
                await handleImageFiles(e.target.files);
                imageInput.value = ''; // 清空，允许重复选择相同文件
            }
        });

        // 拖拽上传
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', function() {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', async function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                await handleImageFiles(e.dataTransfer.files);
            }
        });
    }

    /**
     * 处理图片文件
     */
    async function handleImageFiles(files) {
        if (!window.imageUtils) {
            showToast('图片工具未加载', 'error');
            return;
        }

        // 检查剩余可上传数量
        var remaining = window.imageUtils.MAX_COUNT - pendingImages.length;
        if (remaining <= 0) {
            showToast('最多只能上传 ' + window.imageUtils.MAX_COUNT + ' 张图片', 'error');
            return;
        }

        // 只取剩余数量的文件
        var filesToProcess = Array.prototype.slice.call(files, 0, remaining);

        try {
            showToast('正在处理图片...');
            var base64List = await window.imageUtils.process(filesToProcess);

            base64List.forEach(function(base64) {
                pendingImages.push(base64);
            });

            renderImagePreviews();
            showToast('图片添加成功');
        } catch (error) {
            console.error('图片处理失败:', error);
            showToast(error.message || '图片处理失败', 'error');
        }
    }

    /**
     * 渲染图片预览
     */
    function renderImagePreviews() {
        var previewList = document.getElementById('imagePreviewList');
        if (!previewList) return;

        previewList.innerHTML = pendingImages.map(function(base64, index) {
            return '<div class="image-preview-item">' +
                '<img src="' + base64 + '" alt="预览">' +
                '<button type="button" class="image-preview-remove" data-index="' + index + '">&times;</button>' +
            '</div>';
        }).join('');

        // 绑定删除按钮
        previewList.querySelectorAll('.image-preview-remove').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var index = parseInt(this.dataset.index);
                pendingImages.splice(index, 1);
                renderImagePreviews();
            });
        });
    }

    /**
     * 清空图片预览
     */
    function clearImagePreviews() {
        pendingImages = [];
        var previewList = document.getElementById('imagePreviewList');
        if (previewList) {
            previewList.innerHTML = '';
        }
    }

    /**
     * 打开写日记弹窗
     */
    function openWriteModal() {
        editingId = null;
        dom.diaryForm.reset();
        clearImagePreviews();

        // 默认日期为今天
        var today = new Date().toISOString().split('T')[0];
        dom.diaryDate.value = today;

        var titleEl = document.querySelector('.modal-title');
        titleEl.innerHTML = '<svg class="title-icon"><use href="#icon-edit"></use></svg><span>写日记</span>';
        dom.writeModal.classList.add('active');
    }

    /**
     * 关闭写日记弹窗
     */
    function closeWriteModal() {
        dom.writeModal.classList.remove('active');
        editingId = null;
        clearImagePreviews();
    }

    /**
     * 关闭导入弹窗
     */
    function closeImportModal() {
        dom.importModal.classList.remove('active');
        document.getElementById('importFile').value = '';
    }

    /**
     * 处理表单提交
     */
    async function handleSubmit() {
        var title = dom.diaryTitle.value.trim();
        var content = dom.diaryContent.value.trim();
        var isPinned = dom.isPinned.checked;
        var dateStr = dom.diaryDate.value;

        if (!title || !content) {
            showToast('请填写标题和内容', 'error');
            return;
        }

        if (!dateStr) {
            showToast('请选择日期', 'error');
            return;
        }

        try {
            // 构建日期对象
            var selectedDate = new Date(dateStr + 'T12:00:00');

            if (editingId) {
                // 编辑模式 - 需要保留原来的创建时间，但更新日期
                var originalEntry = allEntries.find(function(e) { return e.id === editingId; });
                var createdAt = selectedDate.toISOString();

                // 如果存在原始条目，尝试保留原来的时间部分
                if (originalEntry && originalEntry.createdAt) {
                    try {
                        var originalTime = originalEntry.createdAt.split('T')[1] || '12:00:00.000Z';
                        createdAt = dateStr + 'T' + originalTime;
                    } catch (e) {
                        createdAt = selectedDate.toISOString();
                    }
                }

                var entry = {
                    id: editingId,
                    title: title,
                    content: content,
                    isPinned: isPinned,
                    dateKey: dateStr,
                    createdAt: createdAt,
                    images: pendingImages.length > 0 ? pendingImages : (originalEntry ? originalEntry.images : undefined)
                };
                await window.db.update(entry);
                showToast('日记更新成功');
            } else {
                // 新建模式
                var entry = {
                    title: title,
                    content: content,
                    isPinned: isPinned,
                    dateKey: dateStr,
                    createdAt: selectedDate.toISOString(),
                    images: pendingImages.length > 0 ? pendingImages : undefined
                };
                await window.db.save(entry);
                showToast('日记保存成功');
            }

            closeWriteModal();
            await loadEntries();
        } catch (error) {
            console.error('保存失败:', error);
            showToast('保存失败，请重试', 'error');
        }
    }

    /**
     * 加载日记列表
     */
    async function loadEntries() {
        try {
            allEntries = await window.db.getAll();

            // 更新日历上的日期标记
            if (window.calendar) {
                window.calendar.updateEntryDates(allEntries);
            }

            // 显示列表
            renderEntries(allEntries);
        } catch (error) {
            console.error('加载日记失败:', error);
            showToast('加载日记失败', 'error');
        }
    }

    /**
     * 渲染日记列表
     */
    function renderEntries(entries) {
        var count = entries.length;

        // 更新数量显示
        dom.entryCount.textContent =
            count > 0 ? '共 ' + count + ' 篇' : '';

        // 显示或隐藏空状态
        var emptyState = dom.emptyState;
        var entryList = dom.entryList;

        if (entries.length === 0) {
            emptyState.classList.add('show');
            entryList.innerHTML = '';
            return;
        }

        emptyState.classList.remove('show');

        // 渲染日记列表
        entryList.innerHTML = entries.map(function(entry) {
            return renderEntry(entry);
        }).join('');
    }

    /**
     * 渲染单篇日记
     */
    function renderEntry(entry) {
        var date = new Date(entry.createdAt);
        var isValidDate = !isNaN(date.getTime());

        var dateStr = isValidDate ? date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }) : '未知日期';
        var timeStr = isValidDate ? date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        }) : '';

        var pinnedClass = entry.isPinned ? 'pinned' : '';
        var pinTitle = entry.isPinned ? '取消置顶' : '置顶';
        var pinIcon = entry.isPinned ? 'icon-pinned' : 'icon-pin';

        // 图片 HTML
        var imagesHtml = '';
        if (entry.images && entry.images.length > 0) {
            imagesHtml = '<div class="entry-images">' +
                entry.images.map(function(img, idx) {
                    return '<div class="entry-image-wrapper" data-index="' + idx + '" data-entry="' + entry.id + '">' +
                        '<img src="' + img + '" alt="日记图片">' +
                    '</div>';
                }).join('') +
            '</div>';
        }

        return '<div class="entry-card ' + pinnedClass + '" data-id="' + entry.id + '">' +
            '<div class="entry-header">' +
                '<div>' +
                    '<div class="entry-title">' + escapeHtml(entry.title) + '</div>' +
                    '<div class="entry-date">' + dateStr + ' ' + timeStr + '</div>' +
                '</div>' +
                '<div class="entry-actions">' +
                    '<button class="action-btn pin" data-action="pin" title="' + pinTitle + '">' +
                        '<svg class="action-icon"><use href="#' + pinIcon + '"></use></svg>' +
                    '</button>' +
                    '<button class="action-btn edit" data-action="edit" title="编辑">' +
                        '<svg class="action-icon"><use href="#icon-edit"></use></svg>' +
                    '</button>' +
                    '<button class="action-btn delete" data-action="delete" title="删除">' +
                        '<svg class="action-icon"><use href="#icon-trash"></use></svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="entry-content">' + escapeHtml(entry.content) + '</div>' +
            imagesHtml +
        '</div>';
    }

    /**
     * 绑定日记卡片的事件
     */
    function bindEntryEvents() {
        if (eventsBound) return;
        eventsBound = true;

        var entryList = dom.entryList;

        entryList.addEventListener('click', async function(e) {
            // 处理图片点击放大
            var imgWrapper = e.target.closest('.entry-image-wrapper');
            if (imgWrapper) {
                var entryId = parseInt(imgWrapper.dataset.entry);
                var imgIndex = parseInt(imgWrapper.dataset.index);
                openImageViewer(entryId, imgIndex);
                return;
            }

            var btn = e.target.closest('.action-btn');
            if (!btn) return;

            var card = btn.closest('.entry-card');
            var id = parseInt(card.dataset.id);
            var action = btn.dataset.action;

            switch (action) {
                case 'edit':
                    await editEntry(id);
                    break;
                case 'delete':
                    await deleteEntry(id);
                    break;
                case 'pin':
                    await togglePinEntry(id, card);
                    break;
            }
        });
    }

    /**
     * 打开图片查看器
     */
    function openImageViewer(entryId, imgIndex) {
        var entry = allEntries.find(function(e) { return e.id === entryId; });
        if (!entry || !entry.images || !entry.images[imgIndex]) return;

        var overlay = document.createElement('div');
        overlay.className = 'image-viewer-overlay';
        overlay.innerHTML = '<img src="' + entry.images[imgIndex] + '" alt="查看图片">';

        // 使用命名函数以便移除监听器
        function closeViewer() {
            overlay.removeEventListener('click', closeViewer);
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
            }
        }

        overlay.addEventListener('click', closeViewer);
        document.body.appendChild(overlay);
    }

    /**
     * 编辑日记
     */
    async function editEntry(id) {
        try {
            var entry = allEntries.find(function(e) { return e.id === id; });

            if (!entry) {
                showToast('日记不存在', 'error');
                return;
            }

            // 填充表单
            dom.diaryTitle.value = entry.title;
            dom.diaryContent.value = entry.content;
            dom.isPinned.checked = entry.isPinned;
            dom.diaryDate.value = entry.dateKey || entry.createdAt.split('T')[0];

            // 加载已有图片
            clearImagePreviews();
            if (entry.images && entry.images.length > 0) {
                pendingImages = entry.images.slice(); // 复制数组
                renderImagePreviews();
            }

            // 设置编辑模式
            editingId = id;
            var titleEl = document.querySelector('.modal-title');
            titleEl.innerHTML = '<svg class="title-icon"><use href="#icon-edit"></use></svg><span>编辑日记</span>';

            // 打开弹窗
            dom.writeModal.classList.add('active');

            showToast('进入编辑模式');
        } catch (error) {
            console.error('编辑失败:', error);
            showToast('编辑失败', 'error');
        }
    }

    /**
     * 删除日记
     */
    async function deleteEntry(id) {
        if (!confirm('确定要删除这篇日记吗？')) {
            return;
        }

        try {
            await window.db.delete(id);
            showToast('日记已删除');
            await loadEntries();
        } catch (error) {
            console.error('删除失败:', error);
            showToast('删除失败', 'error');
        }
    }

    /**
     * 切换置顶状态
     */
    async function togglePinEntry(id, card) {
        try {
            var isPinned = !card.classList.contains('pinned');
            await window.db.togglePin(id, isPinned);
            showToast(isPinned ? '日记已置顶' : '已取消置顶');
            await loadEntries();
        } catch (error) {
            console.error('置顶失败:', error);
            showToast('操作失败', 'error');
        }
    }

    /**
     * 按日期筛选
     */
    function filterByDate(date) {
        if (!date) {
            renderEntries(allEntries);
            dom.contentTitle.innerHTML = '<svg class="title-icon"><use href="#icon-book-open"></use></svg><span>我的日记</span>';
            return;
        }

        var filtered = allEntries.filter(function(entry) {
            return entry.dateKey === date;
        });

        renderEntries(filtered);

        // 更新标题
        var dateObj = new Date(date + 'T12:00:00');
        if (isNaN(dateObj.getTime())) {
            dom.contentTitle.innerHTML = '<svg class="title-icon"><use href="#icon-calendar"></use></svg><span>已选日期的日记</span>';
            return;
        }
        var dateStr = dateObj.toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric'
        });
        dom.contentTitle.innerHTML = '<svg class="title-icon"><use href="#icon-calendar"></use></svg><span>' + dateStr + ' 的日记</span>';
    }

    /**
     * 搜索
     */
    function handleSearch(keyword) {
        if (!keyword.trim()) {
            var selectedDate = window.calendar ? window.calendar.getSelectedDate() : null;
            if (selectedDate) {
                filterByDate(selectedDate);
            } else {
                renderEntries(allEntries);
            }
            dom.contentTitle.innerHTML = '<svg class="title-icon"><use href="#icon-book-open"></use></svg><span>我的日记</span>';
            return;
        }

        var lowerKeyword = keyword.toLowerCase();
        var filtered = allEntries.filter(function(entry) {
            var title = (entry.title || '').toLowerCase();
            var content = (entry.content || '').toLowerCase();
            return title.indexOf(lowerKeyword) !== -1 ||
                   content.indexOf(lowerKeyword) !== -1;
        });

        renderEntries(filtered);
        dom.contentTitle.innerHTML = '<svg class="title-icon"><use href="#icon-search"></use></svg><span>"' + escapeHtml(keyword) + '" 的搜索结果</span>';
    }

    /**
     * 导出数据
     */
    async function handleExport() {
        try {
            var data = await window.db.export();
            var json = JSON.stringify(data, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);

            var a = document.createElement('a');
            a.href = url;
            a.download = 'diary-backup-' + new Date().toISOString().split('T')[0] + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);

            // 更新上次备份时间
            var settings = getSettings();
            settings.lastBackup = new Date().toISOString();
            saveSettings(settings);

            showToast('导出成功');
        } catch (error) {
            console.error('导出失败:', error);
            showToast('导出失败', 'error');
        }
    }

    /**
     * 导入数据
     */
    async function handleImport() {
        var fileInput = document.getElementById('importFile');
        var merge = document.getElementById('mergeImport').checked;

        if (!fileInput.files || fileInput.files.length === 0) {
            showToast('请选择文件', 'error');
            return;
        }

        var file = fileInput.files[0];

        try {
            var text = await readFileText(file);
            var data = JSON.parse(text);

            if (!window.db.importData) {
                throw new Error('导入功能未初始化');
            }

            var count = await window.db.importData(data, merge);
            showToast('成功导入 ' + count + ' 篇日记');

            closeImportModal();
            await loadEntries();
        } catch (error) {
            console.error('导入失败:', error);
            showToast('导入失败: ' + error.message, 'error');
        }
    }

    /**
     * 读取文件文本（兼容性封装）
     */
    function readFileText(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                resolve(e.target.result);
            };
            reader.onerror = function(e) {
                reject(new Error('读取文件失败'));
            };
            reader.readAsText(file);
        });
    }

    /**
     * HTML转义（使用字符替换，比创建 DOM 元素更高效）
     */
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 显示提示消息
     */
    function showToast(message, type) {
        type = type || 'success';
        var toast = dom.toast;
        toast.textContent = message;
        toast.className = 'toast ' + type + ' show';

        setTimeout(function() {
            toast.classList.remove('show');
        }, 3000);
    }

    // ==================== 设置功能 ====================

    var SETTINGS_KEY = 'diary_settings';
    var defaultSettings = {
        enableReminder: true,
        reminderInterval: 7,
        lastBackup: null
    };

    /**
     * 获取设置
     */
    function getSettings() {
        try {
            var saved = localStorage.getItem(SETTINGS_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('读取设置失败:', e);
        }
        return defaultSettings;
    }

    /**
     * 保存设置
     */
    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('保存设置失败:', e);
        }
    }

    /**
     * 绑定设置事件
     */
    function bindSettingsEvents() {
        // 打开设置
        document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);

        // 关闭设置
        document.getElementById('closeSettingsModal').addEventListener('click', closeSettingsModal);
        document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);

        // 保存设置
        document.getElementById('saveSettingsBtn').addEventListener('click', handleSaveSettings);

        // 清空数据
        document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
    }

    /**
     * 打开设置弹窗
     */
    function openSettingsModal() {
        var settings = getSettings();

        // 填充当前设置
        document.getElementById('enableReminder').checked = settings.enableReminder;
        document.getElementById('reminderInterval').value = settings.reminderInterval;

        // 显示上次备份时间
        var lastBackupText = '从未备份';
        if (settings.lastBackup) {
            var date = new Date(settings.lastBackup);
            lastBackupText = date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        document.getElementById('lastBackupInfo').textContent = '上次备份：' + lastBackupText;

        // 显示统计信息
        document.getElementById('statsEntryCount').textContent = allEntries.length + ' 篇';

        // 估算存储大小
        try {
            var dataStr = JSON.stringify(allEntries);
            var sizeKB = Math.round(dataStr.length / 1024);
            document.getElementById('statsStorageSize').textContent = sizeKB + ' KB';
        } catch (e) {
            document.getElementById('statsStorageSize').textContent = '计算失败';
        }

        dom.settingsModal.classList.add('active');
    }

    /**
     * 关闭设置弹窗
     */
    function closeSettingsModal() {
        dom.settingsModal.classList.remove('active');
    }

    /**
     * 保存设置
     */
    function handleSaveSettings() {
        var settings = {
            enableReminder: document.getElementById('enableReminder').checked,
            reminderInterval: parseInt(document.getElementById('reminderInterval').value),
            lastBackup: getSettings().lastBackup
        };

        saveSettings(settings);
        showToast('设置已保存');
        closeSettingsModal();
    }

    /**
     * 清空所有数据
     */
    async function handleClearAll() {
        if (!confirm('警告：此操作将删除所有日记数据，且无法恢复！\n\n建议先导出备份。\n\n确定要清空所有数据吗？')) {
            return;
        }

        if (!confirm('再次确认：确定要删除所有日记吗？')) {
            return;
        }

        try {
            // 清空数据库
            allEntries = [];
            await window.db.importData({ entries: [] }, false);

            // 清空设置
            localStorage.removeItem(SETTINGS_KEY);

            showToast('所有数据已清空');
            closeSettingsModal();
            await loadEntries();
        } catch (error) {
            console.error('清空失败:', error);
            showToast('清空失败', 'error');
        }
    }

    /**
     * 检查是否需要备份提醒
     */
    function checkBackupReminder() {
        var settings = getSettings();

        if (!settings.enableReminder) return;

        var lastBackup = settings.lastBackup;
        var interval = settings.reminderInterval * 24 * 60 * 60 * 1000; // 转换为毫秒

        var shouldRemind = false;

        if (!lastBackup) {
            // 从未备份
            shouldRemind = true;
        } else {
            var daysSinceBackup = new Date() - new Date(lastBackup);
            if (daysSinceBackup >= interval) {
                shouldRemind = true;
            }
        }

        if (shouldRemind) {
            showBackupReminder();
        }
    }

    /**
     * 显示备份提醒
     */
    function showBackupReminder() {
        // 创建提醒弹窗
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '2500';

        var reminder = document.createElement('div');
        reminder.className = 'backup-reminder';
        reminder.innerHTML =
            '<div class="backup-reminder-icon">' +
                '<svg class="icon-large"><use href="#icon-save"></use></svg>' +
            '</div>' +
            '<div class="backup-reminder-title">备份提醒</div>' +
            '<div class="backup-reminder-text">您已经很久没有备份日记数据了。定期备份可以防止数据丢失。</div>' +
            '<div class="backup-reminder-actions">' +
                '<button class="btn-secondary" id="reminderLater">稍后再说</button>' +
                '<button class="btn-primary" id="reminderBackup">立即备份</button>' +
            '</div>';

        overlay.appendChild(reminder);
        document.body.appendChild(overlay);
        overlay.classList.add('active');

        // 稍后再说
        document.getElementById('reminderLater').addEventListener('click', function() {
            document.body.removeChild(overlay);
        });

        // 立即备份
        document.getElementById('reminderBackup').addEventListener('click', async function() {
            document.body.removeChild(overlay);
            await handleExport();

            // 更新上次备份时间
            var settings = getSettings();
            settings.lastBackup = new Date().toISOString();
            saveSettings(settings);
        });
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    // 检查备份提醒（延迟3秒，等待应用初始化完成）
    setTimeout(function() {
        checkBackupReminder();
    }, 3000);

    // ==================== 日记注入功能 ====================
    // 供外部工具或控制台调用，将日记写入当前应用的存储中
    window.injectTodayDiary = async function() {
        var todayKey = '2026-05-21';

        // 检查今天是否已有工作日记
        var entries = await window.db.getAll();
        var hasToday = entries.some(function(e) {
            return e.dateKey === todayKey && e.title.indexOf('工作日记') !== -1;
        });

        if (hasToday) {
            console.log('[injectTodayDiary] 今天已有工作日记，跳过注入');
            return { success: false, reason: 'already_exists' };
        }

        var diaryContent = '今天是充实的一天，主要推进了三个项目的工作。\n\n一、diary-app 性能优化与 UI/UX 升级\n\n上午对日记应用进行了全面的性能优化和视觉升级。修复了初始化顺序问题，解决了之前可能存在的内存泄漏。日历组件的事件监听器从 42 个减少到 1 个，使用事件委托大幅提升了性能。搜索功能添加了 300ms 防抖，避免频繁触发重排。数据库排序增加了时间戳缓存，减少重复创建 Date 对象的开销。\n\n视觉方面，全面替换了 Emoji 为统一的 SVG 图标（共 14 个），应用了温暖极简主义设计系统：奶油色背景、柔和靛蓝主色调、语义化 CSS 令牌、优化后的动画和按钮反馈效果。PWA 主题色和 Service Worker 缓存版本也同步更新到 v2。\n\n这次改动的文件包括 css/style.css、index.html、js/app.js、js/calendar.js、js/db.js、manifest.json 和 service-worker.js，总共修改了约 1180 行代码。\n\n二、wechat-auto-publisher 系统设计\n\n下午花了大量时间设计公众号自动文章生产线的完整架构。这是一个多 Agent 协作系统，覆盖从热点获取到文章发布的全流程。\n\n核心设计包括：\n- 6 个核心 Agent：热点获取、文章撰写（支持 create/revise 双模式）、文章审核、排版设计、排版审核、封面生成与审核\n- 状态机管理：13 种状态，覆盖从 IDLE 到 COMPLETED 的完整流程\n- 循环优化机制：撰写-审核循环、排版-审核循环、封面-审核循环，质量不达标自动修改\n- CLI 接口：支持 --once、--dry-run、--agent-test 等参数\n- LLMClient 抽象层：统一封装不同大模型提供商，预留多模型路由扩展\n\n还编写了详细的状态管理器设计，支持原子写入、损坏恢复和状态转换追踪。整个设计文档超过 1500 行，为后续开发打下了坚实基础。\n\n三、invest-data-web A股数据接入（阶段二完成）\n\n今天完成了投资数据平台的第二阶段开发。安装了 pandas、aiohttp、apscheduler 和 @tanstack/react-table 等依赖。封装了东方财富 API 用于获取 A 股实时数据，虽然沙箱环境网络受限，但代码结构和重试机制都已就绪。\n\n后端完成了 SQLAlchemy 股票模型（15+ 字段）、SQLite 数据库配置、股票 API 路由（列表、股息率排行、行业筛选、搜索、统计）和 APScheduler 定时任务（每 5 分钟自动刷新）。前端使用 TanStack Table 实现了专业的股票数据表格，支持排序、分页和行业筛选。\n\n插入了 10 只测试股票数据（平安银行、万科 A、美的集团等）用于功能演示。\n\n总结：\n\n今天横跨前端性能优化、系统架构设计和全栈数据接入三个不同领域，产出非常丰富。diary-app 的 UI 焕然一新，wechat-auto-publisher 的架构设计清晰完整，invest-data-web 阶段二顺利收官。接下来 invest-data-web 将进入阶段三——港股数据接入。';

        var entry = {
            title: '2026-05-21 工作日记',
            content: diaryContent,
            isPinned: true,
            dateKey: todayKey,
            createdAt: '2026-05-21T21:00:00.000Z'
        };

        try {
            var id = await window.db.save(entry);
            await loadEntries();
            console.log('[injectTodayDiary] 日记注入成功，ID:', id);
            showToast('今日工作日记已注入');
            return { success: true, id: id };
        } catch (e) {
            console.error('[injectTodayDiary] 注入失败:', e);
            showToast('注入失败: ' + e.message, 'error');
            return { success: false, error: e.message };
        }
    };

    console.log('app.js 加载完成');
})();
