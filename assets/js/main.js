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

const PREFERENCE_KEYS = {
  theme: 'conecta_theme_mode',
  fontFamily: 'conecta_font_family',
  fontSize: 'conecta_font_size',
};

const FONT_FAMILIES = {
  inter: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Cascadia Code", "Fira Code", Consolas, monospace',
  rounded: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
};

const FONT_SIZES = {
  small: '14px',
  normal: '16px',
  large: '18px',
  xlarge: '20px',
};

function getThemeMode() {
  const saved = localStorage.getItem(PREFERENCE_KEYS.theme);
  return ['light', 'dark'].includes(saved) ? saved : 'light';
}

function getResolvedTheme(mode = getThemeMode()) {
  return mode === 'dark' ? 'dark' : 'light';
}

function applyTheme(mode = getThemeMode()) {
  const resolved = getResolvedTheme(mode);
  document.documentElement.classList.remove('theme-light', 'theme-dark');
  document.documentElement.classList.add(`theme-${resolved}`);
  body.classList.remove('theme-light', 'theme-dark');
  body.classList.add(`theme-${resolved}`);
  updatePreferenceControls();
}

function setThemeMode(mode) {
  const safeMode = mode === 'dark' ? 'dark' : 'light';
  localStorage.setItem(PREFERENCE_KEYS.theme, safeMode);
  applyTheme(safeMode);
}

function getFontFamilyMode() {
  const saved = localStorage.getItem(PREFERENCE_KEYS.fontFamily);
  return Object.prototype.hasOwnProperty.call(FONT_FAMILIES, saved) ? saved : 'inter';
}

function getFontSizeMode() {
  const saved = localStorage.getItem(PREFERENCE_KEYS.fontSize);
  return Object.prototype.hasOwnProperty.call(FONT_SIZES, saved) ? saved : 'normal';
}

function applyFontPreferences() {
  const familyMode = getFontFamilyMode();
  const sizeMode = getFontSizeMode();
  body.style.setProperty('--app-font-family', FONT_FAMILIES[familyMode]);
  body.style.setProperty('--app-font-size', FONT_SIZES[sizeMode]);
  updatePreferenceControls();
}

function setFontFamilyMode(mode) {
  const safeMode = Object.prototype.hasOwnProperty.call(FONT_FAMILIES, mode) ? mode : 'inter';
  localStorage.setItem(PREFERENCE_KEYS.fontFamily, safeMode);
  applyFontPreferences();
}

function setFontSizeMode(mode) {
  const safeMode = Object.prototype.hasOwnProperty.call(FONT_SIZES, mode) ? mode : 'normal';
  localStorage.setItem(PREFERENCE_KEYS.fontSize, safeMode);
  applyFontPreferences();
}

function resetAppearancePreferences() {
  localStorage.removeItem(PREFERENCE_KEYS.theme);
  localStorage.removeItem(PREFERENCE_KEYS.fontFamily);
  localStorage.removeItem(PREFERENCE_KEYS.fontSize);
  applyTheme('light');
  applyFontPreferences();
}

function updatePreferenceControls() {
  const themeSelect = document.getElementById('themeMode');
  const fontSelect = document.getElementById('fontFamilyMode');
  const sizeSelect = document.getElementById('fontSizeMode');
  const themePreview = document.getElementById('themeModePreview');

  if (themeSelect) themeSelect.value = getThemeMode();
  if (fontSelect) fontSelect.value = getFontFamilyMode();
  if (sizeSelect) sizeSelect.value = getFontSizeMode();
  if (themePreview) {
    const resolved = getResolvedTheme() === 'dark' ? 'escuro' : 'claro';
    themePreview.textContent = `Tema ${resolved} selecionado.`;
  }
}

function initSettingsControls() {
  const themeSelect = document.getElementById('themeMode');
  const fontSelect = document.getElementById('fontFamilyMode');
  const sizeSelect = document.getElementById('fontSizeMode');
  const resetBtn = document.getElementById('resetAppearancePreferences');

  themeSelect?.addEventListener('change', (event) => setThemeMode(event.target.value));
  fontSelect?.addEventListener('change', (event) => setFontFamilyMode(event.target.value));
  sizeSelect?.addEventListener('change', (event) => setFontSizeMode(event.target.value));
  resetBtn?.addEventListener('click', resetAppearancePreferences);
  updatePreferenceControls();
}

function setupMobileBottomNav() {
  if (!window.location.pathname.includes('/pages/')) return;
  if (document.querySelector('.mobile-bottom-nav')) return;

  const currentPage = window.location.pathname.split('/').pop() || 'feed.html';
  const items = [
    { href: 'feed.html', label: 'Início', icon: '<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8V21h-6v-6H9v6H3Z" /></svg>', pages: ['feed.html'] },
    { href: 'communities.html', label: 'Comunidades', icon: '<svg viewBox="0 0 24 24"><path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a6 6 0 0 1 12 0Zm10 0a6 6 0 0 1 10 0" /></svg>', pages: ['communities.html', 'community.html'] },
    { href: 'friends.html', label: 'Amigos', icon: '<svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 9a6 6 0 0 0-12 0Zm0 0a5 5 0 0 1 6-4.9" /></svg>', pages: ['friends.html'] },
    { href: 'profile.html', label: 'Perfil', icon: '<svg viewBox="0 0 24 24"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0" /></svg>', pages: ['profile.html', 'profileuser.html'] },
    { href: 'settings.html', label: 'Config.', icon: '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8.5-3.5a7.7 7.7 0 0 0-.1-1.1l2-1.5-2-3.5-2.4 1a8.7 8.7 0 0 0-1.9-1.1L15.8 3h-4l-.4 2.8a8.7 8.7 0 0 0-1.9 1.1l-2.4-1-2 3.5 2 1.5A7.7 7.7 0 0 0 7 12c0 .4 0 .8.1 1.1l-2 1.5 2 3.5 2.4-1c.6.5 1.2.8 1.9 1.1l.4 2.8h4l.4-2.8c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1.1Z" /></svg>', pages: ['settings.html'] },
  ];

  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';
  nav.setAttribute('aria-label', 'Menu principal');
  nav.innerHTML = items.map((item) => {
    const active = item.pages.includes(currentPage) ? 'active' : '';
    return `<a href="${item.href}" class="${active}" aria-label="${item.label}">${item.icon}<span>${item.label}</span></a>`;
  }).join('');
  document.body.appendChild(nav);
}

applyTheme();
applyFontPreferences();

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-logout], #logoutBtn').forEach((button) => {
    button.addEventListener('click', logout);
  });

  setupMobileBottomNav();
  initSettingsControls();

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
