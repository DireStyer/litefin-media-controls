import test from 'node:test';
import assert from 'node:assert/strict';
import ContinuousTrickplay, { advancePreviewTicks, TRICKPLAY_SPEEDS } from '../src/ContinuousTrickplay.js';

const S = 10_000_000;
function fixture({ startSeconds = 25, durationSeconds = 120, paused = false } = {}) {
    let time = 0;
    let wallTime = 1000;
    let nextId = 1;
    const timers = new Map();
    let current = startSeconds * S;
    const calls = { pause: 0, update: 0, thumbs: [], resumed: 0, seek: [] };
    const player = {
        isPaused: () => paused,
        pause: () => { paused = true; calls.pause++; },
        getCurrentPositionTicks: () => current,
        getDurationTicks: () => durationSeconds * S,
        seek: (target) => { current = target; calls.seek.push(target); }
    };
    const osd = {
        _player: player,
        _seekTargetTicks: null,
        _osdEl: { querySelector: () => null },
        _updatePositionSlider: () => { calls.update++; },
        _updateTimeDisplay: () => { calls.update++; },
        _updateTrickplayTooltip: target => calls.thumbs.push(target),
        _formatTime: target => String(Math.floor(target / S)),
        updatePlayPauseButton: () => {},
        resetAutoHide: () => {},
        show: () => {},
        _clearSeekState: () => { osd._seekTargetTicks = null; osd._seekRequiresConfirmation = false; },
        _updateState: () => {},
        _restoreSeekPlayback: value => { if (value) { paused = false; calls.resumed++; } }
    };
    const scan = new ContinuousTrickplay(osd, {
        now: () => time,
        wallNow: () => wallTime,
        setInterval: fn => { let id = nextId++; timers.set(id, fn); return id; },
        clearInterval: id => timers.delete(id)
    });
    const move = ms => { time += ms; wallTime += ms; [...timers.values()].forEach(fn => fn()); };
    return { osd, scan, player, calls, move, getPaused: () => paused, getTimerCount: () => timers.size };
}

test('five requested speeds and time evolution', () => {
    const f = fixture();
    assert.equal(f.scan.press('fastForward'), true);
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 4);
    assert.equal(f.getPaused(), true);
    f.move(100);
    assert.equal(Math.round(f.scan._target / S * 10) / 10, 25.4);
    f.move(300);
    f.scan.press('fastForward');
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 8);
    f.move(300); f.scan.press('fastForward');
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 16);
    f.move(300); f.scan.press('fastForward');
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 32);
    f.move(300); f.scan.press('fastForward');
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 64);
    f.move(300); f.scan.press('fastForward');
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 64);
    assert.equal(f.calls.seek.length, 0, 'must not seek decoder while scanning');
    assert.equal(f.getTimerCount(), 1);
    f.scan.stop();
    assert.equal(f.getTimerCount(), 0);
});

test('direction change resets speed to 4x and clamps at beginning', () => {
    const f = fixture({startSeconds: 1});
    f.scan.press('rewind');
    f.move(600);
    assert.equal(f.scan._target, 0);
    f.scan.press('rewind');
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 8);
    f.move(600);
    f.scan.press('fastForward');
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 4);
    f.scan.stop();
});

test('ignore key repeat and bounce; back cancels without seek', () => {
    const f = fixture({ startSeconds: 80 });
    f.scan.press('fastForward');
    f.scan.press('fastForward', { repeat: true });
    f.move(120);
    f.scan.press('fastForward'); // too soon, should not increase speed
    assert.equal(f.scan._speedIndex, 0);
    assert.equal(f.scan.cancel(), true);
    assert.equal(f.calls.seek.length, 0);
    assert.equal(f.calls.resumed, 1);
    assert.equal(f.getTimerCount(), 0);
    assert.equal(f.osd._seekTargetTicks, null);
});

test('original paused state remains paused after cancellation', () => {
    const f = fixture({ paused: true });
    f.scan.press('fastForward');
    f.move(250);
    f.scan.cancel();
    assert.equal(f.getPaused(), true);
    assert.equal(f.calls.resumed, 0);
});

test('does not intercept media without a duration', () => {
    const f = fixture({ durationSeconds: 0 });
    assert.equal(f.scan.press('fastForward'), false);
    assert.equal(f.getTimerCount(), 0);
});

test('position math is bounded at both ends and pauses clock after a stall', () => {
    assert.equal(advancePreviewTicks(0, 100 * S, 32, -1, 100), 0);
    assert.equal(advancePreviewTicks(99 * S, 100 * S, 32, 1, 100), 100 * S);
    assert.equal(advancePreviewTicks(0, 100 * S, 4, 1, 10_000), 3 * S);
});

test('64x scan moves cursor 64 seconds per second and clamps at end', () => {
    const f = fixture({ startSeconds: 20, durationSeconds: 100 });
    f.scan.press('fastForward');
    for (let speed of [8, 16, 32, 64]) { f.move(300); f.scan.press('fastForward'); }
    assert.equal(TRICKPLAY_SPEEDS[f.scan._speedIndex], 64);
    const prior = f.scan._target;
    f.move(100);
    assert.equal(Math.round((f.scan._target - prior) / S * 10) / 10, 6.4);
    for (let i = 0; i < 5; i++) f.move(250);
    assert.equal(f.scan._target, 100 * S);
    f.scan.stop();
});
