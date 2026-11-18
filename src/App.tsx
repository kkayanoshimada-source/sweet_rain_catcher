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
  isBomb?: boolean;
}

interface FloatingScore {
  id: number;
  x: number;
  y: number;
  text: string;
  isPositive: boolean;
  isCombo: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

const ITEMS_CONFIG = [
  { emoji: '🍰', name: 'ショートケーキ', points: 100, isBad: false, weight: 22 },
  { emoji: '🍩', name: 'ドーナツ', points: 80, isBad: false, weight: 22 },
  { emoji: '🍪', name: 'クッキー', points: 50, isBad: false, weight: 26 },
  { emoji: '🍮', name: 'プリン', points: 120, isBad: false, weight: 18 },
  { emoji: '🧁', name: 'カップケーキ', points: 150, isBad: false, weight: 14 },
  { emoji: '🍓', name: '特選いちごタルト', points: 300, isBad: false, weight: 8 },
  { emoji: '🍫', name: '生チョコレート', points: 200, isBad: false, weight: 12 },
  { emoji: '💣', name: 'ばくだん', points: -200, isBad: true, isBomb: true, weight: 15 },
  { emoji: '🫑', name: 'ピーマン', points: -100, isBad: true, weight: 12 },
  { emoji: '🌶️', name: '激辛とうがらし', points: -150, isBad: true, weight: 10 },
];

const GAME_DURATION = 60;
const MAX_BOMBS = 5;

export function App() {
  const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
  const [endReason, setEndReason] = useState<'timeup' | 'bomb'>('timeup');
  const [stage, setStage] = useState<number>(1);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_DURATION);
  const [bombCount, setBombCount] = useState<number>(0);
  const [basketX, setBasketX] = useState<number>(50);
  const [items, setItems] = useState<FallingItem[]>([]);
  const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [isDamaged, setIsDamaged] = useState<boolean>(false);

  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const basketXRef = useRef<number>(50);
  const bombCountRef = useRef<number>(0);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const nextItemId = useRef<number>(0);
  const nextScoreId = useRef<number>(0);
  const nextParticleId = useRef<number>(0);
  const lastSpawnTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);

  // ハイスコア読み込み
  useEffect(() => {
    const saved = localStorage.getItem('choco_catch_highscore');
    if (saved) setHighScore(Number(saved));
  }, []);

  const updateBasketPosition = useCallback((newX: number) => {
    const clamped = Math.max(9, Math.min(91, newX));
    basketXRef.current = clamped;
    setBasketX(clamped);
  }, []);

  // ゲーム開始
  const startGame = (targetStage: number = 1, keepScore: boolean = false) => {
    if (!keepScore) {
      setScore(0);
    }
    setStage(targetStage);
    setTimeLeft(GAME_DURATION);
    setBombCount(0);
    bombCountRef.current = 0;
    setEndReason('timeup');
    setItems([]);
    setFloatingScores([]);
    setParticles([]);
    setCombo(0);
    setMaxCombo(0);
    setIsDamaged(false);
    updateBasketPosition(50);
    lastSpawnTime.current = performance.now();
    lastFrameTime.current = performance.now();
    setGameState('playing');
  };

  // 60秒タイマー
  useEffect(() => {
    if (gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setEndReason('timeup');
          setGameState('gameover');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState]);

  // ハイスコア更新
  useEffect(() => {
    if (gameState === 'gameover') {
      setHighScore((prev) => {
        const updated = Math.max(prev, score);
        localStorage.setItem('choco_catch_highscore', String(updated));
        return updated;
      });
    }
  }, [gameState, score]);

  // キーボード操作
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

  const handlePointerMove = (clientX: number) => {
    if (gameState !== 'playing' || !gameAreaRef.current) return;
    const rect = gameAreaRef.current.getBoundingClientRect();
    const relativeX = ((clientX - rect.left) / rect.width) * 100;
    updateBasketPosition(relativeX);
  };

  // キラキラパーティクル生成
  const createParticles = (xPct: number, yPct: number, isGood: boolean) => {
    const newParticles: Particle[] = [];
    const count = isGood ? 14 : 10;
    const colors = isGood ? ['#ffd700', '#ff9800', '#fff', '#ff69b4', '#00e5ff'] : ['#ff3d00', '#d50000', '#333'];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      newParticles.push({
        id: nextParticleId.current++,
        x: xPct,
        y: yPct,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
      });
    }

    setParticles((prev) => [...prev, ...newParticles]);
  };

  // アイテムスポーン
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

    const stageSpeedMod = 1 + (stage - 1) * 0.15;
    const baseSpeed = (28 + elapsedRatio * 20) * stageSpeedMod;
    const speedVariance = Math.random() * 14;

    const newItem: FallingItem = {
      id: nextItemId.current++,
      x: 9 + Math.random() * 82,
      y: -6,
      speed: baseSpeed + speedVariance,
      emoji: selected.emoji,
      name: selected.name,
      points: selected.points,
      isBad: selected.isBad,
      isBomb: selected.isBomb,
    };

    setItems((prev) => [...prev, newItem]);
  }, [stage]);

  const triggerFloatingScore = (x: number, y: number, points: number, comboCount: number, isBomb?: boolean) => {
    const id = nextScoreId.current++;
    const multiplier = Math.min(3.0, 1 + Math.floor(comboCount / 5) * 0.2);
    const finalPts = points > 0 ? Math.round(points * multiplier) : points;
    const text = isBomb
      ? `💥 ${finalPts}`
      : finalPts > 0
      ? `+${finalPts} ${comboCount >= 3 ? `(${comboCount}COMBO!)` : ''}`
      : `${finalPts}`;

    setFloatingScores((prev) => [...prev, { id, x, y, text, isPositive: finalPts > 0, isCombo: comboCount >= 5 }]);

    setTimeout(() => {
      setFloatingScores((prev) => prev.filter((item) => item.id !== id));
    }, 800);
  };

  // メインゲームループ
  useEffect(() => {
    if (gameState !== 'playing') return;

    let animationFrameId: number;

    const loop = (now: number) => {
      const dt = (now - lastFrameTime.current) / 1000;
      lastFrameTime.current = now;

      // 1. キーボード移動
      const moveSpeed = 85 * dt;
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['a'] || keysPressed.current['A']) {
        updateBasketPosition(basketXRef.current - moveSpeed);
      }
      if (keysPressed.current['ArrowRight'] || keysPressed.current['d'] || keysPressed.current['D']) {
        updateBasketPosition(basketXRef.current + moveSpeed);
      }

      // 2. スポーン間隔
      const elapsedRatio = (GAME_DURATION - timeLeft) / GAME_DURATION;
      const stageIntervalMod = Math.max(0.45, 1 - (stage - 1) * 0.12);
      const spawnInterval = Math.max(200, (700 - elapsedRatio * 350) * stageIntervalMod);

      if (now - lastSpawnTime.current > spawnInterval) {
        spawnItem(elapsedRatio);
        lastSpawnTime.current = now;
      }

      // 3. パーティクル更新
      setParticles((prevParticles) =>
        prevParticles
          .map((p) => ({
            ...p,
            x: p.x + p.vx * 0.15,
            y: p.y + p.vy * 0.15,
            vy: p.vy + 0.3,
            life: p.life - dt * 1.8,
          }))
          .filter((p) => p.life > 0)
      );

      // 4. 当たり判定（カゴの位置を上に引き上げたため Y判定も 73% 〜 85% に調整）
      setItems((prevItems) => {
        const nextItems: FallingItem[] = [];
        let scoreDelta = 0;
        let hitBad = false;
        let bombsHitThisFrame = 0;
        let currentCombo = combo;

        for (const item of prevItems) {
          const nextY = item.y + item.speed * dt;
          const isWithinY = nextY >= 73 && nextY <= 85;
          const isWithinX = Math.abs(item.x - basketXRef.current) <= 10.5;

          if (isWithinY && isWithinX) {
            if (item.isBad) {
              currentCombo = 0;
              scoreDelta += item.points;
              hitBad = true;
              if (item.isBomb) {
                bombsHitThisFrame += 1;
              }
              createParticles(item.x, 76, false);
            } else {
              currentCombo += 1;
              setMaxCombo((max) => Math.max(max, currentCombo));

              const mult = Math.min(3.0, 1 + Math.floor(currentCombo / 5) * 0.2);
              const actualPoints = Math.round(item.points * mult);
              scoreDelta += actualPoints;
              createParticles(item.x, 76, true);
            }

            triggerFloatingScore(item.x, 71, item.points, currentCombo, item.isBomb);
            continue;
          }

          if (nextY > 105) continue;

          nextItems.push({ ...item, y: nextY });
        }

        setCombo(currentCombo);

        if (scoreDelta !== 0) {
          setScore((prev) => Math.max(0, prev + scoreDelta));
        }
        if (hitBad) {
          setIsDamaged(true);
          setTimeout(() => setIsDamaged(false), 300);
        }
        if (bombsHitThisFrame > 0) {
          const updatedBombs = bombCountRef.current + bombsHitThisFrame;
          bombCountRef.current = updatedBombs;
          setBombCount(updatedBombs);
          if (updatedBombs >= MAX_BOMBS) {
            setEndReason('bomb');
            setGameState('gameover');
          }
        }

        return nextItems;
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    lastFrameTime.current = performance.now();
    animationFrameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, timeLeft, spawnItem, updateBasketPosition, combo, stage]);

  const remainingLife = Math.max(0, MAX_BOMBS - bombCount);

  return (
    <div className="app-wrapper">
      <div
        ref={gameAreaRef}
        className={`game-container ${isDamaged ? 'shake-damage' : ''}`}
        onMouseMove={(e) => handlePointerMove(e.clientX)}
        onTouchMove={(e) => {
          if (e.touches.length > 0) handlePointerMove(e.touches[0].clientX);
        }}
        onTouchStart={(e) => {
          if (e.touches.length > 0) handlePointerMove(e.touches[0].clientX);
        }}
      >
        <div className="choco-grid-bg" aria-hidden="true"></div>

        <div className="chocolate-drip-header" aria-hidden="true">
          <div className="shine-bar"></div>
          <div className="drip drip-1"></div>
          <div className="drip drip-2"></div>
          <div className="drip drip-3"></div>
          <div className="drip drip-4"></div>
          <div className="drip drip-5"></div>
          <div className="drip drip-6"></div>
        </div>

        <header className="hud-bar">
          <div className="hud-box">
            <span className="hud-label">STAGE</span>
            <span className="hud-value stage-text">★ {stage}</span>
          </div>
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
            <span className="hud-label">LIFE</span>
            <span className={`hud-value life-text ${remainingLife <= 1 ? 'urgent' : ''}`}>
              💣 {remainingLife}/{MAX_BOMBS}
            </span>
          </div>
        </header>

        {gameState === 'playing' && combo >= 2 && (
          <div className="combo-banner">
            🔥 {combo} COMBO!
          </div>
        )}

        {gameState === 'start' && (
          <div className="overlay-screen">
            <div className="card-panel">
              <h1 className="game-title">🍫Sweet Rain Catcher!🍰</h1>
              <p className="game-subtitle">
                落ちてくるスイーツをカゴでキャッチしよう！
              </p>

              <div className="rules-box">
                <div className="rule-row">
                  <span>🍰 🧁 🍓 🍫 🍮</span>
                  <span className="plus-text">＋50 〜 ＋300点</span>
                </div>
                <div className="rule-row">
                  <span>🫑 🌶️（苦手品）</span>
                  <span className="minus-text">−100 〜 −150点</span>
                </div>
                <div className="rule-row">
                  <span>💣（爆弾）</span>
                  <span className="minus-text">−200点（5個で終了！）</span>
                </div>
                <div className="rule-info-note">
                  ✨ ステージクリアごとに難易度が上がり、<br />エンドレスに挑戦可能！
                </div>
                <p className="control-hint">
                  操作：マウス / タッチ / キーボード（← →）
                </p>
              </div>

              <button className="primary-btn" onClick={() => startGame(1, false)}>
                ゲームスタート（STAGE 1）
              </button>
            </div>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="overlay-screen">
            <div className="card-panel">
              {endReason === 'bomb' ? (
                <>
                  <h2 className="gameover-title">💥 GAME OVER!</h2>
                  <p className="bomb-over-sub">ばくだんを5個キャッチしてしまった！</p>
                </>
              ) : (
                <>
                  <h2 className="stageclear-title">🎉 STAGE CLEAR!</h2>
                  <p className="final-score-label">STAGE {stage} クリアスコア</p>
                </>
              )}

              <div className="final-score-value">{score.toLocaleString()} pt</div>
              <div className="max-combo-display">最高コンボ: {maxCombo} COMBO</div>

              {score > 0 && score >= highScore && (
                <div className="new-record-badge">🌟 NEW HIGH SCORE! 🌟</div>
              )}

              <div className="gameover-btn-group">
                {endReason === 'timeup' && (
                  <button
                    className="primary-btn stage2-btn"
                    onClick={() => startGame(stage + 1, true)}
                  >
                    🚀 次のステージ（STAGE {stage + 1}）へ進む！
                  </button>
                )}
                <button
                  className={endReason === 'bomb' ? 'primary-btn' : 'secondary-btn'}
                  onClick={() => startGame(1, false)}
                >
                  最初から（STAGE 1）やり直す
                </button>
              </div>
            </div>
          </div>
        )}

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

        {particles.map((p) => (
          <div
            key={p.id}
            className="sparkle-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              backgroundColor: p.color,
              opacity: p.life,
              transform: `scale(${p.life * 1.2})`,
            }}
          ></div>
        ))}

        {floatingScores.map((fs) => (
          <div
            key={fs.id}
            className={`floating-score ${fs.isPositive ? 'positive' : 'negative'} ${fs.isCombo ? 'combo-pop' : ''}`}
            style={{
              left: `${fs.x}%`,
              top: `${fs.y}%`,
            }}
          >
            {fs.text}
          </div>
        ))}

        {/* カゴ（下部から余裕を持たせた高さに配置） */}
        <div
          className="basket-wrapper"
          style={{
            left: `${basketX}%`,
          }}
        >
          <div className="luxury-basket">
            <div className="basket-gold-handle"></div>
            <div className="basket-rim-ribbon"></div>
            <div className="basket-body-mesh">
              <div className="mesh-line"></div>
              <div className="mesh-line"></div>
            </div>
          </div>
        </div>

        {/* 下部の操作ガイド帯＆ウエハース風フロア */}
        <div className="touch-guide-zone" aria-hidden="true">
          <span>◀ スライドしてカゴを移動 ▶</span>
        </div>
        <div className="floor-wafer" aria-hidden="true"></div>
      </div>
    </div>
  );
}

export default App;