const COLLECTIONS_KEY = 'my_collections';
const CATEGORY_NAMES = {
    art: '艺术品',
    book: '书籍',
    travel: '旅行',
    music: '音乐',
    other: '其他'
};

const state = {
    editingId: null
};

/* ---------- helpers ---------- */

function getCollections() {
    try {
        const data = localStorage.getItem(COLLECTIONS_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveCollections(collections) {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}

/** Escape user content before injecting into innerHTML (XSS guard). */
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getCategoryName(category) {
    return CATEGORY_NAMES[category] || '其他';
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getActiveCategory() {
    const activeBtn = document.querySelector('.filter-btn.active');
    return activeBtn ? activeBtn.dataset.category : 'all';
}

function getSearchQuery() {
    return document.getElementById('searchInput').value.trim().toLowerCase();
}

/** Filter by category + search query (name/description). */
function filterCollections(collections) {
    const category = getActiveCategory();
    const query = getSearchQuery();
    return collections.filter((item) => {
        const inCategory = category === 'all' || item.category === category;
        if (!inCategory) return false;
        if (!query) return true;
        return (
            String(item.name || '').toLowerCase().includes(query) ||
            String(item.description || '').toLowerCase().includes(query)
        );
    });
}

function updateStats(collections) {
    const el = document.getElementById('statCount');
    el.textContent = `共 ${collections.length} 件收藏`;
}

/* ---------- rendering ---------- */

function renderCollections() {
    const collections = getCollections();
    const grid = document.getElementById('collectionGrid');
    const emptyState = document.getElementById('emptyState');
    const emptyTitle = document.getElementById('emptyTitle');
    const emptyText = document.getElementById('emptyText');

    updateStats(collections);

    const filtered = filterCollections(collections);

    if (filtered.length === 0) {
        grid.hidden = true;
        emptyState.hidden = false;
        if (collections.length === 0) {
            emptyTitle.textContent = '暂无收藏';
            emptyText.textContent = '添加您的第一个收藏吧！';
        } else {
            emptyTitle.textContent = '没有匹配的收藏';
            emptyText.textContent = '试试更换筛选分类或搜索关键词';
        }
        return;
    }

    grid.hidden = false;
    emptyState.hidden = true;

    grid.innerHTML = filtered
        .map((item) => {
            const safeName = escapeHtml(item.name);
            const safeDesc = escapeHtml(item.description || '暂无描述');
            const safeImage = escapeHtml(item.image);
            const imgBlock = safeImage
                ? `<img src="${safeImage}" alt="${safeName}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'img-fallback',textContent:'🖼️'}))">`
                : '<div class="img-fallback">🖼️</div>';
            return `
            <article class="collection-card" data-id="${escapeHtml(item.id)}">
                <div class="card-image">${imgBlock}</div>
                <div class="card-content">
                    <div class="card-meta">
                        <span class="card-category cat-${escapeHtml(item.category)}">${getCategoryName(item.category)}</span>
                        ${item.createdAt ? `<span class="card-date">${formatDate(item.createdAt)}</span>` : ''}
                    </div>
                    <h3 class="card-title">${safeName}</h3>
                    <p class="card-description">${safeDesc}</p>
                    <div class="card-actions">
                        <button class="btn-edit" data-action="edit" data-id="${escapeHtml(item.id)}">编辑</button>
                        <button class="btn-delete" data-action="delete" data-id="${escapeHtml(item.id)}">删除</button>
                    </div>
                </div>
            </article>`;
        })
        .join('');
}

/* ---------- actions ---------- */

function handleDelete(id) {
    if (!confirm('确定要删除这个收藏吗？')) return;
    const collections = getCollections();
    saveCollections(collections.filter((item) => item.id !== id));
    if (state.editingId === id) cancelEdit();
    renderCollections();
}

function startEdit(id) {
    const item = getCollections().find((c) => c.id === id);
    if (!item) return;

    state.editingId = id;
    document.getElementById('name').value = item.name || '';
    document.getElementById('description').value = item.description || '';
    document.getElementById('image').value = item.image || '';
    document.getElementById('category').value = item.category || 'other';
    document.getElementById('formTitle').textContent = '编辑收藏';
    document.getElementById('submitBtn').textContent = '保存修改';
    document.getElementById('cancelEdit').hidden = false;
    document.getElementById('addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('name').focus();
}

function cancelEdit() {
    state.editingId = null;
    document.getElementById('addForm').reset();
    document.getElementById('formTitle').textContent = '添加新收藏';
    document.getElementById('submitBtn').textContent = '添加收藏';
    document.getElementById('cancelEdit').hidden = true;
}

/* ---------- events ---------- */

document.addEventListener('DOMContentLoaded', () => {
    renderCollections();

    const form = document.getElementById('addForm');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const newCollection = {
            id: state.editingId || Date.now().toString(),
            name: document.getElementById('name').value.trim(),
            description: document.getElementById('description').value.trim(),
            image: document.getElementById('image').value.trim(),
            category: document.getElementById('category').value,
            createdAt: new Date().toISOString()
        };

        const collections = getCollections();
        if (state.editingId) {
            const idx = collections.findIndex((c) => c.id === state.editingId);
            if (idx !== -1) {
                collections[idx] = { ...collections[idx], ...newCollection };
            }
        } else {
            collections.unshift(newCollection);
        }

        saveCollections(collections);
        cancelEdit();
        renderCollections();
    });

    document.getElementById('cancelEdit').addEventListener('click', cancelEdit);

    document.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach((b) => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            renderCollections();
        });
    });

    document.getElementById('searchInput').addEventListener('input', renderCollections);

    // Event delegation for card buttons (edit / delete)
    document.getElementById('collectionGrid').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'delete') handleDelete(btn.dataset.id);
        else if (btn.dataset.action === 'edit') startEdit(btn.dataset.id);
    });
});
