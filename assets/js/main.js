/* =========================================================
   CONECTA FATEC: Funções Globais e Core da Aplicação
   - Otimizado com processamento paralelo e contagem de comentários corrigida
========================================================= */

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
    { href: 'feed.html', label: 'Home', icon: '<svg viewBox="0 0 24 24"><path d="M3.5 10.8 12 3.5l8.5 7.3V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1v-9.2Z" /></svg>', pages: ['feed.html'] },
    { href: 'communities.html', label: 'Comunidades', icon: '<svg viewBox="0 0 24 24"><path d="M7.5 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm9 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20.5a4.5 4.5 0 0 1 9 0m0 0a4.5 4.5 0 0 1 9 0" /></svg>', pages: ['communities.html', 'community.html'] },
    { href: 'friends.html', label: 'Amizades', icon: '<svg viewBox="0 0 24 24"><path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-5.5 9a5.5 5.5 0 0 1 11 0m4-9v6m-3-3h6" /></svg>', pages: ['friends.html'] },
    { href: 'profile.html', label: 'Perfil', icon: '<svg viewBox="0 0 24 24"><path d="M12 12.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 21a8 8 0 0 1 16 0" /></svg>', pages: ['profile.html', 'profileuser.html'] },
    { href: 'settings.html', label: 'Config.', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2a1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9a1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1.1a1 1 0 0 0 1.1.2a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1a1 1 0 0 0 .9.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6a1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1a1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6Z" /></svg>', pages: ['settings.html', 'about.html', 'notifications.html'] },
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
    modalImg.src = img.src;
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

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-logout], #logoutBtn').forEach((button) => {
    button.addEventListener('click', logout);
  });

  setupMobileBottomNav();
  initSettingsControls();
  setupCookieBanner();
  setupProfilePhotoViewer();
  setupRegisterRules();

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
  const photo = toApiUrl(userPhoto(source));

  if (photo) {
    return `<div class="${sizeClass} has-image"><img src="${escapeHTML(photo)}" alt="Foto de ${escapeHTML(name)}" loading="lazy"></div>`;
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