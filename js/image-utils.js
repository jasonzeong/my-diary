/**
 * 图片处理工具
 * 负责图片压缩和 Base64 转换
 */

(function() {
    'use strict';

    // 最大图片尺寸
    const MAX_WIDTH = 1200;
    const MAX_HEIGHT = 1200;
    // 图片质量
    const JPEG_QUALITY = 0.8;
    // 最大文件大小（MB）
    const MAX_FILE_SIZE = 5;

    /**
     * 压缩图片
     * @param {File} file - 图片文件
     * @returns {Promise<string>} Base64 字符串
     */
    async function compressImage(file) {
        return new Promise(function(resolve, reject) {
            // 检查文件类型
            if (!file.type.startsWith('image/')) {
                reject(new Error('请选择图片文件'));
                return;
            }

            // 检查文件大小
            if (file.size > MAX_FILE_SIZE * 1024 * 1024) {
                reject(new Error('图片大小不能超过 ' + MAX_FILE_SIZE + 'MB'));
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    // 计算压缩后的尺寸
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    // 创建 Canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    // 转换为 Base64
                    const base64 = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
                    resolve(base64);
                };
                img.onerror = function() {
                    reject(new Error('图片加载失败'));
                };
                img.src = e.target.result;
            };
            reader.onerror = function() {
                reject(new Error('文件读取失败'));
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * 处理多个图片文件
     * @param {FileList} files - 文件列表
     * @param {number} maxCount - 最大数量
     * @returns {Promise<Array>} Base64 数组
     */
    async function processImages(files, maxCount) {
        maxCount = maxCount || 5;

        if (files.length > maxCount) {
            throw new Error('最多只能上传 ' + maxCount + ' 张图片');
        }

        const promises = [];
        for (let i = 0; i < files.length; i++) {
            promises.push(compressImage(files[i]));
        }

        return Promise.all(promises);
    }

    // 导出
    window.imageUtils = {
        compress: compressImage,
        process: processImages,
        MAX_COUNT: 5
    };

    console.log('image-utils.js 加载完成');
})();
