/**
 * ContinuousTrickplay — experimental Litefin Android TV seek preview module.
 *
 * Physical FF/REW presses start an autonomous 4x/8x/16x/32x/64x virtual scan.
 * Actual video stays paused until Play/OK commits one real seek; Back cancels.
 * D-pad navigation remains the stock Litefin behavior.
 *
 * This module deliberately uses Litefin's existing seek-preview fields and
 * OSD drawing methods. No video decoding or server APIs are altered.
 *
 * License: MPL-2.0 (see the upstream Litefin LICENSE file).
 */
export const TRICKPLAY_SPEEDS = Object.freeze([4, 8, 16, 32, 64]);
const TICKS_PER_SECOND = 10_000_000;
const TICK_INTERVAL_MS = 100;
const THUMB_REFRESH_MS = 175;
const MIN_DISTINCT_PRESS_MS = 300;

export function advancePreviewTicks(position, duration, speed, direction, elapsedMs) {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const delta = Math.max(0, Math.min(elapsedMs, 750)) / 1000 * TICKS_PER_SECOND * speed * direction;
    return Math.max(0, Math.min(duration, position + delta));
}

export default class ContinuousTrickplay {
    constructor(osd, options = {}) {
        this._osd = osd;
        this._now = options.now || (() => performance.now());
        this._wallNow = options.wallNow || (() => Date.now());
        this._startInterval = options.setInterval || ((fn, ms) => setInterval(fn, ms));
        this._stopInterval = options.clearInterval || ((timer) => clearInterval(timer));
        this._timer = null;
        this.active = false;
        this._speedIndex = 0;
        this._direction = 1;
        this._target = 0;
        this._duration = 0;
        this._lastFrame = 0;
        this._lastThumbAt = -Infinity;
        this._lastPressAt = -Infinity;
        this._wasPaused = false;
    }

    /** Returns false if scanning is unavailable; caller should run normal seek. */
    press(directionName, event = null) {
        if (event?.repeat === true) return true; // ignore held-button auto-repeat
        const direction = directionName === 'rewind' ? -1 : 1;
        const osd = this._osd;
        const player = osd?._player;
        const duration = Number(player?.getDurationTicks?.());
        if (osd?._isAudio || !player || typeof player.seek !== 'function'
            || !Number.isFinite(duration) || duration <= 0) return false;

        const now = this._wallNow();
        if (now - this._lastPressAt < MIN_DISTINCT_PRESS_MS) return true;
        this._lastPressAt = now;

        if (!this.active) {
            // Finish any separate D-pad scrub session; don't mix its debounce
            // timer with a new continuous scan.
            if (osd._seekTargetTicks !== null) osd._clearSeekState(false);
            const position = Number(player.getCurrentPositionTicks?.()) || 0;
            this._target = Math.max(0, Math.min(duration, position));
            this._duration = duration;
            this._direction = direction;
            this._speedIndex = 0;
            this._wasPaused = Boolean(player.isPaused?.());
            osd.show();
            osd._seekInitialPos = this._target;
            osd._seekTargetTicks = this._target;
            osd._seekRequiresConfirmation = true;
            osd._seekResumePlayback = !this._wasPaused;
            osd._seekStartTime = now;
            this.active = true;
            player.pause?.();
            osd.updatePlayPauseButton?.();
            this._lastFrame = this._now();
            this._lastThumbAt = -Infinity;
            this._timer = this._startInterval(() => this._tick(), TICK_INTERVAL_MS);
        } else {
            this._tick(); // don't lose the interval elapsed at prior speed
            if (this._direction === direction) {
                this._speedIndex = Math.min(this._speedIndex + 1, TRICKPLAY_SPEEDS.length - 1);
            } else {
                this._direction = direction;
                this._speedIndex = 0;
            }
            this._lastFrame = this._now();
        }
        this._render(true);
        return true;
    }

    _tick() {
        if (!this.active) return;
        const now = this._now();
        const deltaMs = Math.max(0, now - this._lastFrame);
        this._lastFrame = now;
        this._target = advancePreviewTicks(
            this._target, this._duration, TRICKPLAY_SPEEDS[this._speedIndex], this._direction, deltaMs
        );
        this._osd._seekTargetTicks = this._target;
        this._render(false);
    }

    _render(forceThumbnail = false) {
        if (!this.active) return;
        const osd = this._osd;
        const virtualPlayer = {
            getCurrentPositionTicks: () => this._target,
            getDurationTicks: () => this._duration
        };
        osd._updateTimeDisplay(virtualPlayer, true);
        osd._updatePositionSlider(virtualPlayer);
        const tooltip = osd._cachedTooltipEl || osd._osdEl?.querySelector('#osdSeekTooltip');
        if (tooltip) {
            osd._cachedTooltipEl = tooltip;
            const time = osd._formatTime(this._target, this._duration >= 3600 * TICKS_PER_SECOND);
            const symbol = this._direction === -1 ? '◀◀' : '▶▶';
            if (osd._cachedTooltipTextEl) {
                osd._cachedTooltipTextEl.textContent = `${time}  ${symbol} ${TRICKPLAY_SPEEDS[this._speedIndex]}×`;
            }
            tooltip.classList.add('visible');
            tooltip.style.left = `${this._duration > 0 ? 100 * this._target / this._duration : 0}%`;
        }
        const now = this._now();
        if (forceThumbnail || now - this._lastThumbAt >= THUMB_REFRESH_MS) {
            this._lastThumbAt = now;
            osd._updateTrickplayTooltip(this._target); // existing Jellyfin sprite preview
        }
        // Don't let ordinary OSD timeout hide the preview while it is scanning.
        if (Math.floor(now / 1000) !== Math.floor((now - TICK_INTERVAL_MS) / 1000)) {
            osd.resetAutoHide?.();
        }
    }

    /** Stop the timer, but leave preview state for Litefin's confirm path. */
    stop() {
        if (this._timer !== null) this._stopInterval(this._timer);
        this._timer = null;
        this.active = false;
    }

    /** Discard the preview and restore the original paused/playing state. */
    cancel() {
        if (!this.active) return false;
        const shouldResume = !this._wasPaused;
        this.stop();
        this._osd._clearSeekState(false);
        this._osd._updateState?.();
        if (shouldResume) this._osd._restoreSeekPlayback(true);
        this._osd.updatePlayPauseButton?.();
        return true;
    }
}
