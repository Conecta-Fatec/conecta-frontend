// Importando a URL base da API para facilitar manutenção e evitar hardcoding em múltiplos lugares
const API_BASE_URL = 'https://conecta-fatec-api.onrender.com';

// Utilitários de Controle de Interface e Gerenciamento de Estado de Botões

window.travarBotao = function(botao, mudarTexto = false) {
  if (!botao || botao.disabled) return false;
  
  botao.disabled = true;
  botao.classList.add('opacity-50', 'cursor-not-allowed');
  botao.style.pointerEvents = 'none';

  if (mudarTexto) {
    botao.dataset.conteudoOriginal = botao.innerHTML;
    botao.innerHTML = 'Aguarde...';
  }
  return true;
};

window.destravarBotao = function(botao, mudarTexto = false) {
  if (!botao) return;
  
  botao.disabled = false;
  botao.classList.remove('opacity-50', 'cursor-not-allowed');
  botao.style.pointerEvents = 'auto';

  if (mudarTexto && botao.dataset.conteudoOriginal) {
    botao.innerHTML = botao.dataset.conteudoOriginal;
  }
};


// Cache leve de imagens e pré-carregamento visual

const IMAGE_CACHE_KEY = 'conecta_image_cache_v1';
const IMAGE_CACHE_LIMIT = 80;
const IMAGE_CACHE_STORAGE = 'conecta-image-cache-v1';

const ConectaImageCache = (() => {
  const memory = new Map();

  function normalizeImageUrl(url) {
    if (!url) return '';
    const normalized = String(url).trim();
    if (!normalized) return '';

    try {
      return new URL(normalized, document.baseURI).href;
    } catch {
      return normalized;
    }
  }

  function isValidCachedUrl(url) {
    return Boolean(url) && !url.includes('/pages/assets/');
  }

  function readStoredUrls() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(IMAGE_CACHE_KEY) || '[]');
      if (!Array.isArray(stored)) return [];

      return stored
        .map(normalizeImageUrl)
        .filter(isValidCachedUrl);
    } catch {
      return [];
    }
  }

  function writeStoredUrls(urls) {
    try {
      sessionStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(urls.slice(-IMAGE_CACHE_LIMIT)));
    } catch {
      // Se o armazenamento estiver indisponível, o navegador mantém o cache HTTP normal.
    }
  }

  function remember(url) {
    const normalized = normalizeImageUrl(url);
    if (!isValidCachedUrl(normalized)) return '';

    const stored = readStoredUrls().filter((item) => item !== normalized);
    stored.push(normalized);
    writeStoredUrls(stored);
    return normalized;
  }

  function storeResponse(url) {
    if (!('caches' in window)) return;

    caches.open(IMAGE_CACHE_STORAGE)
      .then(async (cache) => {
        const cached = await cache.match(url);
        if (!cached) await cache.add(url);
      })
      .catch(() => {
        // URLs externas sem CORS ainda ficam com o cache HTTP normal do navegador.
      });
  }

  function preload(url) {
    if (!url) return '';
    const normalized = remember(url);
    if (!normalized) return '';
    if (memory.has(normalized)) return normalized;

    const image = new Image();
    image.decoding = 'async';
    image.loading = 'lazy'; /* pode parcer sacanagem, mas essa mudança faz o navegador carregar as imagens de forma mais eficiente, nem to zoando*/
    image.src = normalized;
    memory.set(normalized, image);
    storeResponse(normalized);
    return normalized;
  }

  function get(url) {
    return preload(url);
  }

  function hydratePageImages() {
    const run = () => {
      document.querySelectorAll('img[src]').forEach((img) => {
        if (!img.decoding) img.decoding = 'async';
        if (!img.loading) img.loading = 'lazy';
        preload(img.currentSrc || img.src);
      });
    };

    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1200 });
    else window.setTimeout(run, 250);
  }

  function preloadStoredImages() {
    const run = () => readStoredUrls().forEach(preload);
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
    else window.setTimeout(run, 350);
  }

  function getAssetUrl(assetPath) {
    const mainScript =
      document.currentScript?.src ||
      document.querySelector('script[src*="assets/js/main.js"]')?.src;

    if (!mainScript) return normalizeImageUrl(`assets/${assetPath}`);

    return new URL(`../${assetPath}`, mainScript).href;
  }

  function preloadLogos() {
    [
      getAssetUrl('img/logo-light.svg'),
      getAssetUrl('img/logo-dark.svg'),
      getAssetUrl('img/logo-light.svg')
    ].forEach(preload);
  }

  return { get, preload, remember, hydratePageImages, preloadStoredImages, preloadLogos };
})();

function cachedImageUrl(url) {
  return window.ConectaImageCache?.get(url) || ConectaImageCache.get(url);
}

window.ConectaImageCache = ConectaImageCache;

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

function isLocalFilePreview() {
  return window.location.protocol === 'file:';
}

function redirectToLogin() {
  /*
    Em produção, o usuário sem sessão volta para o login.
    Em teste local aberto por file://, o Chrome bloqueia redirecionamentos
    automáticos entre arquivos e gera "Unsafe attempt to load URL".
  */
  if (isLocalFilePreview()) return;

  window.location.href = window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
}

function logout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('username');
  localStorage.removeItem('logged_user');
  redirectToLogin();
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
  if (data.message) return Array.isArray(data.message) ? data.message[0] : data.message;
  if (data.detail) return Array.isArray(data.detail) ? data.detail[0] : data.detail;

  const firstKey = Object.keys(data)[0];
  if (!firstKey) return fallback;

  const value = data[firstKey];
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'object') return getApiError(value, fallback);
  return String(value);
}

let loggedUserPromise = null;

async function loadLoggedUser(force = false) {
  const token = getAccessToken();
  if (!token) return null;

  if (!force && loggedUserPromise) return loggedUserPromise;

  loggedUserPromise = (async () => {
    const response = await apiFetch('/api/users/me/');
    if (!response.ok) return getLoggedUserFromStorage();

    const user = await response.json();
    saveLoggedUser(user);
    updateSidebarUser(user);
    return user;
  })();

  return loggedUserPromise;
}

function updateSidebarUser(user) {
  if (!user) return;

  const name = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.nickname || 'Usuário';
  const nickname = user.nickname || 'usuario';
  const initials = getInitials(name || nickname);

  function syncSidebarText(el, value, countValue = value) {
    if (!el) return;
    const cleanValue = String(value || '').trim();
    const cleanCount = String(countValue || '').replace(/^@/, '').trim();
    el.textContent = cleanValue;
    el.title = cleanValue;
    el.classList.toggle('is-long-sidebar-text', cleanCount.length > 15);
  }

  document.querySelectorAll('#sidebar-name').forEach((el) => {
    syncSidebarText(el, name);
  });

  document.querySelectorAll('#sidebar-username').forEach((el) => {
    syncSidebarText(el, `@${nickname}`, nickname);
  });

  document.querySelectorAll('#sidebar-avatar, #modal-avatar, #post-input-avatar').forEach((el) => {
    const photo = cachedImageUrl(toApiUrl(userPhoto(user)));
    if (photo) {
      el.innerHTML = `<img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy" decoding="async">`;
      el.classList.add('has-image');
    } else {
      el.textContent = initials;
    }
  });
}


// Utilitário Global: Stale-While-Revalidate (SWR)
window.useSWR = async function(cacheKey, fetchCallback, renderCallback, options = {}) {
  const storage = options.storage === 'local' ? localStorage : sessionStorage;
  const silent = options.silent || false;
  
  const cacheSalvo = storage.getItem(cacheKey);
  let hasCache = false;

  if (cacheSalvo && !silent) {
    try {
      renderCallback(JSON.parse(cacheSalvo), { isCache: true });
      hasCache = true;
    } catch (e) { console.error(`Erro cache ${cacheKey}:`, e); }
  }

  if (!hasCache && !silent && typeof options.onLoading === 'function') {
    options.onLoading();
  }

  try {
    const data = await fetchCallback();
    const newDataString = JSON.stringify(data);
    
    if (newDataString !== cacheSalvo) {
      storage.setItem(cacheKey, newDataString);
      renderCallback(data, { isCache: false });
      // Re-hidrata o cache de imagens para evitar piscadas após a DOM ser atualizada
      if (window.ConectaImageCache && typeof window.ConectaImageCache.hydratePageImages === 'function') {
        window.ConectaImageCache.hydratePageImages();
      }
    }
    return data;
  } catch (error) {
    if (typeof options.onError === 'function') options.onError(error, hasCache);
    throw error;
  }
};

function requireAuth() {
  /*
    Em produção, páginas internas continuam exigindo login.
    No teste local via file://, o Chrome bloqueia redirecionamentos entre arquivos
    e mostra "Unsafe attempt to load URL"; por isso o redirecionamento é ignorado
    somente nesse modo de pré-visualização local.
  */
  const isLocalPreview = isLocalFilePreview();

  if (!getAccessToken()) {
    redirectToLogin();
    return isLocalPreview;
  }

  return true;
}

const body = document.body;

const PREFERENCE_KEYS = {
  theme: 'conecta_theme_mode',
  fontFamily: 'conecta_font_family',
  fontSize: 'conecta_font_size',
  animations: 'conecta_animations',
  reduceTransparency: 'conecta_reduce_transparency',
};

const FONT_FAMILIES = {
  inter: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Cascadia Code", "Fira Code", Consolas, monospace',
  rounded: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
};

const FONT_SIZES = {
  small: '1rem',
  normal: '1rem',
  large: '1rem',
  xlarge: '1rem',
};

const ROOT_FONT_SIZES = {
  small: '80%',
  normal: '100%',
  large: '120%',
  xlarge: '140%',
};

const FONT_SCALES = {
  small: '0.8',
  normal: '1',
  large: '1.2',
  xlarge: '1.4',
};

const CONTROL_SCALES = {
  small: '1',
  normal: '1',
  large: '1',
  xlarge: '1',
};



function getBrowserZoomRatio() {
  const visualScale = window.visualViewport?.scale || 1;
  const viewportRatio = window.outerWidth && window.innerWidth ? window.outerWidth / window.innerWidth : 1;
  const safeViewportRatio = viewportRatio > 1.08 && viewportRatio < 2.4 ? viewportRatio : 1;
  return Math.max(visualScale, safeViewportRatio, 1);
}

function getZoomSuggestedFontSizeMode() {
  const ratio = getBrowserZoomRatio();
  if (ratio >= 1.45) return 'xlarge';
  if (ratio >= 1.20) return 'large';
  return '';
}

function getEffectiveFontSizeMode(mode = getFontSizeMode()) {
  const zoomMode = getZoomSuggestedFontSizeMode();
  if (!zoomMode) return mode;
  const order = { small: 0, normal: 1, large: 2, xlarge: 3 };
  return order[zoomMode] > order[mode] ? zoomMode : mode;
}

function setupZoomGuard() {
  const preventZoom = (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };

  document.addEventListener('wheel', preventZoom, { passive: false });
  document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (event) => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    const isZoomShortcut = (event.ctrlKey || event.metaKey) && ['+', '=', '-', '_', '0'].includes(key);
    if (isZoomShortcut) event.preventDefault();
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applyFontPreferences, 120);
  });
}

function getThemeMode() {
  const saved = localStorage.getItem(PREFERENCE_KEYS.theme);
  return ['light', 'dark', 'oled'].includes(saved) ? saved : 'light';
}

function getResolvedTheme(mode = getThemeMode()) {
  return ['light', 'dark', 'oled'].includes(mode) ? mode : 'light';
}

function applyTheme(mode = getThemeMode()) {
  const resolved = getResolvedTheme(mode);
  document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-oled');
  document.documentElement.classList.add(`theme-${resolved}`);
  document.documentElement.dataset.theme = resolved;

  if (body) {
    body.classList.remove('theme-light', 'theme-dark', 'theme-oled');
    body.classList.add(`theme-${resolved}`);
    body.dataset.theme = resolved;
    body.classList.toggle('reduce-transparency', localStorage.getItem(PREFERENCE_KEYS.reduceTransparency) === 'true');
  }

  updateSidebarLogo();
  updatePreferenceControls();
}

function setThemeMode(mode) {
  const safeMode = ['light', 'dark', 'oled'].includes(mode) ? mode : 'light';
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

function getFontScale() {
  const mode = getFontSizeMode();
  return FONT_SCALES[mode] || FONT_SCALES.normal;
}

function getRootFontSize() {
  const mode = getFontSizeMode();
  return ROOT_FONT_SIZES[mode] || ROOT_FONT_SIZES.normal;
}

function getControlScale() {
  const mode = getFontSizeMode();
  return CONTROL_SCALES[mode] || CONTROL_SCALES.normal;
}

function applyFontPreferences() {
  const familyMode = getFontFamilyMode();
  const savedSizeMode = getFontSizeMode();
  const sizeMode = getEffectiveFontSizeMode(savedSizeMode);
  const fontFamily = FONT_FAMILIES[familyMode];
  const fontScale = FONT_SIZES[sizeMode];

  // Escala visual gradual. Se o navegador já estiver em 125%/150%,
  // o site assume visualmente Grande/Extra Grande sem gravar essa mudança nas configurações.
  document.documentElement.style.setProperty('font-size', ROOT_FONT_SIZES[sizeMode] || ROOT_FONT_SIZES.normal);
  document.documentElement.style.setProperty('--app-font-family', fontFamily);
  document.documentElement.style.setProperty('--app-font-size', fontScale);
  document.documentElement.style.setProperty('--app-text-scale', '1');
  document.documentElement.style.setProperty('--app-size-scale', FONT_SCALES[sizeMode] || FONT_SCALES.normal);
  document.documentElement.style.setProperty('--app-control-scale', CONTROL_SCALES[sizeMode] || CONTROL_SCALES.normal);
  document.documentElement.dataset.fontSizeMode = sizeMode;
  document.documentElement.dataset.savedFontSizeMode = savedSizeMode;
  if (body) {
    body.style.setProperty('--app-font-family', fontFamily);
    body.style.setProperty('--app-font-size', fontScale);
    body.style.setProperty('--app-text-scale', '1');
    body.style.setProperty('--app-size-scale', FONT_SCALES[sizeMode] || FONT_SCALES.normal);
    body.style.setProperty('--app-control-scale', CONTROL_SCALES[sizeMode] || CONTROL_SCALES.normal);
    body.dataset.fontSizeMode = sizeMode;
    body.dataset.savedFontSizeMode = savedSizeMode;
  }

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

// NOVO: Gerenciamento de Animações
function getAnimationsMode() {
  const saved = localStorage.getItem(PREFERENCE_KEYS.animations);
  return saved === 'disabled' ? 'disabled' : 'enabled';
}

function applyAnimationsPreference() {
  const mode = getAnimationsMode();
  if (body) {
    body.classList.remove('animations-enabled', 'animations-disabled');
    body.classList.add(`animations-${mode}`);
  }
  updatePreferenceControls();
}

function setAnimationsMode(mode) {
  const safeMode = mode === 'disabled' ? 'disabled' : 'enabled';
  localStorage.setItem(PREFERENCE_KEYS.animations, safeMode);
  applyAnimationsPreference();
}

function resetAppearancePreferences() {
  localStorage.removeItem(PREFERENCE_KEYS.theme);
  localStorage.removeItem(PREFERENCE_KEYS.fontFamily);
  localStorage.removeItem(PREFERENCE_KEYS.fontSize);
  localStorage.removeItem(PREFERENCE_KEYS.animations);
  applyTheme('light');
  applyFontPreferences();
  applyAnimationsPreference();
}

function updatePreferenceControls() {
  const themeMode = getThemeMode();
  const themeSelect = document.getElementById('themeMode');
  const themeRadios = document.querySelectorAll('input[name="themeMode"]');
  const fontSelect = document.getElementById('fontFamilyMode') || document.getElementById('fontFamily');
  const sizeSelect = document.getElementById('fontSizeMode') || document.getElementById('fontSize');
  const animSelect = document.getElementById('animationsMode');
  const animToggle = document.getElementById('toggleAnimations');
  const transToggle = document.getElementById('toggleTransparency');
  const themePreview = document.getElementById('themeModePreview');

  if (themeSelect) themeSelect.value = themeMode;
  themeRadios.forEach((radio) => { radio.checked = radio.value === themeMode; });
  if (fontSelect) fontSelect.value = getFontFamilyMode();
  if (sizeSelect) sizeSelect.value = getFontSizeMode();
  if (animSelect) animSelect.value = getAnimationsMode();
  if (animToggle) animToggle.checked = getAnimationsMode() !== 'disabled';
  if (transToggle) transToggle.checked = localStorage.getItem(PREFERENCE_KEYS.reduceTransparency) === 'true';
  
  if (themePreview) {
    const labels = { light: 'claro', dark: 'escuro', oled: 'OLED' };
    themePreview.textContent = `Tema ${labels[getResolvedTheme()] || 'claro'} selecionado.`;
  }
}

function initSettingsControls() {
  const themeSelect = document.getElementById('themeMode');
  const themeRadios = document.querySelectorAll('input[name="themeMode"]');
  const fontSelect = document.getElementById('fontFamilyMode') || document.getElementById('fontFamily');
  const sizeSelect = document.getElementById('fontSizeMode') || document.getElementById('fontSize');
  const animSelect = document.getElementById('animationsMode');
  const resetBtn = document.getElementById('resetAppearancePreferences');

  themeSelect?.addEventListener('change', (event) => setThemeMode(event.target.value));
  themeRadios.forEach((radio) => radio.addEventListener('change', (event) => setThemeMode(event.target.value)));
  fontSelect?.addEventListener('change', (event) => setFontFamilyMode(event.target.value));
  sizeSelect?.addEventListener('change', (event) => setFontSizeMode(event.target.value));
  animSelect?.addEventListener('change', (event) => setAnimationsMode(event.target.value));
  
  resetBtn?.addEventListener('click', resetAppearancePreferences);
  updatePreferenceControls();
}

function setupMobileBottomNav() {
  if (!window.location.pathname.includes('/pages/')) return;
  if (document.querySelector('.mobile-bottom-nav')) return;

  const currentPage = window.location.pathname.split('/').pop() || 'feed.html';
  const items = [
    { href: 'feed.html', label: 'Home', icon: '<svg viewBox="0 0 24 24"><path d="M3.5 10.8 12 3.5l8.5 7.3V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1v-9.2Z" /></svg>', pages: ['feed.html'] },
    { href: 'communities.html', label: 'Comunidades', icon: '<svg viewBox="0 0 24 24"><path d="M7.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20.5a4.5 4.5 0 0 1 9 0m0 0a4.5 4.5 0 0 1 9 0" /></svg>', pages: ['communities.html', 'community.html'] },
    { href: 'friends.html', label: 'Amizades', icon: '<svg viewBox="0 0 24 24"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-5.5 9a5.5 5.5 0 0 1 11 0m4-9v6m-3-3h6" /></svg>', pages: ['friends.html'] },
    { href: 'profile.html', label: 'Perfil', icon: '<svg viewBox="0 0 24 24"><path d="M12 12.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 21a8 8 0 0 1 16 0" /></svg>', pages: ['profile.html', 'profileuser.html'] },
    {href: 'settings.html', label: 'Config.', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7Z" /><path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.4 7.4 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.6.24-1.17.56-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.02.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.52.42 1.08.74 1.69.98l.38 2.65a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.38-2.65c.6-.24 1.17-.56 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65Z" /></svg>', pages: ['settings.html']},
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

function setupCookieBanner() {
  const banner = document.getElementById('cookieBanner');
  if (!banner) return;
  const accepted = localStorage.getItem('conecta_cookie_consent') === 'accepted';
  banner.classList.toggle('d-none', accepted);
  document.getElementById('acceptCookiesBtn')?.addEventListener('click', () => {
    localStorage.setItem('conecta_cookie_consent', 'accepted');
    document.cookie = 'conecta_cookie_consent=accepted; max-age=31536000; path=/; SameSite=Lax';
    banner.classList.add('d-none');
  });
}

function postDestinationUrl(post = {}) {
  const community = post.community || post.community_data || null;
  const slug = community?.slug || post.community_slug;
  const postId = post.id ? `&post=${encodeURIComponent(post.id)}` : '';
  if (slug) return `community.html?slug=${encodeURIComponent(slug)}${postId}`;
  return `feed.html${post.id ? `?post=${encodeURIComponent(post.id)}` : ''}`;
}

function setupProfilePhotoViewer() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-photo-viewer]');
    if (!trigger) return;
    const img = trigger.querySelector('img');
    if (!img) return;
    let modal = document.getElementById('photoViewerModal');
    if (!modal) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="photoViewerModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered photo-viewer-dialog">
            <div class="modal-content photo-viewer-content">
              <div class="modal-header border-0">
                <h2 class="modal-title fs-6 fw-bold" id="photoViewerTitle">Foto</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
              </div>
              <div class="modal-body text-center">
                <img id="photoViewerImage" class="photo-viewer-img" alt="Foto ampliada">
              </div>
            </div>
          </div>
        </div>
      `);
      modal = document.getElementById('photoViewerModal');
    }
    const modalImg = document.getElementById('photoViewerImage');
    const modalTitle = document.getElementById('photoViewerTitle');
    if (!modal || !modalImg) return;
    modalImg.src = cachedImageUrl(img.currentSrc || img.src);
    modalImg.alt = img.alt || 'Foto ampliada';
    if (modalTitle) modalTitle.textContent = trigger.dataset.photoTitle || 'Foto';
    bootstrap.Modal.getOrCreateInstance(modal).show();
  });
}

function setupRegisterRules() {
  const rules = document.getElementById('registerRulesAccepted');
  if (!rules) return;
  rules.addEventListener('change', syncRegisterSubmitState);
  syncRegisterSubmitState();
}

applyTheme();
applyFontPreferences();
applyAnimationsPreference(); // Aplica a regra de animação no boot do JS

document.addEventListener('DOMContentLoaded', () => {
  setupZoomGuard();

  document.querySelectorAll('[data-logout], #logoutBtn').forEach((button) => {
    button.addEventListener('click', logout);
  });

  setupMobileBottomNav();
  initSettingsControls();
  setupCookieBanner();
  setupProfilePhotoViewer();
  setupRegisterRules();
  ConectaImageCache.preloadStoredImages();
  ConectaImageCache.preloadLogos();
  ConectaImageCache.hydratePageImages();

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

const REGISTER_STEP = {
  EMAIL: 'email',
  CODE: 'code',
  FORM: 'form',
};

const REGISTER_STEP_LABELS = {
  [REGISTER_STEP.EMAIL]: 'Enviar código',
  [REGISTER_STEP.CODE]: 'Verificar código',
  [REGISTER_STEP.FORM]: 'Finalizar cadastro',
};

const REGISTER_STEP_TITLES = {
  [REGISTER_STEP.EMAIL]: 'Verificar Email Institucional',
  [REGISTER_STEP.CODE]: 'Confirmar Código',
  [REGISTER_STEP.FORM]: 'Criar Nova Conta',
};

const registerState = {
  step: REGISTER_STEP.EMAIL,
  email: '',
  verificationId: '',
  registrationToken: '',
  isLoading: false,
};

const registerForm = document.getElementById('registerForm');

function getRegisterInput(id) {
  return document.getElementById(id);
}

function setRegisterMessage(type, message) {
  const error = document.getElementById('registerError');
  const success = document.getElementById('registerSuccess');
  if (!error || !success) return;

  error.style.display = 'none';
  success.style.display = 'none';
  error.textContent = '';
  success.textContent = '';

  if (!message) return;

  const target = type === 'success' ? success : error;
  target.textContent = message;
  target.style.display = 'block';
}

function updateRegisterStepInputs() {
  document.querySelectorAll('[data-register-step]').forEach((panel) => {
    const isActive = panel.dataset.registerStep === registerState.step;
    panel.hidden = !isActive;
    panel.querySelectorAll('input, textarea, select, button').forEach((control) => {
      if (control.id === 'regVerifiedEmail') return;
      control.disabled = !isActive || registerState.isLoading;
    });
  });
}

function syncRegisterSubmitState() {
  const button = document.getElementById('regSubmitBtn');
  if (!button) return;

  const rules = document.getElementById('registerRulesAccepted');
  const needsRules = registerState.step === REGISTER_STEP.FORM;
  const rulesBlocked = needsRules && rules && !rules.checked;

  button.disabled = registerState.isLoading || Boolean(rulesBlocked);
  button.textContent = registerState.isLoading
    ? 'Processando...'
    : REGISTER_STEP_LABELS[registerState.step];
}

function setRegisterStep(step, options = {}) {
  registerState.step = step;

  document.querySelectorAll('[data-register-step-dot]').forEach((dot) => {
    const dotStep = dot.dataset.registerStepDot;
    dot.classList.toggle('active', dotStep === step);
    dot.classList.toggle('completed',
      (step === REGISTER_STEP.CODE && dotStep === REGISTER_STEP.EMAIL) ||
      (step === REGISTER_STEP.FORM && dotStep !== REGISTER_STEP.FORM)
    );
  });

  const title = document.getElementById('registerModalLabel');
  if (title) title.textContent = REGISTER_STEP_TITLES[step];

  const backButton = document.getElementById('regBackBtn');
  if (backButton) backButton.style.display = step === REGISTER_STEP.EMAIL ? 'none' : 'inline-flex';

  const emailPreview = document.getElementById('registerEmailPreview');
  if (emailPreview) emailPreview.textContent = registerState.email;

  const verifiedEmail = document.getElementById('regVerifiedEmail');
  if (verifiedEmail) verifiedEmail.value = registerState.email;

  updateRegisterStepInputs();
  syncRegisterSubmitState();

  if (!options.keepMessage) setRegisterMessage('', '');
}

function setRegisterLoading(isLoading) {
  registerState.isLoading = isLoading;
  updateRegisterStepInputs();
  syncRegisterSubmitState();
}

function resetRegisterFlow() {
  registerState.step = REGISTER_STEP.EMAIL;
  registerState.email = '';
  registerState.verificationId = '';
  registerState.registrationToken = '';
  registerState.isLoading = false;

  registerForm?.reset();
  const actions = document.getElementById('registerExistingEmailActions');
  if (actions) actions.style.display = 'none';
  const verifiedEmail = document.getElementById('regVerifiedEmail');
  if (verifiedEmail) verifiedEmail.value = '';

  setRegisterStep(REGISTER_STEP.EMAIL);
}

async function readResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function startEmailVerification() {
  const emailInput = getRegisterInput('regEmail');
  const email = emailInput?.value.trim().toLowerCase() || '';

  if (!email) {
    setRegisterMessage('error', 'Digite seu email institucional para continuar.');
    return;
  }

  const actions = document.getElementById('registerExistingEmailActions');
  if (actions) actions.style.display = 'none';

  setRegisterLoading(true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/email-verification/start/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await readResponseJson(response);

    if (!response.ok) {
      setRegisterMessage('error', getApiError(data, 'Não foi possível enviar o código.'));

      if (data?.code === 'email_already_registered' && actions) {
        actions.style.display = 'flex';
      }

      return;
    }

    registerState.email = email;
    registerState.verificationId = data?.verification_id || '';
    registerState.registrationToken = '';

    setRegisterStep(REGISTER_STEP.CODE, { keepMessage: true });
    setRegisterMessage('success', data?.message || 'Código enviado para o email institucional.');
    getRegisterInput('regVerificationCode')?.focus();
  } catch (error) {
    console.error('Erro ao iniciar verificação:', error);
    setRegisterMessage('error', 'Erro de conexão com o servidor.');
  } finally {
    setRegisterLoading(false);
  }
}

async function confirmEmailVerification() {
  const codeInput = getRegisterInput('regVerificationCode');
  const code = codeInput?.value.trim() || '';

  if (!registerState.verificationId) {
    setRegisterMessage('error', 'Solicite um novo código para continuar.');
    setRegisterStep(REGISTER_STEP.EMAIL);
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    setRegisterMessage('error', 'Digite o código de 6 dígitos enviado para o email.');
    return;
  }

  setRegisterLoading(true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/email-verification/confirm/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verification_id: registerState.verificationId,
        code,
      }),
    });

    const data = await readResponseJson(response);

    if (!response.ok) {
      const attempts = Number.isInteger(data?.attempts_left)
        ? ` Tentativas restantes: ${data.attempts_left}.`
        : '';
      setRegisterMessage('error', `${getApiError(data, 'Código inválido.')}${attempts}`);
      return;
    }

    registerState.email = data?.email || registerState.email;
    registerState.registrationToken = data?.registration_token || '';

    setRegisterStep(REGISTER_STEP.FORM, { keepMessage: true });
    setRegisterMessage('success', data?.message || 'Email verificado com sucesso.');
    getRegisterInput('regFirstName')?.focus();
  } catch (error) {
    console.error('Erro ao confirmar código:', error);
    setRegisterMessage('error', 'Erro de conexão com o servidor.');
  } finally {
    setRegisterLoading(false);
  }
}

async function finishRegistration() {
  const password = getRegisterInput('regPassword')?.value || '';
  const passwordConfirm = getRegisterInput('regPasswordConfirm')?.value || '';
  const rulesAccepted = getRegisterInput('registerRulesAccepted');

  setRegisterMessage('', '');

  if (!registerState.registrationToken) {
    setRegisterMessage('error', 'Confirme o email antes de finalizar o cadastro.');
    setRegisterStep(REGISTER_STEP.EMAIL);
    return;
  }

  if (password !== passwordConfirm) {
    setRegisterMessage('error', 'As senhas não coincidem. Tente novamente.');
    return;
  }

  if (rulesAccepted && !rulesAccepted.checked) {
    setRegisterMessage('error', 'Você precisa aceitar as regras de convivência para criar a conta.');
    return;
  }

  const userData = {
    first_name: getRegisterInput('regFirstName')?.value.trim() || '',
    last_name: getRegisterInput('regLastName')?.value.trim() || '',
    nickname: getRegisterInput('regNickname')?.value.trim() || '',
    registration_token: registerState.registrationToken,
    password,
    confirm_password: passwordConfirm,
  };

  setRegisterLoading(true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/users/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    const data = await readResponseJson(response);

    if (!response.ok) {
      setRegisterMessage('error', getApiError(data, 'Erro ao cadastrar.'));
      return;
    }

    setRegisterMessage('success', data?.message || 'Conta criada com sucesso!');

    setTimeout(() => {
      document.querySelector('#registerModal .btn-close')?.click();
    }, 1400);
  } catch (error) {
    console.error('Erro ao finalizar cadastro:', error);
    setRegisterMessage('error', 'Erro de conexão com o servidor.');
  } finally {
    setRegisterLoading(false);
  }
}

if (registerForm) {
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (registerState.step === REGISTER_STEP.EMAIL) {
      await startEmailVerification();
      return;
    }

    if (registerState.step === REGISTER_STEP.CODE) {
      await confirmEmailVerification();
      return;
    }

    await finishRegistration();
  });

  document.getElementById('regBackBtn')?.addEventListener('click', () => {
    if (registerState.step === REGISTER_STEP.FORM) {
      setRegisterStep(REGISTER_STEP.CODE);
      return;
    }

    setRegisterStep(REGISTER_STEP.EMAIL);
  });

  document.getElementById('regChangeEmailBtn')?.addEventListener('click', () => {
    registerState.email = '';
    registerState.verificationId = '';
    registerState.registrationToken = '';
    getRegisterInput('regVerificationCode').value = '';
    setRegisterStep(REGISTER_STEP.EMAIL);
    getRegisterInput('regEmail')?.focus();
  });

  document.getElementById('registerBackFromExisting')?.addEventListener('click', () => {
    const actions = document.getElementById('registerExistingEmailActions');
    if (actions) actions.style.display = 'none';
    setRegisterMessage('', '');
    getRegisterInput('regEmail')?.focus();
  });

  document.getElementById('registerForgotPasswordBtn')?.addEventListener('click', () => {
    setRegisterMessage('error', 'A recuperação de senha ainda não está conectada no frontend. Use o login se já souber sua senha.');
  });

  document.getElementById('regVerificationCode')?.addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
  });

  document.getElementById('registerModal')?.addEventListener('hidden.bs.modal', resetRegisterFlow);
  resetRegisterFlow();
}

function toApiUrl(url) {
  if (!url) return '';
  const value = String(url);
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) return value;
  if (value.startsWith('/')) return `${API_BASE_URL}${value}`;
  return `${API_BASE_URL}/${value}`;
}

function nestedUserFrom(user = {}) {
  if (!user || typeof user !== 'object') return {};
  return user.user || user.profile || user.student || user.friend || user.member || user.participant || user.sender || user.receiver || {};
}

function userProfileSource(user = {}) {
  if (!user || typeof user !== 'object') return {};

  const nested = nestedUserFrom(user);
  const hasNested = nested && typeof nested === 'object' && Object.keys(nested).length > 0;

  if (!hasNested) return user;

  return {
    ...nested,
    ...user,
    id: user.id ?? nested.id,
    nickname: user.nickname || nested.nickname || nested.username,
    username: user.username || nested.username || nested.nickname,
    full_name: user.full_name || nested.full_name || nested.name,
    first_name: user.first_name || nested.first_name,
    last_name: user.last_name || nested.last_name,
    course: user.course || nested.course,
  };
}

function normalizePhotoValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return value.url || value.src || value.href || value.path || value.image || value.photo || '';
  }
  return '';
}

function photoFromObject(source = {}) {
  if (!source || typeof source !== 'object') return '';

  const candidates = [
    source.photo_url,
    source.photo,
    source.avatar_url,
    source.avatar,
    source.profile_photo,
    source.profile_picture,
    source.profile_image,
    source.picture,
    source.picture_url,
    source.image_url,
    source.image,
    source.user_photo,
    source.member_photo,
    source.creator_photo,
    source.author_photo,
  ];

  for (const candidate of candidates) {
    const photo = normalizePhotoValue(candidate);
    if (photo) return photo;
  }

  return '';
}

function userDisplayName(user = {}) {
  const source = userProfileSource(user);
  return source.full_name || source.name || `${source.first_name || ''} ${source.last_name || ''}`.trim() || source.nickname || source.username || 'Usuário';
}

function truncateText(value = '', limit = 20) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function userPhoto(user = {}) {
  const source = userProfileSource(user);
  return photoFromObject(source) || photoFromObject(nestedUserFrom(user));
}

function avatarColorClass(seed = '') {
  const classes = ['static-avatar-blue', 'static-avatar-green', 'static-avatar-purple', 'static-avatar-orange', 'static-avatar-red', 'static-avatar-indigo', 'static-avatar-teal', 'static-avatar-pink', 'static-avatar-gray'];
  const text = String(seed || 'user');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i) * (i + 1)) % classes.length;
  return classes[hash];
}

function avatarHTML(user = {}, sizeClass = 'user-avatar') {
  const source = userProfileSource(user);
  const name = userDisplayName(source);
  const nickname = source.nickname || source.username || name;
  const photo = cachedImageUrl(toApiUrl(userPhoto(source)));

  if (photo) {
    return `<div class="${sizeClass} has-image"><img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy" decoding="async"></div>`;
  }

  return `<div class="${sizeClass} static-avatar ${avatarColorClass(nickname)}">${escapeHTML(getInitials(name || nickname))}</div>`;
}

function profileUrlFor(user = {}) {
  const source = userProfileSource(user);
  const nickname = source.nickname || source.username || '';
  const logged = getLoggedUserFromStorage();

  if (logged?.nickname && nickname === logged.nickname) return 'profile.html';

  return `profileuser.html?nickname=${encodeURIComponent(nickname)}`;
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
  const photo = cachedImageUrl(toApiUrl(communityPhoto(community)));
  if (photo) {
    return `<div class="${sizeClass} has-image"><img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy" decoding="async"></div>`;
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

  const withPrefix = (text) => (prefix ? `${prefix} ${text}` : text);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return withPrefix('agora');

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return withPrefix('agora');

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return withPrefix(`há ${minutes} min`);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return withPrefix(`há ${hours}h`);

  const days = Math.floor(hours / 24);
  if (days < 7) return withPrefix(`há ${days} ${days === 1 ? 'dia' : 'dias'}`);

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return withPrefix(`há ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`);

  return date.toLocaleDateString('pt-BR');
}

function compactRelativeTime(value, prefix = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const join = (text) => (prefix ? `${prefix} ${text}` : text);
  if (diffMs < 0) return join('agora');

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return join('agora');

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return join(`${minutes}m`);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return join(`${hours}h`);

  const days = Math.floor(hours / 24);
  if (days < 7) return join(`${days}d`);

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return join(`${weeks}sem`);

  return date.toLocaleDateString('pt-BR');
}

function postLikesCount(post = {}) {
  return post.total_likes ?? post.likes_count ?? post.likes ?? 0;
}

// =========================================================
// OTIMIZAÇÃO: FILTRO PARA CONTAR APENAS COMENTÁRIOS PRINCIPAIS
// =========================================================
function postCommentsCount(post = {}) {
  const topLevel = normalizeArray(post.top_level_comments, 'results');
  const allComments = normalizeArray(post.comments, 'results');
  const source = topLevel.length ? topLevel : allComments;

  // Se a lista de comentários estiver disponível, conta apenas os principais (sem pai)
  if (source.length > 0) {
    return source.filter(c => {
      const parentId = typeof c.parent === 'object' ? c.parent?.id : (c.parent || c.parent_id);
      return !parentId;
    }).length;
  }

  // Fallback para caso a API não envie a lista e apenas envie o contador total
  if (Number.isFinite(Number(post.top_level_comments_count))) return Number(post.top_level_comments_count);
  if (Number.isFinite(Number(post.comments_count))) return Number(post.comments_count);
  if (Number.isFinite(Number(post.total_comments))) return Number(post.total_comments);
  
  return 0;
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
  const promises = paths.map(path =>
    apiJSON(path, options).then(data => data)
  );

  try {
    return await Promise.any(promises);
  } catch (aggregateError) {
    throw new Error('Nenhum dos endpoints de busca encontrou os dados.');
  }
}

// Detecta a página atual e acende o indicador na Sidebar
document.addEventListener("DOMContentLoaded", () => {
  // Pega o nome do arquivo atual na URL (ex: feed.html)
  let currentPage = window.location.pathname.split("/").pop() || "feed.html";
  
  // Regra especial: se estiver dentro da página de UMA comunidade, a aba "Comunidades" fica acesa
  if (currentPage === "community.html") {
    currentPage = "communities.html";
  }

  // Seleciona todos os links da nova sidebar
  const navLinks = document.querySelectorAll(".modern-nav .sidebar-link");

  navLinks.forEach(link => {
    const linkPage = link.getAttribute("href").split("/").pop();
    
    // Se o link do menu bater com a página atual, adiciona a classe active
    if (linkPage === currentPage) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
});
function updateSidebarLogo() {
  const logo = document.getElementById("sidebarLogo");
  if (!logo) return;

  const theme =
    document.documentElement.dataset.theme ||
    document.body?.dataset.theme ||
    localStorage.getItem(PREFERENCE_KEYS.theme) ||
    (document.documentElement.classList.contains("theme-oled") && "oled") ||
    (document.documentElement.classList.contains("theme-dark") && "dark") ||
    (document.body?.classList.contains("theme-oled") && "oled") ||
    (document.body?.classList.contains("theme-dark") && "dark") ||
    "light";

  const isDarkTheme = theme === "dark" || theme === "oled";
  const lightLogo = logo.dataset.logoLight || logo.dataset.logoDefault || "../assets/img/logo-light.svg";
  const darkLogo = logo.dataset.logoDark || "../assets/img/logo-dark.svg";
  const nextSrc = isDarkTheme ? darkLogo : lightLogo;

  if (nextSrc && logo.getAttribute("src") !== nextSrc) logo.src = nextSrc;
}

document.addEventListener("DOMContentLoaded", updateSidebarLogo);

const logoThemeObserver = new MutationObserver(updateSidebarLogo);

logoThemeObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme", "class"],
});

logoThemeObserver.observe(document.body, {
  attributes: true,
  attributeFilter: ["data-theme", "class"],
});