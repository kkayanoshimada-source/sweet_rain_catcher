import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

interface FallingItem {
  id: number;
  x: number; // 0 ~ 100 (%)
  y: number; // 0 ~ 100 (%)
  speed: number;
  emoji: string;
  name: string;
  points: number;
  isBad: boolean;
}

interface FloatingScore {
  id: number;
  x: number;
  y: number;
  text: string;
  isPositive: boolean;
}

const ITEMS_CONFIG = [
  { emoji: '🍰', name: 'ショートケーキ', points: 100, isBad: false, weight: 25 },
  { emoji: '🍩', name: 'ドーナツ', points: 80, isBad: false, weight: 25 },
  { emoji: '🍪', name: 'クッキー', points: 50, isBad: false, weight: 30 },
  { emoji: '🍮', name: 'プリン', points: 120, isBad: false, weight: 20 },
  { emoji: '🧁', name: 'カップケーキ', points: 150, isBad: false, weight: 15 },
  { emoji: '🍓', name: '特選いちごタルト', points: 300, isBad: false, weight: 8 },
  { emoji: '💣', name: 'ばくだん', points: -200, isBad: true, weight: 18 },
  { emoji: '🫑', name: 'ピーマン', points: -100, isBad: true, weight: 15 },
  { emoji: '🌶️', name: '激辛とうがらし', points: -150, isBad: true, weight: 12 },
];

const GAME_DURATION = 60;

export function App() {
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_DURATION);
  const [basketX, setBasketX] = useState<number>(50);
  const [items, setItems] = useState<FallingItem[]>([]);
  const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([]);
  const [isDamaged, setIsDamaged] = useState<boolean>(false);

  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const basketXRef = useRef<number>(50);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const nextItemId = useRef<number>(0);
  const nextScoreId = useRef<number>(0);
  const lastSpawnTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);

  // ハイスコアの読み込み
  useEffect(() => {
    const saved = localStorage.getItem('choco_catch_highscore');
    if (saved) setHighScore(Number(saved));
  }, []);

  // カゴの位置更新（0%〜100%の範囲内に制限）
  const updateBasketPosition = useCallback((newX: number) => {
    const clamped = Math.max(8, Math.min(92, newX));
    basketXRef.current = clamped;
    setBasketX(clamped);
  }, []);

  // ゲーム開始
  const startGame = () => {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setItems([]);
    setFloatingScores([]);
    setIsDamaged(false);
    updateBasketPosition(50);
    lastSpawnTime.current = performance.now();
    lastFrameTime.current = performance.now();
    setGameState('playing');
  };

  // 60秒カウントダウンタイマー
  useEffect(() => {
    if (gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setGameState('gameover');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState]);

  // ゲーム終了時のハイスコア更新
  useEffect(() => {
    if (gameState === 'gameover') {
      setHighScore((prev) => {
        const updated = Math.max(prev, score);
        localStorage.setItem('choco_catch_highscore', String(updated));
        return updated;
      });
    }
  }, [gameState, score]);

  // キーボード操作のリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // マウス・タッチ操作
  const handlePointerMove = (clientX: number) => {
    if (gameState !== 'playing' || !gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * 100;
    updateBasketPosition(relativeX);
  };

  // 重み付きランダムでお菓子・障害物を生成
  const spawnItem = useCallback((elapsedRatio: number) => {
    const totalWeight = ITEMS_CONFIG.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    let selected = ITEMS_CONFIG[0];

    for (const item of ITEMS_CONFIG) {
      if (random < item.weight) {
        selected = item;
        break;
      }
      random -= item.weight;
    }

    // 時間が進むにつれて落下スピードが少し上がる
    const baseSpeed = 28 + elapsedRatio * 18;
    const speedVariance = Math.random() * 12;

    const newItem: FallingItem = {
      id: nextItemId.current++,
      x: 8 + Math.random() * 84,
      y: -6,
      speed: baseSpeed + speedVariance,
      emoji: selected.emoji,
      name: selected.name,
      points: selected.points,
      isBad: selected.isBad,
    };

    setItems((prev) => [...prev, newItem]);
  }, []);

  // ポップアップスコア表示
  const triggerFloatingScore = (x: number, y: number, points: number) => {
    const id = nextScoreId.current++;
    const text = points > 0 ? `+${points}` : `${points}`;
    setFloatingScores((prev) => [...prev, { id, x, y, text, isPositive: points > 0 }]);

    setTimeout(() => {
      setFloatingScores((prev) => prev.filter((item) => item.id !== id));
    }, 700);
  };

  // メインゲームループ (requestAnimationFrame)
  useEffect(() => {
    if (gameState !== 'playing') return;

    let animationFrameId: number;

    const loop = (now: number) => {
      const dt = (now - lastFrameTime.current) / 1000;
      lastFrameTime.current = now;

      // 1. キーボードによるカゴ移動
      const moveSpeed = 75 * dt; // 1秒で画面幅の75%移動
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['a'] || keysPressed.current['A']) {
        updateBasketPosition(basketXRef.current - moveSpeed);
      }
      if (keysPressed.current['ArrowRight'] || keysPressed.current['d'] || keysPressed.current['D']) {
        updateBasketPosition(basketXRef.current + moveSpeed);
      }

      // 2. アイテムのスポーン間隔制御（残り時間が減るほど出現頻度アップ）
      const elapsedRatio = (GAME_DURATION - timeLeft) / GAME_DURATION;
      const spawnInterval = Math.max(320, 750 - elapsedRatio * 380);
      if (now - lastSpawnTime.current > spawnInterval) {
        spawnItem(elapsedRatio);
        lastSpawnTime.current = now;
      }

      // 3. アイテムの落下と当たり判定
      setItems((prevItems) => {
        const nextItems: FallingItem[] = [];
        let scoreDelta = 0;
        let hitBad = false;

        for (const item of prevItems) {
          const nextY = item.y + item.speed * dt;

          // カゴの当たり判定ゾーン（画面下部 y: 82% ~ 92%）
          const isWithinY = nextY >= 82 && nextY <= 92;
          const isWithinX = Math.abs(item.x - basketXRef.current) <= 9;

          if (isWithinY && isWithinX) {
            scoreDelta += item.points;
            triggerFloatingScore(item.x, 80, item.points);
            if (item.isBad) {
              hitBad = true;
            }
            continue; // キャッチされたので配列から除外
          }

          // 画面外に落ちたら除外
          if (nextY > 105) {
            continue;
          }

          nextItems.push({ ...item, y: nextY });
        }

        if (scoreDelta !== 0) {
          setScore((prev) => Math.max(0, prev + scoreDelta));
        }
        if (hitBad) {
          setIsDamaged(true);
          setTimeout(() => setIsDamaged(false), 300);
        }

        return nextItems;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    lastFrameTime.current = performance.now();
    animationFrameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, timeLeft, spawnItem, updateBasketPosition]);

  return (
    <div className="app-wrapper">
      <div
        ref={gameAreaRef}
        className={`game-container ${isDamaged ? 'shake-damage' : ''}`}
        onMouseMove={(e) => handlePointerMove(e.clientX)}
        onTouchMove={(e) => {
          if (e.touches.length > 0) {
            handlePointerMove(e.touches[0].clientX);
          }
        }}
        onTouchStart={(e) => {
          if (e.touches.length > 0) {
            handlePointerMove(e.touches[0].clientX);
          }
        }}
      >
        {/* 上部とろけるチョコ装飾 */}
        <div className="chocolate-drip-header" aria-hidden="true">
          <div className="drip drip-1"></div>
          <div className="drip drip-2"></div>
          <div className="drip drip-3"></div>
          <div className="drip drip-4"></div>
          <div className="drip drip-5"></div>
        </div>

        {/* スコア＆タイマーヘッダー */}
        <header className="hud-bar">
          <div className="hud-box">
            <span className="hud-label">SCORE</span>
            <span className="hud-value">{score.toLocaleString()}</span>
          </div>
          <div className="hud-box timer-box">
            <span className="hud-label">TIME</span>
            <span className={`hud-value ${timeLeft <= 10 && gameState === 'playing' ? 'urgent' : ''}`}>
              {timeLeft}s
            </span>
          </div>
          <div className="hud-box">
            <span className="hud-label">BEST</span>
            <span className="hud-value">{highScore.toLocaleString()}</span>
          </div>
        </header>

        {/* スタート画面 */}
        {gameState === 'start' && (
          <div className="overlay-screen">
            <div className="card-panel">
              <h1 className="game-title">🍫 スイーツキャッチ 🍰</h1>
              <p className="game-subtitle">
                上から落ちてくる甘いお菓子をカゴでキャッチしよう！
              </p>

              <div className="rules-box">
                <div className="rule-row">
                  <span>🍰 🍩 🍪 🍮 🍓</span>
                  <span className="plus-text">＋50 〜 ＋300点</span>
                </div>
                <div className="rule-row">
                  <span>💣 🫑 🌶️（苦手・ばくだん）</span>
                  <span className="minus-text">−100 〜 −200点</span>
                </div>
                <p className="control-hint">
                  操作：マウス移動 / 画面タッチ / キーボード（← →）
                </p>
              </div>

              <button className="primary-btn" onClick={startGame}>
                ゲームスタート（60秒）
              </button>
            </div>
          </div>
        )}

        {/* ゲーム終了画面 */}
        {gameState === 'gameover' && (
          <div className="overlay-screen">
            <div className="card-panel">
              <h2 className="gameover-title">TIME UP!</h2>
              <p className="final-score-label">獲得スコア</p>
              <div className="final-score-value">{score.toLocaleString()} pt</div>
              {score > 0 && score >= highScore && (
                <div className="new-record-badge">🎉 NEW HIGH SCORE! 🎉</div>
              )}
              <button className="primary-btn" onClick={startGame}>
                もういちど遊ぶ
              </button>
            </div>
          </div>
        )}

        {/* 落下アイテム描画 */}
        {gameState === 'playing' &&
          items.map((item) => (
            <div
              key={item.id}
              className="falling-item"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
              }}
            >
              {item.emoji}
            </div>
          ))}

        {/* 獲得・減点ポップアップ */}
        {floatingScores.map((fs) => (
          <div
            key={fs.id}
            className={`floating-score ${fs.isPositive ? 'positive' : 'negative'}`}
            style={{
              left: `${fs.x}%`,
              top: `${fs.y}%`,
            }}
          >
            {fs.text}
          </div>
        ))}

        {/* プレイヤーのカゴ */}
        <div
          className="basket-wrapper"
          style={{
            left: `${basketX}%`,
          }}
        >
          <div className="basket-body">
            <div className="basket-rim"></div>
            <div className="basket-weave">🧺</div>
          </div>
        </div>

        {/* 下部ウエハース風の床装飾 */}
        <div className="floor-wafer" aria-hidden="true"></div>
      </div>
    </div>
  );
}

export default App;