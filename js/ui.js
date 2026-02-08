/**
 * SumSum — Управление интерфейсом (Canvas-рендеринг + ввод)
 * @file ui.js
 */

'use strict';

class GameUI {
  /**
   * @param {SumSumGame} game — ссылка на объект игры
   */
  constructor(game) {
    this.game = game;

    /** @type {HTMLCanvasElement} */
    this.canvas = document.getElementById('game-canvas');
    /** @type {CanvasRenderingContext2D} */
    this.ctx = this.canvas.getContext('2d');

    // Размеры
    this.cubeSize = 56;
    this.cubeGap = 6;
    this.columnGap = 10;
    this.fieldWidth = 0;
    this.fieldHeight = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dpr = window.devicePixelRatio || 1;

    // Анимация всплывающих очков
    this.floatingTexts = [];

    // FPS
    this.fpsCounter = document.getElementById('fps-counter');
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.currentFps = 60;

    // DOM-элементы
    this.dom = {
      currentTarget: document.getElementById('current-target'),
      selectedSum: document.getElementById('selected-sum'),
      selectedSumDisplay: document.getElementById('selected-sum-display'),
      nextTarget1: document.getElementById('next-target-1'),
      nextTarget2: document.getElementById('next-target-2'),
      scoreValue: document.getElementById('score-value'),
      levelValue: document.getElementById('level-value'),
      comboDisplay: document.getElementById('combo-display'),
      comboValue: document.getElementById('combo-value'),
      queueItems: document.querySelectorAll('.queue-item'),
      colDangers: document.querySelectorAll('.col-danger'),
    };

    this._resizeBound = this._onResize.bind(this);
    window.addEventListener('resize', debounce(this._resizeBound, 150));
    this._onResize();
    this._setupInput();
  }

  // ===== Размеры и масштаб =====

  /**
   * Пересчитать размеры канваса и кубиков
   * @private
   */
  _onResize() {
    const field = document.getElementById('game-field');
    const rect = field.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Подбираем размер кубика под доступное пространство
    const maxCubeW = (w - 32 - (GAME_CONST.NUM_COLUMNS - 1) * 10) / GAME_CONST.NUM_COLUMNS;
    const maxCubeH = (h - 20) / (GAME_CONST.MAX_COLUMN_HEIGHT + 1);
    this.cubeSize = Math.floor(Math.min(maxCubeW, maxCubeH, 72));
    this.cubeSize = Math.max(this.cubeSize, 40); // минимум
    this.cubeGap = Math.max(4, Math.floor(this.cubeSize * 0.08));
    this.columnGap = Math.max(8, Math.floor(this.cubeSize * 0.15));

    // Размеры поля
    this.fieldWidth = GAME_CONST.NUM_COLUMNS * this.cubeSize +
                      (GAME_CONST.NUM_COLUMNS - 1) * this.columnGap;
    this.fieldHeight = GAME_CONST.MAX_COLUMN_HEIGHT * (this.cubeSize + this.cubeGap);

    // Канвас
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Смещение для центровки
    this.offsetX = Math.floor((w - this.fieldWidth) / 2);
    this.offsetY = Math.floor(h - this.fieldHeight - 10);

    // Обновляем CSS-переменные для очередей
    document.documentElement.style.setProperty('--cube-size', this.cubeSize + 'px');
    document.documentElement.style.setProperty('--column-gap', this.columnGap + 'px');
  }

  // ===== Ввод =====

  /**
   * Настройка touch/click событий
   * @private
   */
  _setupInput() {
    const handler = (e) => {
      e.preventDefault();
      if (!this.game.isPlaying || this.game.isPaused) return;

      let x, y;
      if (e.touches && e.touches.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
      } else {
        const rect = this.canvas.getBoundingClientRect();
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
      }

      this._handleTap(x, y);
    };

    this.canvas.addEventListener('touchstart', handler, { passive: false });
    this.canvas.addEventListener('click', handler);
  }

  /**
   * Обработка нажатия на поле
   * @param {number} px — координата X (CSS-пиксели)
   * @param {number} py — координата Y (CSS-пиксели)
   * @private
   */
  _handleTap(px, py) {
    // Определяем колонку и ряд
    const relX = px - this.offsetX;
    const relY = py - this.offsetY;

    const colW = this.cubeSize + this.columnGap;
    const colIndex = Math.floor(relX / colW);

    if (colIndex < 0 || colIndex >= GAME_CONST.NUM_COLUMNS) return;

    // Проверяем, попали ли в границы колонки (не в зазор)
    const inColX = relX - colIndex * colW;
    if (inColX > this.cubeSize) return; // попали в зазор

    const column = this.game.columns[colIndex];
    if (!column || column.length === 0) return;

    // Ряды идут снизу вверх
    const rowH = this.cubeSize + this.cubeGap;
    const bottomY = this.fieldHeight;
    const clickRow = Math.floor((bottomY - relY) / rowH);

    if (clickRow < 0 || clickRow >= column.length) return;

    // Кубик найден!
    const cube = column[clickRow];
    if (cube && !cube.removing && !cube.falling) {
      this.game.toggleCubeSelection(colIndex, clickRow);
    }
  }

  // ===== Рендеринг =====

  /**
   * Основной метод рендеринга (вызывается каждый кадр)
   * @param {number} timestamp
   */
  render(timestamp) {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    // Очистка
    ctx.clearRect(0, 0, w, h);

    // Фон с сеткой
    this._renderBackground(ctx, w, h);

    // Колонки и кубики
    this._renderColumns(ctx);

    // Всплывающие тексты (очки)
    this._renderFloatingTexts(ctx, timestamp);

    // Debug: хитбоксы
    if (DEBUG.showHitboxes) {
      this._renderHitboxes(ctx);
    }

    // FPS
    this._updateFPS(timestamp);
  }

  /**
   * Фон с направляющими колонок
   * @private
   */
  _renderBackground(ctx, w, h) {
    // Направляющие для колонок
    for (let i = 0; i < GAME_CONST.NUM_COLUMNS; i++) {
      const x = this.offsetX + i * (this.cubeSize + this.columnGap);
      const y = this.offsetY;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(x, y, this.cubeSize, this.fieldHeight);

      // Линия критической высоты
      const critY = y + (GAME_CONST.MAX_COLUMN_HEIGHT - GAME_CONST.DANGER_HEIGHT) *
                    (this.cubeSize + this.cubeGap);
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, critY);
      ctx.lineTo(x + this.cubeSize, critY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * Рендеринг всех колонок с кубиками
   * @private
   */
  _renderColumns(ctx) {
    const columns = this.game.columns;

    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const column = columns[colIdx];

      for (let rowIdx = 0; rowIdx < column.length; rowIdx++) {
        const cube = column[rowIdx];
        if (!cube) continue;

        // Позиция кубика (ряды снизу вверх)
        let x = this.offsetX + colIdx * (this.cubeSize + this.columnGap);
        let y = this.offsetY + this.fieldHeight -
                (rowIdx + 1) * (this.cubeSize + this.cubeGap);

        // Анимация падения
        if (cube.falling && cube.fallProgress < 1) {
          const fromY = this.offsetY + this.fieldHeight -
                        (cube.fallFrom + 1) * (this.cubeSize + this.cubeGap);
          const toY = this.offsetY + this.fieldHeight -
                      (cube.fallTo + 1) * (this.cubeSize + this.cubeGap);
          const t = easeOutCubic(cube.fallProgress);
          y = lerp(fromY, toY, t);
        }

        // Анимация удаления
        if (cube.removing) {
          this._renderRemovingCube(ctx, cube, x, y);
          continue;
        }

        // Анимация появления (bounce)
        let scale = 1;
        if (cube.bounceProgress < 1) {
          const t = cube.bounceProgress;
          if (t < 0.5) {
            scale = lerp(0, 1.15, easeOutCubic(t * 2));
          } else {
            scale = lerp(1.15, 1, easeOutCubic((t - 0.5) * 2));
          }
        }

        this._renderCube(ctx, cube, x, y, scale);
      }
    }
  }

  /**
   * Отрисовка одного кубика
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} cube
   * @param {number} x
   * @param {number} y
   * @param {number} scale
   * @private
   */
  _renderCube(ctx, cube, x, y, scale = 1) {
    const size = this.cubeSize;
    const colors = getCubeColors(cube.value);
    const r = Math.max(4, size * 0.15); // border-radius

    ctx.save();

    if (scale !== 1) {
      const cx = x + size / 2;
      const cy = y + size / 2;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }

    // Тень
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // Фон кубика
    ctx.fillStyle = colors.bg;
    this._roundRect(ctx, x, y, size, size, r);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Рамка
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    this._roundRect(ctx, x, y, size, size, r);
    ctx.stroke();

    // Подсветка выбранного
    if (cube.selected) {
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(251, 146, 60, 0.6)';
      ctx.shadowBlur = 12;
      this._roundRect(ctx, x - 1, y - 1, size + 2, size + 2, r + 1);
      ctx.stroke();
      ctx.shadowColor = 'transparent';
    }

    // Число
    const fontSize = Math.max(16, Math.floor(size * 0.45));
    ctx.fillStyle = colors.text;
    ctx.font = `bold ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cube.value.toString(), x + size / 2, y + size / 2 + 1);

    ctx.restore();
  }

  /**
   * Отрисовка удаляемого кубика (с анимацией)
   * @private
   */
  _renderRemovingCube(ctx, cube, x, y) {
    const t = cube.removeProgress;
    const size = this.cubeSize;
    const colors = getCubeColors(cube.value);

    ctx.save();

    const cx = x + size / 2;
    const cy = y + size / 2;

    // Масштаб уменьшается, прозрачность уменьшается
    const scale = 1 - easeInOutCubic(t);
    const alpha = 1 - t;
    const rotation = t * Math.PI * 0.5;

    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    // Свечение
    ctx.shadowColor = 'rgba(74, 222, 128, 0.8)';
    ctx.shadowBlur = 20 * (1 - t);

    const r = Math.max(4, size * 0.15);
    ctx.fillStyle = colors.bg;
    this._roundRect(ctx, x, y, size, size, r);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    const fontSize = Math.max(16, Math.floor(size * 0.45));
    ctx.fillStyle = colors.text;
    ctx.font = `bold ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cube.value.toString(), x + size / 2, y + size / 2 + 1);

    ctx.restore();
  }

  /**
   * Закруглённый прямоугольник
   * @private
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ===== Всплывающие тексты =====

  /**
   * Добавить всплывающий текст (очки)
   * @param {string} text
   * @param {number} x — CSS px
   * @param {number} y — CSS px
   * @param {string} color
   */
  addFloatingText(text, x, y, color = '#4ade80') {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      startTime: performance.now(),
      duration: 1200,
    });
  }

  /**
   * @private
   */
  _renderFloatingTexts(ctx, timestamp) {
    this.floatingTexts = this.floatingTexts.filter(ft => {
      const elapsed = timestamp - ft.startTime;
      if (elapsed > ft.duration) return false;

      const t = elapsed / ft.duration;
      const alpha = 1 - easeInOutCubic(t);
      const yOffset = -60 * easeOutCubic(t);
      const scale = t < 0.3 ? lerp(0.5, 1.2, t / 0.3) : lerp(1.2, 0.9, (t - 0.3) / 0.7);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${Math.floor(24 * scale)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;

      ctx.fillText(ft.text, ft.x, ft.y + yOffset);
      ctx.restore();

      return true;
    });
  }

  // ===== Обновление DOM =====

  /**
   * Обновить отображение целей с плавной анимацией сдвига
   */
  updateTargets() {
    const targets = this.game.targets;

    // Обновляем текст
    this.dom.currentTarget.textContent = targets[0] || '?';
    this.dom.nextTarget1.textContent = targets[1] || '–';
    this.dom.nextTarget2.textContent = targets[2] || '–';

    // Плавный сдвиг всех элементов
    const items = [this.dom.nextTarget2, this.dom.nextTarget1, this.dom.currentTarget];
    items.forEach(el => {
      el.classList.remove('slide-in');
      void el.offsetWidth;
      el.classList.add('slide-in');
    });
  }

  /**
   * Обновить отображение выбранной суммы
   */
  updateSelectedSum() {
    const sum = this.game.getSelectedSum();
    const target = this.game.targets[0];

    this.dom.selectedSum.textContent = sum;
    this.dom.selectedSum.className = '';

    if (sum === 0) {
      this.dom.selectedSumDisplay.innerHTML = `Выбрано: <span id="selected-sum">0</span>`;
    } else if (sum === target) {
      this.dom.selectedSum.classList.add('match');
    } else if (sum > target) {
      this.dom.selectedSum.classList.add('over');
    }
  }

  /**
   * Обновить счёт
   */
  updateScore() {
    this.dom.scoreValue.textContent = formatNumber(this.game.score);
  }

  /**
   * Обновить уровень
   */
  updateLevel() {
    this.dom.levelValue.textContent = this.game.level;
  }

  /**
   * Обновить комбо-индикатор
   * @param {number} combo
   */
  updateCombo(combo) {
    if (combo > 1) {
      this.dom.comboDisplay.classList.remove('hidden');
      this.dom.comboValue.textContent = `×${combo}`;
      this.dom.comboValue.classList.remove('anim-combo-flash');
      void this.dom.comboValue.offsetWidth;
      this.dom.comboValue.classList.add('anim-combo-flash');
    } else {
      this.dom.comboDisplay.classList.add('hidden');
    }
  }

  /**
   * Обновить очереди кубиков
   */
  updateQueues() {
    const queues = this.game.queues;
    this.dom.queueItems.forEach((el, i) => {
      if (queues[i] && queues[i].length > 0) {
        el.textContent = queues[i][0];
        const colors = getCubeColors(queues[i][0]);
        el.style.background = colors.bg;
        el.style.color = colors.text;
        el.style.borderColor = colors.border;
        el.style.borderStyle = 'solid';
      } else {
        el.textContent = '?';
        el.style.background = '';
        el.style.color = '';
        el.style.borderColor = '';
        el.style.borderStyle = 'dashed';
      }
    });
  }

  /**
   * Обновить индикаторы опасности колонок
   */
  updateColumnDangers() {
    const columns = this.game.columns;
    this.dom.colDangers.forEach((el, i) => {
      const height = columns[i] ? columns[i].length : 0;
      el.classList.remove('warning', 'critical');
      if (height >= GAME_CONST.DANGER_HEIGHT) {
        el.classList.add('critical');
      } else if (height >= GAME_CONST.WARNING_HEIGHT) {
        el.classList.add('warning');
      }
    });
  }

  /**
   * Получить позицию центра кубика в CSS-координатах канваса
   * @param {number} colIdx
   * @param {number} rowIdx
   * @returns {{ x: number, y: number }}
   */
  getCubeCenter(colIdx, rowIdx) {
    const x = this.offsetX + colIdx * (this.cubeSize + this.columnGap) + this.cubeSize / 2;
    const y = this.offsetY + this.fieldHeight -
              (rowIdx + 1) * (this.cubeSize + this.cubeGap) + this.cubeSize / 2;
    return { x, y };
  }

  // ===== Debug =====

  /**
   * @private
   */
  _renderHitboxes(ctx) {
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    for (let col = 0; col < GAME_CONST.NUM_COLUMNS; col++) {
      for (let row = 0; row < GAME_CONST.MAX_COLUMN_HEIGHT; row++) {
        const x = this.offsetX + col * (this.cubeSize + this.columnGap);
        const y = this.offsetY + this.fieldHeight -
                  (row + 1) * (this.cubeSize + this.cubeGap);
        ctx.strokeRect(x, y, this.cubeSize, this.cubeSize);
      }
    }
  }

  /**
   * FPS-счётчик
   * @private
   */
  _updateFPS(timestamp) {
    this.frameCount++;
    if (timestamp - this.lastFpsTime >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = timestamp;

      if (DEBUG.showFPS) {
        this.fpsCounter.classList.remove('hidden');
        this.fpsCounter.textContent = `FPS: ${this.currentFps}`;
      }
    }
  }

  /**
   * Полное обновление всех DOM-элементов
   */
  updateAll() {
    this.updateTargets();
    this.updateSelectedSum();
    this.updateScore();
    this.updateLevel();
    this.updateQueues();
    this.updateColumnDangers();
    this.updateCombo(this.game.comboCount);
  }
}
