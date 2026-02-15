"use strict";
// AVball Nakama Server Module
// All code in a single file — required by Nakama JS runtime (outFile bundle)
// ============================================================
// PHYSICS CONSTANTS — must match client avball.js exactly
// ============================================================
var W = 320;
var H = 200;
var GROUND_Y = 176;
var NET_X = W / 2;
var NET_TOP = 101;
var NET_W = 3;
var BALL_R = 9;
var HEAD_R = 9;
var P_HEIGHT = 24;
var GRAVITY = 0.055;
var P_GRAVITY = 0.126;
var P_SPEED = 2.5;
var JUMP_VEL = -3.1;
var WIN_SCORE = 15;
var BOUNCE_DAMP = 0.85;
// ============================================================
// PHYSICS FUNCTIONS
// ============================================================
function createPlayer(side) {
    return {
        x: side === 0 ? W * 0.25 : W * 0.75,
        y: GROUND_Y,
        vx: 0, vy: 0,
        grounded: true,
        side: side,
    };
}
function resetPlayer(p) {
    p.x = p.side === 0 ? W * 0.25 : W * 0.75;
    p.y = GROUND_Y;
    p.vx = 0;
    p.vy = 0;
    p.grounded = true;
}
function createBall() {
    return { x: 0, y: 0, vx: 0, vy: 0, rot: 0 };
}
function serveBall(ball, side) {
    ball.x = side === 0 ? W * 0.25 : W * 0.75;
    ball.y = 30;
    ball.vx = 0;
    ball.vy = 0;
    ball.rot = 0;
}
function updatePlayer(p, inp) {
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
    if (p.x < minX)
        p.x = minX;
    if (p.x > maxX)
        p.x = maxX;
}
function ballHitNet(ball) {
    var nl = NET_X - NET_W / 2;
    var nr = NET_X + NET_W / 2;
    if (ball.y + BALL_R < NET_TOP)
        return;
    if (ball.y - BALL_R > GROUND_Y)
        return;
    if (ball.x + BALL_R <= nl || ball.x - BALL_R >= nr)
        return;
    if (ball.y + BALL_R >= NET_TOP && ball.y - BALL_R < NET_TOP + 4 && ball.vy > 0) {
        ball.y = NET_TOP - BALL_R;
        ball.vy = -Math.abs(ball.vy) * 0.7;
        return;
    }
    if (ball.x < NET_X) {
        ball.x = nl - BALL_R;
        ball.vx = -Math.abs(ball.vx) * BOUNCE_DAMP;
    }
    else {
        ball.x = nr + BALL_R;
        ball.vx = Math.abs(ball.vx) * BOUNCE_DAMP;
    }
}
function updateBall(ball) {
    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.rot += ball.vx * 0.06;
    if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx);
    }
    if (ball.x + BALL_R > W) {
        ball.x = W - BALL_R;
        ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y - BALL_R < 0) {
        ball.y = BALL_R;
        ball.vy = Math.abs(ball.vy);
    }
    ballHitNet(ball);
    if (ball.y + BALL_R >= GROUND_Y) {
        return ball.x < NET_X ? 1 : 0;
    }
    return -1;
}
function ballHitPlayer(ball, p) {
    var hx = p.x;
    var hy = p.y - P_HEIGHT;
    var dx = ball.x - hx;
    var dy = ball.y - hy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minD = BALL_R + HEAD_R;
    if (dist >= minD || dist === 0)
        return false;
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
function calculateElo(winnerElo, loserElo) {
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
function getElo(nk, userId) {
    var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [userId], 1);
    if (records.records && records.records.length > 0) {
        return records.records[0].score;
    }
    return DEFAULT_ELO;
}
function setElo(nk, userId, username, elo) {
    nk.leaderboardRecordWrite(LEADERBOARD_ID, userId, username, elo, 0);
}
function updateEloAfterMatch(nk, winnerId, winnerName, loserId, loserName) {
    if (!winnerId || !loserId)
        return null;
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
function aiUpdate(state, me, ball) {
    var inp = { dx: 0, jump: false };
    state.aiTick++;
    if (state.aiTick % 2 !== 0)
        return inp;
    var onMySide = ball.x > NET_X;
    var coming = ball.vx > 0;
    if (onMySide || coming) {
        var px = ball.x, py = ball.y, pvx = ball.vx, pvy = ball.vy;
        for (var i = 0; i < 40; i++) {
            pvy += GRAVITY;
            px += pvx;
            py += pvy;
            if (px < NET_X + 10)
                pvx = Math.abs(pvx);
            if (px > W - 5)
                pvx = -Math.abs(pvx);
            if (py >= GROUND_Y - P_HEIGHT)
                break;
        }
        state.aiTargetX = Math.max(NET_X + HEAD_R + 5, Math.min(W - HEAD_R, px));
    }
    else {
        state.aiTargetX = W * 0.72;
    }
    var diff = state.aiTargetX - me.x;
    if (Math.abs(diff) > 4)
        inp.dx = diff > 0 ? 1 : -1;
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
// Game states
var ST_WAITING = 0;
var ST_SERVE = 1;
var ST_PLAY = 2;
var ST_SCORED = 3;
var ST_OVER = 4;
var BROADCAST_INTERVAL = 3; // 20Hz at 60 tick rate
var SERVE_TIMER = 50;
var SCORED_TIMER = 55;
// ============================================================
// RPC FUNCTIONS
// ============================================================
function rpcGetLeaderboard(ctx, logger, nk, payload) {
    var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 10);
    var result = (records.records || []).map(function (r) {
        return {
            username: r.username,
            elo: r.score,
            rank: r.rank,
        };
    });
    return JSON.stringify(result);
}
function rpcGetPlayerElo(ctx, logger, nk, payload) {
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
function rpcCreateAiMatch(ctx, logger, nk, payload) {
    var userId = ctx.userId;
    if (!userId)
        throw Error('authentication required');
    // Rate limit via Nakama storage
    var now = Math.floor(Date.now() / 1000);
    var stored = nk.storageRead([{ collection: 'rate_limit', key: 'ai_match', userId: userId }]);
    if (stored.length > 0 && stored[0].value && stored[0].value['ts']) {
        var lastTs = stored[0].value['ts'];
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
var matchInit = function (ctx, logger, nk, params) {
    var isAiMatch = params && params['ai'] === 'true';
    var state = {
        presences: {},
        playerSides: {},
        usernames: {},
        p1: createPlayer(0),
        p2: createPlayer(1),
        ball: createBall(),
        score: [0, 0],
        serveSide: 0,
        gameState: ST_WAITING,
        timer: 0,
        tickCount: 0,
        inputs: {},
        isAiMatch: !!isAiMatch,
        aiTick: 0,
        aiTargetX: W * 0.75,
    };
    return {
        state: state,
        tickRate: 60,
        label: JSON.stringify({ open: true, ai: !!isAiMatch }),
    };
};
var matchJoinAttempt = function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    var s = state;
    var count = Object.keys(s.presences).length;
    var maxPlayers = s.isAiMatch ? 1 : 2;
    if (count >= maxPlayers) {
        return { state: s, accept: false, rejectMessage: 'Match is full' };
    }
    return { state: s, accept: true };
};
var matchJoin = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    var s = state;
    for (var i = 0; i < presences.length; i++) {
        var p = presences[i];
        s.presences[p.userId] = p;
        // Assign side
        var takenSides = Object.keys(s.playerSides).map(function (k) { return s.playerSides[k]; });
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
        var allPresences = Object.keys(s.presences).map(function (k) { return s.presences[k]; });
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
var matchLeave = function (ctx, logger, nk, dispatcher, tick, state, presences) {
    var s = state;
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
        var remainingPresences = remaining.map(function (k) { return s.presences[k]; });
        if (awardElo && s.usernames[loserId] && s.usernames[winnerId]) {
            var eloResult = updateEloAfterMatch(nk, winnerId, s.usernames[winnerId], loserId, s.usernames[loserId]);
            dispatcher.broadcastMessage(OP_GAME_OVER, JSON.stringify({
                winner: s.playerSides[winnerId],
                score: s.score,
                forfeit: true,
                elo: eloResult ? { delta: eloResult.deltaWinner, newElo: eloResult.newWinner } : null,
            }), remainingPresences);
        }
        else {
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
var matchLoop = function (ctx, logger, nk, dispatcher, tick, state, messages) {
    var s = state;
    s.tickCount++;
    if (s.gameState === ST_WAITING)
        return { state: s };
    // Process input messages
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (msg.opCode === OP_INPUT) {
            // Fix #5: only accept input from match participants
            if (!(msg.sender.userId in s.playerSides)) {
                logger.warn('Input from non-participant: %s', msg.sender.userId);
                continue;
            }
            try {
                var data = JSON.parse(nk.binaryToString(msg.data));
                var dx = Math.max(-1, Math.min(1, Math.round(data.dx || 0)));
                var jump = !!data.jump;
                s.inputs[msg.sender.userId] = { dx: dx, jump: jump };
            }
            catch (e) {
                logger.warn('Malformed input from %s', msg.sender.userId);
            }
        }
    }
    // Get inputs
    var p1UserId = '';
    var p2UserId = '';
    var sideKeys = Object.keys(s.playerSides);
    for (var si = 0; si < sideKeys.length; si++) {
        if (s.playerSides[sideKeys[si]] === 0)
            p1UserId = sideKeys[si];
        if (s.playerSides[sideKeys[si]] === 1)
            p2UserId = sideKeys[si];
    }
    var p1Input = s.inputs[p1UserId] || { dx: 0, jump: false };
    var p2Input;
    if (s.isAiMatch && p2UserId === AI_USER_ID) {
        p2Input = aiUpdate(s, s.p2, s.ball);
    }
    else {
        p2Input = s.inputs[p2UserId] || { dx: 0, jump: false };
    }
    // State machine
    if (s.gameState === ST_SERVE) {
        updatePlayer(s.p1, p1Input);
        updatePlayer(s.p2, p2Input);
        s.timer--;
        if (s.timer <= 0) {
            serveBall(s.ball, s.serveSide);
            s.gameState = ST_PLAY;
        }
    }
    else if (s.gameState === ST_PLAY) {
        updatePlayer(s.p1, p1Input);
        updatePlayer(s.p2, p2Input);
        var scorer = updateBall(s.ball);
        ballHitPlayer(s.ball, s.p1);
        ballHitPlayer(s.ball, s.p2);
        if (scorer >= 0) {
            s.score[scorer]++;
            s.serveSide = scorer;
            s.gameState = ST_SCORED;
            s.timer = SCORED_TIMER;
            var allP = Object.keys(s.presences).map(function (k) { return s.presences[k]; });
            dispatcher.broadcastMessage(OP_SCORE, JSON.stringify({
                scorer: scorer,
                score: s.score,
            }), allP);
        }
    }
    else if (s.gameState === ST_SCORED) {
        s.timer--;
        if (s.timer <= 0) {
            if (s.score[0] >= WIN_SCORE || s.score[1] >= WIN_SCORE) {
                s.gameState = ST_OVER;
                var winSide = s.score[0] >= WIN_SCORE ? 0 : 1;
                var winUid = '';
                var loseUid = '';
                var sk = Object.keys(s.playerSides);
                for (var wi = 0; wi < sk.length; wi++) {
                    if (s.playerSides[sk[wi]] === winSide)
                        winUid = sk[wi];
                    else
                        loseUid = sk[wi];
                }
                var eloRes = updateEloAfterMatch(nk, winUid, s.usernames[winUid] || 'Player', loseUid, s.usernames[loseUid] || 'Player');
                // Send personalized game-over to each player
                var ap = Object.keys(s.presences).map(function (k) { return s.presences[k]; });
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
            }
            else {
                s.gameState = ST_SERVE;
                s.timer = SERVE_TIMER;
                resetPlayer(s.p1);
                resetPlayer(s.p2);
            }
        }
    }
    else if (s.gameState === ST_OVER) {
        return null; // end match
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
        });
        var broadcastTargets = Object.keys(s.presences).map(function (k) { return s.presences[k]; });
        dispatcher.broadcastMessage(OP_STATE, snapshot, broadcastTargets);
    }
    return { state: s };
};
var matchTerminate = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state: state };
};
var matchSignal = function (ctx, logger, nk, dispatcher, tick, state, data) {
    return { state: state, data: '' };
};
// ============================================================
// MATCHMAKER MATCHED HOOK
// ============================================================
var matchmakerMatched = function (ctx, logger, nk, matches) {
    var matchId = nk.matchCreate('avball', { ai: 'false' });
    return matchId;
};
// ============================================================
// MODULE INIT
// ============================================================
var InitModule = function (ctx, logger, nk, initializer) {
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
    // Create ELO leaderboard
    try {
        nk.leaderboardCreate(LEADERBOARD_ID, false, "descending" /* nkruntime.SortOrder.DESCENDING */, "set" /* nkruntime.Operator.SET */, '', {});
        logger.info('Leaderboard created: %s', LEADERBOARD_ID);
    }
    catch (e) {
        logger.debug('Leaderboard already exists');
    }
    // Ensure CPU bot user exists
    // Look up by username first, then create with non-guessable device ID if needed
    try {
        var cpuUsers = nk.usersGetUsername([AI_USERNAME]);
        if (cpuUsers.length > 0) {
            AI_USER_ID = cpuUsers[0].userId;
            // Unlink the old guessable device ID and link a new one
            try {
                nk.unlinkDevice(AI_USER_ID, 'avball-cpu-bot-device');
            }
            catch (e) { }
            var SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
            var stored = nk.storageRead([{ collection: 'system', key: 'cpu_bot', userId: SYSTEM_USER_ID }]);
            if (stored.length === 0 || !stored[0].value || !stored[0].value['deviceId']) {
                var newDeviceId = 'cpu-' + nk.uuidv4();
                nk.storageWrite([{
                        collection: 'system', key: 'cpu_bot', userId: SYSTEM_USER_ID,
                        value: { deviceId: newDeviceId }, permissionRead: 0, permissionWrite: 0,
                    }]);
                try {
                    nk.linkDevice(AI_USER_ID, newDeviceId);
                }
                catch (e) { }
            }
        }
        else {
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
    }
    catch (e) {
        logger.warn('Could not create CPU bot: %s', e);
    }
    // Matchmaker hook: create authoritative match when 2 players matched
    initializer.registerMatchmakerMatched(matchmakerMatched);
    logger.info('AVball module loaded successfully');
};
