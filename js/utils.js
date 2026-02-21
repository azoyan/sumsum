/**
 * SumSum — Вспомогательные функции
 * @file utils.js
 */

'use strict';

/**
 * Генерация случайного целого числа в диапазоне [min, max]
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Случайный выбор элемента из массива
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Перемешивание массива (Fisher-Yates)
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ограничение значения в диапазоне
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Линейная интерполяция
 * @param {number} a
 * @param {number} b
 * @param {number} t — от 0 до 1
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Ease-out кубическая
 * @param {number} t
 * @returns {number}
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Ease-in-out кубическая
 * @param {number} t
 * @returns {number}
 */
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Генерация уникального ID
 * @returns {string}
 */
let _idCounter = 0;
function generateId() {
  return `cube_${Date.now()}_${_idCounter++}`;
}

/**
 * Цвет кубика по числу (1-12)
 * Градиент от синего к красному
 * @param {number} value — число на кубике (1-12)
 * @returns {{ bg: string, border: string, text: string }}
 */
function getCubeColors(value) {
  const colors = [
    null, // 0 — не используется
    { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },  // 1 — синий
    { bg: '#6366f1', border: '#4f46e5', text: '#ffffff' },  // 2 — индиго
    { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },  // 3 — фиолетовый
    { bg: '#a855f7', border: '#9333ea', text: '#ffffff' },  // 4 — пурпурный
    { bg: '#d946ef', border: '#c026d3', text: '#ffffff' },  // 5 — фуксия
    { bg: '#ec4899', border: '#db2777', text: '#ffffff' },  // 6 — розовый
    { bg: '#f43f5e', border: '#e11d48', text: '#ffffff' },  // 7 — алый
    { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },  // 8 — красный
    { bg: '#f97316', border: '#ea580c', text: '#ffffff' },  // 9 — оранжевый
    { bg: '#eab308', border: '#ca8a04', text: '#1a1a2e' },  // 10 — жёлтый
    { bg: '#84cc16', border: '#65a30d', text: '#1a1a2e' },  // 11 — лайм
    { bg: '#22c55e', border: '#16a34a', text: '#ffffff' },  // 12 — зелёный
  ];
  return colors[clamp(value, 1, 12)] || colors[1];
}

/**
 * Форматирование числа с разделителями тысяч
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return n.toLocaleString('ru-RU');
}

/**
 * Дебаунс
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Троттлинг
 * @param {Function} fn
 * @param {number} limit
 * @returns {Function}
 */
function throttle(fn, limit) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

/**
 * Создание объекта кубика
 * @param {number} value — число
 * @param {number} column — индекс колонки
 * @returns {Object}
 */
function createCube(value, column) {
  return {
    id: generateId(),
    value: value,
    column: column,
    row: -1,           // будет установлена при размещении
    selected: false,
    falling: false,
    fallProgress: 0,   // 0..1 прогресс анимации падения
    fallFrom: -1,      // начальная позиция (ряд) для анимации
    fallTo: -1,        // конечная позиция
    removing: false,
    removeProgress: 0, // 0..1 прогресс анимации удаления
    spawnTime: Date.now(),
    bounceProgress: 0, // 0..1 прогресс bounce-анимации при появлении
  };
}

/**
 * Простой синтезатор звуков через Web Audio API
 */
class SoundFX {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this._initOnInteraction = this._initOnInteraction.bind(this);
    document.addEventListener('touchstart', this._initOnInteraction, { once: true });
    document.addEventListener('click', this._initOnInteraction, { once: true });
  }

  _initOnInteraction() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
    }
  }

  /**
   * Проиграть тон
   * @param {number} freq — частота Гц
   * @param {number} duration — длительность сек
   * @param {string} type — тип осциллятора
   * @param {number} volume — громкость 0..1
   */
  _playTone(freq, duration, type = 'sine', volume = 0.3) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) { /* ignore */ }
  }

  /** Звук выбора кубика */
  select() { this._playTone(440, 0.1, 'sine', 0.2); }

  /** Звук отмены выбора */
  deselect() { this._playTone(330, 0.08, 'sine', 0.15); }

  /** Звук успешного сбора суммы */
  match() {
    this._playTone(523, 0.15, 'sine', 0.3);
    setTimeout(() => this._playTone(659, 0.15, 'sine', 0.3), 80);
    setTimeout(() => this._playTone(784, 0.2, 'sine', 0.3), 160);
  }

  /** Звук комбо */
  combo() {
    this._playTone(587, 0.1, 'sine', 0.2);
    setTimeout(() => this._playTone(740, 0.1, 'sine', 0.2), 60);
    setTimeout(() => this._playTone(784, 0.15, 'sine', 0.25), 120);
    setTimeout(() => this._playTone(880, 0.2, 'sine', 0.2), 200);
  }

  /** Звук проигрыша */
  gameOver() {
    this._playTone(440, 0.3, 'sine', 0.2);
    setTimeout(() => this._playTone(370, 0.3, 'sine', 0.2), 200);
    setTimeout(() => this._playTone(311, 0.5, 'sine', 0.25), 400);
  }

  /** Звук падения кубика */
  drop() { this._playTone(200, 0.08, 'sine', 0.1); }

  /** Звук предупреждения */
  warning() { this._playTone(220, 0.2, 'sine', 0.15); }

  /** Звук повышения уровня */
  levelUp() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, 0.15, 'sine', 0.25), i * 100);
    });
  }
}

/**
 * Вибрация (если поддерживается)
 */
const Vibration = {
  enabled: true,
  short() {
    if (this.enabled && navigator.vibrate) navigator.vibrate(15);
  },
  medium() {
    if (this.enabled && navigator.vibrate) navigator.vibrate(40);
  },
  long() {
    if (this.enabled && navigator.vibrate) navigator.vibrate([50, 30, 80]);
  },
  pattern(pattern) {
    if (this.enabled && navigator.vibrate) navigator.vibrate(pattern);
  }
};

/**
 * Конфигурация уровней сложности
 */
const LEVEL_CONFIG = [
  null, // 0 не используется
  // Уровни 1-3: Числа 1-6, цели до 15, медленно
  { maxNumber: 6, maxTarget: 15, spawnInterval: 3000, label: 'Начинающий' },
  { maxNumber: 6, maxTarget: 15, spawnInterval: 2800, label: 'Начинающий' },
  { maxNumber: 6, maxTarget: 16, spawnInterval: 2600, label: 'Начинающий' },
  // Уровни 4-6: Числа 1-9, цели до 25, средне
  { maxNumber: 9, maxTarget: 25, spawnInterval: 2400, label: 'Продвинутый' },
  { maxNumber: 9, maxTarget: 25, spawnInterval: 2200, label: 'Продвинутый' },
  { maxNumber: 9, maxTarget: 27, spawnInterval: 2000, label: 'Продвинутый' },
  // Уровни 7-10: Числа 1-12, цели до 35, быстро
  { maxNumber: 12, maxTarget: 30, spawnInterval: 1800, label: 'Эксперт' },
  { maxNumber: 12, maxTarget: 32, spawnInterval: 1600, label: 'Эксперт' },
  { maxNumber: 12, maxTarget: 35, spawnInterval: 1500, label: 'Мастер' },
  { maxNumber: 12, maxTarget: 35, spawnInterval: 1400, label: 'Мастер' },
];

/**
 * Получить конфигурацию уровня
 * @param {number} level
 * @returns {Object}
 */
function getLevelConfig(level) {
  const idx = clamp(level, 1, LEVEL_CONFIG.length - 1);
  return LEVEL_CONFIG[idx];
}

/**
 * Константы игры
 */
const GAME_CONST = {
  NUM_COLUMNS: 4,
  MAX_COLUMN_HEIGHT: 8,
  DANGER_HEIGHT: 6,
  WARNING_HEIGHT: 5,
  MIN_CUBES_FOR_SUM: 2,
  MAX_CUBES_FOR_SUM: 5,
  MIN_TARGET: 5,
  MAX_TARGET: 50,
  QUEUE_SIZE: 2,        // сколько следующих кубиков показывать для каждой колонки
  TARGETS_AHEAD: 2,     // сколько следующих целей показывать
  POINTS_PER_LEVEL: 500, // очков для перехода на следующий уровень
  COMBO_TIMEOUT: 5000,   // мс, за которые нужно собрать следующую сумму для комбо
  FALL_DURATION: 350,    // мс, длительность анимации падения
  REMOVE_DURATION: 300,  // мс, длительность анимации удаления
  BOUNCE_DURATION: 250,  // мс, длительность bounce-анимации
  CUBE_SIZE_MIN: 40,     // минимальный размер кубика
  CUBE_SIZE_MAX: 72,     // максимальный размер кубика
};

/**
 * Отладочные настройки
 */
const DEBUG = {
  showFPS: false,
  showHitboxes: false,
  infiniteTime: false,
  autoPlay: false,
  logGenerations: false,
};

/**
 * Конфигурация приложения
 * Объединяет все настройки в одно место для избежания глобального загрязнения
 */
const APP_CONFIG = {
  GAME: GAME_CONST,
  DEBUG: DEBUG,
  LEVEL_CONFIG: LEVEL_CONFIG,
  CACHE_NAME: 'sumsum-v1',
  STORAGE_KEY: 'sumsum_save',
};
