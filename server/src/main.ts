// AVball Nakama Server Module
// All code in a single file — required by Nakama JS runtime (outFile bundle)

// ============================================================
// PHYSICS CONSTANTS — must match client avball.js exactly
// ============================================================
const W = 320;
const H = 200;
const GROUND_Y = 176;
const NET_X = W / 2;
const NET_TOP = 101;
const NET_W = 3;
const BALL_R = 9;
const HEAD_R = 9;
const P_HEIGHT = 24;
const GRAVITY = 0.055;
const P_GRAVITY = 0.126;
const P_SPEED = 2.5;
const JUMP_VEL = -3.1;
const WIN_SCORE = 15;
const BOUNCE_DAMP = 0.85;
const BALL_AUTH_HYST = 10; // hysteresis zone (px) for authority handoff at net

// ============================================================
// TYPES
// ============================================================
interface PlayerInput {
  dx: number;
  jump: boolean;
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  side: number;
}

interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
}

interface MatchState {
  presences: { [userId: string]: nkruntime.Presence };
  playerSides: { [userId: string]: number };
  usernames: { [userId: string]: string };
  p1: PlayerState;
  p2: PlayerState;
  ball: BallState;
  score: [number, number];
  serveSide: number;
  gameState: number;
  timer: number;
  tickCount: number;
  inputs: { [userId: string]: PlayerInput };
  isAiMatch: boolean;
  aiTick: number;
  aiTargetX: number;
  pendingBallState: { senderId: string; x: number; y: number; vx: number; vy: number; rot: number } | null;
  ballAuthState: string; // tracks current ball authority for hysteresis: "p1", "p2", or "server"
}

interface EloResult {
  newWinner: number;
  newLoser: number;
  deltaWinner: number;
  deltaLoser: number;
}

// ============================================================
// PHYSICS FUNCTIONS
// ============================================================
function createPlayer(side: number): PlayerState {
  return {
    x: side === 0 ? W * 0.25 : W * 0.75,
    y: GROUND_Y,
    vx: 0, vy: 0,
    grounded: true,
    side: side,
  };
}

function resetPlayer(p: PlayerState): void {
  p.x = p.side === 0 ? W * 0.25 : W * 0.75;
  p.y = GROUND_Y;
  p.vx = 0; p.vy = 0;
  p.grounded = true;
}

function createBall(): BallState {
  return { x: 0, y: 0, vx: 0, vy: 0, rot: 0 };
}

function serveBall(ball: BallState, side: number): void {
  ball.x = side === 0 ? W * 0.25 : W * 0.75;
  ball.y = 30;
  ball.vx = 0; ball.vy = 0; ball.rot = 0;
}

function updatePlayer(p: PlayerState, inp: PlayerInput): void {
  p.vx = inp.dx * P_SPEED;
  p.x += p.vx;

  if (inp.jump && p.grounded) {
    p.vy = JUMP_VEL;
    p.grounded = false;
  }
  if (!p.grounded) {
    p.vy += P_GRAVITY;
    p.y += p.vy;
  }
  if (p.y >= GROUND_Y) {
    p.y = GROUND_Y;
    p.vy = 0;
    p.grounded = true;
  }

  var minX = p.side === 0 ? HEAD_R : NET_X + NET_W / 2 + HEAD_R;
  var maxX = p.side === 0 ? NET_X - NET_W / 2 - HEAD_R : W - HEAD_R;
  if (p.x < minX) p.x = minX;
  if (p.x > maxX) p.x = maxX;
}

function ballHitNet(ball: BallState): void {
  var nl = NET_X - NET_W / 2;
  var nr = NET_X + NET_W / 2;
  if (ball.y + BALL_R < NET_TOP) return;
  if (ball.y - BALL_R > GROUND_Y) return;
  if (ball.x + BALL_R <= nl || ball.x - BALL_R >= nr) return;

  if (ball.y + BALL_R >= NET_TOP && ball.y - BALL_R < NET_TOP + 4 && ball.vy > 0) {
    ball.y = NET_TOP - BALL_R;
    ball.vy = -Math.abs(ball.vy) * 0.7;
    return;
  }
  if (ball.x < NET_X) {
    ball.x = nl - BALL_R;
    ball.vx = -Math.abs(ball.vx) * BOUNCE_DAMP;
  } else {
    ball.x = nr + BALL_R;
    ball.vx = Math.abs(ball.vx) * BOUNCE_DAMP;
  }
}

function updateBall(ball: BallState): number {
  ball.vy += GRAVITY;
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.rot += ball.vx * 0.06;

  if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
  if (ball.x + BALL_R > W) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
  if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

  ballHitNet(ball);

  if (ball.y + BALL_R >= GROUND_Y) {
    return ball.x < NET_X ? 1 : 0;
  }
  return -1;
}

function ballHitPlayer(ball: BallState, p: PlayerState): boolean {
  var hx = p.x;
  var hy = p.y - P_HEIGHT;
  var dx = ball.x - hx;
  var dy = ball.y - hy;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var minD = BALL_R + HEAD_R;
  if (dist >= minD || dist === 0) return false;

  var nx = dx / dist;
  var ny = dy / dist;
  ball.x = hx + nx * (minD + 0.5);
  ball.y = hy + ny * (minD + 0.5);

  var dot = ball.vx * nx + ball.vy * ny;
  if (dot < 0) {
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;
  }

  ball.vx += p.vx * 0.5;
  ball.vy += p.vy * 0.7;

  if (ny < -0.2 && ball.vy > -0.75) {
    ball.vy = -1.5;
  }

  ball.vx *= 0.95;
  ball.vy *= 0.95;

  var spd = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (spd > 3.5) {
    ball.vx = (ball.vx / spd) * 3.5;
    ball.vy = (ball.vy / spd) * 3.5;
  }

  return true;
}

// ============================================================
// ELO
// ============================================================
var ELO_K = 32;
var DEFAULT_ELO = 1200;
var LEADERBOARD_ID = 'elo_ratings';

var ELO_MIN = 0;
var ELO_MAX = 5000;

function calculateElo(winnerElo: number, loserElo: number): EloResult {
  var expectedW = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  var expectedL = 1 - expectedW;
  var newWinner = Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(winnerElo + ELO_K * (1 - expectedW))));
  var newLoser = Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(loserElo + ELO_K * (0 - expectedL))));
  return {
    newWinner: newWinner,
    newLoser: newLoser,
    deltaWinner: newWinner - winnerElo,
    deltaLoser: newLoser - loserElo,
  };
}

function getElo(nk: nkruntime.Nakama, userId: string): number {
  var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [userId], 1);
  if (records.records && records.records.length > 0) {
    return records.records[0].score;
  }
  return DEFAULT_ELO;
}

function setElo(nk: nkruntime.Nakama, userId: string, username: string, elo: number): void {
  nk.leaderboardRecordWrite(LEADERBOARD_ID, userId, username, elo, 0);
}

function updateEloAfterMatch(
  nk: nkruntime.Nakama,
  winnerId: string, winnerName: string,
  loserId: string, loserName: string
): EloResult | null {
  if (!winnerId || !loserId) return null;
  var winnerElo = getElo(nk, winnerId);
  var loserElo = getElo(nk, loserId);
  var result = calculateElo(winnerElo, loserElo);
  setElo(nk, winnerId, winnerName, result.newWinner);
  setElo(nk, loserId, loserName, result.newLoser);
  return result;
}

// ============================================================
// AI (port from avball.js AI class)
// ============================================================
var AI_USERNAME = 'CPU';
var AI_USER_ID = ''; // set at init time

function aiUpdate(state: MatchState, me: PlayerState, ball: BallState): PlayerInput {
  var inp: PlayerInput = { dx: 0, jump: false };
  state.aiTick++;
  if (state.aiTick % 2 !== 0) return inp;

  var onMySide = ball.x > NET_X;
  var coming = ball.vx > 0;

  if (onMySide || coming) {
    var px = ball.x, py = ball.y, pvx = ball.vx, pvy = ball.vy;
    for (var i = 0; i < 40; i++) {
      pvy += GRAVITY;
      px += pvx;
      py += pvy;
      if (px < NET_X + 10) pvx = Math.abs(pvx);
      if (px > W - 5) pvx = -Math.abs(pvx);
      if (py >= GROUND_Y - P_HEIGHT) break;
    }
    state.aiTargetX = Math.max(NET_X + HEAD_R + 5, Math.min(W - HEAD_R, px));
  } else {
    state.aiTargetX = W * 0.72;
  }

  var diff = state.aiTargetX - me.x;
  if (Math.abs(diff) > 4) inp.dx = diff > 0 ? 1 : -1;

  var hy = me.y - P_HEIGHT;
  var bdy = ball.y - hy;
  var bdx = Math.abs(ball.x - me.x);
  if (onMySide && bdx < 35 && bdy < 5 && ball.y < hy + 15) {
    inp.jump = true;
  }
  if (onMySide && bdx < 20 && ball.vy > 2 && ball.y < hy - 10 && ball.y > NET_TOP - 20) {
    inp.jump = true;
  }

  return inp;
}

// ============================================================
// OP CODES
// ============================================================
var OP_INPUT = 1;
var OP_STATE = 2;
var OP_SCORE = 3;
var OP_GAME_OVER = 4;
var OP_SIDE_ASSIGN = 5;
var OP_BALL_STATE = 6;

// Game states
var ST_WAITING = 0;
var ST_SERVE = 1;
var ST_PLAY = 2;
var ST_SCORED = 3;
var ST_OVER = 4;

var BROADCAST_INTERVAL = 2; // 30Hz at 60 tick rate
var SERVE_TIMER = 50;
var SCORED_TIMER = 55;

// ============================================================
// RPC FUNCTIONS
// ============================================================
function rpcGetLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 10);
  var result = (records.records || []).map(function(r) {
    return {
      username: r.username,
      elo: r.score,
      rank: r.rank,
    };
  });
  return JSON.stringify(result);
}

function rpcGetPlayerElo(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var userId = ctx.userId;
  if (!userId) {
    return JSON.stringify({ elo: DEFAULT_ELO, rank: null });
  }
  var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [userId], 1);
  if (records.records && records.records.length > 0) {
    return JSON.stringify({
      elo: records.records[0].score,
      rank: records.records[0].rank,
    });
  }
  return JSON.stringify({ elo: DEFAULT_ELO, rank: null });
}

var MATCH_CREATE_COOLDOWN_SEC = 5;

function rpcCreateAiMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var userId = ctx.userId;
  if (!userId) throw Error('authentication required');

  // Rate limit via Nakama storage
  var now = Math.floor(Date.now() / 1000);
  var stored = nk.storageRead([{ collection: 'rate_limit', key: 'ai_match', userId: userId }]);
  if (stored.length > 0 && stored[0].value && stored[0].value['ts']) {
    var lastTs = stored[0].value['ts'] as number;
    if (now - lastTs < MATCH_CREATE_COOLDOWN_SEC) {
      throw Error('rate limited: wait ' + (MATCH_CREATE_COOLDOWN_SEC - (now - lastTs)) + 's');
    }
  }
  nk.storageWrite([{
    collection: 'rate_limit', key: 'ai_match', userId: userId,
    value: { ts: now }, permissionRead: 0, permissionWrite: 0,
  }]);

  var matchId = nk.matchCreate('avball', { ai: 'true' });
  return JSON.stringify({ matchId: matchId });
}

// ============================================================
// MATCH HANDLER
// ============================================================
var matchInit: nkruntime.MatchInitFunction = function (ctx, logger, nk, params) {
  var isAiMatch = params && params['ai'] === 'true';
  var state: MatchState = {
    presences: {},
    playerSides: {},
    usernames: {},
    p1: createPlayer(0),
    p2: createPlayer(1),
    ball: createBall(),
    score: [0, 0] as [number, number],
    serveSide: 0,
    gameState: ST_WAITING,
    timer: 0,
    tickCount: 0,
    inputs: {},
    isAiMatch: !!isAiMatch,
    aiTick: 0,
    aiTargetX: W * 0.75,
    pendingBallState: null,
    ballAuthState: 'server',
  };
  return {
    state: state,
    tickRate: 60,
    label: JSON.stringify({ open: true, ai: !!isAiMatch }),
  };
};

var matchJoinAttempt: nkruntime.MatchJoinAttemptFunction = function (
  ctx, logger, nk, dispatcher, tick, state, presence, metadata
) {
  var s = state as MatchState;
  var count = Object.keys(s.presences).length;
  var maxPlayers = s.isAiMatch ? 1 : 2;
  if (count >= maxPlayers) {
    return { state: s, accept: false, rejectMessage: 'Match is full' };
  }
  return { state: s, accept: true };
};

var matchJoin: nkruntime.MatchJoinFunction = function (
  ctx, logger, nk, dispatcher, tick, state, presences
) {
  var s = state as MatchState;

  for (var i = 0; i < presences.length; i++) {
    var p = presences[i];
    s.presences[p.userId] = p;

    // Assign side
    var takenSides = Object.keys(s.playerSides).map(function(k) { return s.playerSides[k]; });
    var side = takenSides.indexOf(0) >= 0 ? 1 : 0;
    s.playerSides[p.userId] = side;

    // Get username
    var account = nk.accountGetId(p.userId);
    s.usernames[p.userId] = account.user.username || 'Player';

    // Initialize ELO for new players
    var elo = getElo(nk, p.userId);
    if (elo === DEFAULT_ELO) {
      setElo(nk, p.userId, s.usernames[p.userId], DEFAULT_ELO);
    }

    logger.info('Player joined: %s (side %d)', s.usernames[p.userId], side);
  }

  var playerCount = Object.keys(s.presences).length;
  var needed = s.isAiMatch ? 1 : 2;

  if (playerCount >= needed) {
    // For AI match, assign AI to side 1
    if (s.isAiMatch) {
      s.playerSides[AI_USER_ID] = 1;
      s.usernames[AI_USER_ID] = AI_USERNAME;
    }

    // Notify players of side assignments
    var allPresences = Object.keys(s.presences).map(function(k) { return s.presences[k]; });
    for (var j = 0; j < allPresences.length; j++) {
      var pr = allPresences[j];
      var mySide = s.playerSides[pr.userId];
      var opponentName = AI_USERNAME;
      var keys = Object.keys(s.playerSides);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k] !== pr.userId && s.playerSides[keys[k]] !== mySide) {
          opponentName = s.usernames[keys[k]] || AI_USERNAME;
          break;
        }
      }
      dispatcher.broadcastMessage(OP_SIDE_ASSIGN, JSON.stringify({
        side: mySide,
        opponent: opponentName,
      }), [pr]);
    }

    // Start game
    s.gameState = ST_SERVE;
    s.timer = SERVE_TIMER;
    s.serveSide = 0;
    resetPlayer(s.p1);
    resetPlayer(s.p2);
    dispatcher.matchLabelUpdate(JSON.stringify({ open: false, ai: s.isAiMatch }));
  }

  return { state: s };
};

var matchLeave: nkruntime.MatchLeaveFunction = function (
  ctx, logger, nk, dispatcher, tick, state, presences
) {
  var s = state as MatchState;

  for (var i = 0; i < presences.length; i++) {
    var leftId = presences[i].userId;
    delete s.presences[leftId];
    logger.info('Player left: %s', leftId);
  }

  var remaining = Object.keys(s.presences);
  if (remaining.length === 0) {
    return null;
  }

  // Forfeit: remaining player wins
  if (s.gameState >= ST_SERVE && s.gameState <= ST_SCORED) {
    var winnerId = remaining[0];
    var loserId = presences[0].userId;

    // Don't award ELO on forfeit for AI matches (prevents farming)
    // For PvP forfeits, require at least 3 total points scored
    var totalScore = s.score[0] + s.score[1];
    var awardElo = !s.isAiMatch && totalScore >= 3 && winnerId && loserId;

    var remainingPresences = remaining.map(function(k) { return s.presences[k]; });

    if (awardElo && s.usernames[loserId] && s.usernames[winnerId]) {
      var eloResult = updateEloAfterMatch(
        nk,
        winnerId, s.usernames[winnerId],
        loserId, s.usernames[loserId]
      );

      dispatcher.broadcastMessage(OP_GAME_OVER, JSON.stringify({
        winner: s.playerSides[winnerId],
        score: s.score,
        forfeit: true,
        elo: eloResult ? { delta: eloResult.deltaWinner, newElo: eloResult.newWinner } : null,
      }), remainingPresences);
    } else {
      dispatcher.broadcastMessage(OP_GAME_OVER, JSON.stringify({
        winner: s.playerSides[winnerId],
        score: s.score,
        forfeit: true,
        elo: null,
      }), remainingPresences);
    }

    return null;
  }

  return { state: s };
};

var matchLoop: nkruntime.MatchLoopFunction = function (
  ctx, logger, nk, dispatcher, tick, state, messages
) {
  var s = state as MatchState;
  s.tickCount++;

  if (s.gameState === ST_WAITING) return { state: s };

  // Process input messages
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    // Fix #5: only accept messages from match participants
    if (!(msg.sender.userId in s.playerSides)) {
      logger.warn('Input from non-participant: %s', msg.sender.userId);
      continue;
    }
    if (msg.opCode === OP_INPUT) {
      try {
        var data = JSON.parse(nk.binaryToString(msg.data));
        var dx = Math.max(-1, Math.min(1, Math.round(data.dx || 0)));
        var jump = !!data.jump;
        s.inputs[msg.sender.userId] = { dx: dx, jump: jump };
      } catch (e) {
        logger.warn('Malformed input from %s', msg.sender.userId);
      }
    } else if (msg.opCode === OP_BALL_STATE) {
      try {
        var bdata = JSON.parse(nk.binaryToString(msg.data));
        // Store for later processing (validated in physics step)
        s.pendingBallState = {
          senderId: msg.sender.userId,
          x: +bdata.x, y: +bdata.y,
          vx: +bdata.vx, vy: +bdata.vy,
          rot: +bdata.rot,
        };
      } catch (e) {
        logger.warn('Malformed ball state from %s', msg.sender.userId);
      }
    }
  }

  // Get inputs
  var p1UserId = '';
  var p2UserId = '';
  var sideKeys = Object.keys(s.playerSides);
  for (var si = 0; si < sideKeys.length; si++) {
    if (s.playerSides[sideKeys[si]] === 0) p1UserId = sideKeys[si];
    if (s.playerSides[sideKeys[si]] === 1) p2UserId = sideKeys[si];
  }

  var p1Input: PlayerInput = s.inputs[p1UserId] || { dx: 0, jump: false };
  var p2Input: PlayerInput;

  if (s.isAiMatch && p2UserId === AI_USER_ID) {
    p2Input = aiUpdate(s, s.p2, s.ball);
  } else {
    p2Input = s.inputs[p2UserId] || { dx: 0, jump: false };
  }

  // Determine ball authority with hysteresis to prevent flip-flopping at net.
  // "p1" = P1's client, "p2" = P2's client, "server" = server runs physics.
  // Hysteresis: authority only switches when ball is BALL_AUTH_HYST pixels past the net.
  var p1IsHuman = p1UserId !== AI_USER_ID && p1UserId !== '';
  var p2IsHuman = p2UserId !== AI_USER_ID && p2UserId !== '';
  var ballAuth = 'server';
  if (s.gameState === ST_SERVE) {
    // During serve, serving player's client is authoritative (if human)
    var serveUserId = s.serveSide === 0 ? p1UserId : p2UserId;
    if (serveUserId !== AI_USER_ID && serveUserId !== '') ballAuth = s.serveSide === 0 ? 'p1' : 'p2';
  } else if (s.gameState === ST_PLAY) {
    // Hysteresis: keep current authority unless ball clearly crossed to other side
    if (s.ballAuthState === 'p1') {
      if (s.ball.x >= NET_X + BALL_AUTH_HYST) {
        ballAuth = p2IsHuman ? 'p2' : 'server';
      } else {
        ballAuth = 'p1'; // stay — ball still in hysteresis zone or on P1's side
      }
    } else if (s.ballAuthState === 'p2') {
      if (s.ball.x < NET_X - BALL_AUTH_HYST) {
        ballAuth = p1IsHuman ? 'p1' : 'server';
      } else {
        ballAuth = 'p2'; // stay
      }
    } else {
      // Server was authoritative (initial or AI transition) — use normal threshold
      if (s.ball.x < NET_X) {
        ballAuth = p1IsHuman ? 'p1' : 'server';
      } else {
        ballAuth = p2IsHuman ? 'p2' : 'server';
      }
    }
  }
  s.ballAuthState = ballAuth;

  // Apply pending ball state from authoritative client.
  // Accept from current auth, or from a client whose side the ball is on
  // (predictive clients may send slightly before server switches authority).
  var clientBallApplied = false;
  if (s.pendingBallState && ballAuth !== 'server') {
    var expectedSender = ballAuth === 'p1' ? p1UserId : p2UserId;
    if (s.pendingBallState.senderId === expectedSender) {
      s.ball.x = s.pendingBallState.x;
      s.ball.y = s.pendingBallState.y;
      s.ball.vx = s.pendingBallState.vx;
      s.ball.vy = s.pendingBallState.vy;
      s.ball.rot = s.pendingBallState.rot;
      clientBallApplied = true;
    }
  } else if (s.pendingBallState && ballAuth === 'server') {
    // Server is auth (AI side), but a human client sent ball state — they may
    // be predicting authority before hysteresis threshold. Accept if ball is
    // within the hysteresis zone on the sender's side.
    var senderSide = s.playerSides[s.pendingBallState.senderId];
    if (senderSide === 0 && s.ball.x < NET_X + BALL_AUTH_HYST && p1IsHuman) {
      s.ball.x = s.pendingBallState.x;
      s.ball.y = s.pendingBallState.y;
      s.ball.vx = s.pendingBallState.vx;
      s.ball.vy = s.pendingBallState.vy;
      s.ball.rot = s.pendingBallState.rot;
      clientBallApplied = true;
      ballAuth = 'p1';
      s.ballAuthState = ballAuth;
    } else if (senderSide === 1 && s.ball.x >= NET_X - BALL_AUTH_HYST && p2IsHuman) {
      s.ball.x = s.pendingBallState.x;
      s.ball.y = s.pendingBallState.y;
      s.ball.vx = s.pendingBallState.vx;
      s.ball.vy = s.pendingBallState.vy;
      s.ball.rot = s.pendingBallState.rot;
      clientBallApplied = true;
      ballAuth = 'p2';
      s.ballAuthState = ballAuth;
    }
  }
  s.pendingBallState = null;

  // State machine
  if (s.gameState === ST_SERVE) {
    updatePlayer(s.p1, p1Input);
    updatePlayer(s.p2, p2Input);
    s.timer--;
    if (s.timer <= 0) {
      // Only server sets the serve ball position if server is authoritative
      if (ballAuth === 'server') {
        serveBall(s.ball, s.serveSide);
      }
      s.gameState = ST_PLAY;
      s.ballAuthState = 'server'; // reset for fresh authority determination
    }
  } else if (s.gameState === ST_PLAY) {
    updatePlayer(s.p1, p1Input);
    updatePlayer(s.p2, p2Input);

    // Ball physics: run on server when server is authoritative, OR as a bridge
    // when the authoritative client didn't send a ball state this tick (covers
    // the gap between client dropping authority and server threshold crossing).
    var scorer = -1;
    if (ballAuth === 'server' || !clientBallApplied) {
      scorer = updateBall(s.ball);
      ballHitPlayer(s.ball, s.p1);
      ballHitPlayer(s.ball, s.p2);
    } else {
      // Client sent authoritative ball state — just check for scoring
      if (s.ball.y + BALL_R >= GROUND_Y) {
        scorer = s.ball.x < NET_X ? 1 : 0;
      }
    }

    if (scorer >= 0) {
      s.score[scorer]++;
      s.serveSide = scorer;
      s.gameState = ST_SCORED;
      s.timer = SCORED_TIMER;

      var allP = Object.keys(s.presences).map(function(k) { return s.presences[k]; });
      dispatcher.broadcastMessage(OP_SCORE, JSON.stringify({
        scorer: scorer,
        score: s.score,
      }), allP);
    }
  } else if (s.gameState === ST_SCORED) {
    s.timer--;
    if (s.timer <= 0) {
      if (s.score[0] >= WIN_SCORE || s.score[1] >= WIN_SCORE) {
        s.gameState = ST_OVER;

        var winSide = s.score[0] >= WIN_SCORE ? 0 : 1;
        var winUid = '';
        var loseUid = '';
        var sk = Object.keys(s.playerSides);
        for (var wi = 0; wi < sk.length; wi++) {
          if (s.playerSides[sk[wi]] === winSide) winUid = sk[wi];
          else loseUid = sk[wi];
        }

        var eloRes = updateEloAfterMatch(
          nk,
          winUid, s.usernames[winUid] || 'Player',
          loseUid, s.usernames[loseUid] || 'Player'
        );

        // Send personalized game-over to each player
        var ap = Object.keys(s.presences).map(function(k) { return s.presences[k]; });
        for (var pi = 0; pi < ap.length; pi++) {
          var pSide = s.playerSides[ap[pi].userId];
          var isWin = pSide === winSide;
          var eloPayload = eloRes ? {
            delta: isWin ? eloRes.deltaWinner : eloRes.deltaLoser,
            newElo: isWin ? eloRes.newWinner : eloRes.newLoser,
          } : null;
          dispatcher.broadcastMessage(OP_GAME_OVER, JSON.stringify({
            winner: winSide,
            score: s.score,
            forfeit: false,
            elo: eloPayload,
          }), [ap[pi]]);
        }
      } else {
        s.gameState = ST_SERVE;
        s.timer = SERVE_TIMER;
        resetPlayer(s.p1);
        resetPlayer(s.p2);
      }
    }
  } else if (s.gameState === ST_OVER) {
    return null; // end match
  }

  // Recompute ballAuth after state machine — ensures broadcasts after state
  // transitions (SCORED→SERVE, SERVE→PLAY) have the correct authority value.
  if (s.gameState === ST_SERVE) {
    var serveUserId2 = s.serveSide === 0 ? p1UserId : p2UserId;
    if (serveUserId2 !== AI_USER_ID && serveUserId2 !== '') {
      ballAuth = s.serveSide === 0 ? 'p1' : 'p2';
    } else {
      ballAuth = 'server';
    }
    s.ballAuthState = ballAuth;
  } else if (s.gameState === ST_SCORED || s.gameState === ST_OVER) {
    ballAuth = 'server';
    s.ballAuthState = 'server';
  }

  // Broadcast state at 20Hz
  if (s.tickCount % BROADCAST_INTERVAL === 0) {
    var snapshot = JSON.stringify({
      state: s.gameState,
      timer: s.timer,
      score: s.score,
      serveSide: s.serveSide,
      p1: { x: s.p1.x, y: s.p1.y, vy: s.p1.vy, grounded: s.p1.grounded },
      p2: { x: s.p2.x, y: s.p2.y, vy: s.p2.vy, grounded: s.p2.grounded },
      ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy, rot: s.ball.rot },
      inp1: p1Input,
      inp2: p2Input,
      ballAuth: ballAuth,
    });
    var broadcastTargets = Object.keys(s.presences).map(function(k) { return s.presences[k]; });
    dispatcher.broadcastMessage(OP_STATE, snapshot, broadcastTargets);
  }

  return { state: s };
};

var matchTerminate: nkruntime.MatchTerminateFunction = function (
  ctx, logger, nk, dispatcher, tick, state, graceSeconds
) {
  return { state: state };
};

var matchSignal: nkruntime.MatchSignalFunction = function (
  ctx, logger, nk, dispatcher, tick, state, data
) {
  return { state: state, data: '' };
};

// ============================================================
// MATCHMAKER MATCHED HOOK
// ============================================================
var matchmakerMatched: nkruntime.MatchmakerMatchedFunction = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  matches: nkruntime.MatchmakerResult[]
): string {
  var matchId = nk.matchCreate('avball', { ai: 'false' });
  return matchId;
};

// ============================================================
// ARKANOID SCORE LEADERBOARD
// ============================================================
var ARKANOID_LB_ID = 'arkanoid_scores';
var ARKANOID_SUBMIT_COOLDOWN = 20; // seconds between submissions

function rpcArkanoidSubmitScore(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var userId = ctx.userId;
  if (!userId) throw Error('authentication required');

  var data: any;
  try { data = JSON.parse(payload); } catch (e) { throw Error('invalid payload'); }
  var score = Math.floor(Number(data.score) || 0);
  if (score <= 0 || score > 1000000) throw Error('invalid score');

  // Rate limit
  var now = Math.floor(Date.now() / 1000);
  var stored = nk.storageRead([{ collection: 'rate_limit', key: 'arkanoid_submit', userId: userId }]);
  if (stored.length > 0 && stored[0].value && stored[0].value['ts']) {
    var lastTs = stored[0].value['ts'] as number;
    if (now - lastTs < ARKANOID_SUBMIT_COOLDOWN) {
      return JSON.stringify({ ok: false, reason: 'rate_limited' });
    }
  }
  nk.storageWrite([{
    collection: 'rate_limit', key: 'arkanoid_submit', userId: userId,
    value: { ts: now }, permissionRead: 0, permissionWrite: 0,
  }]);

  var account = nk.accountGetId(userId);
  var username = account.user.username || 'Player';
  nk.leaderboardRecordWrite(ARKANOID_LB_ID, userId, username, score, 0);

  var records = nk.leaderboardRecordsList(ARKANOID_LB_ID, [userId], 1);
  var rank = (records.records && records.records.length > 0) ? records.records[0].rank : null;
  return JSON.stringify({ ok: true, rank: rank });
}

function rpcArkanoidGetLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var records = nk.leaderboardRecordsList(ARKANOID_LB_ID, [], 10);
  var result = (records.records || []).map(function(r) {
    return { username: r.username, score: r.score, rank: r.rank };
  });
  return JSON.stringify(result);
}

// ============================================================
// MODULE INIT
// ============================================================
var InitModule: nkruntime.InitModule = function (ctx, logger, nk, initializer) {
  // Register match handler
  initializer.registerMatch('avball', {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchTerminate: matchTerminate,
    matchSignal: matchSignal,
  });

  // Register RPCs
  initializer.registerRpc('get_leaderboard', rpcGetLeaderboard);
  initializer.registerRpc('get_player_elo', rpcGetPlayerElo);
  initializer.registerRpc('create_ai_match', rpcCreateAiMatch);
  initializer.registerRpc('arkanoid_submit_score', rpcArkanoidSubmitScore);
  initializer.registerRpc('arkanoid_get_leaderboard', rpcArkanoidGetLeaderboard);

  // Create ELO leaderboard
  try {
    nk.leaderboardCreate(
      LEADERBOARD_ID,
      false,
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.SET,
      '',
      {}
    );
    logger.info('Leaderboard created: %s', LEADERBOARD_ID);
  } catch (e) {
    logger.debug('Leaderboard already exists');
  }

  // Create Arkanoid score leaderboard
  try {
    nk.leaderboardCreate(
      ARKANOID_LB_ID,
      false,
      nkruntime.SortOrder.DESCENDING,
      nkruntime.Operator.BEST,
      '',
      {}
    );
    logger.info('Leaderboard created: %s', ARKANOID_LB_ID);
  } catch (e) {
    logger.debug('Arkanoid leaderboard already exists');
  }

  // Ensure CPU bot user exists
  // Look up by username first, then create with non-guessable device ID if needed
  try {
    var cpuUsers = nk.usersGetUsername([AI_USERNAME]);
    if (cpuUsers.length > 0) {
      AI_USER_ID = cpuUsers[0].userId;
      // Unlink the old guessable device ID and link a new one
      try { nk.unlinkDevice(AI_USER_ID, 'avball-cpu-bot-device'); } catch (e) {}
      var SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
      var stored = nk.storageRead([{ collection: 'system', key: 'cpu_bot', userId: SYSTEM_USER_ID }]);
      if (stored.length === 0 || !stored[0].value || !stored[0].value['deviceId']) {
        var newDeviceId = 'cpu-' + nk.uuidv4();
        nk.storageWrite([{
          collection: 'system', key: 'cpu_bot', userId: SYSTEM_USER_ID,
          value: { deviceId: newDeviceId }, permissionRead: 0, permissionWrite: 0,
        }]);
        try { nk.linkDevice(AI_USER_ID, newDeviceId); } catch (e) {}
      }
    } else {
      var cpuDeviceId = 'cpu-' + nk.uuidv4();
      var SYSTEM_USER_ID2 = '00000000-0000-0000-0000-000000000000';
      nk.storageWrite([{
        collection: 'system', key: 'cpu_bot', userId: SYSTEM_USER_ID2,
        value: { deviceId: cpuDeviceId }, permissionRead: 0, permissionWrite: 0,
      }]);
      var aiUsers = nk.authenticateDevice(cpuDeviceId, AI_USERNAME, true);
      AI_USER_ID = aiUsers.userId;
    }
    setElo(nk, AI_USER_ID, AI_USERNAME, DEFAULT_ELO);
    logger.info('CPU bot ready: %s', AI_USER_ID);
  } catch (e) {
    logger.warn('Could not create CPU bot: %s', e);
  }

  // Matchmaker hook: create authoritative match when 2 players matched
  initializer.registerMatchmakerMatched(matchmakerMatched);

  logger.info('AVball module loaded successfully');
};
