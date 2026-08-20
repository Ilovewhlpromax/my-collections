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
        currentTopicId: null
    };

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

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const { data, error } = await state.supabase
                .from('forum_topics')
                .insert({ nickname, category, title, content })
                .select('id')
                .single();
            if (error) throw error;

            setNickname(nickname);
            showToast('发布成功 🎉');
            e.target.reset();
            showView('list');
            await loadTopics();
        } catch (err) {
            console.error('submitTopic failed:', err);
            showToast('发布失败：' + (err.message || '未知错误'), true);
        } finally {
            btn.disabled = false;
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

            detail.innerHTML =
                '<h2>' + escapeHtml(topic.title) + '</h2>' +
                '<div class="topic-meta">' +
                    '<span class="card-category cat-' + escapeHtml(topic.category) + '">' + getCategoryName(topic.category) + '</span>' +
                    '<span>👤 ' + escapeHtml(topic.nickname) + '</span>' +
                    '<span>🕒 ' + formatDateTime(topic.created_at) + '</span>' +
                '</div>' +
                '<div class="topic-body">' + escapeHtml(topic.content) + '</div>';

            const list = replyData || [];
            $('replyCount').textContent = String(list.length);

            if (list.length === 0) {
                replies.innerHTML = '<div class="empty-topic"><span class="empty-icon">🫧</span>暂无回复，抢个沙发！</div>';
            } else {
                replies.innerHTML = list.map((r) =>
                    '<div class="reply-item">' +
                        '<div class="reply-meta">' +
                            '<span class="reply-nickname">👤 ' + escapeHtml(r.nickname) + '</span>' +
                            '<span>🕒 ' + formatDateTime(r.created_at) + '</span>' +
                        '</div>' +
                        '<div class="reply-content">' + escapeHtml(r.content) + '</div>' +
                    '</div>'
                ).join('');
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

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const { error } = await state.supabase
                .from('forum_replies')
                .insert({ topic_id: state.currentTopicId, nickname, content });
            if (error) throw error;

            setNickname(nickname);
            showToast('回复成功 🎉');
            e.target.reset();
            await openTopic(state.currentTopicId);
        } catch (err) {
            console.error('submitReply failed:', err);
            showToast('回复失败：' + (err.message || '未知错误'), true);
        } finally {
            btn.disabled = false;
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

    document.addEventListener('DOMContentLoaded', () => {
        initSupabase();
        bindEvents();
        if (state.ready) loadTopics();
    });
})();
