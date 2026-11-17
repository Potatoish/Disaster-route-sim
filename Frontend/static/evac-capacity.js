// Evacuation site capacity: how many people are already at each flood
// evacuation site (out of CAPACITY), and how many are in the visitor's group.
// Every site starts at 0 and the group at 1, again for each new simulation
// (resetCounts, when script.js drops a result); kept for the tab
// (sessionStorage), so a reload keeps them with the restored result. Sent
// with every flood run to the evacuation sites (requestFields); the backend
// passes over a site without
// room for the group and says which it passed over
// (osm_routing.pick_site_with_room). Flood runs only: earthquake runs have
// no site counts. Like the sites themselves, it shows only after a run: a
// site's count is set in its popup on the map (popupHtml, flood.js) or in
// the dialog the results notice ([data-capacity-result]) opens, which shows
// the result's chosen site with the group size (every site only when all
// are full and there is no result). Both use the same controls
// ([data-capacity-controls]) and everything follows a change at once. No
// state of its own beyond the counts: it reads script.js globals.
(function initEvacCapacity() {
  const CAPACITY = 100;
  // A site this full (share of CAPACITY) shows as filling up.
  const FILLING_SHARE = 0.8;
  const STORAGE_KEY = 'agnas-evac-capacity';

  // Earlier versions kept the counts for good (localStorage); they start
  // at 0 now.
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {}

  const saved = readSaved();
  let sites = [];
  let sitesScope = '';
  let sitesLoading = null;
  let returnFocusEl = null;
  // The counts when the dialog opened, to tell whether Done changed them.
  let openedWith = '';
  // The one site the dialog shows (the result's chosen site), or null when
  // it lists every site.
  let dialogSite = null;

  const INTRO_ONE_SITE = 'Set how many people are already at your evacuation site. It holds up to 100 people. If it is full, AGNAS sends you to the next best site with room.';
  const INTRO_ALL_SITES = 'Set how many people are already at each site. Each site holds up to 100 people. If the best site for you is full, AGNAS sends you to the next best site with room.';

  const $ = id => document.getElementById(id);

  function readSaved() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      return {
        group: clampGroup(value.group),
        counts: value.counts && typeof value.counts === 'object' ? value.counts : {},
      };
    } catch (err) {
      return { group: 1, counts: {} };
    }
  }

  function writeFresh(change) {
    const fresh = readSaved();
    change(fresh);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch (err) {}
    Object.assign(saved, fresh);
  }

  // A new simulation: every site back to 0, the group back to 1.
  function resetCounts() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {}
    saved.group = 1;
    saved.counts = {};
  }

  function writeGroup(group) {
    writeFresh(fresh => { fresh.group = clampGroup(group); });
  }

  function setCount(siteId, value) {
    const key = `${barangayKey()}|${siteId}`;
    const count = clampCount(value);
    writeFresh(fresh => {
      if (count) fresh.counts[key] = count;
      else delete fresh.counts[key];
    });
  }

  function clampCount(value) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(Math.max(number, 0), CAPACITY) : 0;
  }

  function clampGroup(value) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(Math.max(number, 1), CAPACITY) : 1;
  }

  function barangayKey() {
    return String(selectedBarangay || '').trim().toLowerCase();
  }

  function countFor(siteId) {
    return clampCount(saved.counts[`${barangayKey()}|${siteId}`] || 0);
  }

  function groupSize() {
    return saved.group;
  }

  function statusOf(siteId) {
    const occupancy = countFor(siteId);
    const available = CAPACITY - occupancy;
    const hasRoom = available >= saved.group;
    const level = occupancy >= CAPACITY ? 'full'
      : !hasRoom ? 'tight'
      : occupancy >= CAPACITY * FILLING_SHARE ? 'filling'
      : 'open';
    return { occupancy, available, hasRoom, level };
  }

  function pillText(status) {
    if (status.level === 'full') return 'Full';
    if (status.level === 'tight') return `No room for ${saved.group}`;
    return `${status.available} left`;
  }

  function meterHtml(occupancy, level) {
    return `<span class="capacity-meter is-${level}" aria-hidden="true"><span style="width:${(occupancy / CAPACITY) * 100}%"></span></span>`;
  }

  // A flood run whose destination is the evacuation sites, so the run picks
  // the site.
  function isActive() {
    if (!selectedBarangay || selectedHazard !== 'Flood') return false;
    return isToEvacuationSite() && !routePins.end;
  }

  function scope() {
    return `${selectedHazard}|${selectedBarangay}`;
  }

  // The barangay's flood evacuation sites (flood.js caches them).
  function ensureSites() {
    const wanted = scope();
    if (sitesScope === wanted) return Promise.resolve(sites);
    if (sitesLoading?.scope === wanted) return sitesLoading.promise;
    const promise = (window.floodHazardUI?.loadEvacuationSites(selectedBarangay) || Promise.resolve([]))
      .then(list => {
        if (scope() !== wanted) return sites;
        sites = Array.isArray(list) ? list : [];
        sitesScope = wanted;
        return sites;
      })
      .catch(() => sites)
      .finally(() => {
        if (sitesLoading?.promise === promise) sitesLoading = null;
      });
    sitesLoading = { scope: wanted, promise };
    return promise;
  }

  // ---- the run request ----

  // Every count this browser has for the barangay, read fresh, and the group
  // size. Sent even when empty, so the result always says how full its site
  // is.
  function requestFields() {
    Object.assign(saved, readSaved());
    const prefix = `${barangayKey()}|`;
    const occupancy = {};
    Object.entries(saved.counts).forEach(([key, count]) => {
      if (key.startsWith(prefix)) occupancy[key.slice(prefix.length)] = clampCount(count);
    });
    return { site_occupancy: occupancy, group_size: saved.group };
  }

  // ---- the dialog ----

  function countsSignature() {
    return JSON.stringify([saved.group, sites.map(site => countFor(site.id))]);
  }

  async function open(options = {}) {
    const modal = $('evacCapacityModal');
    if (!modal || !isActive()) return;
    returnFocusEl = options.event?.currentTarget instanceof HTMLElement
      ? options.event.currentTarget
      : document.activeElement;
    Object.assign(saved, readSaved());
    await ensureSites();
    // With a result, only the site its routes lead to: the others are set in
    // their own popups on the map.
    const chosen = options.allFull ? null : chosenResultSite();
    dialogSite = chosen ? (sites.find(site => site.id === chosen.id) || chosen) : null;
    $('evacCapacityScope').textContent = dialogSite ? dialogSite.name : 'Flood evacuation sites';
    $('evacCapacityIntro').textContent = dialogSite ? INTRO_ONE_SITE : INTRO_ALL_SITES;
    renderGroup();
    renderSiteList();
    const alert = $('evacCapacityAlert');
    alert.hidden = !options.allFull;
    alert.textContent = options.allFull
      ? 'Every site you can reach is full, so no route was found. Make your group smaller, or choose your own destination.'
      : '';
    openedWith = countsSignature();
    syncDoneButton();
    modal.classList.remove('is-closing');
    modal.hidden = false;
    $('evacCapacityBody').scrollTop = 0;
    window.modalFocus?.enter(modal, modal.querySelector('.capacity-modal-close'));
  }

  function isOpen() {
    return $('evacCapacityModal')?.hidden === false;
  }

  function close() {
    const modal = $('evacCapacityModal');
    if (!modal || modal.hidden) return;
    closeModalAnimated(modal, '.about-modal');
    const focusTarget = returnFocusEl;
    returnFocusEl = null;
    focusTarget?.focus?.({ preventScroll: true });
  }

  // Done: when a result is showing and the group size or the counts changed,
  // the route is checked again (the site may now be full, or a better one
  // may have room again).
  function done() {
    const rerun = shouldRerunOnDone();
    close();
    if (rerun) rerunWithCounts();
  }

  function hasEvacResult() {
    return !!(simData && simData.pins_key === getRoutePinsKey() && getResultCapacity(simData) && isActive());
  }

  // The site the shown result's routes lead to.
  function chosenResultSite() {
    return hasEvacResult() ? getResultCapacity(simData)?.chosen || null : null;
  }

  function shouldRerunOnDone() {
    return hasEvacResult() && countsSignature() !== openedWith;
  }

  function syncDoneButton() {
    const button = $('evacCapacityDone');
    if (!button) return;
    const rerun = shouldRerunOnDone();
    button.textContent = rerun ? 'Update my route' : 'Done';
    $('evacCapacityRerunNote').hidden = !rerun;
  }

  function renderGroup() {
    const input = $('evacCapacityGroup');
    if (input && document.activeElement !== input) input.value = String(saved.group);
    $('evacCapacityGroupLess').disabled = saved.group <= 1;
    $('evacCapacityGroupMore').disabled = saved.group >= CAPACITY;
  }

  // The count controls of one site, in the dialog and in its popup: a
  // slider, a stepper with the number, and Mark full / Mark empty.
  function controlsHtml(site, inputId) {
    const name = escapeHtml(site.name);
    return `<input class="capacity-range" type="range" min="0" max="${CAPACITY}" step="1" data-capacity-range
        aria-label="People at ${name}">
      <div class="capacity-site-controls">
        <div class="capacity-stepper">
          <button type="button" data-capacity-step="-1" aria-label="One person fewer at ${name}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>
          </button>
          <input id="${inputId}" type="number" inputmode="numeric" min="0" max="${CAPACITY}" step="1" data-capacity-input
            aria-label="People at ${name}">
          <button type="button" data-capacity-step="1" aria-label="One person more at ${name}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>
          </button>
        </div>
        <span class="capacity-of">of ${CAPACITY}</span>
        <button type="button" class="capacity-quick" data-capacity-toggle></button>
      </div>`;
  }

  function renderSiteList() {
    const list = $('evacCapacitySites');
    if (!list) return;
    const shown = dialogSite ? [dialogSite] : sites;
    if (!shown.length) {
      list.innerHTML = '<li class="capacity-empty">No evacuation sites are listed for this barangay.</li>';
      return;
    }
    // One site: its name already heads the dialog.
    list.innerHTML = shown.map((site, index) => `<li class="capacity-site" data-capacity-controls data-site-id="${escapeHtml(site.id)}">
        <div class="capacity-site-top">
          <label class="capacity-site-name" for="capacitySite${index}">${dialogSite ? 'People at this site' : escapeHtml(site.name)}</label>
          <span class="capacity-pill" data-capacity-pill></span>
        </div>
        ${controlsHtml(site, `capacitySite${index}`)}
      </li>`).join('');
    list.querySelectorAll('[data-capacity-controls]').forEach(box => updateControls(box));
  }

  // Any count or group change: the pins, the open popup and dialog, and the
  // results notice follow at once. source: the controls just used, already
  // up to date (a count being typed stays as typed).
  function afterChange(source = null) {
    syncDoneButton();
    refreshMarkers();
    document.querySelectorAll('[data-capacity-controls]').forEach(box => {
      if (box !== source) updateControls(box);
    });
    renderResults();
  }

  function setGroup(value) {
    writeGroup(value);
    renderGroup();
    afterChange();
  }

  // ---- the map: a site's popup, where its count can be set too ----

  // With a flood result to the evacuation sites only; a pinned destination
  // of one's own has nothing to do with site counts.
  function popupHtml(site) {
    if (!hasEvacResult()) return '';
    return `<div class="popup-capacity" data-capacity-controls data-site-id="${escapeHtml(site.id)}">
      <div class="popup-capacity-top">
        <label class="popup-capacity-label" for="popupCapacityInput">People here</label>
        <span class="capacity-pill" data-capacity-pill></span>
      </div>
      ${controlsHtml(site, 'popupCapacityInput')}
      <div class="popup-capacity-alert" data-capacity-alert hidden>
        <span>Your route's site is now full.</span>
        <button type="button" class="capacity-result-btn is-primary" onclick="window.evacCapacity.rerun()">Find another site</button>
      </div>
    </div>`;
  }

  // A site's controls (dialog row or popup), after a change; keepInput: the
  // count being typed.
  function updateControls(box, { keepInput = false } = {}) {
    const siteId = box.dataset.siteId;
    const status = statusOf(siteId);
    box.classList.remove('is-open', 'is-filling', 'is-tight', 'is-full');
    box.classList.add(`is-${status.level}`);
    box.querySelector('[data-capacity-pill]').textContent = pillText(status);
    const range = box.querySelector('[data-capacity-range]');
    range.value = String(status.occupancy);
    range.style.setProperty('--fill', `${(status.occupancy / CAPACITY) * 100}%`);
    range.setAttribute('aria-valuetext', `${status.occupancy} of ${CAPACITY} people, ${pillText(status)}`);
    const input = box.querySelector('[data-capacity-input]');
    if (!keepInput) input.value = String(status.occupancy);
    box.querySelector('[data-capacity-step="-1"]').disabled = status.occupancy <= 0;
    box.querySelector('[data-capacity-step="1"]').disabled = status.occupancy >= CAPACITY;
    box.querySelector('[data-capacity-toggle]').textContent = status.occupancy >= CAPACITY ? 'Mark empty' : 'Mark full';
    // The popup's own note when it is the route's site that filled up.
    const alert = box.querySelector('[data-capacity-alert]');
    if (!alert) return;
    const hideAlert = !(siteId === chosenResultSite()?.id && !status.hasRoom);
    if (alert.hidden !== hideAlert) {
      alert.hidden = hideAlert;
      window.floodHazardUI?.relayoutPopup?.();
    }
  }

  function controlsOf(target) {
    return target.closest?.('[data-capacity-controls]') || null;
  }

  function onControlsInput(event) {
    const box = controlsOf(event.target);
    if (!box) return;
    if (event.target.matches('[data-capacity-range]')) {
      setCount(box.dataset.siteId, event.target.value);
      updateControls(box);
    } else if (event.target.matches('[data-capacity-input]')) {
      if (event.target.value === '') return;
      setCount(box.dataset.siteId, event.target.value);
      updateControls(box, { keepInput: clampCount(event.target.value) === Number(event.target.value) });
    } else {
      return;
    }
    afterChange(box);
  }

  function onControlsClick(event) {
    const button = event.target.closest?.('button');
    const box = button && controlsOf(button);
    if (!box) return;
    const siteId = box.dataset.siteId;
    if (button.matches('[data-capacity-step]')) {
      setCount(siteId, countFor(siteId) + Number(button.dataset.capacityStep));
    } else if (button.matches('[data-capacity-toggle]')) {
      setCount(siteId, countFor(siteId) >= CAPACITY ? 0 : CAPACITY);
    } else {
      return;
    }
    afterChange();
  }

  // ---- the map: pins ----

  function refreshMarkers() {
    window.floodHazardUI?.refreshCapacity?.();
    // The legend's full-site row.
    if (isActive() && gMap) setFloodLegendContent();
  }

  // A pin's look, with a result: a site without room for the group shows
  // as full, unless it is the one the result's routes lead to.
  function isSiteFull(siteId) {
    return hasEvacResult() && !statusOf(siteId).hasRoom;
  }

  // ---- results ----

  function getResultCapacity(result) {
    if (!result || isEarthquakeSimulationResult(result)) return null;
    return result.capacity || null;
  }

  function joinNames(names) {
    if (names.length < 2) return names[0] || '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  // mode: 'full' (the phone sheet's details), 'banner' (the desktop
  // results: a few lines, the counts themselves in the dialog) or 'compact'
  // (the phone sheet's peek: one line, only when the site was moved or is
  // now full).
  function buildResultCard(result, mode = 'full') {
    const capacity = getResultCapacity(result);
    const chosen = capacity?.chosen;
    if (!chosen) return '';
    const group = capacity.group_size || 1;
    const skipped = capacity.skipped_full_sites || [];
    const usedCounts = Object.fromEntries((capacity.sites || []).map(site => [site.id, site.occupancy]));
    const changed = group !== saved.group
      || (capacity.sites || []).some(site => countFor(site.id) !== usedCounts[site.id]);
    const nowStatus = statusOf(chosen.id);
    const stale = changed && !nowStatus.hasRoom;
    // The meter shows the counts as they are now, which may be newer than
    // the run's.
    const shown = changed ? nowStatus : {
      occupancy: chosen.occupancy,
      available: chosen.available,
      level: chosen.occupancy >= CAPACITY * FILLING_SHARE ? 'filling' : 'open',
    };
    const kind = stale ? 'is-stale' : skipped.length ? 'is-moved' : 'is-ok';
    const label = stale ? 'Site is now full' : skipped.length ? 'Moved to another site' : 'Site capacity';
    const title = stale ? `${chosen.name} has no room now` : `${chosen.name} has room`;
    const fullNames = joinNames(skipped.map(site => site.name));
    const text = stale
      ? `Find the next best site with room for ${group > 1 ? `your group of ${group}` : 'you'}.`
      : skipped.length
      ? (skipped.every(site => site.occupancy >= CAPACITY)
        ? `${fullNames} ${skipped.length > 1 ? 'are' : 'is'} full, so AGNAS sent you to the next best site with room.`
        : `${fullNames} ${skipped.length > 1 ? 'do' : 'does'} not have room for your group of ${group}, so AGNAS sent you to the next best site with room.`)
      : group > 1 ? `Enough space for your group of ${group}.` : 'Enough space for you.';
    const icon = stale || skipped.length
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11a4 4 0 0 1 0 8H8"/><path d="m11 11-4 4 4 4"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="m9.5 14.5 2 2 3.5-3.5"/></svg>';
    const allFull = skipped.every(site => site.occupancy >= CAPACITY);
    const isAre = skipped.length > 1 ? 'are' : 'is';
    const rerunButton = text => `<button type="button" class="capacity-result-btn is-primary" onclick="window.evacCapacity.rerun()">${text}</button>`;
    if (mode === 'compact') {
      if (kind === 'is-ok') return '';
      return `<section class="capacity-result capacity-result--compact ${kind}" aria-label="Evacuation site capacity">
        <div class="capacity-result-icon">${icon}</div>
        <div class="capacity-result-main">
          <div class="capacity-result-label">${escapeHtml(label)}</div>
          <p class="capacity-result-text">${escapeHtml(stale ? `${chosen.name} has no room now.` : `${fullNames} ${isAre} ${allFull ? 'full' : 'too full for your group'}.`)}</p>
        </div>
        ${stale ? rerunButton('Find another site') : ''}
      </section>`;
    }
    if (mode === 'banner') {
      const bannerKind = kind === 'is-ok' && changed ? 'is-changed' : kind;
      const bannerLabel = bannerKind === 'is-changed' ? 'Counts changed' : label;
      const bannerText = stale ? `${chosen.name} has no room now.`
        : bannerKind === 'is-changed' ? 'Check the route again with the new counts.'
        : skipped.length
        ? `${fullNames} ${isAre} ${allFull ? 'full' : `too full for your group of ${group}`}, so your route goes to ${chosen.name}.`
        : `${chosen.name} has room: ${shown.available} of ${CAPACITY} spaces left.`;
      return `<section class="capacity-result capacity-result--banner ${bannerKind}" aria-label="Evacuation site capacity">
        <div class="capacity-result-icon">${icon}</div>
        <div class="capacity-result-main">
          <div class="capacity-result-label">${escapeHtml(bannerLabel)}</div>
          <p class="capacity-result-text">${escapeHtml(bannerText)}</p>
          <div class="capacity-result-actions">
            ${stale ? rerunButton('Find another site') : changed ? rerunButton('Check again') : ''}
            <button type="button" class="capacity-result-link" onclick="openEvacCapacity(event)" aria-haspopup="dialog" aria-controls="evacCapacityModal">Adjust capacity</button>
          </div>
        </div>
      </section>`;
    }
    const changedNote = changed && !stale ? '<p class="capacity-result-changed">Counts changed since this route was found.</p>' : '';
    return `<section class="capacity-result ${kind}" aria-label="Evacuation site capacity">
      <div class="capacity-result-icon">${icon}</div>
      <div class="capacity-result-main">
        <div class="capacity-result-label">${escapeHtml(label)}</div>
        <div class="capacity-result-title">${escapeHtml(title)}</div>
        <p class="capacity-result-text">${escapeHtml(text)}</p>
        <div class="capacity-result-meter">
          ${meterHtml(shown.occupancy, stale ? (nowStatus.level === 'full' ? 'full' : 'tight') : shown.level)}
          <span>${escapeHtml(`${shown.occupancy} / ${CAPACITY} people, ${stale ? pillText(nowStatus).toLowerCase() : `${shown.available} spaces left`}`)}</span>
        </div>
        ${changedNote}
        <div class="capacity-result-actions">
          ${stale || changed
            ? `<button type="button" class="capacity-result-btn is-primary" onclick="window.evacCapacity.rerun()">${stale ? 'Find another site' : 'Check route again'}</button>`
            : ''}
          <button type="button" class="capacity-result-btn" onclick="openEvacCapacity(event)" aria-haspopup="dialog" aria-controls="evacCapacityModal">Adjust capacity</button>
        </div>
      </div>
    </section>`;
  }

  function renderResults() {
    const current = simData && simData.pins_key === getRoutePinsKey() ? simData : null;
    document.querySelectorAll('[data-capacity-result]').forEach(slot => {
      const html = current ? buildResultCard(current, slot.dataset.capacityResult || 'full') : '';
      if (slot._html === html) return;
      slot._html = html;
      slot.innerHTML = html;
      slot.hidden = !html;
    });
    window.mobileSim?.scheduleSync();
  }

  function rerunWithCounts() {
    if (isSimulationInteractionLocked() || !canRunCurrentSimulation()) return;
    runSimulation();
  }

  // ---- wiring ----

  // The popup is rebuilt each time a site is clicked and the dialog's rows
  // each time it opens, so their controls are reached through the document.
  document.addEventListener('input', onControlsInput);
  document.addEventListener('click', onControlsClick);
  // A typed count out of range, or left empty, settles when the field does.
  document.addEventListener('change', event => {
    const box = controlsOf(event.target);
    if (!box || !event.target.matches('[data-capacity-input]')) return;
    setCount(box.dataset.siteId, event.target.value === '' ? 0 : event.target.value);
    afterChange();
  });

  $('evacCapacityGroup')?.addEventListener('input', event => {
    if (event.target.value !== '') setGroup(event.target.value);
  });
  $('evacCapacityGroup')?.addEventListener('change', event => {
    setGroup(event.target.value === '' ? 1 : event.target.value);
    event.target.value = String(saved.group);
  });
  $('evacCapacityGroupLess')?.addEventListener('click', () => setGroup(saved.group - 1));
  $('evacCapacityGroupMore')?.addEventListener('click', () => setGroup(saved.group + 1));
  $('evacCapacityModal')?.addEventListener('mousedown', event => {
    if (event.target === event.currentTarget) close();
  });
  // Before script.js's handler, which would otherwise close what is behind.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }, true);
  window.openEvacCapacity = event => open({ event });
  window.evacCapacity = {
    open,
    close,
    done,
    isSiteFull,
    resetCounts,
    popupHtml,
    syncPopup: box => updateControls(box),
    requestFields,
    renderResults,
    rerun: rerunWithCounts,
    groupSize,
  };
})();
