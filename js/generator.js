/**
 * SumSum — Интеллектуальная генерация контента
 * @file generator.js
 *
 * Отвечает за:
 * - Генерацию кубиков с балансировкой
 * - Генерацию целей с гарантией проходимости
 * - Адаптивную сложность
 */

'use strict';

class GameGenerator {
  /**
   * @param {Object} gameRef — ссылка на объект игры (columns, level и т.д.)
   */
  constructor(gameRef) {
    this.game = gameRef;

    /**
     * Запланированные кубики: Map<columnIndex, number[]>
     * Используется для гарантии проходимости будущих целей
     */
    this.plannedCubes = new Map();
    for (let i = 0; i < GAME_CONST.NUM_COLUMNS; i++) {
      this.plannedCubes.set(i, []);
    }
  }

  // ===== Генерация кубиков =====

  /**
   * Сгенерировать следующий кубик для колонки
   * @param {number} colIndex
   * @returns {number} — значение кубика
   */
  generateNextCubeValue(colIndex) {
    const config = getLevelConfig(this.game.level);

    // 1. Если есть запланированный кубик — отдаём его
    const planned = this.plannedCubes.get(colIndex);
    if (planned && planned.length > 0) {
      const value = planned.shift();
      if (DEBUG.logGenerations) {
        console.log(`[GEN] Planned cube ${value} for col ${colIndex}`);
      }
      return value;
    }

    // 2. Адаптивная генерация
    return this._generateAdaptiveCube(colIndex, config);
  }

  /**
   * Адаптивная генерация с учётом текущего состояния
   * @param {number} colIndex
   * @param {Object} config — конфигурация уровня
   * @returns {number}
   * @private
   */
  _generateAdaptiveCube(colIndex, config) {
    const columns = this.game.columns;
    const colHeight = columns[colIndex].length;

    // Если колонка в опасности — увеличиваем шанс полезного числа
    if (colHeight >= GAME_CONST.DANGER_HEIGHT) {
      return this._generateHelpfulCube(config);
    }

    // Базовая генерация с балансировкой
    return this._generateBalancedCube(config);
  }

  /**
   * Генерация «полезного» кубика (для спасения от проигрыша)
   * Анализирует текущую цель и подбирает число, помогающее её собрать
   * @param {Object} config
   * @returns {number}
   * @private
   */
  _generateHelpfulCube(config) {
    const currentTarget = this.game.targets[0];
    if (!currentTarget) return randomInt(1, config.maxNumber);

    // Считаем сумму уже выбранных кубиков
    const selectedSum = this.game.getSelectedSum();
    const needed = currentTarget - selectedSum;

    // Если нужно конкретное число — генерируем его с повышенной вероятностью
    if (needed > 0 && needed <= config.maxNumber) {
      // 60% шанс получить нужное число
      if (Math.random() < 0.6) {
        return needed;
      }
    }

    // Иначе генерируем число, которое помогает собрать цель из имеющихся
    const allCubes = this._getAllCubeValues();
    for (let numCubes = 2; numCubes <= 3; numCubes++) {
      const combos = this._findCombinations(allCubes, currentTarget, numCubes);
      if (combos.length > 0) {
        // Уже есть решение, просто генерируем случайное
        return randomInt(1, config.maxNumber);
      }
    }

    // Нет решения — подбираем число, дополняющее до цели
    const bestValues = this._findHelpfulValues(allCubes, currentTarget, config.maxNumber);
    if (bestValues.length > 0) {
      return randomChoice(bestValues);
    }

    return randomInt(1, config.maxNumber);
  }

  /**
   * Сбалансированная генерация (нормальный режим)
   * @param {Object} config
   * @returns {number}
   * @private
   */
  _generateBalancedCube(config) {
    // Анализируем распределение чисел на поле
    const distribution = this._getNumberDistribution();
    const maxNumber = config.maxNumber;

    // Уменьшаем вероятность часто встречающихся чисел
    const weights = [];
    for (let i = 1; i <= maxNumber; i++) {
      const count = distribution[i] || 0;
      // Чем больше число встречается — тем меньше вес
      weights.push(Math.max(1, 10 - count * 2));
    }

    return this._weightedRandom(weights) + 1;
  }

  /**
   * Взвешенный случайный выбор
   * @param {number[]} weights
   * @returns {number} — индекс
   * @private
   */
  _weightedRandom(weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  /**
   * Выбрать колонку для следующего кубика (балансировка)
   * @returns {number} — индекс колонки
   */
  chooseColumn() {
    const columns = this.game.columns;
    const heights = columns.map(col => col.length);
    const minHeight = Math.min(...heights);

    // Собираем колонки с минимальной/средней высотой
    const candidates = [];
    for (let i = 0; i < columns.length; i++) {
      if (heights[i] >= GAME_CONST.MAX_COLUMN_HEIGHT) continue; // полная колонка
      // Вес обратно пропорционален высоте
      const weight = Math.max(1, GAME_CONST.MAX_COLUMN_HEIGHT - heights[i]);
      for (let j = 0; j < weight; j++) {
        candidates.push(i);
      }
    }

    if (candidates.length === 0) {
      // Все колонки полные — выбираем случайную
      return randomInt(0, GAME_CONST.NUM_COLUMNS - 1);
    }

    return randomChoice(candidates);
  }

  // ===== Генерация целей =====

  /**
   * Сгенерировать цель с гарантией проходимости
   * @returns {number}
   */
  generateTarget() {
    const config = getLevelConfig(this.game.level);
    const allCubes = this._getAllCubeValues();
    const upcomingCubes = this._getUpcomingCubeValues();
    const availableCubes = [...allCubes, ...upcomingCubes];

    if (DEBUG.logGenerations) {
      console.log(`[GEN] Field cubes: [${allCubes}], upcoming: [${upcomingCubes}]`);
    }

    // 1. Найти все возможные суммы
    const possibleSums = this.findAllPossibleSums(availableCubes);

    if (possibleSums.size > 0) {
      // 2. Фильтруем суммы по допустимому диапазону
      const validSums = [];
      for (const [sum, combos] of possibleSums) {
        if (sum >= GAME_CONST.MIN_TARGET && sum <= config.maxTarget) {
          validSums.push({ sum, combos });
        }
      }

      if (validSums.length > 0) {
        // 3. Выбираем с учётом распределения сложности
        const chosen = this._chooseSumByDifficulty(validSums);
        if (DEBUG.logGenerations) {
          console.log(`[GEN] Target: ${chosen} (from ${validSums.length} valid sums)`);
        }
        return chosen;
      }
    }

    // Fallback: генерируем достижимую цель и планируем кубики
    return this._generateFallbackTarget(config);
  }

  /**
   * Выбрать сумму по правилам сложности
   * @param {{ sum: number, combos: number[][] }[]} validSums
   * @returns {number}
   * @private
   */
  _chooseSumByDifficulty(validSums) {
    // Разделяем по количеству кубиков
    const by2 = validSums.filter(s => s.combos.some(c => c.length === 2));
    const by3 = validSums.filter(s => s.combos.some(c => c.length === 3));
    const by4 = validSums.filter(s => s.combos.some(c => c.length >= 4));

    // Распределение: 40% - 2 кубика, 40% - 3, 20% - 4+
    const roll = Math.random();
    let pool;
    if (roll < 0.4 && by2.length > 0) {
      pool = by2;
    } else if (roll < 0.8 && by3.length > 0) {
      pool = by3;
    } else if (by4.length > 0) {
      pool = by4;
    } else {
      pool = validSums;
    }

    return randomChoice(pool).sum;
  }

  /**
   * Фоллбэк: генерируем простую цель и планируем кубики
   * @param {Object} config
   * @returns {number}
   * @private
   */
  _generateFallbackTarget(config) {
    // Генерируем 2-3 числа, которые дадут нужную сумму
    const numCubes = Math.random() < 0.5 ? 2 : 3;
    const values = [];
    for (let i = 0; i < numCubes; i++) {
      values.push(randomInt(1, config.maxNumber));
    }
    const target = values.reduce((s, v) => s + v, 0);

    // Планируем эти кубики для разных колонок
    const shuffledCols = shuffle([0, 1, 2, 3]);
    values.forEach((val, i) => {
      const colIdx = shuffledCols[i % 4];
      this.plannedCubes.get(colIdx).push(val);
    });

    if (DEBUG.logGenerations) {
      console.log(`[GEN] Fallback target: ${target}, planned cubes: ${JSON.stringify(values)}`);
    }

    return clamp(target, GAME_CONST.MIN_TARGET, config.maxTarget);
  }

  // ===== Поиск комбинаций =====

  /**
   * Найти все возможные суммы из данных кубиков
   * @param {number[]} cubeValues — массив значений
   * @param {number} maxCubes — максимум кубиков в комбинации
   * @returns {Map<number, number[][]>} — сумма → массив комбинаций
   */
  findAllPossibleSums(cubeValues, maxCubes = GAME_CONST.MAX_CUBES_FOR_SUM) {
    const results = new Map();

    const search = (startIdx, currentSum, count, usedIndices) => {
      if (count > maxCubes) return;

      if (count >= GAME_CONST.MIN_CUBES_FOR_SUM) {
        if (!results.has(currentSum)) {
          results.set(currentSum, []);
        }
        results.get(currentSum).push([...usedIndices]);
      }

      for (let i = startIdx; i < cubeValues.length; i++) {
        search(
          i + 1,
          currentSum + cubeValues[i],
          count + 1,
          [...usedIndices, i]
        );
      }
    };

    search(0, 0, 0, []);
    return results;
  }

  /**
   * Проверить, можно ли собрать данную сумму из кубиков на поле
   * @param {number} target
   * @returns {{ possible: boolean, combinations: Object[][] }}
   */
  checkTargetAchievable(target) {
    const allCubes = this._getAllCubesFlat();
    const values = allCubes.map(c => c.value);

    const results = [];
    const search = (startIdx, remaining, count, used) => {
      if (remaining === 0 && count >= GAME_CONST.MIN_CUBES_FOR_SUM) {
        results.push([...used]);
        return;
      }
      if (remaining < 0 || count >= GAME_CONST.MAX_CUBES_FOR_SUM) return;

      for (let i = startIdx; i < values.length; i++) {
        search(i + 1, remaining - values[i], count + 1, [...used, allCubes[i]]);
      }
    };

    search(0, target, 0, []);
    return { possible: results.length > 0, combinations: results };
  }

  // ===== Вспомогательные методы =====

  /**
   * Получить все значения кубиков на поле
   * @returns {number[]}
   * @private
   */
  _getAllCubeValues() {
    const values = [];
    for (const col of this.game.columns) {
      for (const cube of col) {
        if (!cube.removing) {
          values.push(cube.value);
        }
      }
    }
    return values;
  }

  /**
   * Получить все кубики как плоский массив
   * @returns {Object[]}
   * @private
   */
  _getAllCubesFlat() {
    const cubes = [];
    for (const col of this.game.columns) {
      for (const cube of col) {
        if (!cube.removing) {
          cubes.push(cube);
        }
      }
    }
    return cubes;
  }

  /**
   * Получить значения кубиков из очередей
   * @returns {number[]}
   * @private
   */
  _getUpcomingCubeValues() {
    const values = [];
    if (this.game.queues) {
      for (const queue of this.game.queues) {
        for (const val of queue) {
          values.push(val);
        }
      }
    }
    // Плюс запланированные
    for (const [, planned] of this.plannedCubes) {
      for (const val of planned) {
        values.push(val);
      }
    }
    return values;
  }

  /**
   * Распределение чисел на поле
   * @returns {Object<number, number>}
   * @private
   */
  _getNumberDistribution() {
    const dist = {};
    for (const col of this.game.columns) {
      for (const cube of col) {
        dist[cube.value] = (dist[cube.value] || 0) + 1;
      }
    }
    return dist;
  }

  /**
   * Найти значения, добавление которых поможет собрать цель
   * @param {number[]} existingValues
   * @param {number} target
   * @param {number} maxValue
   * @returns {number[]}
   * @private
   */
  _findHelpfulValues(existingValues, target, maxValue) {
    const helpful = new Set();

    // Проверяем: если добавить число X, можно ли собрать target?
    for (let x = 1; x <= maxValue; x++) {
      const extended = [...existingValues, x];
      const sums = this.findAllPossibleSums(extended, 4);
      if (sums.has(target)) {
        helpful.add(x);
      }
    }

    return Array.from(helpful);
  }

  /**
   * Найти комбинации из values, дающие target, с ровно count элементами
   * @param {number[]} values
   * @param {number} target
   * @param {number} count
   * @returns {number[][]}
   * @private
   */
  _findCombinations(values, target, count) {
    const results = [];

    const search = (startIdx, remaining, depth, used) => {
      if (depth === count) {
        if (remaining === 0) results.push([...used]);
        return;
      }
      for (let i = startIdx; i < values.length; i++) {
        if (values[i] <= remaining) {
          search(i + 1, remaining - values[i], depth + 1, [...used, values[i]]);
        }
      }
    };

    search(0, target, 0, []);
    return results;
  }

  /**
   * Сброс запланированных кубиков
   */
  reset() {
    for (let i = 0; i < GAME_CONST.NUM_COLUMNS; i++) {
      this.plannedCubes.set(i, []);
    }
  }
}
