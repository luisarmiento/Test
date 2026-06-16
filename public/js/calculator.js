let display = document.getElementById('calcDisplay');
let currentPage = 1;
const limit = 15;

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
    if (!res.ok) {
      window.location.href = '/';
      return null;
    }
    const data = await res.json();
    document.getElementById('userDisplay').textContent = `${data.username} (${data.role})`;
    if (data.role === 'admin') {
      const nav = document.querySelector('.navbar-info');
      const adminLink = document.createElement('a');
      adminLink.href = '/admin.html';
      adminLink.className = 'btn btn-small btn-primary';
      adminLink.textContent = 'Panel Admin';
      adminLink.style.textDecoration = 'none';
      nav.insertBefore(adminLink, nav.firstChild);
    }
    return data;
  } catch {
    window.location.href = '/';
    return null;
  }
}

function appendNum(val) {
  if (display.value === '0' && val !== '.') {
    display.value = val;
  } else {
    display.value += val;
  }
}

function appendOp(op) {
  const last = display.value.slice(-1);
  if ('+-*/'.includes(last)) {
    display.value = display.value.slice(0, -1) + op;
  } else {
    display.value += op;
  }
}

function clearAll() {
  display.value = '0';
}

function clearEntry() {
  display.value = '0';
}

function backspace() {
  if (display.value.length > 1) {
    display.value = display.value.slice(0, -1);
  } else {
    display.value = '0';
  }
}

async function calculate() {
  if (display.value === '0' || !display.value) return;

  try {
    const res = await fetch('/api/calculate', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ expression: display.value })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Error al calcular');
      return;
    }

    display.value = data.result;
    currentPage = 1;
    loadHistory();
  } catch {
    alert('Error de conexión');
  }
}

async function loadHistory() {
  try {
    const res = await fetch(`/api/calculations?page=${currentPage}&limit=${limit}`, { headers: authHeaders() });
    const data = await res.json();
    renderHistory(data);
  } catch {
    console.error('Error al cargar historial');
  }
}

function renderHistory(data) {
  const list = document.getElementById('historyList');
  const pagination = document.getElementById('pagination');

  if (data.data.length === 0) {
    list.innerHTML = '<div class="history-empty">No hay cálculos aún</div>';
    pagination.innerHTML = '';
    return;
  }

  list.innerHTML = data.data.map(item => `
    <div class="history-item">
      <div>
        <div class="expr">${escapeHtml(item.expression)}</div>
        <div class="result">= ${escapeHtml(item.result)}</div>
      </div>
      <button class="delete-btn" onclick="deleteCalc(${item.id})">&times;</button>
    </div>
  `).join('');

  const totalPages = Math.ceil(data.total / limit);
  pagination.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
    btn.textContent = i;
    btn.onclick = () => { currentPage = i; loadHistory(); };
    pagination.appendChild(btn);
  }
}

async function deleteCalc(id) {
  try {
    const res = await fetch(`/api/calculations/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) loadHistory();
  } catch {
    console.error('Error al eliminar');
  }
}

async function clearHistory() {
  if (!confirm('¿Limpiar todo el historial?')) return;
  try {
    const res = await fetch('/api/calculations?limit=1000', { headers: authHeaders() });
    const data = await res.json();
    for (const item of data.data) {
      await fetch(`/api/calculations/${item.id}`, { method: 'DELETE', headers: authHeaders() });
    }
    currentPage = 1;
    loadHistory();
  } catch {
    console.error('Error al limpiar historial');
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  localStorage.removeItem('token');
  window.location.href = '/';
});

document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') appendNum(e.key);
  if (e.key === '.') appendNum('.');
  if (e.key === '%') appendNum('%');
  if ('+-*/'.includes(e.key)) appendOp(e.key);
  if (e.key === 'Enter') calculate();
  if (e.key === 'Backspace') backspace();
  if (e.key === 'Escape') clearAll();
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

checkAuth().then(() => loadHistory());
