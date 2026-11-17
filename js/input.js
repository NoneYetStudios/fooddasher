/* Food Dasher — desktop keyboard + non-overlapping mobile touch controls. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  const keys = Object.create(null);
  const touchState = {
    left: false,
    right: false,
    accel: false,
    brake: false,
    actionQueued: false
  };
  let actionPressedQueued = false;
  let isTouchDevice = false;

  if (typeof window !== 'undefined') {
    isTouchDevice =
      'ontouchstart' in window ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  }

  function clearAll() {
    for (const k in keys) delete keys[k];
    touchState.left = false;
    touchState.right = false;
    touchState.accel = false;
    touchState.brake = false;
    touchState.actionQueued = false;
    actionPressedQueued = false;
  }

  function bindDom() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    window.addEventListener('keydown', function (e) {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) !== -1) {
        if (document.body && document.body.classList.contains('playing')) {
          e.preventDefault();
        }
      }
      if (!keys[e.code] && e.code === 'Space') {
        actionPressedQueued = true;
      }
      keys[e.code] = true;
    });

    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
    });

    window.addEventListener('blur', clearAll);

    const holdButtons = document.querySelectorAll('[data-touch-hold]');
    holdButtons.forEach(function (btn) {
      const act = btn.getAttribute('data-touch-hold');
      const setHold = function (down, ev) {
        if (ev && ev.cancelable) ev.preventDefault();
        isTouchDevice = true;
        if (act && act in touchState) touchState[act] = down;
        btn.classList.toggle('pressed', down);
      };
      btn.addEventListener('pointerdown', function (e) {
        setHold(true, e);
        if (btn.setPointerCapture) {
          try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        }
      });
      btn.addEventListener('pointerup', function (e) { setHold(false, e); });
      btn.addEventListener('pointercancel', function (e) { setHold(false, e); });
      btn.addEventListener('lostpointercapture', function () {
        if (act && act in touchState) touchState[act] = false;
        btn.classList.remove('pressed');
      });
    });

    const actBtn = document.getElementById('touchActionBtn');
    if (actBtn) {
      actBtn.addEventListener('pointerdown', function (e) {
        if (e.cancelable) e.preventDefault();
        isTouchDevice = true;
        touchState.actionQueued = true;
        actBtn.classList.add('pressed');
      });
      const release = function () { actBtn.classList.remove('pressed'); };
      actBtn.addEventListener('pointerup', release);
      actBtn.addEventListener('pointercancel', release);
    }
  }

  function readControls() {
    const left = !!(keys.ArrowLeft || keys.KeyA || touchState.left);
    const right = !!(keys.ArrowRight || keys.KeyD || touchState.right);
    const accel = !!(keys.ArrowUp || keys.KeyW || touchState.accel);
    const brake = !!(keys.ArrowDown || keys.KeyS || touchState.brake);
    const action = !!(actionPressedQueued || touchState.actionQueued);
    actionPressedQueued = false;
    touchState.actionQueued = false;
    return {
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      throttle: (accel ? 1 : 0) - (brake ? 1 : 0),
      action: action
    };
  }

  function queueAction() {
    actionPressedQueued = true;
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindDom);
    } else {
      bindDom();
    }
  }

  FD.Input = {
    get isTouchDevice() { return isTouchDevice; },
    readControls: readControls,
    queueAction: queueAction,
    clearAll: clearAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
