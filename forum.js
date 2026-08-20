/* ============================================================
   收藏论坛 · Supabase 驱动
   ============================================================ */
(() => {
    'use strict';

    const NICKNAME_KEY = 'forum_nickname';
    const CATEGORY_NAMES = {
        general: '闲聊',
        share: '晒收藏',
        help: '求鉴定',
        trade: '交流',
        other: '其他'
    };

    const state = {
        supabase: null,
        ready: false,
        currentCategory: 'all',
        currentTopicId: null,
        topicImages: [],   // {file, dataUrl, preview}
        replyImages: []
    };

    /* ---------- 图片处理（压缩 + 上传 Supabase Storage） ---------- */

    const MAX_IMAGES_TOPIC = 6;
    const MAX_IMAGES_REPLY = 4;
    const MAX_RAW_FILE = 15 * 1024 * 1024;   // 15 MB raw cap
    const MAX_EDGE = 1600;                    // downscale long edge (px)
    const JPEG_QUALITY = 0.82;
    const MAX_GIF_KEEP = 3 * 1024 * 1024;

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('无法解析该图片'));
            img.src = src;
        });
    }

    /** 压缩图片为 dataURL（GIF 小文件原样保留动画）。 */
    async function processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('请选择图片文件（JPG / PNG / WebP / GIF）', true);
            return null;
        }
        if (file.size > MAX_RAW_FILE) {
            showToast('图片过大（超过 15 MB）', true);
            return null;
        }
        if (file.type === 'image/gif' && file.size <= MAX_GIF_KEEP) {
            return await readFileAsDataURL(file);
        }
        const raw = await readFileAsDataURL(file);
        const img = await loadImage(raw);
        const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        return canvas.toDataURL(format, JPEG_QUALITY);
    }

    function dataUrlToBlob(dataUrl) {
        const [meta, b64] = dataUrl.split(',');
        const mime = (meta.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    /** 把暂存图片上传到 Supabase Storage，返回公开 URL 数组。 */
    async function uploadImages(list) {
        const urls = [];
        for (const item of list) {
            const ext = (item.file.type === 'image/png') ? 'png'
                : (item.file.type === 'image/gif') ? 'gif' : 'jpg';
            const name = Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.' + ext;
            const blob = dataUrlToBlob(item.dataUrl);
            const { error } = await state.supabase.storage
                .from('forum-images')
                .upload('forum/' + name, blob, {
                    contentType: blob.type,
                    cacheControl: '3600',
                    upsert: false
                });
            if (error) throw error;
            const { data: pub } = state.supabase.storage
                .from('forum-images')
                .getPublicUrl('forum/' + name);
            urls.push(pub.publicUrl);
        }
        return urls;
    }

    /** 图片选择（多选）+ 预览渲染。 */
    function bindImagePicker(inputId, zoneId, previewId, placeholderId, stateKey, maxCount) {
        const input = $(inputId);
        const zone = $(zoneId);
        const preview = $(previewId);
        const placeholder = $(placeholderId);

        function renderPreviews() {
            const list = state[stateKey];
            preview.innerHTML = list.map((item, i) =>
                '<div class="image-preview-item" data-index="' + i + '">' +
                    '<img src="' + item.dataUrl + '" alt="预览图">' +
                    '<button type="button" class="image-preview-remove" data-index="' + i + '" aria-label="移除图片">✕</button>' +
                '</div>'
            ).join('');
            placeholder.hidden = list.length > 0;
            zone.classList.toggle('has-images', list.length > 0);
        }

        zone.addEventListener('click', (e) => {
            const rm = e.target.closest('.image-preview-remove');
            if (rm) {
                e.stopPropagation();
                const idx = Number(rm.dataset.index);
                state[stateKey].splice(idx, 1);
                renderPreviews();
                return;
            }
            if (!e.target.closest('.image-preview-item')) input.click();
        });
        zone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            input.value = '';
            for (const file of files) {
                if (state[stateKey].length >= maxCount) {
                    showToast('最多 ' + maxCount + ' 张图片', true);
                    break;
                }
                try {
                    const dataUrl = await processImageFile(file);
                    if (dataUrl) state[stateKey].push({ file, dataUrl });
                } catch (err) {
                    showToast(err.message || '图片处理失败', true);
                }
            }
            renderPreviews();
        });
        // drag & drop
        ['dragover', 'dragenter'].forEach((evt) =>
            zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('dragover'); })
        );
        ['dragleave', 'drop'].forEach((evt) =>
            zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('dragover'); })
        );
        zone.addEventListener('drop', async (e) => {
            const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
            for (const file of files) {
                if (state[stateKey].length >= maxCount) { showToast('最多 ' + maxCount + ' 张图片', true); break; }
                try {
                    const dataUrl = await processImageFile(file);
                    if (dataUrl) state[stateKey].push({ file, dataUrl });
                } catch (err) { showToast(err.message || '图片处理失败', true); }
            }
            renderPreviews();
        });

        return renderPreviews;
    }

    /* ---------- 工具 ---------- */

    const $ = (id) => document.getElementById(id);

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function getCategoryName(cat) {
        return CATEGORY_NAMES[cat] || '其他';
    }

    function formatDateTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return (
            d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
        );
    }

    function getNickname() {
        return localStorage.getItem(NICKNAME_KEY) || '';
    }

    function setNickname(value) {
        localStorage.setItem(NICKNAME_KEY, value.trim());
    }

    let toastTimer = null;
    function showToast(message, isError = false) {
        const toast = $('toast');
        toast.textContent = message;
        toast.classList.toggle('error', isError);
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
    }

    function showView(name) {
        $('viewList').hidden = name !== 'list';
        $('viewNew').hidden = name !== 'new';
        $('viewTopic').hidden = name !== 'topic';
    }

    function setLoading(el, text) {
        el.innerHTML = '<div class="loading-hint">' + escapeHtml(text || '加载中…') + '</div>';
    }

    /* ---------- 初始化 ---------- */

    function initSupabase() {
        const cfg = window.SUPABASE_CONFIG || {};
        const url = (cfg.url || '').trim();
        const key = (cfg.anonKey || '').trim();
        const configured =
            url && key &&
            !url.startsWith('YOUR_') && !key.startsWith('YOUR_');

        if (!configured) {
            $('configBanner').hidden = false;
            $('newTopicBtn').disabled = true;
            setLoading($('topicList'), '⚠️ 论坛尚未启用：请先在 config.js 中配置 Supabase。');
            return;
        }

        state.supabase = window.supabase.createClient(url, key);
        state.ready = true;
    }

    
    /** 图片画廊 HTML（点击新窗口查看原图）。 */
    function renderImageGallery(images) {
        if (!images || images.length === 0) return '';
        return '<div class="image-gallery">' +
            images.slice(0, 9).map((u, i) =>
                '<a class="image-gallery-item" href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer">' +
                    '<img src="' + escapeHtml(u) + '" alt="图片 ' + (i + 1) + '" loading="lazy" onerror="this.hidden=true">' +
                '</a>'
            ).join('') +
            (images.length > 9 ? '<span class="image-gallery-more">+' + (images.length - 9) + '</span>' : '') +
        '</div>';
    }

    /* ---------- 帖子列表 ---------- */

    async function loadTopics() {
        const list = $('topicList');
        if (!state.ready) return;
        setLoading(list, '加载中…');

        try {
            const { data, error } = await state.supabase
                .from('forum_topics')
                .select('id, title, category, nickname, created_at, forum_replies(count)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;

            if (!data || data.length === 0) {
                list.innerHTML =
                    '<div class="empty-topic"><span class="empty-icon">💬</span>还没有帖子，快来发第一帖吧！</div>';
                return;
            }

            const category = state.currentCategory;
            const items = data.filter(
                (t) => category === 'all' || t.category === category
            );

            if (items.length === 0) {
                list.innerHTML =
                    '<div class="empty-topic"><span class="empty-icon">🗂️</span>该分类下暂无帖子</div>';
                return;
            }

            list.innerHTML = items.map((t) => {
                const count = (t.forum_replies && t.forum_replies[0] && t.forum_replies[0].count) || 0;
                return (
                    '<button type="button" class="topic-card" data-topic-id="' + escapeHtml(t.id) + '">' +
                        '<div class="topic-card-head">' +
                            '<span class="card-category cat-' + escapeHtml(t.category) + '">' + getCategoryName(t.category) + '</span>' +
                            '<span class="topic-title">' + escapeHtml(t.title) + '</span>' +
                        '</div>' +
                        '<div class="topic-card-meta">' +
                            '<span>👤 ' + escapeHtml(t.nickname) + '</span>' +
                            '<span class="dot">·</span>' +
                            '<span>🕒 ' + formatDateTime(t.created_at) + '</span>' +
                            '<span class="dot">·</span>' +
                            '<span>💬 ' + count + ' 回复</span>' +
                        '</div>' +
                    '</button>'
                );
            }).join('');
        } catch (err) {
            console.error('loadTopics failed:', err);
            list.innerHTML =
                '<div class="empty-topic"><span class="empty-icon">⚠️</span>加载失败：' +
                escapeHtml(err.message || '网络错误') + '</div>';
        }
    }

    /* ---------- 发帖 ---------- */

    async function submitTopic(e) {
        e.preventDefault();
        if (!state.ready) {
            showToast('请先配置 Supabase', true);
            return;
        }
        const nickname = $('topicNickname').value.trim();
        const category = $('topicCategory').value;
        const title = $('topicTitle').value.trim();
        const content = $('topicContent').value.trim();

        if (!nickname || !title || !content) {
            showToast('请完整填写昵称、标题和内容', true);
            return;
        }

        const btn = $('topicSubmitBtn');
        btn.disabled = true;
        btn.textContent = '上传中…';
        try {
            let images = [];
            if (state.topicImages.length > 0) {
                images = await uploadImages(state.topicImages);
            }
            const { data, error } = await state.supabase
                .from('forum_topics')
                .insert({ nickname, category, title, content, images })
                .select('id')
                .single();
            if (error) throw error;

            setNickname(nickname);
            showToast('发布成功 🎉');
            e.target.reset();
            state.topicImages = [];
            renderTopicImagePreviews();
            showView('list');
            await loadTopics();
        } catch (err) {
            console.error('submitTopic failed:', err);
            showToast('发布失败：' + (err.message || '未知错误'), true);
        } finally {
            btn.disabled = false;
            btn.textContent = '发布';
        }
    }

    /* ---------- 帖子详情 + 回复 ---------- */

    async function openTopic(id) {
        if (!state.ready) return;
        state.currentTopicId = id;
        showView('topic');

        const detail = $('topicDetail');
        const replies = $('replyList');
        setLoading(detail, '加载中…');
        setLoading(replies, '加载中…');
        $('replyCount').textContent = '0';

        try {
            const { data: topic, error: topicErr } = await state.supabase
                .from('forum_topics')
                .select('*')
                .eq('id', id)
                .single();
            if (topicErr) throw topicErr;

            const { data: replyData, error: replyErr } = await state.supabase
                .from('forum_replies')
                .select('*')
                .eq('topic_id', id)
                .order('created_at', { ascending: true });
            if (replyErr) throw replyErr;

            const topicImages = Array.isArray(topic.images) ? topic.images : [];
            detail.innerHTML =
                '<h2>' + escapeHtml(topic.title) + '</h2>' +
                '<div class="topic-meta">' +
                    '<span class="card-category cat-' + escapeHtml(topic.category) + '">' + getCategoryName(topic.category) + '</span>' +
                    '<span>👤 ' + escapeHtml(topic.nickname) + '</span>' +
                    '<span>🕒 ' + formatDateTime(topic.created_at) + '</span>' +
                '</div>' +
                '<div class="topic-body">' + escapeHtml(topic.content) + '</div>' +
                renderImageGallery(topicImages);

            const list = replyData || [];
            $('replyCount').textContent = String(list.length);

            if (list.length === 0) {
                replies.innerHTML = '<div class="empty-topic"><span class="empty-icon">🫧</span>暂无回复，抢个沙发！</div>';
            } else {
                replies.innerHTML = list.map((r) => {
                    const rImages = Array.isArray(r.images) ? r.images : [];
                    return '<div class="reply-item">' +
                        '<div class="reply-meta">' +
                            '<span class="reply-nickname">👤 ' + escapeHtml(r.nickname) + '</span>' +
                            '<span>🕒 ' + formatDateTime(r.created_at) + '</span>' +
                        '</div>' +
                        '<div class="reply-content">' + escapeHtml(r.content) + '</div>' +
                        renderImageGallery(rImages) +
                    '</div>';
                }).join('');
            }

            // 预填昵称
            const nick = getNickname();
            if (nick) $('replyNickname').value = nick;
        } catch (err) {
            console.error('openTopic failed:', err);
            detail.innerHTML =
                '<div class="empty-topic"><span class="empty-icon">⚠️</span>加载失败：' +
                escapeHtml(err.message || '网络错误') + '</div>';
            replies.innerHTML = '';
        }
    }

    async function submitReply(e) {
        e.preventDefault();
        if (!state.ready || !state.currentTopicId) return;
        const nickname = $('replyNickname').value.trim();
        const content = $('replyContent').value.trim();
        if (!nickname || !content) {
            showToast('请填写昵称和回复内容', true);
            return;
        }

        const btn = $('replySubmitBtn');
        btn.disabled = true;
        btn.textContent = '上传中…';
        try {
            let images = [];
            if (state.replyImages.length > 0) {
                images = await uploadImages(state.replyImages);
            }
            const { error } = await state.supabase
                .from('forum_replies')
                .insert({ topic_id: state.currentTopicId, nickname, content, images });
            if (error) throw error;

            setNickname(nickname);
            showToast('回复成功 🎉');
            e.target.reset();
            state.replyImages = [];
            renderReplyImagePreviews();
            await openTopic(state.currentTopicId);
        } catch (err) {
            console.error('submitReply failed:', err);
            showToast('回复失败：' + (err.message || '未知错误'), true);
        } finally {
            btn.disabled = false;
            btn.textContent = '回复';
        }
    }

    /* ---------- 事件绑定 ---------- */

    function bindEvents() {
        // 分类筛选
        document.querySelectorAll('#categoryFilters .filter-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#categoryFilters .filter-btn').forEach((b) => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                state.currentCategory = btn.dataset.category;
                loadTopics();
            });
        });

        // 发新帖 / 返回
        $('newTopicBtn').addEventListener('click', () => {
            const nick = getNickname();
            if (nick) $('topicNickname').value = nick;
            showView('new');
            $('topicTitle').focus();
        });
        $('backFromNew').addEventListener('click', () => {
            showView('list');
            loadTopics();
        });

        // 帖子列表点击
        $('topicList').addEventListener('click', (e) => {
            const card = e.target.closest('.topic-card');
            if (card) openTopic(card.dataset.topicId);
        });

        // 帖子详情返回
        $('backFromTopic').addEventListener('click', () => {
            state.currentTopicId = null;
            showView('list');
            loadTopics();
        });

        // 表单提交
        $('topicForm').addEventListener('submit', submitTopic);
        $('replyForm').addEventListener('submit', submitReply);
    }

    /* ---------- 启动 ---------- */

    // 图片选择器（绑定后返回渲染函数供表单重置时调用）
    const renderTopicImagePreviews = bindImagePicker(
        'topicImages', 'topicImageZone', 'topicImagePreview', 'topicImagePlaceholder', 'topicImages', MAX_IMAGES_TOPIC
    );
    const renderReplyImagePreviews = bindImagePicker(
        'replyImages', 'replyImageZone', 'replyImagePreview', 'replyImagePlaceholder', 'replyImages', MAX_IMAGES_REPLY
    );

    document.addEventListener('DOMContentLoaded', () => {
        initSupabase();
        bindEvents();
        if (state.ready) loadTopics();
    });
})();