(function () {
  "use strict";

  // ============================================================
  // CONSTANTS
  // ============================================================
  const W = 320;
  const H = 200;
  const GROUND_Y = 176;
  const NET_X = W / 2;
  const NET_TOP = 126;
  const NET_W = 3;
  const BALL_R = 9;
  const HEAD_R = 9;
  const P_HEIGHT = 24; // feet to head center
  const GRAVITY = 0.11;
  const P_GRAVITY = 0.19;
  const P_SPEED = 1.25;
  const JUMP_VEL = -3.1;
  const WIN_SCORE = 15;
  const BOUNCE_DAMP = 0.85;

  const PAL = {
    bg: "#0f0f23",
    sky1: "#0a0a2e",
    sky2: "#16213e",
    ground: "#8B6914",
    groundDark: "#6B5010",
    groundLine: "#A07818",
    net: "#AAAAAA",
    netTop: "#FFFFFF",
    ball: "#FFFFFF",
    p1: "#FFFF55",
    p1d: "#AAAA00",
    p2: "#55FFFF",
    p2d: "#00AAAA",
    text: "#FFFFFF",
    dim: "#555555",
    mid: "#888888",
  };

  const ST = { MENU: 0, SERVE: 1, PLAY: 2, SCORED: 3, OVER: 4 };

  // ============================================================
  // SOUND ENGINE
  // ============================================================
  class Sound {
    constructor() {
      this.ctx = null;
      this.on = true;
    }
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this.on = false;
      }
    }
    beep(freq, dur, type, vol) {
      if (!this.on || !this.ctx) return;
      type = type || "square";
      vol = vol || 0.12;
      try {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.connect(g);
        g.connect(this.ctx.destination);
        o.frequency.value = freq;
        o.type = type;
        g.gain.value = vol;
        g.gain.exponentialRampToValueAtTime(
          0.001,
          this.ctx.currentTime + dur
        );
        o.start(this.ctx.currentTime);
        o.stop(this.ctx.currentTime + dur);
      } catch (e) {}
    }
    hit() {
      this.beep(520, 0.07);
    }
    wall() {
      this.beep(200, 0.05, "triangle", 0.08);
    }
    net() {
      this.beep(300, 0.06, "triangle", 0.08);
    }
    score() {
      this.beep(660, 0.25, "square", 0.1);
      setTimeout(() => this.beep(880, 0.15, "square", 0.08), 150);
    }
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => this.beep(f, 0.2, "square", 0.1), i * 150)
      );
    }
    jump() {
      this.beep(280, 0.04, "triangle", 0.06);
    }
    menu() {
      this.beep(440, 0.08, "square", 0.08);
    }
  }

  // ============================================================
  // PARTICLES
  // ============================================================
  class Particles {
    constructor() {
      this.list = [];
    }
    emit(x, y, color, count, spread) {
      for (let i = 0; i < count; i++) {
        this.list.push({
          x: x,
          y: y,
          vx: (Math.random() - 0.5) * spread,
          vy: (Math.random() - 0.8) * spread,
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: color,
        });
      }
    }
    update() {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1;
        p.life--;
        if (p.life <= 0) this.list.splice(i, 1);
      }
    }
    draw(ctx) {
      for (const p of this.list) {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // PLAYER
  // ============================================================
  class Player {
    constructor(x, side, color, colorD) {
      this.startX = x;
      this.x = x;
      this.y = GROUND_Y;
      this.side = side;
      this.color = color;
      this.colorD = colorD;
      this.vx = 0;
      this.vy = 0;
      this.grounded = true;
      this.walkT = 0;
      this.jumped = false;
    }
    get hx() {
      return this.x;
    }
    get hy() {
      return this.y - P_HEIGHT;
    }
    reset() {
      this.x = this.startX;
      this.y = GROUND_Y;
      this.vx = 0;
      this.vy = 0;
      this.grounded = true;
      this.jumped = false;
    }
    update(inp) {
      this.jumped = false;
      this.vx = inp.dx * P_SPEED;
      this.x += this.vx;

      if (inp.jump && this.grounded) {
        this.vy = JUMP_VEL;
        this.grounded = false;
        this.jumped = true;
      }
      if (!this.grounded) {
        this.vy += P_GRAVITY;
        this.y += this.vy;
      }
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.grounded = true;
      }

      // boundaries
      const minX = this.side === 0 ? HEAD_R : NET_X + NET_W / 2 + HEAD_R;
      const maxX =
        this.side === 0 ? NET_X - NET_W / 2 - HEAD_R : W - HEAD_R;
      if (this.x < minX) this.x = minX;
      if (this.x > maxX) this.x = maxX;

      // walk anim
      if (Math.abs(this.vx) > 0.5 && this.grounded) {
        this.walkT += 0.18;
      } else if (this.grounded) {
        this.walkT = 0;
      }
    }
    draw(ctx) {
      const hx = Math.round(this.hx);
      const hy = Math.round(this.hy);
      const fy = Math.round(this.y);

      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;

      // torso
      ctx.beginPath();
      ctx.moveTo(hx, hy + HEAD_R);
      ctx.lineTo(hx, fy - 10);
      ctx.stroke();

      // legs
      const lk = Math.sin(this.walkT * 3) * 5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, fy - 10);
      ctx.lineTo(hx - 4 + lk, fy);
      ctx.moveTo(hx, fy - 10);
      ctx.lineTo(hx + 4 - lk, fy);
      ctx.stroke();

      // arms
      const armY = hy + HEAD_R + 4;
      const armUp = this.grounded ? 0 : -4;
      ctx.beginPath();
      ctx.moveTo(hx, armY);
      ctx.lineTo(hx - 7, armY + 6 + armUp);
      ctx.moveTo(hx, armY);
      ctx.lineTo(hx + 7, armY + 6 + armUp);
      ctx.stroke();

      // head
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(hx, hy, HEAD_R, 0, Math.PI * 2);
      ctx.fill();

      // eyes
      ctx.fillStyle = this.colorD;
      const ed = this.side === 0 ? 1 : -1;
      ctx.fillRect(hx + ed * 2, hy - 3, 2, 2);
      ctx.fillRect(hx + ed * 5, hy - 3, 2, 2);

      // headband
      ctx.strokeStyle = this.colorD;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, HEAD_R + 1, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
  }

  // ============================================================
  // BALL
  // ============================================================
  class Ball {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.trail = [];
    }
    serve(side) {
      this.x = side === 0 ? W * 0.25 : W * 0.75;
      this.y = 30;
      this.vx = 0;
      this.vy = 0;
      this.trail = [];
    }
    update(snd) {
      this.vy += GRAVITY;
      this.x += this.vx;
      this.y += this.vy;

      // walls — no energy loss (authentic to original)
      if (this.x - BALL_R < 0) {
        this.x = BALL_R;
        this.vx = Math.abs(this.vx);
        snd.wall();
      }
      if (this.x + BALL_R > W) {
        this.x = W - BALL_R;
        this.vx = -Math.abs(this.vx);
        snd.wall();
      }
      if (this.y - BALL_R < 0) {
        this.y = BALL_R;
        this.vy = Math.abs(this.vy);
        snd.wall();
      }

      // net collision
      this.hitNet(snd);

      // trail
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 5) this.trail.shift();

      // ground check — who scored?
      if (this.y + BALL_R >= GROUND_Y) {
        return this.x < NET_X ? 1 : 0; // opposite side scores
      }
      return -1;
    }
    hitNet(snd) {
      const nl = NET_X - NET_W / 2;
      const nr = NET_X + NET_W / 2;
      if (this.y + BALL_R < NET_TOP) return;
      if (this.y - BALL_R > GROUND_Y) return;
      if (this.x + BALL_R <= nl || this.x - BALL_R >= nr) return;

      // top of net
      if (
        this.y + BALL_R >= NET_TOP &&
        this.y - BALL_R < NET_TOP + 4 &&
        this.vy > 0
      ) {
        this.y = NET_TOP - BALL_R;
        this.vy = -Math.abs(this.vy) * 0.7;
        snd.net();
        return;
      }
      // side of net
      if (this.x < NET_X) {
        this.x = nl - BALL_R;
        this.vx = -Math.abs(this.vx) * BOUNCE_DAMP;
      } else {
        this.x = nr + BALL_R;
        this.vx = Math.abs(this.vx) * BOUNCE_DAMP;
      }
      snd.net();
    }
    hitPlayer(p, snd, particles) {
      const dx = this.x - p.hx;
      const dy = this.y - p.hy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = BALL_R + HEAD_R;
      if (dist >= minD || dist === 0) return false;

      const nx = dx / dist;
      const ny = dy / dist;
      // push out
      this.x = p.hx + nx * (minD + 0.5);
      this.y = p.hy + ny * (minD + 0.5);

      // reflect
      const dot = this.vx * nx + this.vy * ny;
      if (dot < 0) {
        this.vx -= 2 * dot * nx;
        this.vy -= 2 * dot * ny;
      }

      // add player velocity influence
      this.vx += p.vx * 0.3;
      this.vy += p.vy * 0.5;

      // ensure upward bounce when hit from below
      if (ny < -0.2 && this.vy > -0.75) {
        this.vy = -1.5;
      }

      // damping
      this.vx *= 0.92;
      this.vy *= 0.92;

      // speed limit
      const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (spd > 4) {
        this.vx = (this.vx / spd) * 4;
        this.vy = (this.vy / spd) * 4;
      }

      snd.hit();
      if (particles) particles.emit(this.x, this.y, p.color, 4, 3);
      return true;
    }
    draw(ctx) {
      // trail
      for (let i = 0; i < this.trail.length; i++) {
        const a = ((i + 1) / this.trail.length) * 0.25;
        ctx.globalAlpha = a;
        ctx.fillStyle = PAL.ball;
        ctx.beginPath();
        ctx.arc(
          Math.round(this.trail[i].x),
          Math.round(this.trail[i].y),
          BALL_R * 0.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // shadow on ground
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(
        Math.round(this.x),
        GROUND_Y + 1,
        BALL_R,
        2,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // ball
      ctx.fillStyle = PAL.ball;
      ctx.beginPath();
      ctx.arc(
        Math.round(this.x),
        Math.round(this.y),
        BALL_R,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // highlight
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(
        Math.round(this.x) - 1,
        Math.round(this.y) - 1,
        BALL_R * 0.35,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  // ============================================================
  // AI
  // ============================================================
  class AI {
    constructor() {
      this.targetX = W * 0.75;
      this.tick = 0;
    }
    update(me, ball) {
      const inp = { dx: 0, jump: false };
      this.tick++;
      if (this.tick % 2 !== 0) return inp; // slight reaction delay

      const onMySide = ball.x > NET_X;
      const coming = ball.vx > 0;

      if (onMySide || coming) {
        // predict landing
        let px = ball.x,
          py = ball.y,
          pvx = ball.vx,
          pvy = ball.vy;
        for (let i = 0; i < 40; i++) {
          pvy += GRAVITY;
          px += pvx;
          py += pvy;
          if (px < NET_X + 10) pvx = Math.abs(pvx);
          if (px > W - 5) pvx = -Math.abs(pvx);
          if (py >= GROUND_Y - P_HEIGHT) break;
        }
        this.targetX = Math.max(NET_X + HEAD_R + 5, Math.min(W - HEAD_R, px));
      } else {
        this.targetX = W * 0.72;
      }

      const diff = this.targetX - me.x;
      if (Math.abs(diff) > 4) inp.dx = diff > 0 ? 1 : -1;

      // jump when ball is close and above
      const bdy = ball.y - me.hy;
      const bdx = Math.abs(ball.x - me.hx);
      if (onMySide && bdx < 35 && bdy < 5 && ball.y < me.hy + 15) {
        inp.jump = true;
      }
      // defensive jump — ball falling fast towards us
      if (
        onMySide &&
        bdx < 20 &&
        ball.vy > 2 &&
        ball.y < me.hy - 10 &&
        ball.y > NET_TOP - 20
      ) {
        inp.jump = true;
      }

      return inp;
    }
  }

  // ============================================================
  // INPUT
  // ============================================================
  class Input {
    constructor() {
      this.keys = {};
      this.joy = null;
      this.jumpBtn = false;
      this.jumpBtnId = -1;
      this.mobile =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
      this.tap = null;

      document.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Space",
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
          ].includes(e.code)
        )
          e.preventDefault();
      });
      document.addEventListener("keyup", (e) => {
        this.keys[e.code] = false;
      });
    }
    bind(canvas) {
      this.canvas = canvas;
      canvas.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          const r = canvas.getBoundingClientRect();
          const mid = r.width / 2;
          for (const t of e.changedTouches) {
            const x = t.clientX - r.left;
            const y = t.clientY - r.top;
            this.tap = {
              x: x,
              y: y,
              sw: r.width,
              sh: r.height,
            };
            if (x < mid) {
              this.joy = {
                id: t.identifier,
                bx: x,
                by: y,
                cx: x,
                cy: y,
              };
            } else {
              this.jumpBtn = true;
              this.jumpBtnId = t.identifier;
            }
          }
        },
        { passive: false }
      );
      canvas.addEventListener(
        "touchmove",
        (e) => {
          e.preventDefault();
          const r = canvas.getBoundingClientRect();
          for (const t of e.changedTouches) {
            if (this.joy && t.identifier === this.joy.id) {
              this.joy.cx = t.clientX - r.left;
              this.joy.cy = t.clientY - r.top;
            }
          }
        },
        { passive: false }
      );
      const endTouch = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (this.joy && t.identifier === this.joy.id) this.joy = null;
          if (t.identifier === this.jumpBtnId) {
            this.jumpBtn = false;
            this.jumpBtnId = -1;
          }
        }
      };
      canvas.addEventListener("touchend", endTouch, { passive: false });
      canvas.addEventListener("touchcancel", endTouch, { passive: false });
      canvas.addEventListener("click", (e) => {
        const r = canvas.getBoundingClientRect();
        this.tap = {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          sw: r.width,
          sh: r.height,
        };
      });
    }
    p1() {
      let dx = 0,
        jump = false;
      if (this.keys["ArrowLeft"]) dx = -1;
      if (this.keys["ArrowRight"]) dx = 1;
      if (this.keys["ArrowUp"]) jump = true;
      if (this.joy) {
        const d = this.joy.cx - this.joy.bx;
        if (Math.abs(d) > 12) dx = d > 0 ? 1 : -1;
      }
      if (this.jumpBtn) jump = true;
      return { dx, jump };
    }
    p2() {
      let dx = 0,
        jump = false;
      if (this.keys["KeyA"]) dx = -1;
      if (this.keys["KeyD"]) dx = 1;
      if (this.keys["KeyW"]) jump = true;
      return { dx, jump };
    }
    popTap() {
      const t = this.tap;
      this.tap = null;
      return t;
    }
  }

  // ============================================================
  // GAME
  // ============================================================
  class Game {
    constructor() {
      this.dCvs = document.getElementById("gameCanvas");
      this.dCtx = this.dCvs.getContext("2d");
      this.gCvs = document.createElement("canvas");
      this.gCvs.width = W;
      this.gCvs.height = H;
      this.ctx = this.gCvs.getContext("2d");

      this.snd = new Sound();
      this.inp = new Input();
      this.inp.bind(this.dCvs);
      this.particles = new Particles();

      this.state = ST.MENU;
      this.mode = 0; // 0=1P, 1=2P
      this.menuSel = 0;

      this.p1 = new Player(W * 0.25, 0, PAL.p1, PAL.p1d);
      this.p2 = new Player(W * 0.75, 1, PAL.p2, PAL.p2d);
      this.ball = new Ball();
      this.ai = new AI();

      this.score = [0, 0];
      this.serveSide = 0;
      this.timer = 0;
      this.frame = 0;
      this.shake = 0;

      // stars
      this.stars = [];
      for (let i = 0; i < 30; i++) {
        this.stars.push({
          x: Math.random() * W,
          y: Math.random() * (GROUND_Y - 10),
          b: Math.random(),
        });
      }

      this.resize();
      window.addEventListener("resize", () => this.resize());

      this.lastT = 0;
      const loop = (ts) => {
        const dt = ts - this.lastT;
        this.lastT = ts;
        const steps = Math.min(Math.round(dt / (1000 / 60)), 4) || 1;
        for (let i = 0; i < steps; i++) this.update();
        this.draw();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    resize() {
      const c = this.dCvs.parentElement;
      const mw = c.clientWidth;
      const mh = c.clientHeight || window.innerHeight;
      const asp = W / H;
      let dw = mw;
      let dh = mw / asp;
      if (dh > mh) {
        dh = mh;
        dw = mh * asp;
      }
      this.dCvs.width = Math.round(dw);
      this.dCvs.height = Math.round(dh);
      this.dCvs.style.width = Math.round(dw) + "px";
      this.dCvs.style.height = Math.round(dh) + "px";
      this.scale = dw / W;
    }

    startGame(mode) {
      this.mode = mode;
      this.score = [0, 0];
      this.serveSide = 0;
      this.p1.reset();
      this.p2.reset();
      this.particles.list = [];
      this.state = ST.SERVE;
      this.timer = 50;
      this.snd.init();
      this.snd.menu();
    }

    update() {
      this.frame++;
      this.particles.update();
      if (this.shake > 0) this.shake--;

      switch (this.state) {
        case ST.MENU:
          this.uMenu();
          break;
        case ST.SERVE:
          this.timer--;
          // allow movement during serve countdown
          this.p1.update(this.inp.p1());
          if (this.mode === 0) this.p2.update(this.ai.update(this.p2, this.ball));
          else this.p2.update(this.inp.p2());
          if (this.timer <= 0) {
            this.ball.serve(this.serveSide);
            this.state = ST.PLAY;
          }
          break;
        case ST.PLAY:
          this.uPlay();
          break;
        case ST.SCORED:
          this.timer--;
          if (this.timer <= 0) {
            if (this.score[0] >= WIN_SCORE || this.score[1] >= WIN_SCORE) {
              this.state = ST.OVER;
              this.timer = 90;
              this.snd.win();
            } else {
              this.state = ST.SERVE;
              this.timer = 40;
              this.p1.reset();
              this.p2.reset();
            }
          }
          break;
        case ST.OVER:
          this.uOver();
          break;
      }
    }

    uMenu() {
      if (this.inp.keys["Digit1"]) {
        this.startGame(0);
        this.inp.keys["Digit1"] = false;
        return;
      }
      if (this.inp.keys["Digit2"]) {
        this.startGame(1);
        this.inp.keys["Digit2"] = false;
        return;
      }
      if (this.inp.keys["Enter"] || this.inp.keys["Space"]) {
        this.startGame(this.menuSel);
        this.inp.keys["Enter"] = false;
        this.inp.keys["Space"] = false;
        return;
      }
      if (this.inp.keys["ArrowUp"] || this.inp.keys["KeyW"]) {
        this.menuSel = 0;
        this.inp.keys["ArrowUp"] = false;
        this.inp.keys["KeyW"] = false;
        this.snd.init();
        this.snd.menu();
      }
      if (this.inp.keys["ArrowDown"] || this.inp.keys["KeyS"]) {
        this.menuSel = 1;
        this.inp.keys["ArrowDown"] = false;
        this.inp.keys["KeyS"] = false;
        this.snd.init();
        this.snd.menu();
      }

      const tap = this.inp.popTap();
      if (tap) {
        const gy = (tap.y / tap.sh) * H;
        const gx = (tap.x / tap.sw) * W;
        if (gy >= 100 && gy <= 122 && gx >= 70 && gx <= 250) {
          this.snd.init();
          this.startGame(0);
        } else if (gy >= 126 && gy <= 148 && gx >= 70 && gx <= 250) {
          this.snd.init();
          this.startGame(1);
        }
      }
    }

    uPlay() {
      const p1i = this.inp.p1();
      this.p1.update(p1i);
      if (this.p1.jumped) this.snd.jump();

      let p2i;
      if (this.mode === 0) {
        p2i = this.ai.update(this.p2, this.ball);
      } else {
        p2i = this.inp.p2();
      }
      this.p2.update(p2i);
      if (this.p2.jumped) this.snd.jump();

      const scorer = this.ball.update(this.snd);
      this.ball.hitPlayer(this.p1, this.snd, this.particles);
      this.ball.hitPlayer(this.p2, this.snd, this.particles);

      if (scorer >= 0) {
        this.score[scorer]++;
        this.serveSide = scorer;
        this.state = ST.SCORED;
        this.timer = 55;
        this.shake = 8;
        this.snd.score();
        // particles on ground where ball landed
        this.particles.emit(
          this.ball.x,
          GROUND_Y,
          scorer === 0 ? PAL.p1 : PAL.p2,
          8,
          4
        );
      }
    }

    uOver() {
      const tap = this.inp.popTap();
      if (tap || this.inp.keys["Enter"] || this.inp.keys["Space"]) {
        this.state = ST.MENU;
        this.inp.keys["Enter"] = false;
        this.inp.keys["Space"] = false;
      }
    }

    draw() {
      const ctx = this.ctx;
      // clear
      ctx.fillStyle = PAL.bg;
      ctx.fillRect(0, 0, W, H);

      // sky gradient
      const gr = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      gr.addColorStop(0, PAL.sky1);
      gr.addColorStop(1, PAL.sky2);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, GROUND_Y);

      // stars
      for (const s of this.stars) {
        const tw = Math.sin(this.frame * 0.03 + s.b * 10) * 0.5 + 0.5;
        ctx.globalAlpha = 0.3 + tw * 0.5;
        ctx.fillStyle = PAL.text;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      ctx.globalAlpha = 1;

      switch (this.state) {
        case ST.MENU:
          this.dMenu(ctx);
          break;
        case ST.SERVE:
        case ST.PLAY:
        case ST.SCORED:
          this.dCourt(ctx);
          this.p1.draw(ctx);
          this.p2.draw(ctx);
          if (this.state !== ST.SERVE) this.ball.draw(ctx);
          this.dScore(ctx);
          this.particles.draw(ctx);
          if (this.state === ST.SCORED) this.dPointMsg(ctx);
          if (this.state === ST.SERVE) this.dServeMsg(ctx);
          break;
        case ST.OVER:
          this.dCourt(ctx);
          this.p1.draw(ctx);
          this.p2.draw(ctx);
          this.dScore(ctx);
          this.particles.draw(ctx);
          this.dOverlay(ctx);
          break;
      }

      // scale to display
      const sx = this.shake > 0 ? (Math.random() - 0.5) * 3 : 0;
      const sy = this.shake > 0 ? (Math.random() - 0.5) * 3 : 0;
      this.dCtx.imageSmoothingEnabled = false;
      this.dCtx.clearRect(0, 0, this.dCvs.width, this.dCvs.height);
      this.dCtx.drawImage(
        this.gCvs,
        sx,
        sy,
        W,
        H,
        0,
        0,
        this.dCvs.width,
        this.dCvs.height
      );

      // touch controls overlay (native resolution)
      if (this.inp.mobile && (this.state === ST.PLAY || this.state === ST.SERVE))
        this.dTouch();
    }

    dCourt(ctx) {
      // ground
      ctx.fillStyle = PAL.groundDark;
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      // ground surface line
      ctx.fillStyle = PAL.groundLine;
      ctx.fillRect(0, GROUND_Y, W, 1);
      // ground pattern
      ctx.fillStyle = PAL.ground;
      for (let gx = 0; gx < W; gx += 8) {
        ctx.fillRect(gx, GROUND_Y + 3, 4, 1);
        ctx.fillRect(gx + 4, GROUND_Y + 7, 4, 1);
      }

      // court lines
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(W * 0.25, GROUND_Y + 1, 1, H - GROUND_Y);
      ctx.fillRect(W * 0.75, GROUND_Y + 1, 1, H - GROUND_Y);

      // net post
      ctx.fillStyle = PAL.net;
      ctx.fillRect(NET_X - 1, NET_TOP, NET_W, GROUND_Y - NET_TOP);
      // net top cap
      ctx.fillStyle = PAL.netTop;
      ctx.fillRect(NET_X - 3, NET_TOP - 1, 7, 2);
      // net mesh
      ctx.strokeStyle = "rgba(180,180,180,0.25)";
      ctx.lineWidth = 1;
      for (let ny = NET_TOP + 5; ny < GROUND_Y; ny += 5) {
        ctx.beginPath();
        ctx.moveTo(NET_X - 1, ny);
        ctx.lineTo(NET_X + 1, ny);
        ctx.stroke();
      }
    }

    dScore(ctx) {
      ctx.fillStyle = PAL.text;
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(this.score[0] + "  -  " + this.score[1], W / 2, 6);
      ctx.textBaseline = "alphabetic";
    }

    dMenu(ctx) {
      // title with retro glow
      ctx.textAlign = "center";

      // ARCADE
      ctx.fillStyle = PAL.p1;
      ctx.font = "bold 24px monospace";
      ctx.fillText("ARCADE", W / 2, 48);

      // VOLLEYBALL
      ctx.fillStyle = PAL.p2;
      ctx.font = "bold 18px monospace";
      ctx.fillText("VOLLEYBALL", W / 2, 70);

      // subtitle
      ctx.fillStyle = PAL.dim;
      ctx.font = "8px monospace";
      ctx.fillText("RETRO REMAKE", W / 2, 84);

      // menu options
      const opts = ["1P  VS  COMPUTER", "2P  LOCAL"];
      for (let i = 0; i < opts.length; i++) {
        const y = 110 + i * 26;
        const sel = i === this.menuSel;

        if (sel) {
          ctx.fillStyle = "rgba(50,50,100,0.5)";
          ctx.fillRect(60, y - 10, W - 120, 20);

          if (Math.floor(this.frame / 15) % 2 === 0) {
            ctx.fillStyle = PAL.text;
            ctx.font = "10px monospace";
            ctx.textAlign = "left";
            ctx.fillText("\u25B6", 68, y + 4);
          }
        }

        ctx.fillStyle = sel ? PAL.text : PAL.mid;
        ctx.font = sel ? "bold 10px monospace" : "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(opts[i], W / 2, y + 4);
      }

      // instructions
      ctx.fillStyle = PAL.dim;
      ctx.font = "7px monospace";
      ctx.textAlign = "center";
      if (this.inp.mobile) {
        ctx.fillText("TAP TO SELECT", W / 2, 172);
      } else {
        ctx.fillText("ARROWS / ENTER TO SELECT", W / 2, 166);
        ctx.fillText("P1: ARROWS    P2: W A S D", W / 2, 178);
      }

      // decorative players
      ctx.globalAlpha = 0.3;
      const dp1 = new Player(55, 0, PAL.p1, PAL.p1d);
      dp1.y = GROUND_Y;
      dp1.draw(ctx);
      const dp2 = new Player(W - 55, 1, PAL.p2, PAL.p2d);
      dp2.y = GROUND_Y;
      dp2.draw(ctx);
      ctx.globalAlpha = 1;
    }

    dPointMsg(ctx) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(W / 2 - 55, H / 2 - 12, 110, 20);
      ctx.fillStyle = this.serveSide === 0 ? PAL.p1 : PAL.p2;
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      const who =
        this.serveSide === 0 ? "P1" : this.mode === 0 ? "CPU" : "P2";
      ctx.fillText(who + " SCORES!", W / 2, H / 2 + 2);
    }

    dServeMsg(ctx) {
      if (this.timer > 25 || Math.floor(this.frame / 8) % 2 === 0) {
        ctx.fillStyle = PAL.text;
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText("GET READY", W / 2, H / 2 - 10);
      }
    }

    dOverlay(ctx) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign = "center";
      ctx.fillStyle = PAL.text;
      ctx.font = "bold 18px monospace";
      ctx.fillText("GAME OVER", W / 2, H / 2 - 25);

      const w = this.score[0] >= WIN_SCORE ? 0 : 1;
      const wn = w === 0 ? "PLAYER 1" : this.mode === 0 ? "COMPUTER" : "PLAYER 2";
      ctx.fillStyle = w === 0 ? PAL.p1 : PAL.p2;
      ctx.font = "bold 12px monospace";
      ctx.fillText(wn + " WINS!", W / 2, H / 2);

      ctx.fillStyle = PAL.mid;
      ctx.font = "10px monospace";
      ctx.fillText(this.score[0] + " - " + this.score[1], W / 2, H / 2 + 18);

      if (Math.floor(this.frame / 20) % 2 === 0) {
        ctx.fillStyle = PAL.dim;
        ctx.font = "8px monospace";
        ctx.fillText("TAP OR PRESS ENTER", W / 2, H / 2 + 38);
      }
    }

    dTouch() {
      const c = this.dCtx;
      const dw = this.dCvs.width;
      const dh = this.dCvs.height;
      c.globalAlpha = 0.2;

      // divider
      c.strokeStyle = "#FFFFFF";
      c.lineWidth = 1;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(dw / 2, dh - 60);
      c.lineTo(dw / 2, dh);
      c.stroke();
      c.setLineDash([]);

      // joystick
      if (this.inp.joy) {
        c.strokeStyle = "#FFFFFF";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(this.inp.joy.bx, this.inp.joy.by, 36, 0, Math.PI * 2);
        c.stroke();

        c.fillStyle = "#FFFFFF";
        c.beginPath();
        c.arc(this.inp.joy.cx, this.inp.joy.cy, 14, 0, Math.PI * 2);
        c.fill();
      }

      // labels
      c.fillStyle = "#FFFFFF";
      c.font = "12px monospace";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("\u2190 MOVE \u2192", dw * 0.25, dh - 16);

      // jump button
      c.strokeStyle = "#FFFFFF";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(dw * 0.75, dh - 55, 28, 0, Math.PI * 2);
      c.stroke();
      c.font = "11px monospace";
      c.fillText("JUMP", dw * 0.75, dh - 55);
      c.fillText("\u2191", dw * 0.75, dh - 16);

      c.globalAlpha = 1;
      c.textBaseline = "alphabetic";
    }
  }

  // ============================================================
  // INIT
  // ============================================================
  window.addEventListener("DOMContentLoaded", () => {
    new Game();
  });
})();
