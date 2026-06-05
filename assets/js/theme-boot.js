/* =========================================================
   CONECTA FATEC: boot visual sem flash de tema
   - Aplica tema, fonte, tamanho, transparência e animações antes do CSS renderizar.
========================================================= */
(function () {
  const KEYS = {
    theme: 'conecta_theme_mode',
    fontFamily: 'conecta_font_family',
    fontSize: 'conecta_font_size',
    reduceTransparency: 'conecta_reduce_transparency',
    animations: 'conecta_animations',
  };

  const THEME_MODES = new Set(['light', 'dark', 'oled']);
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

  function readTheme() {
    const saved = localStorage.getItem(KEYS.theme);
    return THEME_MODES.has(saved) ? saved : 'light';
  }

  function readFontFamily() {
    const saved = localStorage.getItem(KEYS.fontFamily);
    return FONT_FAMILIES[saved] || FONT_FAMILIES.inter;
  }

  function readFontSize() {
    const saved = localStorage.getItem(KEYS.fontSize);
    return FONT_SIZES[saved] || FONT_SIZES.normal;
  }

  function readFontSizeMode() {
    const saved = localStorage.getItem(KEYS.fontSize);
    return Object.prototype.hasOwnProperty.call(FONT_SIZES, saved) ? saved : 'normal';
  }

  function readFontScale() {
    const saved = localStorage.getItem(KEYS.fontSize);
    return FONT_SCALES[saved] || FONT_SCALES.normal;
  }

  function readControlScale() {
    const saved = localStorage.getItem(KEYS.fontSize);
    return CONTROL_SCALES[saved] || CONTROL_SCALES.normal;
  }

  function readRootFontSize() {
    const saved = localStorage.getItem(KEYS.fontSize);
    return ROOT_FONT_SIZES[saved] || ROOT_FONT_SIZES.normal;
  }



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

  function getEffectiveFontSizeMode() {
    const saved = readFontSizeMode();
    const zoomMode = getZoomSuggestedFontSizeMode();
    if (!zoomMode) return saved;
    const order = { small: 0, normal: 1, large: 2, xlarge: 3 };
    return order[zoomMode] > order[saved] ? zoomMode : saved;
  }

  function applyRootPreferences() {
    const theme = readTheme();
    const root = document.documentElement;
    const effectiveSizeMode = getEffectiveFontSizeMode();

    root.classList.remove('theme-light', 'theme-dark', 'theme-oled');
    root.classList.add(`theme-${theme}`);
    // Escala visual gradual
    root.style.setProperty('font-size', ROOT_FONT_SIZES[effectiveSizeMode] || ROOT_FONT_SIZES.normal);
    root.style.setProperty('--app-font-family', readFontFamily());
    root.style.setProperty('--app-font-size', FONT_SIZES[effectiveSizeMode] || FONT_SIZES.normal);
    root.style.setProperty('--app-text-scale', '1');
    root.style.setProperty('--app-size-scale', FONT_SCALES[effectiveSizeMode] || FONT_SCALES.normal);
    root.style.setProperty('--app-control-scale', CONTROL_SCALES[effectiveSizeMode] || CONTROL_SCALES.normal);
    root.dataset.theme = theme;
    root.dataset.fontSizeMode = effectiveSizeMode;
    root.dataset.savedFontSizeMode = readFontSizeMode();
  }

  function applyBodyPreferences() {
    if (!document.body) return;

    const theme = readTheme();
    const effectiveSizeMode = getEffectiveFontSizeMode();
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-oled');
    document.body.classList.add(`theme-${theme}`);
    document.body.classList.toggle('reduce-transparency', localStorage.getItem(KEYS.reduceTransparency) === 'true');
    document.body.classList.toggle('animations-disabled', localStorage.getItem(KEYS.animations) === 'disabled');
    document.body.classList.toggle('animations-enabled', localStorage.getItem(KEYS.animations) !== 'disabled');
    document.body.style.setProperty('--app-font-family', readFontFamily());
    document.body.style.setProperty('--app-font-size', FONT_SIZES[effectiveSizeMode] || FONT_SIZES.normal);
    document.body.style.setProperty('--app-text-scale', '1');
    document.body.style.setProperty('--app-size-scale', FONT_SCALES[effectiveSizeMode] || FONT_SCALES.normal);
    document.body.style.setProperty('--app-control-scale', CONTROL_SCALES[effectiveSizeMode] || CONTROL_SCALES.normal);
    document.body.dataset.theme = theme;
    document.body.dataset.fontSizeMode = effectiveSizeMode;
    document.body.dataset.savedFontSizeMode = readFontSizeMode();
  }

  applyRootPreferences();
  applyBodyPreferences();
  document.addEventListener('DOMContentLoaded', applyBodyPreferences, { once: true });
})();
