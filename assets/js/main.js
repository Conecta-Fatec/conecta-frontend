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
    { href: 'feed.html', label: 'Início', icon: '<svg viewBox="0 0 24 24"><path d="M3.5 10.8 12 3.5l8.5 7.3V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1v-9.2Z" /></svg>', pages: ['feed.html'] },
    { href: 'communities.html', label: 'Comunidades', icon: '<svg viewBox="0 0 24 24"><path d="M7.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20.5a4.5 4.5 0 0 1 9 0m0 0a4.5 4.5 0 0 1 9 0" /></svg>', pages: ['communities.html', 'community.html'] },
    { href: 'friends.html', label: 'Amigos', icon: '<svg viewBox="0 0 24 24"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-5.5 9a5.5 5.5 0 0 1 11 0m4-9v6m-3-3h6" /></svg>', pages: ['friends.html'] },
    { href: 'profile.html', label: 'Perfil', icon: '<svg viewBox="0 0 24 24"><path d="M12 12.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 21a8 8 0 0 1 16 0" /></svg>', pages: ['profile.html', 'profileuser.html'] },
    { href: 'settings.html', label: 'Config.', icon: '<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M3 12h2m14 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>', pages: ['settings.html'] },
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


function normalizeArray(data, ...keys) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const key of ['results', 'items', 'data', 'posts', 'communities', 'members', 'friends', 'requests']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function getCommunityMemberCount(community = {}, fallback = 0) {
  const candidates = [
    community.total_members,
    community.members_count,
    community.member_count,
    community.participants_count,
    community.total_participants,
    community.users_count,
    fallback,
  ];

  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  if (Array.isArray(community.members)) return community.members.length;
  if (Array.isArray(community.participants)) return community.participants.length;
  return 0;
}

function communityPhoto(community = {}) {
  return community.photo_url || community.photo || community.image_url || community.image || community.avatar_url || community.cover_url || '';
}

function communityAvatarHTML(community = {}, sizeClass = 'community-card-avatar') {
  const name = community.name || 'Comunidade';
  const photo = toApiUrl(communityPhoto(community));
  if (photo) {
    return `<div class="${sizeClass} has-image"><img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy"></div>`;
  }
  return `<div class="${sizeClass} static-avatar ${avatarColorClass(community.slug || name)}">${escapeHTML(getInitials(name))}</div>`;
}

function normalizeCommunity(community = {}, fallbackMemberCount = 0) {
  return {
    ...community,
    total_members: getCommunityMemberCount(community, fallbackMemberCount),
    photo_url: communityPhoto(community),
  };
}

function relativeTime(value, prefix = 'feito') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return `${prefix} agora`;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return `${prefix} agora`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${prefix} há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${prefix} há ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${prefix} há ${days} ${days === 1 ? 'dia' : 'dias'}`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${prefix} há ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;

  return date.toLocaleDateString('pt-BR');
}

function postLikesCount(post = {}) {
  return post.total_likes ?? post.likes_count ?? post.likes ?? 0;
}

function postCommentsCount(post = {}) {
  if (Number.isFinite(Number(post.comments_count))) return Number(post.comments_count);
  if (Number.isFinite(Number(post.total_comments))) return Number(post.total_comments);
  const comments = normalizeArray(post.top_level_comments, 'results').length
    ? normalizeArray(post.top_level_comments, 'results')
    : normalizeArray(post.comments, 'results');
  return comments.length;
}

function buildCommunityPostPayload(content, community = {}) {
  const communityId = community.id || community.pk;
  return {
    content,
    community: communityId || community.slug || undefined,
    community_id: communityId || undefined,
    community_slug: community.slug || undefined,
  };
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
