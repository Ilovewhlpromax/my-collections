const COLLECTIONS_KEY = 'my_collections';
const CATEGORY_NAMES = {
    art: '艺术品',
    book: '书籍',
    travel: '旅行',
    music: '音乐',
    other: '其他'
};

const MAX_RAW_FILE = 20 * 1024 * 1024;   // 20 MB raw upload cap
const MAX_EDGE = 900;                     // downscale long edge (px)
const JPEG_QUALITY = 0.82;
const MAX_GIF_KEEP = 3 * 1024 * 1024;     // gifs kept as-is below this size

const state = {
    editingId: null,
    imageData: null    // data URL from the picked photo
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
    try {
        localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    } catch (err) {
        alert('保存失败：本地存储空间不足。请删除部分收藏，或使用更小的图片。');
        throw err;
    }
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

/* ---------- photo upload ---------- */

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

/** Downscale + compress an image file into a data URL stored locally. */
async function processImageFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件（JPG / PNG / WebP / GIF）。');
        return;
    }
    if (file.size > MAX_RAW_FILE) {
        alert(`图片过大（超过 ${MAX_RAW_FILE / 1024 / 1024} MB），请选择更小的图片。`);
        return;
    }

    let dataUrl;
    if (file.type === 'image/gif' && file.size <= MAX_GIF_KEEP) {
        // Keep animated gifs untouched.
        dataUrl = await readFileAsDataURL(file);
    } else {
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
        dataUrl = canvas.toDataURL(format, JPEG_QUALITY);
    }

    state.imageData = dataUrl;
    showPreview(dataUrl);
}

function showPreview(dataUrl) {
    const preview = document.getElementById('imagePreview');
    preview.src = dataUrl;
    preview.hidden = false;
    document.getElementById('uploadPlaceholder').hidden = true;
    document.getElementById('removeImage').hidden = false;
}

function clearImage() {
    state.imageData = null;
    const preview = document.getElementById('imagePreview');
    preview.src = '';
    preview.hidden = true;
    document.getElementById('uploadPlaceholder').hidden = false;
    document.getElementById('removeImage').hidden = true;
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
    document.getElementById('category').value = item.category || 'other';

    const imageUrlInput = document.getElementById('imageUrl');
    imageUrlInput.value = '';
    clearImage();

    if (item.image) {
        if (item.image.startsWith('data:')) {
            state.imageData = item.image;
            showPreview(item.image);
        } else {
            imageUrlInput.value = item.image;
        }
    }

    document.getElementById('formTitle').textContent = '编辑收藏';
    document.getElementById('submitBtn').textContent = '保存修改';
    document.getElementById('cancelEdit').hidden = false;
    document.getElementById('addForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('name').focus();
}

function cancelEdit() {
    state.editingId = null;
    document.getElementById('addForm').reset();
    clearImage();
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

        const urlImage = document.getElementById('imageUrl').value.trim();
        const image = state.imageData || urlImage || '';

        const newCollection = {
            id: state.editingId || Date.now().toString(),
            name: document.getElementById('name').value.trim(),
            description: document.getElementById('description').value.trim(),
            image,
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

        try {
            saveCollections(collections);
        } catch {
            return; // alert already shown inside saveCollections
        }
        cancelEdit();
        renderCollections();
    });

    document.getElementById('cancelEdit').addEventListener('click', cancelEdit);

    /* ---- photo upload interactions ---- */
    const fileInput = document.getElementById('imageFile');
    const uploadZone = document.getElementById('uploadZone');

    uploadZone.addEventListener('click', () => {
        if (!document.getElementById('imagePreview').hidden) return; // allow remove button clicks
        fileInput.click();
    });
    uploadZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) processImageFile(file).catch((err) => alert(err.message));
        fileInput.value = '';
    });

    // drag & drop
    ['dragover', 'dragenter'].forEach((evt) =>
        uploadZone.addEventListener(evt, (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        })
    );
    ['dragleave', 'drop'].forEach((evt) =>
        uploadZone.addEventListener(evt, (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
        })
    );
    uploadZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file) processImageFile(file).catch((err) => alert(err.message));
    });

    document.getElementById('removeImage').addEventListener('click', (e) => {
        e.stopPropagation();
        clearImage();
    });

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
