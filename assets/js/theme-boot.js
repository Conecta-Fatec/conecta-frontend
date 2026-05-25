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
    small: '87.5%',
    normal: '100%',
    large: '112.5%',
    xlarge: '125%',
  };

  const FONT_SCALES = {
    small: '0.875',
    normal: '1',
    large: '1.125',
    xlarge: '1.25',
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

  function applyRootPreferences() {
    const theme = readTheme();
    const root = document.documentElement;

    root.classList.remove('theme-light', 'theme-dark', 'theme-oled');
    root.classList.add(`theme-${theme}`);
    // Escala visual gradual
    root.style.setProperty('font-size', readRootFontSize());
    root.style.setProperty('--app-font-family', readFontFamily());
    root.style.setProperty('--app-font-size', readFontSize());
    root.style.setProperty('--app-text-scale', '1');
    root.style.setProperty('--app-control-scale', readControlScale());
    root.dataset.theme = theme;
  }

  function applyBodyPreferences() {
    if (!document.body) return;

    const theme = readTheme();
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-oled');
    document.body.classList.add(`theme-${theme}`);
    document.body.classList.toggle('reduce-transparency', localStorage.getItem(KEYS.reduceTransparency) === 'true');
    document.body.classList.toggle('animations-disabled', localStorage.getItem(KEYS.animations) === 'disabled');
    document.body.classList.toggle('animations-enabled', localStorage.getItem(KEYS.animations) !== 'disabled');
    document.body.style.setProperty('--app-font-family', readFontFamily());
    document.body.style.setProperty('--app-font-size', readFontSize());
    document.body.style.setProperty('--app-text-scale', '1');
    document.body.style.setProperty('--app-control-scale', readControlScale());
    document.body.dataset.theme = theme;
  }

  applyRootPreferences();
  applyBodyPreferences();
  document.addEventListener('DOMContentLoaded', applyBodyPreferences, { once: true });
})();
