const API_BASE_URL = 'https://conecta-fatec-api.onrender.com';

function getAccessToken() {
  return localStorage.getItem('access_token');
}

function getRefreshToken() {
  return localStorage.getItem('refresh_token');
}

function saveLoggedUser(user) {
  if (!user) return;
  localStorage.setItem('logged_user', JSON.stringify(user));
  if (user.nickname) localStorage.setItem('username', user.nickname);
}

function getLoggedUserFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('logged_user')) || null;
  } catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('username');
  localStorage.removeItem('logged_user');
  window.location.href = window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
}

async function apiFetch(path, options = {}) {
  const token = getAccessToken();
  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    logout();
    return response;
  }

  return response;
}

function getInitials(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return '--';

  const words = cleanText.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return cleanText.substring(0, 2).toUpperCase();
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getApiError(data, fallback = 'Não foi possível concluir a ação.') {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (data.detail) return Array.isArray(data.detail) ? data.detail[0] : data.detail;

  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;

  const value = data[firstKey];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'object') return getApiError(value, fallback);
  return String(value);
}

async function loadLoggedUser() {
  const token = getAccessToken();
  if (!token) return null;

  const response = await apiFetch('/api/users/me/');
  if (!response.ok) return getLoggedUserFromStorage();

  const user = await response.json();
  saveLoggedUser(user);
  updateSidebarUser(user);
  return user;
}

function updateSidebarUser(user) {
  if (!user) return;

  const name = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.nickname || 'Usuário';
  const nickname = user.nickname || 'usuario';
  const initials = getInitials(name || nickname);

  document.querySelectorAll('#sidebar-name').forEach((el) => {
    el.textContent = name;
  });

  document.querySelectorAll('#sidebar-username').forEach((el) => {
    el.textContent = `@${nickname}`;
  });

  document.querySelectorAll('#sidebar-avatar, #modal-avatar, #post-input-avatar').forEach((el) => {
    if (userPhoto(user)) {
      el.innerHTML = `<img src="${escapeHTML(toApiUrl(userPhoto(user)))}" alt="Foto de ${escapeHTML(name)}">`;
      el.classList.add('has-image');
    } else {
      el.textContent = initials;
    }
  });
}

function requireAuth() {
  if (!getAccessToken()) {
    window.location.href = '../index.html';
    return false;
  }
  return true;
}

const body = document.body;
const themeToggle = document.getElementById('themeToggle');
const mobileThemeToggle = document.getElementById('mobileThemeToggle');

function updateThemeButtons() {
  const isDark = body.classList.contains('theme-dark');

  if (themeToggle) themeToggle.textContent = isDark ? '☼' : '☽';

  if (mobileThemeToggle) {
    const icon = mobileThemeToggle.querySelector('span');
    if (icon) icon.textContent = isDark ? '☼' : '☽';
  }
}

function toggleTheme() {
  body.classList.toggle('theme-light');
  body.classList.toggle('theme-dark');
  updateThemeButtons();
}

if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
if (mobileThemeToggle) mobileThemeToggle.addEventListener('click', toggleTheme);
updateThemeButtons();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-logout], #logoutBtn').forEach((button) => {
    button.addEventListener('click', logout);
  });

  if (window.location.pathname.includes('/pages/') && getAccessToken()) {
    const storedUser = getLoggedUserFromStorage();
    if (storedUser) updateSidebarUser(storedUser);
    loadLoggedUser().catch(console.error);
  }
});

const loginForm = document.getElementById('loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const identifier = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = document.getElementById('submitBtn');

    errorDiv.style.display = 'none';
    submitBtn.textContent = 'Carregando...';
    submitBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/api/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        errorDiv.textContent = getApiError(data, 'Usuário ou senha incorretos.');
        errorDiv.style.display = 'block';
        return;
      }

      localStorage.setItem('access_token', data.access);
      localStorage.setItem('refresh_token', data.refresh);

      try {
        const profileResponse = await apiFetch('/api/users/me/');
        if (profileResponse.ok) {
          const user = await profileResponse.json();
          saveLoggedUser(user);
        }
      } catch {
        localStorage.setItem('username', identifier);
      }

      window.location.href = 'pages/feed.html';
    } catch (error) {
      console.error('Erro na requisição:', error);
      errorDiv.textContent = 'Erro ao conectar com o servidor. Verifique se a API está rodando.';
      errorDiv.style.display = 'block';
    } finally {
      submitBtn.textContent = 'Entrar';
      submitBtn.disabled = false;
    }
  });
}

const registerForm = document.getElementById('registerForm');

if (registerForm) {
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const btn = document.getElementById('regSubmitBtn');
    const errDiv = document.getElementById('registerError');
    const sucDiv = document.getElementById('registerSuccess');
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;

    errDiv.style.display = 'none';
    sucDiv.style.display = 'none';

    if (password !== passwordConfirm) {
      errDiv.textContent = 'As senhas não coincidem. Tente novamente.';
      errDiv.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Cadastrando...';

    const userData = {
      first_name: document.getElementById('regFirstName').value.trim(),
      last_name: document.getElementById('regLastName').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      nickname: document.getElementById('regNickname').value.trim(),
      course: document.getElementById('regCourse').value,
      password,
      confirm_password: passwordConfirm,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (response.ok) {
        sucDiv.style.display = 'block';
        registerForm.reset();
        setTimeout(() => {
          document.querySelector('#registerModal .btn-close')?.click();
        }, 1600);
      } else {
        errDiv.textContent = getApiError(data, 'Erro ao cadastrar.');
        errDiv.style.display = 'block';
      }
    } catch (error) {
      errDiv.textContent = 'Erro de conexão com o servidor.';
      errDiv.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Finalizar Cadastro';
    }
  });
}

function toApiUrl(url) {
  if (!url) return '';
  const value = String(url);
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) return value;
  if (value.startsWith('/')) return `${API_BASE_URL}${value}`;
  return `${API_BASE_URL}/${value}`;
}

function userDisplayName(user = {}) {
  return user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.nickname || 'Usuário';
}

function userPhoto(user = {}) {
  return user.photo_url || user.photo || user.avatar_url || user.profile_photo || '';
}

function avatarColorClass(seed = '') {
  const classes = ['static-avatar-blue', 'static-avatar-green', 'static-avatar-purple', 'static-avatar-orange', 'static-avatar-red', 'static-avatar-indigo', 'static-avatar-teal', 'static-avatar-pink', 'static-avatar-gray'];
  const text = String(seed || 'user');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % classes.length;
  return classes[hash];
}

function avatarHTML(user = {}, sizeClass = 'user-avatar') {
  const name = userDisplayName(user);
  const nickname = user.nickname || name;
  const photo = toApiUrl(userPhoto(user));
  if (photo) {
    return `<div class="${sizeClass} has-image"><img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy"></div>`;
  }
  return `<div class="${sizeClass} static-avatar ${avatarColorClass(nickname)}">${escapeHTML(getInitials(name || nickname))}</div>`;
}

function profileUrlFor(user = {}) {
  const logged = getLoggedUserFromStorage();
  if (logged?.nickname && user.nickname === logged.nickname) return 'profile.html';
  return `profileuser.html?nickname=${encodeURIComponent(user.nickname || '')}`;
}

function userLinkHTML(user = {}, label = null, className = '') {
  const text = label || userDisplayName(user);
  return `<a href="${profileUrlFor(user)}" class="${className}">${escapeHTML(text)}</a>`;
}

async function apiJSON(path, options = {}) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(getApiError(data));
    error.response = response;
    error.data = data;
    throw error;
  }
  return data;
}

async function tryApiJSON(paths, options = {}) {
  let lastError = null;
  for (const path of paths) {
    try {
      return await apiJSON(path, options);
    } catch (error) {
      lastError = error;
      if (error.response && ![404, 405].includes(error.response.status)) break;
    }
  }
  throw lastError || new Error('Não foi possível consultar a API.');
}
