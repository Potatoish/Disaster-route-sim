// Evacuation site capacity: how many people are already at each evacuation
// site (out of CAPACITY) and how many are in the visitor's group. Entered by
// hand in the capacity dialog, kept in this browser (localStorage) and sent
// with every run to the evacuation sites (requestFields); the backend passes
// over a site without room for the group and says which it passed over
// (osm_routing.pick_site_with_room). No state of its own beyond the counts:
// it reads script.js globals and fills the setup card, the phone sheet row,
// the results notice ([data-capacity-result]) and the site pins' popups.
(function initEvacCapacity() {
  const CAPACITY = 100;
  // A site this full (share of CAPACITY) shows as filling up.
  const FILLING_SHARE = 0.8;
  const STORAGE_KEY = 'agnas-evac-capacity';

  const saved = readSaved();
  let sites = [];
  let sitesScope = '';
  let sitesLoading = null;
  let returnFocusEl = null;
  // The counts when the dialog opened, to tell whether Done changed them.
  let openedWith = '';

  const $ = id => document.getElementById(id);

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        group: clampGroup(value.group),
        counts: value.counts && typeof value.counts === 'object' ? value.counts : {},
      };
    } catch (err) {
      return { group: 1, counts: {} };
    }
  }

  function writeSaved() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {}
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

  function countKey(siteId) {
    return `${barangayKey()}|${siteId}`;
  }

  function countFor(siteId) {
    return clampCount(saved.counts[countKey(siteId)] || 0);
  }

  function setCount(siteId, value) {
    const count = clampCount(value);
    if (count) saved.counts[countKey(siteId)] = count;
    else delete saved.counts[countKey(siteId)];
    writeSaved();
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

  // The destination is the evacuation sites, so the run picks the site.
  function isActive() {
    if (!selectedBarangay || !selectedHazard) return false;
    if (isEarthquakeMode() && !isEarthquakeBarangaySupported()) return false;
    return isToEvacuationSite() && !routePins.end;
  }

  function scope() {
    return `${selectedHazard}|${selectedBarangay}`;
  }

  // Flood and earthquake have their own site lists (flood.js / earthquake.js
  // cache them), so the dialog lists the ones the next run would use.
  function ensureSites() {
    const wanted = scope();
    if (sitesScope === wanted) return Promise.resolve(sites);
    if (sitesLoading?.scope === wanted) return sitesLoading.promise;
    const loader = isEarthquakeMode() ? window.earthquakeUI : window.floodHazardUI;
    const promise = (loader?.loadEvacuationSites(selectedBarangay) || Promise.resolve([]))
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

  function roomTally() {
    const open = sites.filter(site => statusOf(site.id).hasRoom).length;
    return { open, total: sites.length };
  }

  function tallyText() {
    const { open, total } = roomTally();
    if (!total) return 'Loading sites…';
    if (!open) return 'All sites are full';
    return `${open} of ${total} sites have room`;
  }

  // ---- the run request ----

  // Every count this browser has for the barangay, and the group size. Sent
  // even when empty, so the result always says how full its site is.
  function requestFields() {
    const prefix = `${barangayKey()}|`;
    const occupancy = {};
    Object.entries(saved.counts).forEach(([key, count]) => {
      if (key.startsWith(prefix)) occupancy[key.slice(prefix.length)] = clampCount(count);
    });
    return { site_occupancy: occupancy, group_size: saved.group };
  }

  // ---- setup: one row (desktop panel, phone sheet) that opens the dialog ----

  function sync() {
    const active = isActive();
    const card = $('cardCapacity');
    const row = $('msimCapacityRow');
    if (card) card.hidden = !active;
    if (row) row.hidden = !active;
    if (!active) return;
    if (sitesScope !== scope()) {
      ensureSites().then(() => { if (isActive()) renderSetup(); });
    }
    renderSetup();
  }

  // How many sites have room, and a dot per site in its status color.
  function renderSetup() {
    const { open, total } = roomTally();
    const tally = tallyText();
    const dots = sites.map(site => `<span class="is-${statusOf(site.id).level}"></span>`).join('');
    document.querySelectorAll('.capacity-entry').forEach(entry => {
      entry.classList.toggle('is-full', total > 0 && !open);
      const value = entry.querySelector('[data-capacity-tally]');
      if (value.textContent !== tally) value.textContent = tally;
      const dotBox = entry.querySelector('[data-capacity-dots]');
      if (dotBox.innerHTML !== dots) dotBox.innerHTML = dots;
    });
  }

  // ---- the dialog ----

  function countsSignature() {
    return JSON.stringify([saved.group, sites.map(site => countFor(site.id))]);
  }

  async function open(options = {}) {
    const modal = $('evacCapacityModal');
    if (!modal || !selectedBarangay || !selectedHazard) return;
    returnFocusEl = options.event?.currentTarget instanceof HTMLElement
      ? options.event.currentTarget
      : document.activeElement;
    await ensureSites();
    $('evacCapacityScope').textContent = `${selectedBarangay} · ${isEarthquakeMode() ? 'Earthquake' : 'Flood'} evacuation sites`;
    renderGroup();
    renderSiteList();
    const alert = $('evacCapacityAlert');
    alert.hidden = !options.allFull;
    alert.textContent = options.allFull
      ? 'Every site you can reach is full, so no route was found. Lower a count below, make your group smaller, or choose your own destination.'
      : '';
    openedWith = countsSignature();
    syncDoneButton();
    modal.classList.remove('is-closing');
    modal.hidden = false;
    $('evacCapacityBody').scrollTop = 0;
    window.modalFocus?.enter(modal, modal.querySelector('.capacity-modal-close'));
  }

  function close() {
    const modal = $('evacCapacityModal');
    if (!modal || modal.hidden) return;
    closeModalAnimated(modal, '.about-modal');
    const focusTarget = returnFocusEl;
    returnFocusEl = null;
    focusTarget?.focus?.({ preventScroll: true });
  }

  // Done: when a result is showing and the counts changed, the route is
  // checked again with the new ones (the site may now be full, or a better
  // one may have room again).
  function done() {
    const rerun = shouldRerunOnDone();
    close();
    if (rerun) rerunWithCounts();
  }

  function hasEvacResult() {
    return !!(simData && simData.pins_key === getRoutePinsKey() && getResultCapacity(simData) && isActive());
  }

  function shouldRerunOnDone() {
    return hasEvacResult() && countsSignature() !== openedWith;
  }

  function syncDoneButton() {
    const button = $('evacCapacityDone');
    if (!button) return;
    const rerun = shouldRerunOnDone();
    button.textContent = rerun ? 'Save and update route' : 'Done';
    $('evacCapacityRerunNote').hidden = !rerun;
  }

  function renderGroup() {
    const input = $('evacCapacityGroup');
    if (input && document.activeElement !== input) input.value = String(saved.group);
    $('evacCapacityGroupLess').disabled = saved.group <= 1;
    $('evacCapacityGroupMore').disabled = saved.group >= CAPACITY;
  }

  function renderSiteList() {
    const list = $('evacCapacitySites');
    if (!list) return;
    if (!sites.length) {
      list.innerHTML = '<li class="capacity-empty">No evacuation sites are listed for this barangay.</li>';
      return;
    }
    // The site the shown result's routes lead to.
    const chosenId = hasEvacResult() ? getResultCapacity(simData)?.chosen?.id : null;
    list.innerHTML = sites.map((site, index) => {
      const id = `capacitySite${index}`;
      return `<li class="capacity-site" data-site-id="${escapeHtml(site.id)}">
        <div class="capacity-site-top">
          <label class="capacity-site-name" for="${id}">${escapeHtml(site.name)}${site.id === chosenId ? ' <span class="capacity-site-tag">Your site</span>' : ''}</label>
          <span class="capacity-pill" data-capacity-pill></span>
        </div>
        <input class="capacity-range" type="range" min="0" max="${CAPACITY}" step="1" data-capacity-range
          aria-label="People already at ${escapeHtml(site.name)}">
        <div class="capacity-site-controls">
          <div class="capacity-stepper">
            <button type="button" data-capacity-step="-1" aria-label="One person fewer at ${escapeHtml(site.name)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>
            </button>
            <input id="${id}" type="number" inputmode="numeric" min="0" max="${CAPACITY}" step="1" data-capacity-input
              aria-label="People already at ${escapeHtml(site.name)}">
            <button type="button" data-capacity-step="1" aria-label="One person more at ${escapeHtml(site.name)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>
            </button>
          </div>
          <span class="capacity-of">of ${CAPACITY}</span>
          <button type="button" class="capacity-quick" data-capacity-toggle></button>
        </div>
      </li>`;
    }).join('');
    list.querySelectorAll('.capacity-site').forEach(row => updateRow(row));
  }

  function updateRow(row, { keepInput = false } = {}) {
    const status = statusOf(row.dataset.siteId);
    row.className = `capacity-site is-${status.level}`;
    const pill = row.querySelector('[data-capacity-pill]');
    pill.textContent = pillText(status);
    const range = row.querySelector('[data-capacity-range]');
    range.value = String(status.occupancy);
    range.style.setProperty('--fill', `${(status.occupancy / CAPACITY) * 100}%`);
    range.setAttribute('aria-valuetext', `${status.occupancy} of ${CAPACITY} people, ${pillText(status)}`);
    const input = row.querySelector('[data-capacity-input]');
    if (!keepInput) input.value = String(status.occupancy);
    row.querySelector('[data-capacity-step="-1"]').disabled = status.occupancy <= 0;
    row.querySelector('[data-capacity-step="1"]').disabled = status.occupancy >= CAPACITY;
    row.querySelector('[data-capacity-toggle]').textContent = status.occupancy >= CAPACITY ? 'Mark empty' : 'Mark full';
  }

  // Any count or group change: the setup card, the pins and the results
  // notice follow at once.
  function afterChange() {
    syncDoneButton();
    if (isActive()) renderSetup();
    refreshMarkers();
    renderResults();
  }

  function onSiteInput(event) {
    const row = event.target.closest('.capacity-site');
    if (!row) return;
    const siteId = row.dataset.siteId;
    if (event.target.matches('[data-capacity-range]')) {
      setCount(siteId, event.target.value);
      updateRow(row);
    } else if (event.target.matches('[data-capacity-input]')) {
      if (event.target.value === '') return;
      setCount(siteId, event.target.value);
      updateRow(row, { keepInput: clampCount(event.target.value) === Number(event.target.value) });
    } else {
      return;
    }
    afterChange();
  }

  function onSiteClick(event) {
    const button = event.target.closest('button');
    const row = button?.closest('.capacity-site');
    if (!row) return;
    const siteId = row.dataset.siteId;
    if (button.matches('[data-capacity-step]')) {
      setCount(siteId, countFor(siteId) + Number(button.dataset.capacityStep));
    } else if (button.matches('[data-capacity-toggle]')) {
      setCount(siteId, countFor(siteId) >= CAPACITY ? 0 : CAPACITY);
    } else {
      return;
    }
    updateRow(row);
    afterChange();
  }

  function setGroup(value) {
    saved.group = clampGroup(value);
    writeSaved();
    renderGroup();
    document.querySelectorAll('#evacCapacitySites .capacity-site').forEach(row => updateRow(row));
    afterChange();
  }

  function resetCounts() {
    const prefix = `${barangayKey()}|`;
    Object.keys(saved.counts).forEach(key => {
      if (key.startsWith(prefix)) delete saved.counts[key];
    });
    saved.group = 1;
    writeSaved();
    renderGroup();
    renderSiteList();
    afterChange();
  }

  // ---- the map: pins and popups ----

  function refreshMarkers() {
    window.floodHazardUI?.refreshCapacity?.();
    window.earthquakeUI?.refreshCapacity?.();
    // The flood legend's full-site row (earthquake.js redoes its own).
    if (!isEarthquakeMode() && gMap) setFloodLegendContent();
  }

  // A popup's capacity block. Only while the run picks the site: a pinned
  // destination of one's own has nothing to do with site counts.
  function popupHtml(site) {
    if (!isActive() && !hasEvacResult()) return '';
    const status = statusOf(site.id);
    return `<div class="popup-capacity is-${status.level}">
      <div class="popup-capacity-top">
        <span>Capacity</span>
        <strong>${status.occupancy} / ${CAPACITY} people</strong>
      </div>
      ${meterHtml(status.occupancy, status.level)}
      <div class="popup-capacity-foot">
        <span class="capacity-pill">${escapeHtml(pillText(status))}</span>
        <button type="button" class="popup-capacity-edit" onclick="openEvacCapacity(event)">Update</button>
      </div>
    </div>`;
  }

  // A pin's look: a site without room for the group shows as full, unless
  // it is the one the result's routes lead to.
  function isSiteFull(siteId) {
    return (isActive() || hasEvacResult()) && !statusOf(siteId).hasRoom;
  }

  // ---- results ----

  function getResultCapacity(result) {
    if (!result) return null;
    return isEarthquakeSimulationResult(result)
      ? result.active_summary?.capacity || null
      : result.capacity || null;
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
            <button type="button" class="capacity-result-link" onclick="openEvacCapacity(event)" aria-haspopup="dialog" aria-controls="evacCapacityModal">See sites</button>
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
          <button type="button" class="capacity-result-btn" onclick="openEvacCapacity(event)">Update capacity</button>
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

  const list = $('evacCapacitySites');
  list?.addEventListener('input', onSiteInput);
  list?.addEventListener('click', onSiteClick);
  // A typed count out of range, or left empty, settles when the field does.
  list?.addEventListener('change', event => {
    if (!event.target.matches('[data-capacity-input]')) return;
    const row = event.target.closest('.capacity-site');
    setCount(row.dataset.siteId, event.target.value === '' ? 0 : event.target.value);
    updateRow(row);
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
    if (event.key !== 'Escape' || $('evacCapacityModal')?.hidden !== false) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }, true);

  window.openEvacCapacity = event => open({ event });
  window.evacCapacity = {
    CAPACITY,
    sync,
    open,
    close,
    done,
    resetCounts,
    statusOf,
    isSiteFull,
    pillText,
    popupHtml,
    requestFields,
    renderResults,
    rerun: rerunWithCounts,
    groupSize,
  };
})();
