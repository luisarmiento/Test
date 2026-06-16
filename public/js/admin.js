let currentPage = 1;
const limit = 20;

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  const token = getToken();
  return token ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } : { 'Content-Type': 'application/json' };
}

async function checkAuth() {
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    if (!res.ok) throw new Error('No auth');
    const data = await res.json();
    if (data.role !== 'admin') {
      window.location.href = '/dashboard.html';
      return null;
    }
    document.getElementById('adminUserDisplay').textContent = `Admin: ${data.username}`;
    return data;
  } catch {
    window.location.href = '/';
    return null;
  }
}

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    const users = await res.json();
    const list = document.getElementById('userList');
    const filter = document.getElementById('userFilter');

    list.innerHTML = users.map(user => `
      <div class="user-card">
        <div class="user-info">
          <h4>${escapeHtml(user.username)}</h4>
          <span>${new Date(user.created_at).toLocaleDateString()} &middot; 
            <span class="badge ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}">${user.role}</span>
          </span>
        </div>
        <div class="user-actions">
          ${user.username !== 'admin' ? `
            <button class="btn btn-small btn-primary" onclick="toggleRole(${user.id}, '${user.role}')">
              ${user.role === 'admin' ? 'Hacer User' : 'Hacer Admin'}
            </button>
            <button class="btn btn-small btn-danger" onclick="deleteUser(${user.id})">Eliminar</button>
          ` : ''}
        </div>
      </div>
    `).join('');

    filter.innerHTML = '<option value="">Todos los usuarios</option>' +
      users.map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('');
  } catch {
    console.error('Error al cargar usuarios');
  }
}

async function toggleRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ role: newRole })
    });
    if (res.ok) loadUsers();
  } catch {
    console.error('Error al cambiar rol');
  }
}

async function deleteUser(userId) {
  if (!confirm('¿Eliminar este usuario y todos sus cálculos?')) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) {
      loadUsers();
      loadCalculations();
    }
  } catch {
    console.error('Error al eliminar usuario');
  }
}

function filterUser() {
  currentPage = 1;
  loadCalculations();
}

async function loadCalculations() {
  try {
    const userId = document.getElementById('userFilter').value;
    let url = `/api/admin/calculations?page=${currentPage}&limit=${limit}`;
    if (userId) url += `&user_id=${userId}`;

    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    renderAdminCalculations(data);
  } catch {
    console.error('Error al cargar cálculos');
  }
}

function renderAdminCalculations(data) {
  const tbody = document.getElementById('calcTableBody');
  const pagination = document.getElementById('adminPagination');

  if (data.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:rgba(255,255,255,0.4);padding:40px;">No hay cálculos</td></tr>';
    pagination.innerHTML = '';
    return;
  }

  tbody.innerHTML = data.data.map(item => `
    <tr>
      <td class="username-col">${escapeHtml(item.username)}</td>
      <td>${escapeHtml(item.expression)}</td>
      <td>= ${escapeHtml(item.result)}</td>
      <td style="color:rgba(255,255,255,0.4);font-size:12px;">${new Date(item.created_at).toLocaleString()}</td>
    </tr>
  `).join('');

  const totalPages = Math.ceil(data.total / limit);
  pagination.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    btn.textContent = i;
    btn.onclick = () => { currentPage = i; loadCalculations(); };
    pagination.appendChild(btn);
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

checkAuth().then(() => {
  loadUsers();
  loadCalculations();
});
