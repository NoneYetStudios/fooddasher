/* Food Dasher — screens, Phase 1 dispatch UI, dynamic-sort queue, shop dialog & dual leaderboard. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  const NAME_KEY = 'fd_name_v1';
  const LOCAL_SCORES_KEY = 'fd_local_scores_v1';
  const NAME_REGEX = /^[A-Za-z0-9 _.\-!?]+$/;

  const $ = function (id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  };
  const screens = ['menu', 'dispatch', 'pause', 'receipt', 'over', 'board'];

  let currentScreen = 'menu';
  let boardReturn = 'menu';
  let swapSourceIdx = -1;
  let serverAvailable = null;
  let lastSubmitSummary = null;
  let submitted = false;
  let submitting = false;
  let highlightName = null;
  let boardView = 'overall'; // 'overall' | 'vehicle'
  let boardVehicleFilter = null;
  let completedShiftNum = null;

  function lsGet(k) { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); } catch (e) {} }

  function vehicleLabel(id) {
    const v = FD.VEHICLES[id];
    return v ? v.name : String(id || 'SCOOTER');
  }

  function vehicleShortLabel(id) {
    const v = FD.VEHICLES[id];
    return v ? v.shortName : String(id || 'SCOOTER').toUpperCase();
  }

  /* ---------- Screen Switching ---------- */
  function showScreen(name) {
    currentScreen = name;
    if (name !== 'receipt') completedShiftNum = null;
    for (let i = 0; i < screens.length; i++) {
      const s = screens[i];
      const el = $('screen-' + s);
      if (el) el.classList.toggle('active', s === name);
    }
    syncHudAndMenu();
  }

  function hideScreens() {
    currentScreen = 'none';
    completedShiftNum = null;
    for (let i = 0; i < screens.length; i++) {
      const el = $('screen-' + screens[i]);
      if (el) el.classList.remove('active');
    }
  }

  function syncHudAndMenu() {
    const c = FD.Game.getCareer();
    const v = FD.Game.getVehicle();
    const shownShift = (currentScreen === 'receipt' && completedShiftNum != null) ? completedShiftNum : c.shiftNum;
    if ($('hudShift')) $('hudShift').textContent = '#' + shownShift;
    if ($('hudRating')) $('hudRating').textContent = FD.Util.fmtRating(c.rating);
    if ($('hudBankroll')) $('hudBankroll').textContent = FD.Util.fmtMoney(c.bankroll);
    if ($('hudVehicle')) $('hudVehicle').textContent = v.shortName;

    if ($('menuRating')) $('menuRating').textContent = FD.Util.fmtRating(c.rating);
    if ($('menuBankroll')) $('menuBankroll').textContent = FD.Util.fmtMoney(c.bankroll);
    if ($('menuShift')) $('menuShift').textContent = '#' + c.shiftNum;
    if ($('menuBest')) $('menuBest').textContent = '$' + (c.bestNetScore || 0);
    if ($('menuVehicleName')) $('menuVehicleName').textContent = v.name;
    if ($('shopBankroll')) $('shopBankroll').textContent = FD.Util.fmtMoney(c.bankroll);

    if ($('btnSound')) {
      const on = FD.Audio.sfxOn && FD.Audio.musicOn;
      $('btnSound').textContent = on ? 'SND: ON' : (FD.Audio.sfxOn ? 'SFX ONLY' : 'MUTED');
      $('btnSound').classList.toggle('off', !FD.Audio.sfxOn);
    }
  }

  /* ---------- Native <dialog> Light Dismiss Fallback (modern-web-guidance: dialog) ---------- */
  function initDialogFallbacks() {
    if (typeof HTMLDialogElement === 'undefined' || typeof document === 'undefined') return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = function (e, dlg) {
        const r = dlg.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      document.querySelectorAll('dialog[closedby="any"]').forEach(function (dlg) {
        let pressedOutside = false;
        dlg.addEventListener('pointerdown', function (e) { pressedOutside = outside(e, dlg); });
        dlg.addEventListener('pointerup', function (e) {
          if (pressedOutside && outside(e, dlg)) dlg.close();
        });
      });
    }
  }

  /* ---------- Garage & Upgrade Shop ---------- */
  function renderShop() {
    const c = FD.Game.getCareer();
    if ($('shopBankroll')) $('shopBankroll').textContent = FD.Util.fmtMoney(c.bankroll);

    const vGrid = $('shopVehicles');
    if (vGrid) {
      vGrid.innerHTML = '';
      for (let i = 0; i < FD.VEHICLE_ORDER.length; i++) {
        const vid = FD.VEHICLE_ORDER[i];
        const v = FD.VEHICLES[vid];
        const owned = c.ownedVehicles.indexOf(vid) !== -1;
        const equipped = c.equippedVehicle === vid;
        const card = document.createElement('div');
        card.className = 'shop-card' + (equipped ? ' equipped' : '');
        card.innerHTML =
          '<div>' +
            '<div class="shop-card-title">' + FD.Util.escHtml(v.name) + '</div>' +
            '<div class="shop-card-desc">' + FD.Util.escHtml(v.desc) + '</div>' +
          '</div>';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn small ' + (equipped ? 'accent' : 'primary');
        if (equipped) {
          btn.textContent = 'EQUIPPED';
          btn.disabled = true;
        } else if (owned) {
          btn.textContent = 'EQUIP';
        } else {
          btn.textContent = 'BUY ' + FD.Util.fmtMoney(v.cost);
          btn.disabled = c.bankroll < v.cost;
        }
        btn.addEventListener('click', function () {
          const res = FD.Game.buyOrEquipVehicle(vid);
          if (res.ok) {
            FD.Audio.sfx.cash();
            if ($('shopFeedback')) $('shopFeedback').textContent = '';
            renderShop();
            syncHudAndMenu();
          } else {
            FD.Audio.sfx.error();
            if ($('shopFeedback')) $('shopFeedback').textContent = res.reason || 'Insufficient funds.';
          }
        });
        card.appendChild(btn);
        vGrid.appendChild(card);
      }
    }

    const uGrid = $('shopUpgrades');
    if (uGrid) {
      uGrid.innerHTML = '';
      for (let i = 0; i < FD.UPGRADE_ORDER.length; i++) {
        const uid = FD.UPGRADE_ORDER[i];
        const up = FD.UPGRADES[uid];
        const lv = c.upgrades[uid] || 0;
        const maxed = lv >= up.maxLevel;
        const nextCost = maxed ? 0 : up.costs[lv];

        const card = document.createElement('div');
        card.className = 'shop-card' + (maxed ? ' equipped' : '');
        card.innerHTML =
          '<div>' +
            '<div class="shop-card-title">' + FD.Util.escHtml(up.name) + ' (Lv ' + lv + '/' + up.maxLevel + ')</div>' +
            '<div class="shop-card-desc">' + FD.Util.escHtml(up.desc) + '</div>' +
          '</div>';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn small ' + (maxed ? 'accent' : 'primary');
        if (maxed) {
          btn.textContent = 'MAXED';
          btn.disabled = true;
        } else {
          btn.textContent = 'UPGRADE ' + FD.Util.fmtMoney(nextCost);
          btn.disabled = c.bankroll < nextCost;
        }
        btn.addEventListener('click', function () {
          const res = FD.Game.buyUpgrade(uid);
          if (res.ok) {
            FD.Audio.sfx.cash();
            if ($('shopFeedback')) $('shopFeedback').textContent = '';
            renderShop();
            syncHudAndMenu();
          } else {
            FD.Audio.sfx.error();
            if ($('shopFeedback')) $('shopFeedback').textContent = res.reason || 'Insufficient funds.';
          }
        });
        card.appendChild(btn);
        uGrid.appendChild(card);
      }
    }
  }

  function openShop() {
    FD.Audio.sfx.click();
    if ($('shopFeedback')) $('shopFeedback').textContent = '';
    renderShop();
    const dlg = $('shopDialog');
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  }

  /* ---------- Phase 1 Dispatch & Route Queue (modern-web-guidance: dynamic-sort) ---------- */
  function reorderDomNodes(container, orderedNodes) {
    const hasMoveBefore = typeof Element !== 'undefined' && Object.hasOwn(Element.prototype, 'moveBefore');
    for (let i = 0; i < orderedNodes.length; i++) {
      const node = orderedNodes[i];
      if (hasMoveBefore && node.parentNode === container) {
        container.moveBefore(node, null);
      } else {
        container.append(node);
      }
    }
  }

  function applyQueueReorderTransition(container, orderedNodes, announcement) {
    reorderDomNodes(container, orderedNodes);
    const status = $('reorderStatus');
    if (status && announcement) status.textContent = announcement;
  }

  function createStopNode(stop) {
    const node = document.createElement('div');
    node.className = 'queue-stop';
    node.setAttribute('data-uid', stop.uid);
    node.style.borderTopColor = stop.color;

    const badge = document.createElement('div');
    badge.className = 'stop-badge';
    badge.style.color = stop.color;

    const name = document.createElement('div');
    name.className = 'stop-name';
    name.textContent = stop.label;

    const controls = document.createElement('div');
    controls.className = 'stop-controls';

    const btnUp = document.createElement('button');
    btnUp.type = 'button';
    btnUp.textContent = '▲';
    btnUp.title = 'Move Earlier';
    btnUp.setAttribute('data-act', 'up');

    const btnSwap = document.createElement('button');
    btnSwap.type = 'button';
    btnSwap.textContent = 'SWAP';
    btnSwap.title = 'Click two stops to swap';
    btnSwap.setAttribute('data-act', 'swap');

    const btnDown = document.createElement('button');
    btnDown.type = 'button';
    btnDown.textContent = '▼';
    btnDown.title = 'Move Later';
    btnDown.setAttribute('data-act', 'down');

    controls.appendChild(btnUp);
    controls.appendChild(btnSwap);
    controls.appendChild(btnDown);

    node.appendChild(badge);
    node.appendChild(name);
    node.appendChild(controls);

    node.addEventListener('click', function (e) {
      const target = e.target;
      const act = target && target.getAttribute ? target.getAttribute('data-act') : null;
      const q = FD.Game.getDispatch().queue;
      const idx = q.findIndex(function (item) { return item.uid === stop.uid; });
      if (idx === -1) return;

      if (act === 'up' || act === 'down') {
        swapSourceIdx = -1;
        const res = FD.Game.moveQueueStop(idx, act === 'up' ? -1 : 1);
        handleQueueMutationResult(res, 'Moved ' + stop.kind + ' ' + stop.orderId + (act === 'up' ? ' earlier' : ' later'));
        return;
      }

      if (swapSourceIdx === -1) {
        FD.Audio.sfx.click();
        swapSourceIdx = idx;
        syncQueueSelectionHighlight();
        redrawDispatchMap();
      } else if (swapSourceIdx === idx) {
        FD.Audio.sfx.click();
        swapSourceIdx = -1;
        syncQueueSelectionHighlight();
        redrawDispatchMap();
      } else {
        const res = FD.Game.swapQueueStops(swapSourceIdx, idx);
        swapSourceIdx = -1;
        handleQueueMutationResult(res, 'Swapped stops in route queue');
      }
    });

    return node;
  }

  function redrawDispatchMap() {
    const d = FD.Game.getDispatch();
    const sel = swapSourceIdx >= 0 && d.queue[swapSourceIdx]
      ? (d.queue[swapSourceIdx].orderId + '_' + d.queue[swapSourceIdx].kind)
      : null;
    FD.Dispatch.drawDispatchMap($('dispatchMap'), d.offers, d.queue, sel);
  }

  function syncQueueSelectionHighlight() {
    const list = $('routeQueueList');
    if (!list) return;
    const q = FD.Game.getDispatch().queue;
    for (let i = 0; i < list.children.length; i++) {
      const child = list.children[i];
      const uid = child.getAttribute('data-uid');
      const idx = q.findIndex(function (s) { return s.uid === uid; });
      child.classList.toggle('swap-selected', idx !== -1 && idx === swapSourceIdx);
    }
  }

  function handleQueueMutationResult(res, announceText) {
    const errEl = $('routeQueueError');
    if (!res.ok) {
      FD.Audio.sfx.error();
      if (errEl) errEl.textContent = res.reason || 'Invalid stop order.';
      syncQueueSelectionHighlight();
      return;
    }
    FD.Audio.sfx.click();
    if (errEl) errEl.textContent = '';
    syncRouteQueueDom(announceText);
    redrawDispatchMap();
  }

  function syncRouteQueueDom(announceText) {
    const list = $('routeQueueList');
    if (!list) return;
    const q = FD.Game.getDispatch().queue;

    // Map existing child nodes by stop uid to avoid recreating DOM elements on reorder
    const existingByUid = Object.create(null);
    for (let i = 0; i < list.children.length; i++) {
      const ch = list.children[i];
      const uid = ch.getAttribute('data-uid');
      if (uid) existingByUid[uid] = ch;
    }

    const wantedUids = Object.create(null);
    const orderedNodes = [];
    for (let i = 0; i < q.length; i++) {
      const stop = q[i];
      wantedUids[stop.uid] = true;
      let node = existingByUid[stop.uid];
      if (!node) node = createStopNode(stop);
      node.style.borderTopColor = stop.color;
      const badge = node.querySelector('.stop-badge');
      if (badge) {
        badge.style.color = stop.color;
        badge.textContent = '#' + (i + 1) + ' ' + stop.kind + ' ' + stop.orderId + ' (' + stop.side.toUpperCase() + ')';
      }
      const nameEl = node.querySelector('.stop-name');
      if (nameEl) nameEl.textContent = stop.label;
      node.classList.toggle('swap-selected', i === swapSourceIdx);
      orderedNodes.push(node);
    }

    // Remove nodes whose offer was deselected
    for (const uid in existingByUid) {
      if (!wantedUids[uid] && existingByUid[uid].parentNode === list) {
        list.removeChild(existingByUid[uid]);
      }
    }

    applyQueueReorderTransition(list, orderedNodes, announceText);
  }

  function renderDispatchScreen() {
    const d = FD.Game.getDispatch();
    const c = FD.Game.getCareer();
    swapSourceIdx = -1;
    if ($('dispatchTitle')) $('dispatchTitle').textContent = 'SHIFT #' + c.shiftNum + ' — INCOMING OFFERS';
    if ($('routeQueueError')) $('routeQueueError').textContent = '';

    const offersList = $('offersList');
    if (offersList) {
      offersList.innerHTML = '';
      for (let i = 0; i < d.offers.length; i++) {
        const o = d.offers[i];
        const selected = d.queue.some(function (q) { return q.orderId === o.id; });
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'offer-card' + (selected ? ' selected' : '') + (o.isBait ? ' bait' : '');
        card.style.borderLeftColor = o.color;

        const payText = o.isBait
          ? (FD.Util.fmtMoney(o.basePay) + ' — NO TIP / ' + o.itemCount + ' ITEMS')
          : (FD.Util.fmtMoney(o.basePay) + ' + ' + FD.Util.fmtMoney(o.estimatedTip) + ' Tip');

        card.innerHTML =
          '<div class="offer-top">' +
            '<span>[' + FD.Util.escHtml(o.id) + '] ' + FD.Util.escHtml(o.restaurantName) + ' → ' + FD.Util.escHtml(o.customerName) + '</span>' +
            '<span class="offer-pay">' + FD.Util.escHtml(payText) + '</span>' +
          '</div>' +
          '<div class="offer-mid">' + FD.Util.escHtml(o.address) + ' · "' + FD.Util.escHtml(o.note) + '"</div>' +
          '<div class="offer-tags">' +
            '<span class="tag-pill">' + o.food.icon + ' ' + FD.Util.escHtml(o.food.name) + ' (' + FD.Util.escHtml(o.food.tag) + ')</span>' +
            '<span class="tag-pill warn">⚠ ' + FD.Util.escHtml(o.hazardTag) + '</span>' +
          '</div>';

        card.addEventListener('click', (function (oid) {
          return function () {
            const res = FD.Game.toggleOffer(oid);
            if (!res.ok) {
              FD.Audio.sfx.error();
              if ($('routeQueueError')) $('routeQueueError').textContent = res.reason || 'Select at least 1 order.';
              return;
            }
            FD.Audio.sfx.click();
            renderDispatchScreen();
          };
        })(o.id));
        offersList.appendChild(card);
      }
    }

    syncRouteQueueDom('Updated dispatch route queue with ' + d.queue.length + ' waypoints');
    redrawDispatchMap();
  }

  /* ---------- Receipt & Account Deactivated Screens ---------- */
  function renderReceipt(receipt) {
    const c = FD.Game.getCareer();
    completedShiftNum = receipt.shiftNum;
    if ($('receiptKicker')) $('receiptKicker').textContent = 'SHIFT #' + receipt.shiftNum + ' COMPLETE';
    if ($('receiptTitle')) $('receiptTitle').textContent = 'SHIFT #' + receipt.shiftNum + ' EARNINGS RECEIPT';
    if ($('rcBankroll')) $('rcBankroll').textContent = FD.Util.fmtMoney(c.bankroll);
    if ($('rcRating')) $('rcRating').textContent = FD.Util.fmtRating(c.rating);

    const body = $('receiptBody');
    if (!body) return;
    const linesHtml = receipt.lineItems.map(function (it) {
      return '<div class="rc-item">' +
        '<span class="rc-item-desc"><b>[' + FD.Util.escHtml(it.orderId) + '] ' + FD.Util.escHtml(it.restaurant) +
        '</b> — ' + FD.Util.escHtml(it.outcomeLabel) + ' (★ ' + it.rating.toFixed(1) + ')</span>' +
        '<b class="rc-amt">' + FD.Util.fmtMoney(it.earned) + '</b>' +
        '</div>';
    }).join('');

    body.innerHTML =
      linesHtml +
      '<div class="rc-row"><span>Gross Base Pay</span><span class="rc-amt">' + FD.Util.fmtMoney(receipt.grossBasePay) + '</span></div>' +
      '<div class="rc-row"><span>Tips Earned</span><span class="rc-amt">' + FD.Util.fmtMoney(receipt.tipsEarned) + '</span></div>' +
      '<div class="rc-row"><span>Welcome Mat Bullseyes</span><span class="rc-amt">' + FD.Util.fmtMoney(receipt.bullseyeBonuses) + '</span></div>' +
      '<div class="rc-row deduct"><span>App Algorithm Fee (8%)</span><span class="rc-amt">-' + FD.Util.fmtMoney(receipt.algorithmFee) + '</span></div>' +
      '<div class="rc-row deduct"><span>Thermal Bag Depreciation</span><span class="rc-amt">-' + FD.Util.fmtMoney(receipt.bagDepreciation) + '</span></div>' +
      '<div class="rc-row deduct"><span>Convenience Fee for Getting Paid</span><span class="rc-amt">-' + FD.Util.fmtMoney(receipt.convenienceFee) + '</span></div>' +
      (receipt.ruinedOrderFee > 0
        ? '<div class="rc-row deduct"><span>Stolen / Ruined Order Fee (' + receipt.ruinedOrderCount + ' × $3.50)</span><span class="rc-amt">-' + FD.Util.fmtMoney(receipt.ruinedOrderFee) + '</span></div>'
        : '') +
      (receipt.damageDeductible > 0
        ? '<div class="rc-row deduct"><span>Insurance Deductible (' + ((receipt.collisionCount || 0) + (receipt.potholeHits || 0)) + ' hits)</span><span class="rc-amt">-' + FD.Util.fmtMoney(receipt.damageDeductible) + '</span></div>'
        : '') +
      '<div class="rc-row total"><span>NET SHIFT PAYOUT</span><span class="rc-amt">' + FD.Util.fmtMoney(receipt.netShiftEarnings) + '</span></div>';
  }

  function openGameOverScreen(isDeactivated) {
    const c = FD.Game.getCareer();
    const netDollars = Math.max(0, Math.round(c.bankroll));
    lastSubmitSummary = {
      score: netDollars,
      deliveries: c.totalDeliveries,
      shifts_completed: Math.max(1, c.shiftsCompleted),
      peak_rating: FD.Util.round2(c.peakRating),
      vehicle_id: c.equippedVehicle
    };
    submitted = false;
    submitting = false;

    if ($('overStamp')) $('overStamp').textContent = isDeactivated ? 'ACCOUNT DEACTIVATED' : 'SHIFT CASH-OUT';
    if ($('overHeading')) $('overHeading').textContent = isDeactivated ? 'CONTRACT TERMINATED' : 'GIG CAREER CASHED OUT';
    if ($('overReason')) {
      $('overReason').textContent = isDeactivated
        ? 'App Rating dropped below ★ 2.00. Thermal bag privileges revoked.'
        : 'Retiring on top with ' + vehicleLabel(c.equippedVehicle) + '. Submit your net earnings!';
    }
    if ($('goScore')) $('goScore').textContent = '$' + lastSubmitSummary.score.toLocaleString();
    if ($('goDeliveries')) $('goDeliveries').textContent = String(lastSubmitSummary.deliveries);
    if ($('goShifts')) $('goShifts').textContent = String(lastSubmitSummary.shifts_completed);
    if ($('goPeakRating')) $('goPeakRating').textContent = FD.Util.fmtRating(lastSubmitSummary.peak_rating);

    if ($('submitMsg')) {
      $('submitMsg').textContent = '';
      $('submitMsg').className = 'submit-msg';
    }
    if ($('btnSubmit')) {
      $('btnSubmit').disabled = false;
      $('btnSubmit').textContent = 'SUBMIT';
    }
    if ($('nameInput')) {
      $('nameInput').disabled = false;
      $('nameInput').value = FD.Util.cleanName(lsGet(NAME_KEY) || '');
    }
    showScreen('over');
  }

  /* ---------- Dual-Mode Leaderboard (PHP 8 + SQLite / Local Storage Fallback) ---------- */
  function getLocalScores() {
    try {
      const raw = lsGet(LOCAL_SCORES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalScores(list) {
    lsSet(LOCAL_SCORES_KEY, JSON.stringify(list));
  }

  function compareRuns(a, b) {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.deliveries || 0) !== (a.deliveries || 0)) return (b.deliveries || 0) - (a.deliveries || 0);
    if ((b.shifts_completed || 0) !== (a.shifts_completed || 0)) return (b.shifts_completed || 0) - (a.shifts_completed || 0);
    if ((b.peak_rating || 0) !== (a.peak_rating || 0)) return (b.peak_rating || 0) - (a.peak_rating || 0);
    return (a.created_at || 0) - (b.created_at || 0);
  }

  function bestPerPlayer(list, vehicleId) {
    const byPlayer = Object.create(null);
    const items = Array.isArray(list) ? list : [];
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (!row || !(row.name || row.player_name)) continue;
      if (vehicleId && row.vehicle_id !== vehicleId) continue;
      const pname = row.name || row.player_name;
      const nk = String(pname).toLowerCase();
      if (!byPlayer[nk] || compareRuns(row, byPlayer[nk]) < 0) byPlayer[nk] = row;
    }
    const best = Object.keys(byPlayer).map(function (k) { return byPlayer[k]; });
    best.sort(compareRuns);
    return best.map(function (entry, idx) {
      const pname = entry.name || entry.player_name;
      return {
        rank: idx + 1,
        name: pname,
        player_name: pname,
        vehicle_id: entry.vehicle_id || 'scooter',
        score: Number(entry.score || 0),
        deliveries: Number(entry.deliveries || 0),
        shifts_completed: Number(entry.shifts_completed || 1),
        peak_rating: Number(entry.peak_rating || 5.0),
        created_at: Number(entry.created_at || 0)
      };
    });
  }

  function submitLocalScore(payload) {
    const pname = FD.Util.cleanName(payload.name || payload.player_name);
    const nameKey = pname.toLowerCase();
    const vehicleId = FD.VEHICLES[payload.vehicle_id] ? payload.vehicle_id : 'scooter';
    const score = Math.max(0, Math.round(Number(payload.score || 0)));
    const deliveries = Math.max(0, Math.round(Number(payload.deliveries || 0)));
    const shifts = Math.max(1, Math.round(Number(payload.shifts_completed || 1)));
    const peakRating = FD.Util.clamp(FD.Util.round2(payload.peak_rating || 5.0), 1.0, 5.0);
    const now = Math.floor(Date.now() / 1000);

    const list = getLocalScores();
    const idx = list.findIndex(function (e) {
      return e && String(e.name || e.player_name || '').toLowerCase() === nameKey && e.vehicle_id === vehicleId;
    });

    let status = 'new';
    let record = {
      name: pname,
      player_name: pname,
      vehicle_id: vehicleId,
      score: score,
      deliveries: deliveries,
      shifts_completed: shifts,
      peak_rating: peakRating,
      created_at: now
    };

    if (idx >= 0) {
      const ex = list[idx];
      const better = compareRuns(record, ex) < 0;
      if (better) {
        list[idx] = record;
        status = 'improved';
      } else {
        status = score === (ex.score || 0) && deliveries === (ex.deliveries || 0) ? 'duplicate' : 'not_improved';
        record = ex;
      }
    } else {
      list.push(record);
    }

    saveLocalScores(list);
    const rankOf = function (vFilter) {
      const ranked = bestPerPlayer(list, vFilter);
      const pos = ranked.findIndex(function (r) { return r.name.toLowerCase() === nameKey; });
      return pos >= 0 ? pos + 1 : 1;
    };

    return {
      ok: true,
      status: status,
      rank_overall: rankOf(null),
      rank_vehicle: rankOf(vehicleId),
      best: record
    };
  }

  function fetchLeaderboardEntries(opts) {
    const limit = Math.max(1, Math.min(25, (opts && opts.limit) || FD.CONFIG.LEADERBOARD_SIZE || 25));
    const vehicleId = (opts && opts.vehicle_id) || null;
    const view = (opts && opts.view) || 'overall';
    const params = ['limit=' + limit, 'view=' + encodeURIComponent(view), '_=' + Date.now()];
    if (vehicleId) params.push('vehicle_id=' + encodeURIComponent(vehicleId));

    const localFallback = function () {
      serverAvailable = false;
      return {
        local: true,
        entries: bestPerPlayer(getLocalScores(), vehicleId).slice(0, limit)
      };
    };

    if (typeof fetch !== 'function') return Promise.resolve(localFallback());

    return fetch(FD.CONFIG.API_LEADERBOARD + '?' + params.join('&'), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (ct.indexOf('application/json') === -1) throw new Error('Not JSON');
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || 'Bad response');
        serverAvailable = true;
        return { local: false, entries: d.entries || [] };
      })
      .catch(localFallback);
  }

  function renderBoardTable(entries) {
    const body = $('boardBody');
    if (!body) return;
    body.innerHTML = entries.map(function (e) {
      const pname = e.name || e.player_name || 'DASHER';
      const me = highlightName && pname.toLowerCase() === highlightName.toLowerCase();
      return '<tr class="' + (me ? 'me' : '') + '">' +
        '<td>' + e.rank + '</td>' +
        '<th>' + FD.Util.escHtml(pname) + '</th>' +
        '<td>' + FD.Util.escHtml(vehicleShortLabel(e.vehicle_id)) + '</td>' +
        '<td>$' + Number(e.score || 0).toLocaleString() + '</td>' +
        '<td>' + Number(e.deliveries || 0) + '</td>' +
        '<td>' + Number(e.shifts_completed || 1) + '</td>' +
        '<td>★ ' + Number(e.peak_rating || 5).toFixed(2) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderBoardFilters() {
    const row = $('boardFilterRow');
    if (!row) return;
    if (boardView === 'overall') {
      row.classList.add('hidden');
      row.innerHTML = '';
      return;
    }
    row.classList.remove('hidden');
    row.innerHTML = '';
    const makeChip = function (label, active, onClick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (active ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      return btn;
    };
    row.appendChild(makeChip('ALL RIDES', !boardVehicleFilter, function () {
      FD.Audio.sfx.click();
      boardVehicleFilter = null;
      renderBoardFilters();
      loadBoard();
    }));
    for (let i = 0; i < FD.VEHICLE_ORDER.length; i++) {
      const vid = FD.VEHICLE_ORDER[i];
      row.appendChild(makeChip(vehicleShortLabel(vid), boardVehicleFilter === vid, (function (id) {
        return function () {
          FD.Audio.sfx.click();
          boardVehicleFilter = id;
          renderBoardFilters();
          loadBoard();
        };
      })(vid)));
    }
  }

  function loadBoard() {
    const msg = $('boardMsg');
    const notice = $('boardModeNotice');
    if (msg) msg.textContent = 'Loading…';
    if ($('boardBody')) $('boardBody').innerHTML = '';

    const vFilter = boardView === 'vehicle' ? boardVehicleFilter : null;
    return fetchLeaderboardEntries({ view: boardView, vehicle_id: vFilter, limit: 25 }).then(function (res) {
      if (notice) {
        notice.textContent = res.local ? 'LOCAL MODE — NO SERVER' : 'GLOBAL';
        notice.classList.toggle('global', !res.local);
      }
      renderBoardTable(res.entries);
      if (msg) {
        msg.textContent = res.entries.length ? '' : 'No runs posted yet. Finish a shift and cash out!';
      }
      return res;
    });
  }

  function openBoard(returnTo) {
    boardReturn = returnTo || 'menu';
    document.querySelectorAll('[data-board-view]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-board-view') === boardView);
    });
    renderBoardFilters();
    showScreen('board');
    return loadBoard();
  }

  function handleSubmitForm(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!lastSubmitSummary || submitted || submitting) return Promise.resolve();
    const inp = $('nameInput');
    const msg = $('submitMsg');
    const btn = $('btnSubmit');
    const name = FD.Util.cleanName(inp ? inp.value : '');

    if (!name || name.length > 12 || !NAME_REGEX.test(name)) {
      if (msg) {
        msg.className = 'submit-msg err';
        msg.textContent = 'Enter 1-12 chars: letters, numbers, spaces and _ . - ! ?';
      }
      if (inp && inp.focus) inp.focus();
      return Promise.resolve();
    }

    lsSet(NAME_KEY, name);
    submitting = true;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    if (msg) { msg.className = 'submit-msg'; msg.textContent = 'Posting run…'; }

    const payload = {
      name: name,
      score: lastSubmitSummary.score,
      deliveries: lastSubmitSummary.deliveries,
      shifts_completed: lastSubmitSummary.shifts_completed,
      peak_rating: lastSubmitSummary.peak_rating,
      vehicle_id: lastSubmitSummary.vehicle_id
    };

    const finishSuccess = function (d, isLocal) {
      highlightName = name;
      submitted = true;
      submitting = false;
      if (msg) {
        msg.className = 'submit-msg ok';
        msg.textContent = (isLocal ? '[Local Mode] ' : '') +
          'Posted! #' + (d.rank_overall || 1) + ' Overall · #' + (d.rank_vehicle || 1) +
          ' on ' + vehicleShortLabel(payload.vehicle_id);
      }
      if (btn) { btn.disabled = true; btn.textContent = 'POSTED'; }
      if (inp) inp.disabled = true;
    };

    if (serverAvailable === false || typeof fetch !== 'function') {
      const localRes = submitLocalScore(payload);
      finishSuccess(localRes, true);
      return Promise.resolve(localRes);
    }

    return fetch(FD.CONFIG.API_SUBMIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (ct.indexOf('application/json') === -1) throw new Error('NO_API');
        return r.json().then(function (d) { return { ok: r.ok, data: d }; });
      })
      .then(function (res) {
        serverAvailable = true;
        if (!res.ok || !res.data || !res.data.ok) {
          submitting = false;
          if (msg) {
            msg.className = 'submit-msg err';
            msg.textContent = (res.data && res.data.error) || 'Could not post score.';
          }
          if (btn) { btn.disabled = false; btn.textContent = 'SUBMIT'; }
          return res.data;
        }
        finishSuccess(res.data, false);
        return res.data;
      })
      .catch(function () {
        serverAvailable = false;
        const localRes = submitLocalScore(payload);
        finishSuccess(localRes, true);
        return localRes;
      });
  }

  /* ---------- Wiring & Initialization ---------- */
  function bindUi() {
    if (typeof document === 'undefined') return;
    initDialogFallbacks();

    const cv = $('game');
    if (cv && FD.Render) {
      FD.Render.setCanvas(cv);
      const previewOffers = FD.Dispatch.generateShiftOffers(1, 101);
      const previewMap = Object.create(null);
      for (let i = 0; i < previewOffers.length; i++) previewMap[previewOffers[i].id] = previewOffers[i];
      const previewQueue = FD.Dispatch.buildQueueFromOffers(previewOffers);
      const previewRun = FD.Game.createRunState(previewQueue, previewMap, 1, 101);
      previewRun.player.s = 260;
      FD.Render.drawScene(previewRun, FD.Game.getContextAction(previewRun), FD.Game.getCareer());
    }
    if ($('backBtn')) $('backBtn').href = FD.CONFIG.ARCADE_URL;

    FD.Game.setCallbacks({
      onModeChange: function (m) {
        if (m === 'play') hideScreens();
        else if (m === 'dispatch') {
          renderDispatchScreen();
          showScreen('dispatch');
        } else if (m === 'pause') showScreen('pause');
        else if (m === 'menu') showScreen('menu');
      },
      onHudUpdate: function (state, activeCtx) {
        const actBtn = $('touchActionBtn');
        if (actBtn && activeCtx) {
          const isGrab = activeCtx.type === 'GRAB';
          actBtn.textContent = isGrab ? 'GRAB' : 'TOSS';
          actBtn.classList.toggle('grab-ready', isGrab && activeCtx.inLane);
        }
      },
      onShiftComplete: function (receipt) {
        renderReceipt(receipt);
        showScreen('receipt');
      },
      onDeactivated: function () {
        openGameOverScreen(true);
      }
    });

    if ($('btnStartShift')) {
      $('btnStartShift').addEventListener('click', function () {
        FD.Audio.sfx.confirm();
        FD.Game.prepareDispatch();
      });
    }
    if ($('btnOpenShop')) $('btnOpenShop').addEventListener('click', openShop);
    if ($('btnShopHud')) $('btnShopHud').addEventListener('click', openShop);
    if ($('btnDispatchShop')) $('btnDispatchShop').addEventListener('click', openShop);
    if ($('btnReceiptShop')) $('btnReceiptShop').addEventListener('click', openShop);

    if ($('btnHow')) {
      $('btnHow').addEventListener('click', function () {
        FD.Audio.sfx.click();
        const dlg = $('howDialog');
        if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
      });
    }
    if ($('btnPauseHow')) {
      $('btnPauseHow').addEventListener('click', function () {
        FD.Audio.sfx.click();
        const dlg = $('howDialog');
        if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
      });
    }

    if ($('btnDispatchBack')) {
      $('btnDispatchBack').addEventListener('click', function () {
        FD.Audio.sfx.click();
        showScreen('menu');
      });
    }
    if ($('dispatchMap')) {
      $('dispatchMap').addEventListener('click', function (e) {
        const d = FD.Game.getDispatch();
        const pin = FD.Dispatch.hitTestMapPin(d.offers, $('dispatchMap'), e.clientX, e.clientY);
        if (!pin) return;

        const qIdx = d.queue.findIndex(function (s) {
          return s.orderId === pin.orderId && s.kind === pin.kind;
        });

        if (qIdx === -1) {
          swapSourceIdx = -1;
          const res = FD.Game.toggleOffer(pin.orderId);
          if (!res.ok) {
            FD.Audio.sfx.error();
            if ($('routeQueueError')) $('routeQueueError').textContent = res.reason || 'Select at least 1 order.';
            return;
          }
          FD.Audio.sfx.click();
          renderDispatchScreen();
          return;
        }

        if (swapSourceIdx === -1) {
          FD.Audio.sfx.click();
          swapSourceIdx = qIdx;
          if ($('routeQueueError')) $('routeQueueError').textContent = '';
          syncQueueSelectionHighlight();
          redrawDispatchMap();
        } else if (swapSourceIdx === qIdx) {
          FD.Audio.sfx.click();
          swapSourceIdx = -1;
          syncQueueSelectionHighlight();
          redrawDispatchMap();
        } else {
          const res = FD.Game.swapQueueStops(swapSourceIdx, qIdx);
          swapSourceIdx = -1;
          handleQueueMutationResult(res, 'Swapped stops in route queue');
        }
      });
    }
    if ($('btnLaunchDash')) {
      $('btnLaunchDash').addEventListener('click', function () {
        FD.Audio.sfx.confirm();
        FD.Game.startShift();
      });
    }

    if ($('btnNextShift')) {
      $('btnNextShift').addEventListener('click', function () {
        FD.Audio.sfx.confirm();
        FD.Game.prepareDispatch();
      });
    }
    if ($('btnReceiptCashOut')) {
      $('btnReceiptCashOut').addEventListener('click', function () {
        FD.Audio.sfx.click();
        openGameOverScreen(false);
      });
    }
    if ($('btnCashOut')) {
      $('btnCashOut').addEventListener('click', function () {
        FD.Audio.sfx.click();
        openGameOverScreen(false);
      });
    }
    if ($('btnResetCareer')) {
      $('btnResetCareer').addEventListener('click', function () {
        FD.Audio.sfx.click();
        FD.Game.resetCareer();
        syncHudAndMenu();
      });
    }

    if ($('btnPlayAgain')) {
      $('btnPlayAgain').addEventListener('click', function () {
        FD.Audio.sfx.confirm();
        FD.Game.startNewCareerRun();
      });
    }
    if ($('btnOverMenu')) {
      $('btnOverMenu').addEventListener('click', function () {
        FD.Audio.sfx.click();
        FD.Game.resetCareer();
        showScreen('menu');
      });
    }
    if ($('btnOverBoard')) {
      $('btnOverBoard').addEventListener('click', function () {
        FD.Audio.sfx.click();
        openBoard('over');
      });
    }

    if ($('btnBoard')) $('btnBoard').addEventListener('click', function () { FD.Audio.sfx.click(); openBoard('menu'); });
    if ($('btnBoardRefresh')) $('btnBoardRefresh').addEventListener('click', function () { FD.Audio.sfx.click(); loadBoard(); });
    if ($('btnBoardBack')) $('btnBoardBack').addEventListener('click', function () { FD.Audio.sfx.click(); showScreen(boardReturn); });

    document.querySelectorAll('[data-board-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        FD.Audio.sfx.click();
        boardView = btn.getAttribute('data-board-view') || 'overall';
        if (boardView === 'overall') boardVehicleFilter = null;
        document.querySelectorAll('[data-board-view]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderBoardFilters();
        loadBoard();
      });
    });

    if ($('submitForm')) $('submitForm').addEventListener('submit', handleSubmitForm);

    if ($('btnSound')) {
      $('btnSound').addEventListener('click', function () {
        FD.Audio.resume();
        FD.Audio.toggleMuteAll();
        syncHudAndMenu();
        this.blur();
      });
    }
    if ($('btnPause')) {
      $('btnPause').addEventListener('click', function () {
        this.blur();
        if (FD.Game.getMode() === 'play') FD.Game.pause();
        else if (FD.Game.getMode() === 'pause') FD.Game.resume();
      });
    }
    if ($('btnResume')) $('btnResume').addEventListener('click', function () { FD.Game.resume(); });
    if ($('btnQuitShift')) $('btnQuitShift').addEventListener('click', function () { FD.Game.quitToMenu(); });

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', function (e) {
        const tag = e.target && e.target.tagName;
        const typing = tag === 'INPUT' || tag === 'TEXTAREA';
        if (typing) return;
        if (e.code === 'KeyM') {
          FD.Audio.resume();
          FD.Audio.toggleMuteAll();
          syncHudAndMenu();
        } else if (e.code === 'KeyP' || e.code === 'Escape') {
          if (FD.Game.getMode() === 'play') FD.Game.pause();
          else if (FD.Game.getMode() === 'pause') FD.Game.resume();
        } else if (e.code === 'Space' && !e.repeat) {
          const openDlg = typeof document !== 'undefined' && document.querySelector && document.querySelector('dialog[open]');
          if (openDlg) return;
          if (currentScreen === 'menu') {
            e.preventDefault();
            FD.Audio.sfx.confirm();
            FD.Game.prepareDispatch();
          } else if (currentScreen === 'dispatch') {
            e.preventDefault();
            FD.Audio.sfx.confirm();
            FD.Game.startShift();
          }
        }
      });
    }

    syncHudAndMenu();
    showScreen('menu');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindUi);
    } else {
      bindUi();
    }
  }

  FD.UI = {
    showScreen: showScreen,
    bestPerPlayer: bestPerPlayer,
    submitLocalScore: submitLocalScore,
    fetchLeaderboardEntries: fetchLeaderboardEntries,
    handleSubmitForm: handleSubmitForm,
    openBoard: openBoard,
    loadBoard: loadBoard
  };
})(typeof window !== 'undefined' ? window : globalThis);
