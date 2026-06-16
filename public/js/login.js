let isLogin = true;

const form = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const authBtn = document.getElementById('authBtn');
const authSubtitle = document.getElementById('authSubtitle');
const switchLink = document.getElementById('switchLink');
const switchText = document.getElementById('switchText');
const errorMsg = document.getElementById('errorMsg');

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}

function toggleMode() {
  isLogin = !isLogin;
  hideError();
  if (isLogin) {
    authBtn.textContent = 'Iniciar Sesión';
    authSubtitle.textContent = 'Inicia sesión para continuar';
    switchText.textContent = '¿No tienes cuenta?';
    switchLink.textContent = 'Regístrate';
  } else {
    authBtn.textContent = 'Crear Cuenta';
    authSubtitle.textContent = 'Crea una cuenta para empezar';
    switchText.textContent = '¿Ya tienes cuenta?';
    switchLink.textContent = 'Inicia Sesión';
  }
}

switchLink.addEventListener('click', (e) => {
  e.preventDefault();
  toggleMode();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    showError('Todos los campos son obligatorios');
    return;
  }

  const endpoint = isLogin ? '/api/login' : '/api/register';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Error en la solicitud');
      return;
    }

    localStorage.setItem('token', data.token);

    if (data.role === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/dashboard.html';
    }
  } catch (err) {
    showError('Error de conexión con el servidor');
  }
});
