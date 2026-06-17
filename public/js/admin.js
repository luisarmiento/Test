let currentPage = 1;
let userPage = 1;
const userLimit = 10;
const calcLimit = 10;
const selectedUserIds = new Set();

/* ── Utilidades ── */

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  const token = getToken();
  return token ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } : { 'Content-Type': 'application/json' };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/* ── Modal ── */

function showModal(title, message, buttons) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = message;
  const actions = document.getElementById('modalActions');
  actions.innerHTML = '';
  for (const btn of buttons) {
    const el = document.createElement('button');
    el.className = 'btn ' + (btn.variant || 'btn-primary');
    el.textContent = btn.label;
    el.onclick = () => {
      hideModal();
      if (btn.action) btn.action();
    };
    actions.appendChild(el);
  }
  document.getElementById('modalOverlay').classList.add('active');
}

function showNotify(title, message) {
  showModal(title, message, [{ label: 'OK', variant: 'btn-primary' }]);
}

function showConfirm(title, message, onConfirm) {
  showModal(title, message, [
    { label: 'Cancelar', variant: 'btn-small', action: () => {} },
    { label: 'Eliminar', variant: 'btn-danger', action: onConfirm },
  ]);
}

function hideModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

/* ── Paginación compacta ── */

function renderPagination(container, current, total, onChange) {
  container.innerHTML = '';
  if (total <= 1) return;

  const addBtn = (label, cls, disabled, fn) => {
    const b = document.createElement('button');
    b.className = 'page-btn ' + (cls || '');
    b.textContent = label;
    if (disabled) b.disabled = true;
    if (!disabled) b.onclick = fn;
    container.appendChild(b);
  };

  addBtn('⟨ Anterior', 'nav', current === 1, () => onChange(current - 1));

  const range = 2;
  const pages = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - range && i <= current + range)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  for (const p of pages) {
    if (p === '...') {
      addBtn('…', 'ellipsis', true);
    } else {
      addBtn(String(p), p === current ? 'active' : '', false, () => onChange(p));
    }
  }

  addBtn('Siguiente ⟩', 'nav', current === total, () => onChange(current + 1));
}

/* ── Autenticación ── */

async function checkAuth() {
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    if (!res.ok) throw new Error('No auth');
    const data = await res.json();
    if (data.role !== 'admin') {
      window.location.href = '/dashboard.html';
      return null;
    }
    document.getElementById('adminUserDisplay').textContent = 'Admin: ' + data.username;
    return data;
  } catch {
    window.location.href = '/';
    return null;
  }
}

/* ── Usuarios ── */

async function loadUsers() {
  const list = document.getElementById('userList');
  list.innerHTML = '<div class="spinner">Cargando usuarios</div>';

  try {
    const res = await fetch('/api/admin/users?page=' + userPage + '&limit=' + userLimit, { headers: authHeaders() });
    const result = await res.json();
    const { data: users, total } = result;

    list.innerHTML = '';

    const selectAllWrap = document.createElement('div');
    selectAllWrap.className = 'select-all-wrap';
    selectAllWrap.innerHTML = '<input type="checkbox" id="selectAllCheckbox"> Seleccionar todos (' + total + ' usuarios)';
    const selectAllCheckbox = selectAllWrap.querySelector('#selectAllCheckbox');
    selectAllCheckbox.onchange = () => {
      users.forEach(u => {
        if (u.username === 'admin') return;
        if (selectAllCheckbox.checked) selectedUserIds.add(u.id);
        else selectedUserIds.delete(u.id);
      });
      renderUserCards(users);
      updateBulkToolbar();
    };
    list.appendChild(selectAllWrap);

    renderUserCards(users);
    renderPagination(document.getElementById('userPagination'), userPage, Math.ceil(total / userLimit), (p) => {
      userPage = p;
      loadUsers();
    });
  } catch {
    list.innerHTML = '<div class="empty-state">Error al cargar usuarios. Verifica tu conexión.</div>';
  }
}

function renderUserCards(users) {
  const list = document.getElementById('userList');
  const existingSelectAll = list.querySelector('.select-all-wrap');
  list.innerHTML = '';
  if (existingSelectAll) list.appendChild(existingSelectAll);

  for (const user of users) {
    const isProtected = user.username === 'admin';
    const checked = selectedUserIds.has(user.id) ? 'checked' : '';
    const card = document.createElement('div');
    card.className = 'user-card';

    card.innerHTML = ''
      + (!isProtected
        ? '<input type="checkbox" class="user-checkbox" value="' + user.id + '" ' + checked + ' style="margin-right:12px;accent-color:#667eea;width:16px;height:16px;cursor:pointer;">'
        : '<div style="width:28px;"></div>')
      + '<div class="user-info">'
      +   '<h4>' + escapeHtml(user.username) + '</h4>'
      +   '<span>' + new Date(user.created_at).toLocaleDateString() + ' · '
      +     '<span class="badge ' + (user.role === 'admin' ? 'badge-admin' : 'badge-user') + '">' + user.role + '</span>'
      +   '</span>'
      + '</div>'
      + '<div class="user-actions">'
      +   (!isProtected
        ? '<button class="btn btn-small btn-primary" onclick="toggleRole(' + user.id + ',\'' + user.role + '\')">'
        +     (user.role === 'admin' ? 'Hacer User' : 'Hacer Admin')
        +   '</button>'
        +   '<button class="btn btn-small btn-danger" onclick="confirmDeleteUser(' + user.id + ')">Eliminar</button>'
        : '<span style="font-size:12px;color:rgba(255,255,255,0.3);">Protegido</span>')
      + '</div>';

    const cb = card.querySelector('.user-checkbox');
    if (cb) {
      cb.onchange = () => {
        if (cb.checked) selectedUserIds.add(user.id);
        else selectedUserIds.delete(user.id);
        updateBulkToolbar();
        updateSelectAllCheckbox(users);
      };
    }
    list.appendChild(card);
  }
}

function updateSelectAllCheckbox(users) {
  const cb = document.getElementById('selectAllCheckbox');
  if (!cb) return;
  const checkboxes = users.filter(u => u.username !== 'admin');
  const checked = checkboxes.filter(u => selectedUserIds.has(u.id));
  cb.checked = checked.length === checkboxes.length && checkboxes.length > 0;
  cb.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
}

async function toggleRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  try {
    const res = await fetch('/api/admin/users/' + userId + '/role', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) loadUsers();
  } catch {
    console.error('Error al cambiar rol');
  }
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulkToolbar');
  const count = document.getElementById('selectedCount');
  const len = selectedUserIds.size;
  toolbar.classList.toggle('disabled', len === 0);
  count.textContent = len === 0 ? 'Ninguno seleccionado' : (len + ' seleccionado' + (len > 1 ? 's' : ''));
}

function getSelectedIds() {
  return Array.from(selectedUserIds);
}

function confirmDeleteUser(userId) {
  showConfirm(
    'Eliminar usuario',
    '¿Eliminar este usuario y todos sus cálculos? Esta acción no se puede deshacer.',
    () => deleteUser(userId)
  );
}

async function deleteUser(userId) {
  try {
    const res = await fetch('/api/admin/users/' + userId, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      selectedUserIds.delete(userId);
      showNotify('Usuario eliminado', 'El usuario y sus cálculos fueron eliminados.');
      loadUsers();
      loadCalculations();
    } else {
      const data = await res.json();
      showNotify('Error', data.error || 'No se pudo eliminar el usuario.');
    }
  } catch {
    showNotify('Error de red', 'No se pudo conectar con el servidor.');
  }
}

function confirmBulkDelete() {
  const len = selectedUserIds.size;
  if (len === 0) return;
  showConfirm(
    'Eliminar ' + len + ' usuario' + (len > 1 ? 's' : ''),
    '¿Eliminar ' + len + ' usuario' + (len > 1 ? 's' : '') + ' y todos sus cálculos? Esta acción no se puede deshacer.',
    bulkDelete
  );
}

async function bulkDelete() {
  const ids = getSelectedIds();
  try {
    const res = await fetch('/api/admin/users/bulk', {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (res.ok) {
      selectedUserIds.clear();
      showNotify('Usuarios eliminados', data.deleted + ' usuario' + (data.deleted > 1 ? 's' : '') + ' eliminado' + (data.deleted > 1 ? 's' : '') + '.');
      loadUsers();
      loadCalculations();
    } else {
      showNotify('Error', data.error || 'No se pudieron eliminar los usuarios.');
    }
  } catch {
    showNotify('Error de red', 'No se pudo conectar con el servidor.');
  }
}

/* ── Cálculos ── */

let userLookup = [];
let searchTimeout = null;

async function loadUserLookup() {
  try {
    const res = await fetch('/api/admin/users?all=true', { headers: authHeaders() });
    userLookup = await res.json();
  } catch {
    userLookup = [];
  }
}

document.getElementById('userFilter').addEventListener('input', function () {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage = 1;
    loadCalculations();
  }, 300);
});

function resolveUserId(search) {
  if (!search) return null;
  const q = search.toLowerCase();
  const matches = userLookup.filter(u => u.username.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0].id;
  return null;
}

async function loadCalculations() {
  const searchVal = document.getElementById('userFilter').value.trim();
  const tbody = document.getElementById('calcTableBody');
  tbody.innerHTML = '<tr><td colspan="4"><div class="spinner">Cargando cálculos</div></td></tr>';

  try {
    const userId = resolveUserId(searchVal);
    let url = '/api/admin/calculations?page=' + currentPage + '&limit=' + calcLimit;
    if (userId) url += '&user_id=' + userId;

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    renderAdminCalculations(data);
  } catch {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">Error al cargar cálculos.</div></td></tr>';
  }
}

function renderAdminCalculations(data) {
  const tbody = document.getElementById('calcTableBody');
  const pagination = document.getElementById('adminPagination');

  if (data.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state">No hay cálculos' +
      (document.getElementById('userFilter').value.trim() ? ' para este usuario.' : '.') + '</div></td></tr>';
    pagination.innerHTML = '';
    return;
  }

  tbody.innerHTML = data.data.map(item =>
    '<tr>'
      + '<td class="username-col">' + escapeHtml(item.username) + '</td>'
      + '<td>' + escapeHtml(item.expression) + '</td>'
      + '<td>= ' + escapeHtml(item.result) + '</td>'
      + '<td style="color:rgba(255,255,255,0.4);font-size:12px;">' + new Date(item.created_at).toLocaleString() + '</td>'
    + '</tr>'
  ).join('');

  renderPagination(pagination, currentPage, Math.ceil(data.total / calcLimit), (p) => {
    currentPage = p;
    loadCalculations();
  });
}

/* ── Inicialización ── */

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});

document.getElementById('bulkDeleteBtn').addEventListener('click', confirmBulkDelete);

checkAuth().then(() => {
  updateBulkToolbar();
  loadUserLookup();
  loadUsers();
  loadCalculations();
});
