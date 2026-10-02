// ==UserScript==
// @name         MouseHunt Auto Disarm/Swap Bait (Kane)
// @author       Kane
// @namespace    https://greasyfork.org/en/users/979741
// @version      5.5
// @description  Automate your bait management in MouseHunt! Automatically disarms your trap or swaps to your chosen cheese when bait drops to or below your target quantity. Pairs with MouseHunt Auto Horn & KR Solver (Kane).
// @match        https://mousehuntgame.com/*
// @match        https://www.mousehuntgame.com/*
// @icon         https://www.mousehuntgame.com/favicon.ico
// @grant        none
// @license      GPL-3.0+
// @downloadURL https://update.greasyfork.org/scripts/467434/MouseHunt%20Auto%20DisarmSwap%20Bait.user.js
// @updateURL https://update.greasyfork.org/scripts/467434/MouseHunt%20Auto%20DisarmSwap%20Bait.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // LOCAL STORAGE KEYS & STATE
    // ==========================================
    const STORAGE_KEYS = {
        TARGET_QTY: 'mh_auto_bait_target_qty',
        MODE: 'mh_auto_bait_mode', // 'disarm' or 'swap'
        SELECTED_BAIT_ID: 'mh_auto_selected_bait_id',
        SELECTED_BAIT_NAME: 'mh_auto_selected_bait_name',
        IS_MINIMIZED: 'mh_auto_is_minimized'
    };

    let state = {
        targetQuantity: parseTargetQty(localStorage.getItem(STORAGE_KEYS.TARGET_QTY)),
        isDisarmMode: localStorage.getItem(STORAGE_KEYS.MODE) !== 'swap',
        selectedBaitID: parseInt(localStorage.getItem(STORAGE_KEYS.SELECTED_BAIT_ID), 10) || null,
        selectedBaitName: localStorage.getItem(STORAGE_KEYS.SELECTED_BAIT_NAME) || '',
        isMinimized: localStorage.getItem(STORAGE_KEYS.IS_MINIMIZED) === 'true',
        lastActionTime: 0,
        actionPending: false,
        warning: '',
        allCheeses: [] // Array of { id, name, qty }
    };

    function parseTargetQty(val) {
        if (val === null || val === undefined || val === 'N/A') return null;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? null : parsed;
    }

    // ==========================================
    // GAME READERS
    // ==========================================
    function getGameUser() {
        return window.user || null;
    }

    function getCurrentBaitQuantity() {
        const u = getGameUser();
        if (u && typeof u.bait_quantity !== 'undefined') {
            return parseInt(u.bait_quantity, 10) || 0;
        }
        const hudEl = document.querySelector('.campPage-trap-baitQuantity');
        return hudEl ? parseInt(hudEl.innerText.replace(/,/g, ''), 10) || 0 : 0;
    }

    function getCurrentBaitName() {
        const u = getGameUser();
        if (u && u.bait_name) {
            return u.bait_name;
        }
        const nameEl = document.querySelector('.campPage-trap-baitName');
        return nameEl ? nameEl.innerText.trim() : 'Bait';
    }

    function getCurrentBaitID() {
        const u = getGameUser();
        return u ? parseInt(u.bait_item_id, 10) || null : null;
    }

    // ==========================================
    // TRAP ACTIONS
    // ==========================================
    // Resolves true only when the game confirms the trap change.
    function runTrapChange(chain) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), 15000);
            try {
                chain.go(() => { clearTimeout(timer); resolve(true); },
                         () => { clearTimeout(timer); resolve(false); });
            } catch (e) {
                clearTimeout(timer);
                resolve(false);
            }
        });
    }

    function disarmBait() {
        const tc = window.hg?.utils?.TrapControl;
        if (!tc?.disarmBait) return Promise.resolve(false);
        return runTrapChange(tc.disarmBait());
    }

    function armBait(baitID) {
        const tc = window.hg?.utils?.TrapControl;
        if (!tc?.armItem || !baitID) return Promise.resolve(false);
        return runTrapChange(tc.armItem(baitID, 'bait'));
    }

    function resetTargetAfterAction() {
        state.targetQuantity = null;
        localStorage.setItem(STORAGE_KEYS.TARGET_QTY, 'N/A');
        updateUI();
    }

    // ==========================================
    // CORE LOGIC & AUTO CHECKER
    // ==========================================
    function setWarning(text) {
        if (state.warning === text) return;
        state.warning = text;
        updateUI();
    }

    async function evaluateBaitCondition() {
        const now = Date.now();
        if (state.actionPending) return;
        if (now - state.lastActionTime < 4000) return; // Cooldown guard
        if (state.targetQuantity === null) { setWarning(''); return; }

        const u = getGameUser();
        if (!u) return;
        if (u.has_puzzle) { setWarning("Waiting: King's Reward"); return; }
        // Don't change the trap while the Cerulean Skyport Autopilot is mid-action.
        try { if (window.mhSkyport?.busy?.()) return; } catch (e) { /* ignore */ }

        const currentQty = getCurrentBaitQuantity();
        const currentID = getCurrentBaitID();
        const targetBaitID = state.selectedBaitID;

        if (!state.isDisarmMode && !targetBaitID) { setWarning('Pick a cheese to swap to'); return; }

        const isSameCheeseSelected = !state.isDisarmMode && targetBaitID === currentID;
        if (isSameCheeseSelected) {
            console.log('[MH Auto-Bait] Target cheese is already equipped. Resetting target.');
            setWarning('');
            resetTargetAfterAction();
            return;
        }
        if (currentQty > state.targetQuantity) { setWarning(''); return; }

        state.actionPending = true;
        state.lastActionTime = now;
        try {
            let ok;
            if (state.isDisarmMode) {
                console.log(`[MH Auto-Bait] Disarming! Qty: ${currentQty} <= Target: ${state.targetQuantity}`);
                ok = await disarmBait();
            } else {
                await loadFullCheeseList(); // fresh quantities before swapping
                const target = state.allCheeses.find(c => c.id === targetBaitID);
                const name = target ? target.name : (state.selectedBaitName || `bait ${targetBaitID}`);
                if (target && target.qty <= 0) {
                    setWarning(`Out of ${name}, not swapping`);
                    return;
                }
                console.log(`[MH Auto-Bait] Swapping to ${name}! Qty: ${currentQty} <= Target: ${state.targetQuantity}`);
                ok = await armBait(targetBaitID);
            }
            if (ok) {
                setWarning('');
                resetTargetAfterAction();
            } else {
                console.warn('[MH Auto-Bait] Trap change failed, will retry.');
                setWarning('Trap change failed, retrying…');
            }
        } finally {
            state.actionPending = false;
            state.lastActionTime = Date.now();
        }
    }

    // ==========================================
    // UI BUILDER & CUSTOM SEARCH DROPDOWN
    // ==========================================
    let panel, bodyWrapper, targetInput, warningEl, modeToggleBtn, searchInput, dropdownList, toggleMinBtn, equippedLabelEl, equippedQtyEl;

    function buildUI() {
        if (document.getElementById('mh-auto-bait-panel')) return;

        const style = document.createElement('style');
        style.textContent = `
            #mh-auto-bait-panel {
                position: fixed;
                top: 10px;
                left: 10px;
                z-index: 99999;
                background: rgba(18, 24, 38, 0.96);
                backdrop-filter: blur(8px);
                color: #e2e8f0;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 6px;
                padding: 6px 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 11px;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
                width: 185px;
                user-select: none;
            }
            .mh-ab-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 700;
                color: #f7fafc;
                padding-bottom: 4px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
            .mh-ab-min-btn {
                background: none;
                border: none;
                color: #a0aec0;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                padding: 0 4px;
                line-height: 1;
            }
            .mh-ab-min-btn:hover { color: #fff; }
            .mh-ab-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-top: 5px;
            }
            .mh-ab-equipped-block {
                margin-top: 5px;
                line-height: 1.3;
                word-break: break-word;
            }
            .mh-ab-btn {
                background: #2d3748;
                color: #edf2f7;
                border: 1px solid #4a5568;
                border-radius: 4px;
                padding: 3px 6px;
                cursor: pointer;
                font-size: 10px;
                width: 100%;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mh-ab-btn:hover { background: #4a5568; }
            .mh-ab-mode-disarm { background: #c53030 !important; border-color: #9b2c2c !important; color: #fff; font-weight: 600; }
            .mh-ab-mode-swap { background: #dd6b20 !important; border-color: #c05621 !important; color: #fff; font-weight: 600; }
            
            /* Custom Searchable Dropdown Container */
            .mh-ab-dropdown-container {
                position: relative;
                margin-top: 5px;
            }
            .mh-ab-search-input {
                width: 100%;
                background: #1a202c;
                color: #edf2f7;
                border: 1px solid #4a5568;
                border-radius: 4px;
                padding: 4px 6px;
                font-size: 10px;
                box-sizing: border-box;
                outline: none;
            }
            .mh-ab-search-input:focus { border-color: #63b3ed; }
            .mh-ab-dropdown-list {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: #1a202c;
                border: 1px solid #4a5568;
                border-radius: 4px;
                max-height: 130px;
                overflow-y: auto;
                z-index: 100000;
                display: none;
                margin-top: 2px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
            }
            .mh-ab-dropdown-item {
                padding: 4px 6px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                font-size: 10px;
                color: #cbd5e0;
            }
            .mh-ab-dropdown-item:hover {
                background: #3182ce;
                color: #fff;
            }
            .mh-ab-dropdown-item-qty {
                color: #63b3ed;
                font-weight: 600;
                margin-left: 4px;
            }
            .mh-ab-dropdown-item:hover .mh-ab-dropdown-item-qty {
                color: #ebf8ff;
            }
            .mh-ab-badge { color: #63b3ed; font-weight: 600; }
            .mh-ab-target-row { gap: 8px; }
            #mh-auto-bait-panel .mh-ab-target-row label {
                margin: 0;
                white-space: nowrap;
                color: #cbd5e0;
                font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                letter-spacing: 0.01em;
            }
            #mh-auto-bait-panel .mh-ab-target-input {
                width: 78px;
                box-sizing: border-box;
                background: #1a202c;
                color: #edf2f7;
                border: 1px solid #4a5568;
                border-radius: 4px;
                padding: 4px 4px 4px 8px;
                font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                text-align: left;
                outline: none;
                color-scheme: dark;
            }
            #mh-auto-bait-panel .mh-ab-target-input::placeholder { color: #718096; font-weight: 400; }
            .mh-ab-target-input:focus { border-color: #63b3ed; }
            .mh-ab-warning { margin-top: 5px; color: #f6ad55; font-size: 10px; }
            .mh-ab-warning:empty { display: none; }
            .mh-ab-tip {
                position: absolute;
                left: 6px;
                right: 6px;
                z-index: 100001;
                display: none;
                pointer-events: none;
                background: #0d1117;
                color: #e2e8f0;
                border: 1px solid #4a5568;
                border-radius: 5px;
                padding: 5px 7px;
                font-size: 10px;
                line-height: 1.4;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
            }
        `;
        document.head.appendChild(style);

        panel = document.createElement('div');
        panel.id = 'mh-auto-bait-panel';

        panel.innerHTML = `
            <div class="mh-ab-header">
                <span>🧀 Auto Bait</span>
                <button id="mh-ab-min-toggle" class="mh-ab-min-btn" aria-label="Minimize/Expand">${state.isMinimized ? '+' : '−'}</button>
            </div>
            <div id="mh-ab-body" style="display: ${state.isMinimized ? 'none' : 'block'};">
                <div class="mh-ab-equipped-block">
                    <span id="mh-ab-equipped-label">Equipped Bait Qty:</span>
                    <span id="mh-ab-current-qty" class="mh-ab-badge">0</span>
                </div>
                <div class="mh-ab-row mh-ab-target-row" data-tip="Act when the equipped bait drops to this quantity or below. Leave empty to turn off.">
                    <label for="mh-ab-target-input">Target Qty:</label>
                    <input type="number" id="mh-ab-target-input" class="mh-ab-target-input" min="0" step="1" placeholder="off" />
                </div>
                <div class="mh-ab-row">
                    <button id="mh-ab-mode-btn" class="mh-ab-btn mh-ab-mode-disarm" data-tip="Click to switch. Disarm: take the bait off at the target. Swap Bait: switch to the cheese you pick below.">Mode: Disarm</button>
                </div>
                <div id="mh-ab-swap-container" class="mh-ab-dropdown-container" style="display: none;">
                    <input type="text" id="mh-ab-search-input" class="mh-ab-search-input" placeholder="🔍 Search cheese..." autocomplete="off" />
                    <div id="mh-ab-dropdown-list" class="mh-ab-dropdown-list"></div>
                </div>
                <div id="mh-ab-warning" class="mh-ab-warning"></div>
            </div>
        `;

        document.body.appendChild(panel);
        initTooltips();

        bodyWrapper = panel.querySelector('#mh-ab-body');
        toggleMinBtn = panel.querySelector('#mh-ab-min-toggle');
        targetInput = panel.querySelector('#mh-ab-target-input');
        warningEl = panel.querySelector('#mh-ab-warning');
        modeToggleBtn = panel.querySelector('#mh-ab-mode-btn');
        searchInput = panel.querySelector('#mh-ab-search-input');
        dropdownList = panel.querySelector('#mh-ab-dropdown-list');
        equippedLabelEl = panel.querySelector('#mh-ab-equipped-label');
        equippedQtyEl = panel.querySelector('#mh-ab-current-qty');

        // Events
        toggleMinBtn.addEventListener('click', toggleMinimize);
        targetInput.addEventListener('change', onTargetChange);
        modeToggleBtn.addEventListener('click', toggleMode);

        // Search Input Focus & Filtering
        searchInput.addEventListener('focus', () => {
            renderDropdownOptions('');
            loadFullCheeseList().then(() => { if (document.activeElement === searchInput) renderDropdownOptions(searchInput.value); });
        });
        searchInput.addEventListener('input', (e) => renderDropdownOptions(e.target.value));

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target)) {
                dropdownList.style.display = 'none';
            }
        });

        loadFullCheeseList();
        updateUI();
    }

    // Hover tooltips for [data-tip] elements, drawn inside the panel: below the element if it fits,
    // else above, else pinned inside the panel's bottom edge.
    function initTooltips() {
        const tip = document.createElement('div');
        tip.className = 'mh-ab-tip';
        panel.appendChild(tip);
        let timer = null;
        const hide = () => { clearTimeout(timer); tip.style.display = 'none'; };
        panel.addEventListener('mouseover', (e) => {
            const el = e.target.closest('[data-tip]');
            if (!el || el.contains(e.relatedTarget)) return;
            hide();
            timer = setTimeout(() => {
                tip.textContent = el.dataset.tip;
                tip.style.display = 'block';
                const p = panel.getBoundingClientRect();
                const r = el.getBoundingClientRect();
                const h = tip.offsetHeight;
                const below = r.bottom - p.top + 4;
                const above = r.top - p.top - h - 4;
                tip.style.top = `${below + h <= p.height - 4 ? below : above >= 4 ? above : Math.max(4, p.height - h - 4)}px`;
            }, 350);
        });
        panel.addEventListener('mouseout', (e) => {
            const el = e.target.closest('[data-tip]');
            if (el && !el.contains(e.relatedTarget)) hide();
        });
        panel.addEventListener('mousedown', hide);
    }

    function toggleMinimize() {
        state.isMinimized = !state.isMinimized;
        localStorage.setItem(STORAGE_KEYS.IS_MINIMIZED, state.isMinimized.toString());
        bodyWrapper.style.display = state.isMinimized ? 'none' : 'block';
        toggleMinBtn.textContent = state.isMinimized ? '+' : '−';
    }

    function onTargetChange() {
        const raw = targetInput.value.trim();
        const parsed = parseInt(raw, 10);
        if (raw === '' || isNaN(parsed) || parsed < 0) {
            state.targetQuantity = null;
            localStorage.setItem(STORAGE_KEYS.TARGET_QTY, 'N/A');
        } else {
            state.targetQuantity = parsed;
            localStorage.setItem(STORAGE_KEYS.TARGET_QTY, parsed.toString());
        }
        updateUI();
        evaluateBaitCondition();
    }

    function toggleMode() {
        state.isDisarmMode = !state.isDisarmMode;
        localStorage.setItem(STORAGE_KEYS.MODE, state.isDisarmMode ? 'disarm' : 'swap');
        updateUI();
    }

    // Loads ALL owned cheeses via MouseHunt's gettrapcomponents API. Resolves when done (or failed).
    function loadFullCheeseList() {
        const toCheese = (c) => ({ id: parseInt(c.item_id, 10), name: c.name, qty: parseInt(c.quantity, 10) || 0 });
        const byName = (a, b) => a.name.localeCompare(b.name);
        return new Promise((resolve) => {
            if (!window.jQuery) return resolve();
            jQuery.getJSON('/managers/ajax/users/gettrapcomponents.php', (res) => {
                if (res && res.components) {
                    state.allCheeses = res.components.filter(c => c.classification === 'bait').map(toCheese).sort(byName);
                    if (document.activeElement !== searchInput) updateSelectedBaitInputLabel();
                }
                resolve();
            }).fail(() => {
                if (window.hg?.utils?.TrapControl?.getBaitOptions) {
                    state.allCheeses = window.hg.utils.TrapControl.getBaitOptions().map(toCheese).sort(byName);
                    if (document.activeElement !== searchInput) updateSelectedBaitInputLabel();
                }
                resolve();
            });
        });
    }

    function updateSelectedBaitInputLabel() {
        if (!searchInput) return;
        if (state.selectedBaitID) {
            const found = state.allCheeses.find(c => c.id === state.selectedBaitID);
            if (found) {
                searchInput.value = `${found.name} (${found.qty})`;
                return;
            }
            if (state.selectedBaitName) {
                searchInput.value = state.selectedBaitName; // list not loaded (yet)
                return;
            }
        }
        searchInput.value = '';
    }

    function renderDropdownOptions(filterQuery = '') {
        if (!dropdownList) return;

        const q = filterQuery.toLowerCase().trim();
        const filtered = state.allCheeses.filter(c => c.name.toLowerCase().includes(q));

        dropdownList.innerHTML = '';
        dropdownList.style.display = 'block';

        if (filtered.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'mh-ab-dropdown-item';
            emptyEl.textContent = 'No cheese found';
            dropdownList.appendChild(emptyEl);
            return;
        }

        filtered.forEach(c => {
            const itemEl = document.createElement('div');
            itemEl.className = 'mh-ab-dropdown-item';
            const nameEl = document.createElement('span');
            nameEl.textContent = c.name;
            const qtyEl = document.createElement('span');
            qtyEl.className = 'mh-ab-dropdown-item-qty';
            qtyEl.textContent = `(${c.qty})`;
            itemEl.append(nameEl, qtyEl);

            itemEl.addEventListener('click', () => {
                state.selectedBaitID = c.id;
                state.selectedBaitName = c.name;
                localStorage.setItem(STORAGE_KEYS.SELECTED_BAIT_ID, c.id);
                localStorage.setItem(STORAGE_KEYS.SELECTED_BAIT_NAME, c.name);

                searchInput.value = `${c.name} (${c.qty})`;
                dropdownList.style.display = 'none';
                evaluateBaitCondition();
            });

            dropdownList.appendChild(itemEl);
        });
    }

    function updateUI() {
        if (!panel) return;

        const swapContainer = panel.querySelector('#mh-ab-swap-container');
        const currentQty = getCurrentBaitQuantity();
        const currentBaitName = getCurrentBaitName();

        if (equippedLabelEl) {
            equippedLabelEl.textContent = `Equipped ${currentBaitName} Qty:`;
        }
        if (equippedQtyEl) {
            equippedQtyEl.textContent = currentQty.toLocaleString();
        }

        if (document.activeElement !== targetInput) {
            targetInput.value = state.targetQuantity === null ? '' : state.targetQuantity;
        }
        warningEl.textContent = state.warning;

        if (state.isDisarmMode) {
            modeToggleBtn.textContent = 'Mode: Disarm';
            modeToggleBtn.className = 'mh-ab-btn mh-ab-mode-disarm';
            swapContainer.style.display = 'none';
        } else {
            modeToggleBtn.textContent = 'Mode: Swap Bait';
            modeToggleBtn.className = 'mh-ab-btn mh-ab-mode-swap';
            swapContainer.style.display = 'block';
            if (document.activeElement !== searchInput) updateSelectedBaitInputLabel();
        }
    }

    // ==========================================
    // REACTION LISTENERS
    // ==========================================
    function setupListeners() {
        if (window.jQuery) {
            jQuery(document).ajaxComplete((event, xhr, settings) => {
                if (settings?.url && (settings.url.includes('turn.php') || settings.url.includes('changetrap.php'))) {
                    setTimeout(() => {
                        updateUI();
                        evaluateBaitCondition();
                    }, 500);
                }
            });
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                updateUI();
                evaluateBaitCondition();
            }
        });

        setInterval(() => {
            updateUI();
            evaluateBaitCondition();
        }, 10000);
    }

    function init() {
        buildUI();
        setupListeners();
        evaluateBaitCondition();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 1000);
    } else {
        window.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000));
    }
})();