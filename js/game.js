/**
 * SumSum — Основная игровая логика
 * @file game.js
 *
 * Центральный модуль: управление игровым циклом, состоянием,
 * взаимодействие с генератором и UI.
 */

'use strict';

class SumSumGame {
  constructor() {
    // --- Состояние ---
    /** @type {Object[][]} 4 колонки, каждая — массив кубиков (row 0 = дно) */
    this.columns = [[], [], [], []];
    /** @type {number[][]} Очереди следующих кубиков (значения) для каждой колонки */
    this.queues = [[], [], [], []];
    /** @type {number[]} Текущая + следующие цели */
    this.targets = [];
    /** @type {number} */
    this.score = 0;
    /** @type {number} */
    this.level = 1;
    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {boolean} */
    this.isPaused = false;
    /** @type {number} Счётчик комбо */
    this.comboCount = 0;
    /** @type {number} Время последнего сбора суммы (для комбо) */
    this.lastMatchTime = 0;
    /** @type {number} Количество собранных целей на уровне */
    this.targetsCleared = 0;

    // --- Таймеры ---
    this.spawnTimer = 0;
    this.lastSpawnTime = 0;
    this.animationFrame = null;
    this.autoSaveInterval = null;

    // --- Модули ---
    this.storage = new GameStorage();
    this.generator = new GameGenerator(this);
    this.ui = null; // создаётся при инициализации
    this.sound = new SoundFX();

    // --- Инициализация ---
    this._init();
  }

  // ================================================================
  // Инициализация и навигация
  // ================================================================

  /**
   * Начальная инициализация: привязка кнопок и экранов
   * @private
   */
  _init() {
    // Загрузить настройки
    const settings = this.storage.getSettings();
    this.sound.enabled = settings.sound;
    Vibration.enabled = settings.vibration;

    // Настройки UI
    document.getElementById('setting-sound').checked = settings.sound;
    document.getElementById('setting-vibration').checked = settings.vibration;
    document.getElementById('setting-difficulty').value = settings.difficulty;

    // Обновить статистику на экране меню
    this._updateMenuStats();

    // === Кнопки ===

    // Меню
    document.getElementById('btn-play').addEventListener('click', () => this._startGame());
    document.getElementById('btn-how-to-play').addEventListener('click', () => this._showScreen('tutorial-screen'));
    document.getElementById('btn-settings').addEventListener('click', () => this._showScreen('settings-screen'));

    // Обучение
    document.getElementById('btn-tutorial-back').addEventListener('click', () => this._showScreen('menu-screen'));

    // Настройки
    document.getElementById('btn-settings-back').addEventListener('click', () => {
      this._saveSettings();
      this._showScreen('menu-screen');
    });

    document.getElementById('setting-sound').addEventListener('change', (e) => {
      this.sound.enabled = e.target.checked;
    });
    document.getElementById('setting-vibration').addEventListener('change', (e) => {
      Vibration.enabled = e.target.checked;
    });

    // Игровые кнопки
    document.getElementById('btn-pause').addEventListener('click', () => this.pause());
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-restart').addEventListener('click', () => {
      this._hideOverlay('pause-overlay');
      this.reset();
      this.start();
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      this._hideOverlay('pause-overlay');
      this.reset();
      this._showScreen('menu-screen');
    });

    // Game Over
    document.getElementById('btn-play-again').addEventListener('click', () => {
      this._hideOverlay('gameover-overlay');
      this.reset();
      this.start();
    });
    document.getElementById('btn-go-menu').addEventListener('click', () => {
      this._hideOverlay('gameover-overlay');
      this.reset();
      this._showScreen('menu-screen');
    });
  }

  /**
   * Переключение экранов
   * @param {string} screenId
   * @private
   */
  _showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  /**
   * @private
   */
  _showOverlay(overlayId) {
    document.getElementById(overlayId).classList.remove('hidden');
  }

  /**
   * @private
   */
  _hideOverlay(overlayId) {
    document.getElementById(overlayId).classList.add('hidden');
  }

  /**
   * Обновить статистику на экране меню
   * @private
   */
  _updateMenuStats() {
    document.getElementById('menu-high-score').textContent = formatNumber(this.storage.data.highScore);
    document.getElementById('menu-total-games').textContent = this.storage.data.totalGames;
  }

  /**
   * Сохранить настройки
   * @private
   */
  _saveSettings() {
    this.storage.updateSettings({
      sound: document.getElementById('setting-sound').checked,
      vibration: document.getElementById('setting-vibration').checked,
      difficulty: document.getElementById('setting-difficulty').value,
    });
  }

  // ================================================================
  // Управление игрой
  // ================================================================

  /**
   * Начать новую игру (кнопка «Играть»)
   * @private
   */
  _startGame() {
    this._showScreen('game-screen');

    // Создаём UI после показа экрана (канвас должен быть видим)
    if (!this.ui) {
      this.ui = new GameUI(this);
    }

    this.reset();
    this.start();
  }

  /**
   * Начало/возобновление игры
   */
  start() {
    this.isPlaying = true;
    this.isPaused = false;

    // Генерируем начальные цели
    for (let i = 0; i < GAME_CONST.TARGETS_AHEAD + 1; i++) {
      this.targets.push(this.generator.generateTarget());
    }

    // Заполняем очереди
    for (let col = 0; col < GAME_CONST.NUM_COLUMNS; col++) {
      while (this.queues[col].length < GAME_CONST.QUEUE_SIZE) {
        this.queues[col].push(this.generator.generateNextCubeValue(col));
      }
    }

    // Спауним начальные кубики (по 2-3 на колонку)
    const initialCubes = randomInt(6, 10);
    for (let i = 0; i < initialCubes; i++) {
      const col = i % GAME_CONST.NUM_COLUMNS;
      this._spawnCubeImmediate(col);
    }

    // UI
    this.ui.updateAll();
    this.ui._onResize();

    // Запускаем игровой цикл
    this.lastSpawnTime = performance.now();
    this._startGameLoop();

    // Автосохранение
    this.autoSaveInterval = setInterval(() => this.storage.save(), 30000);
  }

  /**
   * Пауза
   */
  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this._showOverlay('pause-overlay');
  }

  /**
   * Продолжить после паузы
   */
  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this._hideOverlay('pause-overlay');
    this.lastSpawnTime = performance.now();
  }

  /**
   * Полный сброс
   */
  reset() {
    this.columns = [[], [], [], []];
    this.queues = [[], [], [], []];
    this.targets = [];
    this.score = 0;
    this.level = 1;
    this.comboCount = 0;
    this.lastMatchTime = 0;
    this.targetsCleared = 0;
    this._shaking = false;
    this._pendingSpawnCol = -1;
    this.isPlaying = false;
    this.isPaused = false;

    this.generator.reset();

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Обработка проигрыша
   */
  gameOver() {
    this.isPlaying = false;

    // Звук
    this.sound.gameOver();
    Vibration.long();

    // Сохранение
    const isNewRecord = this.storage.updateHighScore(this.score);
    this.storage.recordGame(this.score, this.level, this.comboCount);

    // Достижения по очкам
    if (this.score >= 1000) this.storage.unlockAchievement('score1000');
    if (this.score >= 5000) this.storage.unlockAchievement('score5000');
    if (this.score >= 10000) this.storage.unlockAchievement('score10000');

    // UI Game Over
    document.getElementById('go-score').textContent = formatNumber(this.score);
    document.getElementById('go-level').textContent = this.level;
    document.getElementById('go-highscore').textContent = formatNumber(this.storage.data.highScore);

    if (isNewRecord) {
      document.getElementById('go-new-record').classList.remove('hidden');
    } else {
      document.getElementById('go-new-record').classList.add('hidden');
    }

    // Показать оверлей с задержкой для эффекта
    setTimeout(() => {
      this._showOverlay('gameover-overlay');
    }, 600);

    // Обновить меню
    this._updateMenuStats();

    // Остановить таймеры
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }

  // ================================================================
  // Игровой цикл
  // ================================================================

  /**
   * Запуск requestAnimationFrame цикла
   * @private
   */
  _startGameLoop() {
    const loop = (timestamp) => {
      if (!this.isPlaying) return;

      this.animationFrame = requestAnimationFrame(loop);

      if (this.isPaused) return;

      // 1. Обновить анимации
      this._updateAnimations(timestamp);

      // 2. Спаун кубиков
      this._updateSpawn(timestamp);

      // 3. Проверка комбо-таймаута
      this._updateCombo(timestamp);

      // 4. Рендеринг
      this.ui.render(timestamp);
    };

    this.animationFrame = requestAnimationFrame(loop);
  }

  /**
   * Обновить все анимации
   * @private
   */
  _updateAnimations(timestamp) {
    let hasChanges = false;

    for (let colIdx = 0; colIdx < this.columns.length; colIdx++) {
      const column = this.columns[colIdx];

      for (let i = column.length - 1; i >= 0; i--) {
        const cube = column[i];

        // Анимация bounce при появлении
        if (cube.bounceProgress < 1) {
          cube.bounceProgress = Math.min(1,
            (timestamp - cube.spawnTime) / GAME_CONST.BOUNCE_DURATION
          );
          hasChanges = true;
        }

        // Анимация падения
        if (cube.falling) {
          cube.fallProgress = Math.min(1,
            cube.fallProgress + (16 / GAME_CONST.FALL_DURATION)
          );
          if (cube.fallProgress >= 1) {
            cube.falling = false;
            cube.row = cube.fallTo;
          }
          hasChanges = true;
        }

        // Анимация удаления
        if (cube.removing) {
          cube.removeProgress = Math.min(1,
            cube.removeProgress + (16 / GAME_CONST.REMOVE_DURATION)
          );
          if (cube.removeProgress >= 1) {
            column.splice(i, 1);
            hasChanges = true;

            // После удаления — обновить ряды
            this._settleColumn(colIdx);
          }
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      this.ui.updateColumnDangers();
    }
  }

  /**
   * Обновить спаун кубиков
   * @private
   */
  _updateSpawn(timestamp) {
    const config = getLevelConfig(this.level);
    const interval = config.spawnInterval;
    const shakeTime = 500; // мс дрожания перед падением
    const elapsed = timestamp - this.lastSpawnTime;

    // Начать дрожание за shakeTime до спауна
    if (!this._shaking && elapsed >= interval - shakeTime) {
      this._shaking = true;
      this._pendingSpawnCol = this._chooseSpawnColumn();
      if (this._pendingSpawnCol !== -1) {
        this.ui.startQueueShake(this._pendingSpawnCol);
      }
    }

    // Спаун
    if (elapsed >= interval) {
      this.lastSpawnTime = timestamp;
      this._shaking = false;

      if (this._pendingSpawnCol !== -1) {
        this.ui.stopQueueShake(this._pendingSpawnCol);
        this._spawnCubeInColumn(this._pendingSpawnCol);
      } else {
        this._spawnNextCube();
      }
      this._pendingSpawnCol = -1;
    }
  }

  /**
   * Выбрать колонку для спауна (без спауна)
   * @returns {number} индекс колонки или -1 если все полные
   * @private
   */
  _chooseSpawnColumn() {
    const col = this.generator.chooseColumn();
    if (this.columns[col].length < GAME_CONST.MAX_COLUMN_HEIGHT) return col;
    for (let i = 0; i < GAME_CONST.NUM_COLUMNS; i++) {
      if (this.columns[i].length < GAME_CONST.MAX_COLUMN_HEIGHT) return i;
    }
    return -1;
  }

  /**
   * Обновить комбо-таймер
   * @private
   */
  _updateCombo(timestamp) {
    if (this.comboCount > 0 && timestamp - this.lastMatchTime > GAME_CONST.COMBO_TIMEOUT) {
      this.comboCount = 0;
      this.ui.updateCombo(0);
    }
  }

  // ================================================================
  // Спаун кубиков
  // ================================================================

  /**
   * Спаун следующего кубика из очереди
   * @private
   */
  _spawnNextCube() {
    const col = this.generator.chooseColumn();

    // Проверка: колонка полная?
    if (this.columns[col].length >= GAME_CONST.MAX_COLUMN_HEIGHT) {
      // Проверяем все колонки
      if (this._checkGameOver()) {
        this.gameOver();
        return;
      }
      // Пробуем другую колонку
      for (let i = 0; i < GAME_CONST.NUM_COLUMNS; i++) {
        if (this.columns[i].length < GAME_CONST.MAX_COLUMN_HEIGHT) {
          this._spawnCubeInColumn(i);
          return;
        }
      }
      this.gameOver();
      return;
    }

    this._spawnCubeInColumn(col);
  }

  /**
   * Спаун кубика в указанной колонке (из очереди)
   * @param {number} col
   * @private
   */
  _spawnCubeInColumn(col) {
    // Берём из очереди
    let value;
    if (this.queues[col].length > 0) {
      value = this.queues[col].shift();
    } else {
      value = this.generator.generateNextCubeValue(col);
    }

    // Пополняем очередь
    while (this.queues[col].length < GAME_CONST.QUEUE_SIZE) {
      this.queues[col].push(this.generator.generateNextCubeValue(col));
    }

    // Создаём кубик
    const cube = createCube(value, col);
    const row = this.columns[col].length;
    cube.row = row;
    cube.spawnTime = performance.now();

    // Кубик падает сверху (из-за пределов поля)
    cube.falling = true;
    cube.fallFrom = GAME_CONST.MAX_COLUMN_HEIGHT + 2; // начинает выше поля
    cube.fallTo = row;
    cube.fallProgress = 0;
    cube.bounceProgress = 1; // без bounce

    this.columns[col].push(cube);

    // Звук
    this.sound.drop();

    // UI
    this.ui.updateQueues();
    this.ui.updateColumnDangers();

    // Предупреждение
    if (this.columns[col].length >= GAME_CONST.DANGER_HEIGHT) {
      this.sound.warning();
      Vibration.short();
    }
  }

  /**
   * Мгновенный спаун (без анимации, для начальной расстановки)
   * @param {number} col
   * @private
   */
  _spawnCubeImmediate(col) {
    if (this.columns[col].length >= GAME_CONST.MAX_COLUMN_HEIGHT) return;

    let value;
    if (this.queues[col] && this.queues[col].length > 0) {
      value = this.queues[col].shift();
    } else {
      value = this.generator.generateNextCubeValue(col);
    }

    // Пополняем очередь
    while (this.queues[col].length < GAME_CONST.QUEUE_SIZE) {
      this.queues[col].push(this.generator.generateNextCubeValue(col));
    }

    const cube = createCube(value, col);
    cube.row = this.columns[col].length;
    cube.bounceProgress = 1; // без анимации
    this.columns[col].push(cube);
  }

  // ================================================================
  // Выбор и проверка
  // ================================================================

  /**
   * Переключить выбор кубика
   * @param {number} colIdx
   * @param {number} rowIdx
   */
  toggleCubeSelection(colIdx, rowIdx) {
    const cube = this.columns[colIdx][rowIdx];
    if (!cube || cube.removing) return;

    cube.selected = !cube.selected;

    if (cube.selected) {
      this.sound.select();
      Vibration.short();
    } else {
      this.sound.deselect();
    }

    this.ui.updateSelectedSum();

    // Автоматическая проверка суммы
    this._checkTarget();
  }

  /**
   * Получить сумму выбранных кубиков
   * @returns {number}
   */
  getSelectedSum() {
    let sum = 0;
    for (const col of this.columns) {
      for (const cube of col) {
        if (cube.selected && !cube.removing) {
          sum += cube.value;
        }
      }
    }
    return sum;
  }

  /**
   * Получить все выбранные кубики
   * @returns {Object[]}
   */
  getSelectedCubes() {
    const selected = [];
    for (const col of this.columns) {
      for (const cube of col) {
        if (cube.selected && !cube.removing) {
          selected.push(cube);
        }
      }
    }
    return selected;
  }

  /**
   * Проверить, совпадает ли сумма выбранных с текущей целью
   * @private
   */
  _checkTarget() {
    const currentTarget = this.targets[0];
    if (!currentTarget) return;

    const selectedSum = this.getSelectedSum();
    const selectedCubes = this.getSelectedCubes();

    if (selectedSum === currentTarget && selectedCubes.length >= GAME_CONST.MIN_CUBES_FOR_SUM) {
      // Успех! Собрали сумму
      this._onTargetMatch(selectedCubes);
    }
  }

  /**
   * Обработка успешного сбора суммы
   * @param {Object[]} cubes — собранные кубики
   * @private
   */
  _onTargetMatch(cubes) {
    const target = this.targets[0];
    const now = performance.now();

    // --- Комбо ---
    if (now - this.lastMatchTime < GAME_CONST.COMBO_TIMEOUT && this.lastMatchTime > 0) {
      this.comboCount++;
    } else {
      this.comboCount = 1;
    }
    this.lastMatchTime = now;

    // --- Очки ---
    let multiplier = 1;

    // Комбо множитель
    if (this.comboCount >= 2) {
      multiplier *= 1 + (this.comboCount - 1) * 0.5; // ×1.5, ×2, ×2.5...
    }

    // Большие суммы
    if (target >= 25) {
      multiplier *= 3;
    } else if (target >= 20) {
      multiplier *= 2;
    }

    // Эффективность: очистка всей колонки
    const clearedColumns = this._checkColumnClears(cubes);
    if (clearedColumns > 0) {
      multiplier *= 2;
    }

    const points = Math.floor(target * cubes.length * multiplier);
    this.score += points;

    // --- Звук и вибрация ---
    if (this.comboCount >= 3) {
      this.sound.combo();
      Vibration.medium();
    } else {
      this.sound.match();
      Vibration.short();
    }

    // --- Визуальные эффекты ---
    // Всплывающие очки
    const centerCube = cubes[Math.floor(cubes.length / 2)];
    const pos = this.ui.getCubeCenter(centerCube.column, centerCube.row);
    this.ui.addFloatingText(
      `+${formatNumber(points)}`,
      pos.x, pos.y,
      this.comboCount >= 2 ? '#fbbf24' : '#4ade80'
    );

    if (this.comboCount >= 2) {
      this.ui.addFloatingText(
        `КОМБО ×${this.comboCount}!`,
        pos.x, pos.y - 30,
        '#fb923c'
      );
    }

    // --- Удаление кубиков ---
    for (const cube of cubes) {
      cube.selected = false;
      cube.removing = true;
      cube.removeProgress = 0;
    }

    // --- Обновить цели ---
    this.targets.shift();
    this.targets.push(this.generator.generateTarget());
    this.targetsCleared++;

    // --- Проверка повышения уровня ---
    this._checkLevelUp();

    // --- Достижения ---
    this.storage.unlockAchievement('firstWin');
    if (this.comboCount >= 3) this.storage.unlockAchievement('combo3');
    if (this.comboCount >= 5) this.storage.unlockAchievement('combo5');
    if (target >= 25) this.storage.unlockAchievement('bigSum');

    // --- Обновить UI ---
    this.ui.updateTargets();
    this.ui.updateSelectedSum();
    this.ui.updateScore();
    this.ui.updateCombo(this.comboCount);
  }

  /**
   * Проверить, очищены ли целые колонки
   * @param {Object[]} cubes
   * @returns {number} — кол-во очищенных колонок
   * @private
   */
  _checkColumnClears(cubes) {
    const colCounts = {};
    for (const cube of cubes) {
      colCounts[cube.column] = (colCounts[cube.column] || 0) + 1;
    }

    let cleared = 0;
    for (const [col, count] of Object.entries(colCounts)) {
      if (count === this.columns[col].length) {
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Проверка повышения уровня
   * @private
   */
  _checkLevelUp() {
    const needed = GAME_CONST.POINTS_PER_LEVEL * this.level;
    if (this.score >= needed && this.level < LEVEL_CONFIG.length - 1) {
      this.level++;
      this.sound.levelUp();
      Vibration.medium();

      // Достижения
      if (this.level >= 5) this.storage.unlockAchievement('level5');
      if (this.level >= 10) this.storage.unlockAchievement('level10');

      this.ui.updateLevel();

      // Всплывающий текст
      const canvasW = this.ui.canvas.width / this.ui.dpr;
      const canvasH = this.ui.canvas.height / this.ui.dpr;
      this.ui.addFloatingText(
        `Уровень ${this.level}!`,
        canvasW / 2,
        canvasH / 2,
        '#a78bfa'
      );
    }
  }

  // ================================================================
  // Обновление колонок
  // ================================================================

  /**
   * «Осадить» колонку после удаления кубиков (заполнить дыры)
   * @param {number} colIdx
   * @private
   */
  _settleColumn(colIdx) {
    const column = this.columns[colIdx];

    // Обновляем row-индексы и запускаем анимацию падения
    for (let i = 0; i < column.length; i++) {
      const cube = column[i];
      if (cube.row !== i) {
        cube.falling = true;
        cube.fallFrom = cube.row;
        cube.fallTo = i;
        cube.fallProgress = 0;
        cube.row = i;
      }
    }
  }

  // ================================================================
  // Проверка конца игры
  // ================================================================

  /**
   * Проверить, все ли колонки полные (game over)
   * @returns {boolean}
   * @private
   */
  _checkGameOver() {
    for (const col of this.columns) {
      if (col.length < GAME_CONST.MAX_COLUMN_HEIGHT) return false;
    }
    return true;
  }
}

// ================================================================
// Запуск
// ================================================================

/** @type {SumSumGame} Глобальная ссылка на игру */
let game;

document.addEventListener('DOMContentLoaded', () => {
  game = new SumSumGame();
});
