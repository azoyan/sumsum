/**
 * SumSum — Сохранение прогресса
 * @file storage.js
 */

'use strict';

class GameStorage {
  constructor() {
    this.STORAGE_KEY = 'sumsum_save';
    this.data = this._loadOrDefault();
  }

  /**
   * Данные по умолчанию
   * @returns {Object}
   */
  _defaultData() {
    return {
      highScore: 0,
      totalGames: 0,
      totalScore: 0,
      bestLevel: 1,
      bestCombo: 0,
      achievements: {
        firstWin: false,      // Первая собранная сумма
        combo3: false,         // Комбо ×3
        combo5: false,         // Комбо ×5
        score1000: false,      // 1000 очков
        score5000: false,      // 5000 очков
        score10000: false,     // 10000 очков
        level5: false,         // Достичь уровня 5
        level10: false,        // Достичь уровня 10
        bigSum: false,         // Собрать сумму 25+
      },
      settings: {
        sound: true,
        vibration: true,
        difficulty: 'medium'
      },
      tutorialShown: false,
      lastPlayed: null,
    };
  }

  /**
   * Загрузить данные из LocalStorage
   * @returns {Object}
   * @private
   */
  _loadOrDefault() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Мержим с дефолтными данными (для обратной совместимости)
        return this._merge(this._defaultData(), parsed);
      }
    } catch (e) {
      console.warn('Ошибка загрузки сохранения:', e);
    }
    return this._defaultData();
  }

  /**
   * Глубокий мерж: base + override
   * @param {Object} base
   * @param {Object} override
   * @returns {Object}
   * @private
   */
  _merge(base, override) {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      if (
        typeof base[key] === 'object' && base[key] !== null &&
        typeof override[key] === 'object' && override[key] !== null &&
        !Array.isArray(base[key])
      ) {
        result[key] = this._merge(base[key], override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  /**
   * Сохранить данные в LocalStorage
   */
  save() {
    try {
      this.data.lastPlayed = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Ошибка сохранения:', e);
    }
  }

  /**
   * Обновить рекорд
   * @param {number} score
   * @returns {boolean} — true, если новый рекорд
   */
  updateHighScore(score) {
    if (score > this.data.highScore) {
      this.data.highScore = score;
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Зарегистрировать окончание игры
   * @param {number} score
   * @param {number} level
   * @param {number} combo
   */
  recordGame(score, level, combo) {
    this.data.totalGames++;
    this.data.totalScore += score;
    if (level > this.data.bestLevel) this.data.bestLevel = level;
    if (combo > this.data.bestCombo) this.data.bestCombo = combo;
    this.save();
  }

  /**
   * Проверить и установить достижение
   * @param {string} key
   * @returns {boolean} — true, если достижение только что получено
   */
  unlockAchievement(key) {
    if (this.data.achievements[key] === false) {
      this.data.achievements[key] = true;
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Получить настройки
   * @returns {Object}
   */
  getSettings() {
    return { ...this.data.settings };
  }

  /**
   * Обновить настройки
   * @param {Object} settings
   */
  updateSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
  }

  /**
   * Полный сброс
   */
  reset() {
    this.data = this._defaultData();
    this.save();
  }
}
