// ==UserScript==
// @name         MouseHunt Cerulean Skyport Autopilot (Kane)
// @namespace    https://greasyfork.org/en/users/979741
// @version      1.0.6
// @description  Runs Cerulean Skyport for you: launches airship shipments, swaps bait, crafts Sky Pirate Swiss and Aurora Bocconcini, picks your weapon, base and luck charms, and starts raids. Starts paused so you can check its plan first. Pairs with MouseHunt Auto Horn & KR Solver (Kane).
// @author       Kane
// @license      MIT
// @match        https://www.mousehuntgame.com/*
// @match        https://mousehuntgame.com/*
// @icon         https://www.mousehuntgame.com/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * Selectors and data fields below were verified against the live game (Oct 2026):
 *   - user.quests.QuestCeruleanSkyport: is_shipping, is_intercepting, current_shipment ([] when docked,
 *     else { type, hunts_remaining, location, ... }), shipments[] { type, cost[], can_ship }, items{}.
 *   - hg.utils.TrapControl.armItem(itemType, 'bait') / disarmBait() return the chain; go(success, error).
 *   - HUD: .headsUpDisplayCeruleanSkyportView with child views ceruleanSkyportPrepView (docked),
 *     ceruleanSkyportShippingView (in flight) and the raid view (intercepting).
 *   - Shipment dialog: #overlayPopup.ceruleanSkyportShipmentChoiceDialogPopup. Its handlers read e.target,
 *     so we click the exact card / bait container elements, never their children.
 *   - Craft dialog: in-HUD .upsellItemActionView.sky_pirate_cheese; the quantity input is the craft count.
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */
  const SCRIPT = 'Skyport Autopilot';
  const STORE_KEY = 'mhCeruleanSkyport.config.v1';
  const PANEL_ID = 'mhcs-panel';

  const MIN_SWISS = 30;              // pre-flight Sky Pirate Swiss requirement
  const INTEL_CAP = 50;              // skip any shipment whose location's raid intel is already >= this (raid cost)
  const COOLDOWN_MS = 4000;          // debounce between actions
  const QUICK_COOLDOWN_MS = 1000;    // after trap changes and raid start (they wait for the game's reply)
  const PENDING_MAX_MS = 20000;      // longest a chain of steps holds the horn
  const QUICK_KINDS = new Set(['weapon', 'base', 'luck', 'bait', 'fuel', 'raid', 'raidStart']);
  const HEARTBEAT_MS = 6000;         // periodic re-evaluation
  const FAIL_BACKOFF_MS = 60000;     // pause an action type after it fails
  const CRAFT_STALE_MS = 5 * 60000;  // don't re-craft while inventory looks unchanged
  const RAID_MIN_BOCCONCINI = 25;    // only start a raid with at least this much Bocconcini (raid = 25 hunts)
  const CHARM_MIN_QTY = 300;         // default for cfg.charmMinQty
  const BOCC_SPICE_PER_CRAFT = 8;    // Bocconcini: 8 Spice + 1 Essence -> 2, or 8 Spice + 5,000 Gold -> 1
  const BOCC_GOLD_PER_CRAFT = 5000;
  const LOG_MAX = 20;                // log lines kept
  const LOG_KEY = 'mhCeruleanSkyport.log.v1';   // kept across page refreshes
  const FALLBACK_LUCK = 100;         // luck target when minluck can't be worked out

  // Mouse power and effectiveness (% per power type, POWER_TYPES order) for Cerulean Skyport and its raid
  // locations. Copied from the "MH - Minluck & CRE tool" data (Chromatical, tsitu, selianth's minluck
  // spreadsheet and contributors). Re-copy from that tool if MouseHunt rebalances these mice.
  const POWER_TYPES = ['Arcane', 'Draconic', 'Forgotten', 'Hydro', 'Physical', 'Shadow', 'Tactical', 'Law', 'Rift'];
  const MICE = {
    "Port Pillager": [6700, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Amateur Knife Juggler": [6000, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Treacherous Dock Lurker": [5000, [0, 0, 0, 0, 0, 0, 0, 400, 0]],
    "Stubby Scrap Scavenger": [8500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Sly Skulking Scrapper": [7500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Hefty Hulking Hauler": [9000, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Quarrelsome Quartermaster": [6000, [0, 0, 0, 0, 0, 0, 0, 250, 0]],
    "Cluttergrin the Commodore of Curiosities": [20000, [0, 0, 0, 0, 0, 0, 0, 250, 0]],
    "Careless Canister Rider": [9500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Covetous Canister Thief": [8500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Colossal Canister Collector": [10000, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Slipstream the Virtuoso of Vapours": [25000, [0, 0, 0, 0, 0, 0, 0, 300, 0]],
    "Swift Stone Snatcher": [10500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Greedy Stone Grappler": [9500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Boulder and Pebble": [11000, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Craggerclaw the Magnate of Minerals": [27500, [0, 0, 0, 0, 0, 0, 0, 250, 0]],
    "Arrogant Aurora Connoisseur": [12500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Acrobatic Aurora Bandit": [10500, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Audacious Aurora Embezzler": [13000, [0, 0, 0, 0, 0, 0, 0, 100, 0]],
    "Shimmerdread the Sovereign of Spice": [32000, [0, 0, 0, 0, 0, 0, 0, 250, 0]],
    "Alchemist": [1930, [0, 0, 0, 175, 100, 0, 100, 0, 0]],
    "Scout": [1750, [0, 0, 0, 175, 100, 0, 100, 0, 0]],
    "Healer": [3650, [0, 0, 0, 100, 175, 0, 100, 0, 0]],
    "Trailblazer": [2500, [0, 0, 0, 100, 175, 0, 100, 0, 0]],
    "Caretaker": [1600, [0, 0, 0, 100, 100, 0, 175, 0, 0]],
    "Narrator": [1330, [0, 0, 0, 100, 100, 0, 175, 0, 0]],
    "Taleweaver": [1600, [0, 0, 0, 175, 100, 0, 100, 0, 0]],
    "Wordsmith": [3000, [0, 0, 0, 100, 175, 0, 100, 0, 0]],
    "Pathfinder": [1500, [0, 0, 0, 100, 100, 0, 175, 0, 0]],
    "Desert Archer": [4398, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Desert Soldier": [4900, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Vanguard": [4100, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Flame Archer": [5200, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Flame Warrior": [5700, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Sentinel": [4800, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Crimson Ranger": [5999, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Crimson Titan": [6799, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Crimson Watch": [5600, [0, 0, 0, 75, 100, 0, 75, 0, 0]],
    "Shroom": [7000, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Calalilly": [6000, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Camoflower": [9000, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Strawberry Hotcakes": [4500, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Bark": [5000, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Thistle": [4000, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Fungal Spore": [11499, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Twisted Lilly": [9499, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Camofusion": [14500, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Twisted Hotcakes": [7501, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Barkshell": [8000, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Thorn": [6000, [0, 0, 0, 100, 0, 0, 0, 0, 0]],
    "Meteorite Snacker": [1325, [50, 0, 0, 0, 0, 50, 0, 200, 0]],
    "Mining Materials Manager": [1650, [50, 0, 0, 0, 0, 50, 0, 200, 0]],
    "Hardworking Hauler": [1400, [50, 0, 0, 0, 0, 50, 0, 200, 0]],
    "Meteorite Miner": [2550, [50, 0, 0, 0, 0, 50, 0, 200, 0]],
    "Mischievous Meteorite Miner": [1950, [50, 0, 0, 0, 0, 50, 0, 200, 0]],
    "Night Shift Materials Manager": [5500, [100, 0, 0, 0, 0, 150, 0, 0, 0]],
    "Werehauler": [5500, [100, 0, 0, 0, 0, 150, 0, 0, 0]],
    "Wealthy Werewarrior": [6142.5, [100, 0, 0, 0, 0, 150, 0, 0, 0]],
    "Mischievous Wereminer": [6825, [100, 0, 0, 0, 0, 150, 0, 0, 0]],
    "Alpha Weremouse": [6825, [100, 0, 0, 0, 0, 150, 0, 0, 0]],
    "Reveling Lycanthrope": [7637.5, [100, 0, 0, 0, 0, 150, 0, 0, 0]],
    "Wereminer": [9425, [100, 0, 0, 0, 0, 150, 0, 0, 0]],
    "Fuzzy Drake": [3175, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Cork Defender": [4550, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Burly Bruiser": [6300, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Steam Sailor": [5365, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Warming Wyvern": [7350, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Mild Spicekin": [5725, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Smoldersnap": [7820, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Sizzle Pup": [5725, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Corky the Collector": [2595, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Horned Cork Hoarder": [8565, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Vaporior": [10000, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Ignatia": [9400, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Cinderstorm": [9410, [0, 100, 0, 0, 0, 0, 0, 0, 0]],
    "Summoning Scholar": [7900, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Sanguinarian": [13601, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Mystic Guardian": [40602, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "RR-8": [7900, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Ash Golem": [13601, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Tech Golem": [40602, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Drudge": [7900, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Masked Pikeman": [13601, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Solemn Soldier": [40602, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Ethereal Guardian": [10851, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Exo-Tech": [10851, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Battle Cleric": [10851, [100, 0, 300, 0, 0, 0, 0, 0, 0]],
    "Nightshade Maiden": [1600, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Spore Salesman": [2200, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Nightshade Flower Girl": [2800, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Breeze Borrower": [3500, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Windy Farmer": [2400, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Cloud Collector": [2400, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Rainwater Purifier": [3500, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Homeopathic Apothecary": [1300, [100, 100, 0, 0, 0, 100, 0, 0, 0]],
    "Wind Watcher": [4100, [150, 50, 0, 0, 0, 100, 0, 0, 0]],
    "Charming Chimer": [5100, [150, 50, 0, 0, 0, 100, 0, 0, 0]],
    "Fluttering Flutist": [8000, [150, 50, 0, 0, 0, 100, 0, 0, 0]],
    "Cycloness": [10800, [150, 50, 0, 0, 0, 100, 0, 0, 0]],
    "Wind Warrior": [21200, [150, 50, 0, 0, 0, 100, 0, 0, 0]],
    "Suave Pirate": [18510, [100, 100, 100, 100, 100, 100, 100, 100, 0]],
    "Cutthroat Pirate": [24375, [100, 100, 100, 100, 100, 100, 100, 100, 0]],
    "Cutthroat Cannoneer": [32604, [100, 100, 100, 100, 100, 100, 100, 100, 0]],
    "Scarlet Revenger": [114000, [300, 300, 300, 300, 300, 300, 300, 300, 0]],
    "Mairitime Pirate": [137485, [300, 300, 300, 300, 300, 300, 300, 300, 0]],
    "Hans Cheesetian Squeakersen": [8000, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Brothers Grimmaus": [9000, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Madame d'Ormouse": [8500, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Humphrey Dumphrey": [9500, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Little Bo Squeak": [10000, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Little Miss Fluffet": [9000, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Princess and the Olive": [9800, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Pinkielina": [11000, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Fibbocchio": [12000, [0, 0, 100, 0, 0, 0, 0, 0, 0]],
    "Captain Crook": [38500, [250, 250, 250, 250, 250, 250, 250, 250, 0]],
  };

  const ITEMS = {
    debris: 'dirigible_debris_stat_item',
    gas: 'atmospherium_gas_stat_item',
    cloudstone: 'unrefined_cloudstone_stat_item',
    ingot: 'cerulean_chrome_ingot_stat_item',
    spice: 'aurora_spice_stat_item',
    swiss: 'sky_pirate_cheese',
    curd: 'sky_pirate_cheese_curd_crafting_item',
    essence: 'magic_essence_craft_item',
    gouda: 'gouda_cheese',
    superbrie: 'super_brie_cheese',
    bocconcini: 'aurora_bocconcini_cheese',
    romano: 'sky_raider_romano_cheese',
    cannonball: 'raidbuster_cannonball_stat_item',
  };

  const IMG = 'https://www.mousehuntgame.com/images/items/';
  const RESOURCE_GROUPS = [
    ['Shipments', [
      ['debris', 'Debris', 'stats/large/2da4fbd553a07360972f89c4c80bd948.png'],
      ['gas', 'Gas', 'stats/large/fda69ba755cf84f99cd5136791377d88.png'],
      ['cloudstone', 'Cloudstone', 'stats/large/2bbc32752360ae74758c04fa0a618dc0.png'],
      ['ingot', 'Ingot', 'stats/large/4e676496af3a55f7da207a1f6a52d633.png'],
      ['cannonball', 'Cannonball', 'stats/830132ee1e485b530d50f2632191ecb8.gif'],
    ]],
    ['Cheese', [
      ['swiss', 'Swiss', 'bait/980f6d461473de11fb9595555417a896.jpg'],
      ['bocconcini', 'Bocconcini', 'bait/000c8867d69ba7e2ee0fc781b6945615.jpg'],
      ['romano', 'Romano', 'bait/f1721874903c83aebf073f65419c782a.gif'],
      ['gouda', 'Gouda', 'bait/e27d9a7cae531047358a6eccbd729406.jpg'],
      ['superbrie', 'SUPER|brie+', 'bait/ec38729241e103fe744a9ed03409fbd6.jpg'],
    ]],
    ['Crafting · Base', [
      ['curd', 'Curd', 'crafting_items/large/2ffb98531ba5146c1480e1f5939b4578.png'],
      ['spice', 'Spice', 'stats/large/c5bb867c74f9612203085727dea90a23.png'],
      ['essence', 'Essence', 'crafting_items/large/1a5559b59d141e76dec3fe4b8780e5e3.png'],
      ['toothlet', 'Toothlets', 'stats/dacc5e72286eb1d735cd00e38997512a.gif'],
    ]],
  ];

  const BAITS = {
    swiss: { type: 'sky_pirate_cheese', label: 'Sky Pirate Swiss', re: /sky\s*pirate\s*swiss/i },
    bocconcini: { type: 'aurora_bocconcini_cheese', label: 'Aurora Bocconcini', re: /bocconcini/i },
    romano: { type: 'sky_raider_romano_cheese', label: 'Sky Raider Romano', re: /romano/i },
    gouda: { type: 'gouda_cheese', label: 'Gouda', re: /^gouda/i },
    superbrie: { type: 'super_brie_cheese', label: 'SUPER|brie+', re: /^super\|brie\+/i },
  };

  // Priority order: Spice > Cloudstone > Gas. `cost` is a fallback; live cost from quest data wins.
  const SHIPMENTS = [
    { type: 'spice_shipment', label: 'Aurora Spice Shipment', costKey: 'cloudstone', cost: 40, reserveKey: 'minCloudstone' },
    { type: 'cloudstone_shipment', label: 'Unrefined Cloudstone Shipment', costKey: 'gas', cost: 30, reserveKey: 'minGas' },
    { type: 'gas_shipment', label: 'Atmospherium Gas Shipment', costKey: 'debris', cost: 20, reserveKey: 'minDebris' },
  ];

  const SEL = {
    hud: '.headsUpDisplayCeruleanSkyportView',
    prepView: '.ceruleanSkyportPrepView',
    shippingView: '.ceruleanSkyportShippingView',
    huntsRemaining: '.ceruleanSkyportShippingView__huntsRemaining',
    hudShipButton: (type) => `button.ceruleanSkyportPrepView__shipmentButton[data-type="${type}"]`,
    hudCraftButton: 'button.headsUpDisplayCeruleanSkyportView__baitBuyButton[data-recipe="sky_pirate_recipe"]',
    hudBoccCraftButton: 'button.headsUpDisplayCeruleanSkyportView__baitBuyButton[data-recipe="aurora_bocconcini_recipe"]',
    hudRaidButton: 'button.headsUpDisplayCeruleanSkyportView__startRaidButton',
    hudFuelToggle: '.headsUpDisplayCeruleanSkyportView__fuelToggleButton',
    raidView: '.ceruleanSkyportRaidView',
    raidHuntsRemaining: '.ceruleanSkyportRaidView__raidHuntsRemaining',
    hudDialog: '.headsUpDisplayCeruleanSkyportView__dialogContainer.active',
    hudDialogClose: 'button.headsUpDisplayCeruleanSkyportView__dialogCloseButton',
    craftView: '.upsellItemActionView.sky_pirate_cheese',
    boccCraftView: '.upsellItemActionView.aurora_bocconcini_cheese',
    craftRecipe: '.upsellItemActionView-recipe',
    craftQty: 'input.upsellItemActionView-action-quantity',
    craftMax: '.upsellItemActionView-action-max',
    craftBtn: 'a.upsellItemActionView-action-button',
    shipDialog: '#overlayPopup.ceruleanSkyportShipmentChoiceDialogPopup',
    shipCard: (type) => `.ceruleanSkyportShipmentChoiceDialogView__shipment[data-shipment-type="${type}"]`,
    shipCardSelected: 'ceruleanSkyportShipmentChoiceDialogView__shipment--selected',
    shipBait: (type) => `div.ceruleanSkyportShipmentChoiceDialogView__baitContainer[data-item-type="${type}"]`,
    shipBaitSelected: 'ceruleanSkyportShipmentChoiceDialogView__baitContainer--selected',
    shipDisarmCheckbox: 'input.ceruleanSkyportShipmentChoiceDialogView__baitDisarmCheckbox',
    shipEnter: '.ceruleanSkyportShipmentChoiceDialogView__enterButton',
    shipCancel: '.ceruleanSkyportShipmentChoiceDialogView__closeButton',
    raidDialog: '#overlayPopup .ceruleanSkyportRaidChoiceDialogView',
    raidSelect: (type) => `.ceruleanSkyportRaidChoiceDialogView__selectRaidButton[data-type="${type}"]`,
    raidBait: (type) => `div.ceruleanSkyportRaidChoiceDialogView__baitContainer[data-item-type="${type}"]`,
    raidBaitSelected: 'ceruleanSkyportRaidChoiceDialogView__baitContainer--selected',
    raidDisarmCheckbox: 'input.ceruleanSkyportRaidChoiceDialogView__baitDisarmCheckbox',
    raidEnter: '.ceruleanSkyportRaidChoiceDialogView__enterButton',
    raidCancel: '.ceruleanSkyportRaidChoiceDialogView__cancelButton',
    // "MH - Minluck & CRE tool" userscript
    minluckButton: '.min-luck-button',
    minluckList: '#minluck-list',
    minluckOverall: '#minluck-list .chro-minluck-overall-minluck',
    minluckLuck: '#minluck-list .luck-info',
    minluckClose: '#minluck-list #close-button',
  };

  const DEFAULTS = {
    autoLaunch: true,
    autoBait: true,
    autoCraft: true,
    spiceMode: 'bocconcini_spice', // 'swiss' | 'romano' | 'bocconcini' | 'bocconcini_spice' (Spice shipments only)
    boccMin: 0,               // Bocconcini modes: keep at least this many (0 = no minimum)
    dockedAction: 'gouda',    // 'gouda' | 'superbrie' | 'disarm' | 'none'
    minDebris: 60,
    minGas: 90,
    minCloudstone: 120,
    autoRaid: true,           // start raids when intel >= 50 and Bocconcini >= 25
    craftEssence: true,       // craft with Magic Essence (Gold as fallback); off = Gold recipes only
    autoTrap: true,           // Auto Trap: the weapon for every stage (C.L.A.W. for curds, Law on shipments, raid types)
    luckCharmsRaid: true,     // pick luck charms during raids
    luckCharmsNormal: 'bocconcini', // luck charms during shipments: 'off' | 'bocconcini' (only while Bocconcini is armed) | 'always'
    charmMinQty: CHARM_MIN_QTY, // only luck charms held in quantities above this are used
    cannonRaid: true,         // RaidBuster Cannonballs on every raid hunt (+1 Ingot / intel per hunt) while any are left
    cannonShip: false,        // ... and on shipments, only above cannonKeep
    cannonKeep: 25,           // Cannonballs kept for raids (shipments only fire above this)
    dentureBase: 'off',       // Signature Series Denture Base: 'off' | 'raid' | 'ship' (raids + shipments) | 'always'
    toothletMin: 0,           // keep at least this many Toothlets (0 = use them all)
    basePrefer: 'charm',      // raids: 'charm' (charm first, Denture only if no charm is enough: saves Toothlets) | 'denture' (Denture first, saves charms)
    dryRun: true,            // Pause: log decisions without acting (click the Pause button to go live)
    minimized: false,
    showSettings: false,      // panel sections folded until opened
    showResources: false,
    showLog: false,
  };

  /* ------------------------------------------------------------------ *
   * Config & runtime state
   * ------------------------------------------------------------------ */
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      if ('autoWeapon' in saved && !('autoTrap' in saved)) saved.autoTrap = saved.autoWeapon;   // 1.0.3 test builds
      delete saved.autoWeapon;
      const c = Object.assign({}, DEFAULTS, saved);
      if (typeof c.luckCharmsNormal === 'boolean') c.luckCharmsNormal = c.luckCharmsNormal ? 'always' : 'off';
      if (typeof c.cannonRaid === 'string') c.cannonRaid = c.cannonRaid !== 'off';   // 1.0.5: off / enough / always
      return c;
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveConfig() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) { /* storage unavailable */ }
  }

  const cfg = loadConfig();

  const rt = {
    busy: false,
    lastAction: 0,
    cooldown: COOLDOWN_MS,
    pending: false,   // an action just ran or is waiting out the cooldown: busy() stays on until a tick finds nothing to do
    pendingSince: 0,  // start of the current chain of steps (busy() gives up after PENDING_MAX_MS)
    chain: null,      // { lines } logged during the current chain, written as one entry when it ends
    backoff: {},        // kind -> timestamp until which that action is paused
    lastCraft: null,    // { which, before, at }
    tickTimer: null,
    status: { kind: 'idle', lead: 'Starting…', detail: '' },
    log: loadLog(),
  };

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $1 = (sel, root) => (root || document).querySelector(sel);

  function toNum(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'object') return toNum(v.quantity_unformatted != null ? v.quantity_unformatted : v.quantity);
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  async function waitFor(fn, timeout = 5000, interval = 200) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let r = null;
      try { r = fn(); } catch (e) { r = null; }
      if (r) return r;
      await sleep(interval);
    }
    return null;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, String(value));
    for (const type of ['input', 'change', 'keyup', 'blur']) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    }
  }

  function splitLog(entry) {
    const i = entry.indexOf('  ');
    const time = i < 0 ? '' : entry.slice(0, i).replace(/\s*[AP]M$/i, '');
    let msg = i < 0 ? entry : entry.slice(i + 2);
    const m = msg.match(/ ×(\d+)$/);
    if (m) msg = msg.slice(0, -m[0].length);
    return { time, msg, count: m ? Number(m[1]) : 1 };
  }

  function loadLog() {
    try { const l = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(l) ? l.slice(0, LOG_MAX) : []; }
    catch (e) { return []; }
  }

  // During a chain of steps (a raid start: base, weapon, charm, cannonballs…) lines are collected and written
  // as one entry when the chain ends: the event as the headline, the rest on a second line. Warnings and
  // errors are written at once.
  function log(msg, level) {
    if (rt.chain && level !== 'error' && !/^[✖⚠]/.test(msg)) {
      rt.chain.lines.push(msg);
      console.log(`[${SCRIPT}] ${msg}`);
      return;
    }
    writeLog(msg, level);
  }

  // "Weapon: X Trap (Forgotten, …)" → "X Trap": the second line keeps names only (charms keep their luck).
  const chainPart = (l) => l.replace(/^✔ /, '').replace(/^(Weapon|Base): (.*?)(?: \(.*\))?$/, '$2')
    .replace(/^(Raid|Shipment) luck: /, '');

  function flushChain() {
    const c = rt.chain;
    rt.chain = null;
    if (!c || !c.lines.length) return;
    if (c.lines.length === 1) { writeLog(c.lines[0]); return; }
    const i = c.lines.findIndex((l) => /^[⚔⚓✈]/.test(l));
    const head = i >= 0 ? c.lines[i] : c.lines[0];
    const rest = c.lines.filter((l, j) => j !== (i >= 0 ? i : 0)).map(chainPart);
    writeLog(`${head}\n${rest.join(' · ')}`);
  }

  // Entries are "HH:MM  message" (a second line after "\n"); the same message again folds into a count (×N).
  function writeLog(msg, level) {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const last = rt.log[0] ? splitLog(rt.log[0]) : null;
    if (last && last.msg === msg) rt.log[0] = `${t}  ${msg} ×${last.count + 1}`;
    else rt.log.unshift(`${t}  ${msg}`);
    if (rt.log.length > LOG_MAX) rt.log.length = LOG_MAX;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(rt.log)); } catch (e) { /* storage unavailable */ }
    (level === 'error' ? console.warn : console.log)(`[${SCRIPT}] ${msg}`);
    updateUI();
  }

  /* ------------------------------------------------------------------ *
   * Game state
   * ------------------------------------------------------------------ */
  function getQuest() {
    const u = window.user;
    if (!u) return null;
    const q = u.quests && u.quests.QuestCeruleanSkyport;
    if (q) return q;
    const e = u.enviroment_atts || u.environment_atts;
    if (e && ('is_shipping' in e || 'current_shipment' in e || 'shipments' in e)) return e;
    return null;
  }

  function currentBait() {
    const u = window.user || {};
    const id = Number(u.bait_item_id) || 0;
    const name = id > 0 ? String(u.bait_name || '') : '';
    return { id, name, armed: id > 0, qty: toNum(u.bait_quantity) };
  }

  function baitKeyOf(bait) {
    if (!bait.armed) return null;
    for (const k of Object.keys(BAITS)) if (BAITS[k].re.test(bait.name)) return k;
    return null;
  }

  function readState() {
    const q = getQuest();
    if (!q) return null;
    const items = q.items || {};
    const qty = (key) => toNum(items[key]);
    const cs = q.current_shipment && !Array.isArray(q.current_shipment) && typeof q.current_shipment === 'object'
      ? q.current_shipment : null;

    let isShipping = !!q.is_shipping;
    let hunts = cs ? toNum(cs.hunts_remaining) : 0;

    // The HUD re-renders from every AJAX response, so prefer it when it's on screen.
    const hud = $1(SEL.hud);
    if (hud) {
      if ($1(SEL.shippingView, hud)) {
        isShipping = true;
        const h = $1(SEL.huntsRemaining, hud);
        if (h && h.textContent.trim() !== '') hunts = toNum(h.textContent);
      } else if ($1(SEL.prepView, hud)) {
        isShipping = false;
      }
    }

    const shipType = cs ? cs.type || null : null;
    const shipDef = SHIPMENTS.find((x) => x.type === shipType);
    const bait = currentBait();
    const u = window.user || {};

    const shipments = {};
    for (const sh of Array.isArray(q.shipments) ? q.shipments : []) {
      if (!sh || !sh.type) continue;
      const c = Array.isArray(sh.cost) && sh.cost[0];
      const loc = sh.location || {};
      const intelType = loc.intel_item && loc.intel_item.type;
      shipments[sh.type] = {
        canShip: sh.can_ship !== false,
        cost: c ? toNum(c.quantity) : null,
        locationName: loc.name || null,
        intel: intelType && items[intelType] != null ? qty(intelType) : null,
      };
    }
    // Raid intel at the in-flight shipment's location (current_shipment's own location if it has one).
    const csIntel = cs && cs.location && cs.location.intel_item && cs.location.intel_item.type;
    const shipIntel = csIntel ? (items[csIntel] != null ? qty(csIntel) : null) : shipType && shipments[shipType] ? shipments[shipType].intel : null;

    let isIntercepting = !!q.is_intercepting;
    const cr = q.current_raid && !Array.isArray(q.current_raid) && typeof q.current_raid === 'object' ? q.current_raid : null;
    let raidHunts = cr ? toNum(cr.hunts_remaining) : 0;
    if (hud && $1(SEL.raidView, hud)) {
      isIntercepting = true;
      const h = $1(SEL.raidHuntsRemaining, hud);
      if (h && h.textContent.trim() !== '') raidHunts = toNum(h.textContent);
    }
    const raids = (Array.isArray(q.raids) ? q.raids : []).map((r) => {
      const c = (Array.isArray(r.cost) && r.cost[0]) || {};
      return {
        type: r.type,
        name: r.name,
        powerTypes: (r.power_types || []).map((pt) => pt.name),
        intel: toNum(c.user_quantity),
        cost: toNum(c.quantity) || INTEL_CAP,
        canIntercept: r.can_intercept,
      };
    });
    const raidDef = cr ? raids.find((r) => r.name === cr.name || r.type === cr.type) : null;

    const s = {
      isShipping,
      isIntercepting,
      raids,
      raid: isIntercepting ? { name: (cr && cr.name) || (raidDef && raidDef.name) || 'Raid', type: raidDef ? raidDef.type : (cr && cr.type) || null, powerTypes: raidDef ? raidDef.powerTypes : [], hunts: raidHunts } : null,
      shipType,
      shipIntel,
      shipName: cs ? (cs.name || (shipDef && shipDef.label) || shipType) : null,
      hunts,
      inFlight: isShipping && hunts > 0,
      debris: qty(ITEMS.debris),
      gas: qty(ITEMS.gas),
      cloudstone: qty(ITEMS.cloudstone),
      ingot: qty(ITEMS.ingot),
      spice: qty(ITEMS.spice),
      swiss: qty(ITEMS.swiss),
      curd: qty(ITEMS.curd),
      essence: qty(ITEMS.essence),
      gouda: qty(ITEMS.gouda),
      superbrie: qty(ITEMS.superbrie),
      bocconcini: qty(ITEMS.bocconcini),
      romano: qty(ITEMS.romano),
      cannonball: qty(ITEMS.cannonball),
      fuelOn: !!q.is_fuel_enabled,
      canFuel: q.can_enable_fuel !== false,
      gold: toNum(u.gold),
      bait,
      baitKey: baitKeyOf(bait),
      shipments,
      // What the decision can use on screen right now (it never queries the page itself).
      ui: {
        raidButton: !!$1(SEL.hudRaidButton),
        raidDialog: !!$1(SEL.raidDialog),
        shipDialog: !!$1(SEL.shipDialog),
        shipButtons: Object.fromEntries(SHIPMENTS.map((x) => [x.type, !!$1(SEL.hudShipButton(x.type))])),
        fuelToggle: !!$1(SEL.hudFuelToggle),
        craftButtons: { swiss: !!$1(SEL.hudCraftButton), bocconcini: !!$1(SEL.hudBoccCraftButton) },
      },
    };
    if (s.baitKey && s[s.baitKey] === 0 && bait.qty > 0) s[s.baitKey] = bait.qty;
    return s;
  }

  /* ------------------------------------------------------------------ *
   * Strategy
   * ------------------------------------------------------------------ */
  // #region decision
  // "What would I do now?": readState() and a context in, a decision out. Nothing in this region acts on
  // the game, writes storage or reads the page; tests extract the whole region (tests/decide.test.js).

  // Shipment bait options (cfg.spiceMode). `cheese`: the premium cheese (null = Swiss only); `spiceOnly`:
  // only on Aurora Spice shipments; `useMin`: Min Bocconcini to keep applies; `intelCap`: Swiss once the
  // shipment's location holds INTEL_CAP intel (Romano stays on: it also brings more trading loot).
  // `hint` is shown in the panel.
  const BAIT_MODES = {
    swiss: { cheese: null, hint: 'Swiss on every shipment.' },
    romano: { cheese: 'romano', hint: 'Romano on every shipment. Swiss once Romano runs out.' },
    bocconcini: { cheese: 'bocconcini', useMin: true, intelCap: true,
      hint: `Bocconcini on every shipment. Swiss once Bocconcini runs out, hits the minimum, or the location has ${INTEL_CAP} intel.` },
    bocconcini_spice: { cheese: 'bocconcini', spiceOnly: true, useMin: true, intelCap: true,
      hint: `Bocconcini on Spice, Swiss on the rest. Swiss once Bocconcini runs out, hits the minimum, or the location has ${INTEL_CAP} intel.` },
  };
  const baitMode = (c = cfg) => BAIT_MODES[c.spiceMode] || BAIT_MODES.swiss;

  // The shipment bait rule in one place: the premium cheese while you have it (above the minimum, where it
  // applies), otherwise Swiss on every shipment. Returns the cheese per shipment type, why the premium
  // cheese is not used (null | 'out' | 'min') and the matching log problems. `capped(type, intel)`: the
  // premium cheese would apply but the location already holds INTEL_CAP intel (intelCap modes), so Swiss.
  function shipmentBait(s, c = cfg) {
    const mode = baitMode(c);
    const cheese = mode.cheese;
    const min = mode.useMin ? Math.max(0, toNum(c.boccMin)) : 0;
    const fallback = !cheese ? null : s[cheese] <= 0 ? 'out' : s[cheese] <= min ? 'min' : null;
    const problems = {};
    if (fallback === 'out') {
      problems[`out:${cheese}`] = [`⚠ Out of ${BAITS[cheese].label}, using Swiss on every shipment`, `✔ ${BAITS[cheese].label} back in stock`];
    } else if (fallback === 'min') {
      problems['bocc:min'] = [`⚠ Bocconcini at minimum (${min}), using Swiss on every shipment`, '✔ Bocconcini above minimum again'];
    }
    const applies = (type) => !!cheese && !fallback && (!mode.spiceOnly || type === 'spice_shipment');
    const capped = (type, intel = null) => applies(type) && !!mode.intelCap && intel != null && intel >= INTEL_CAP;
    return {
      forShipment: (type, intel = null) => (applies(type) && !capped(type, intel) ? cheese : 'swiss'),
      capped,
      fallback,
      problems,
    };
  }

  function shipmentCost(sh, s) {
    const live = s.shipments[sh.type];
    return live && live.cost != null ? live.cost : sh.cost;
  }

  // Returns { sh, skipped } where `skipped` lists affordable shipments passed over because their
  // location already holds enough raid intel (more would be wasted).
  function pickShipment(s, c = cfg) {
    const known = Object.keys(s.shipments).length > 0;
    const passed = [];
    const skippedText = () => (passed.length ? `Skipped (intel ≥ ${INTEL_CAP}): ${passed.join(', ')}` : '');
    for (const sh of SHIPMENTS) {
      const live = s.shipments[sh.type];
      if (known && (!live || !live.canShip)) continue;
      if (s[sh.costKey] < toNum(c[sh.reserveKey]) + shipmentCost(sh, s)) continue;
      if (live && live.intel != null && live.intel >= INTEL_CAP) {
        passed.push(`${SHIP_SHORT[sh.type]} → ${live.locationName || 'location'} ${live.intel}`);
        continue;
      }
      return { sh, skipped: skippedText() };
    }
    return { sh: null, skipped: skippedText(), allCapped: passed.length > 0 };
  }

  // Recipe 2: 20 Curd + 1 Magic Essence -> 2 cheese. Recipe 1: 20 Curd + 2,000 Gold -> 1 cheese.
  // `times` is the craft count typed into the recipe's quantity input.
  function craftPlan(s, target, c = cfg) {
    const need = Math.max(0, target - s.swiss);
    if (need <= 0) return null;
    const curdBatches = Math.floor(s.curd / 20);
    const r2 = c.craftEssence ? Math.min(curdBatches, Math.floor(s.essence)) : 0;
    if (r2 > 0) return { recipe: 2, times: Math.min(r2, Math.ceil(need / 2)) };
    const r1 = Math.min(curdBatches, Math.floor(s.gold / 2000));
    if (r1 > 0) return { recipe: 1, times: Math.min(r1, need) };
    return null;
  }

  // Bocconcini. Recipe 2: 8 Spice + 1 Essence -> 2 cheese. Recipe 1: 8 Spice + 5,000 Gold -> 1 cheese.
  function boccCraftPlan(s, target, c = cfg) {
    const need = Math.max(0, target - s.bocconcini);
    if (need <= 0) return null;
    const spiceBatches = Math.floor(s.spice / BOCC_SPICE_PER_CRAFT);
    const r2 = c.craftEssence ? Math.min(spiceBatches, Math.floor(s.essence)) : 0;
    if (r2 > 0) return { recipe: 2, times: Math.min(r2, Math.ceil(need / 2)) };
    const r1 = Math.min(spiceBatches, Math.floor(s.gold / BOCC_GOLD_PER_CRAFT));
    if (r1 > 0) return { recipe: 1, times: Math.min(r1, need) };
    return null;
  }

  function pickRaid(s) {
    return s.raids
      .filter((r) => r.intel >= r.cost)
      .sort((a, b) => b.intel - a.intel)[0] || null;
  }

  const charmMin = () => Math.max(0, toNum(cfg.charmMinQty));

  // Charm rule: among luck charms held above the Min charms setting, use the lowest luck tier that still
  // covers `need` (most plentiful within the tier); if none covers it, the highest tier (most plentiful).
  function chooseCharm(charms, need) {
    const pool = charms.filter((c) => c.qty > charmMin() && c.luck > 0);
    if (!pool.length) return null;
    const enough = pool.filter((c) => c.luck >= need);
    const tierLuck = enough.length ? Math.min(...enough.map((c) => c.luck)) : Math.max(...pool.map((c) => c.luck));
    const charm = pool.filter((c) => c.luck === tierLuck).sort((a, b) => b.qty - a.qty)[0];
    return { charm, enough: enough.length > 0 };
  }

  function backedOff(kind) {
    return (rt.backoff[kind] || 0) > Date.now();
  }

  const CRAFTS = {
    swiss: { key: 'swiss', label: 'Swiss', button: SEL.hudCraftButton, view: SEL.craftView },
    bocconcini: { key: 'bocconcini', label: 'Bocconcini', button: SEL.hudBoccCraftButton, view: SEL.boccCraftView },
  };

  // A decision: the status line's lead ('In flight' | 'Raid' | 'Docked'), its detail, `warn` when something
  // is failing (retries backing off), and the action to run, { kind, label, run, done }, or null.
  const decision = (lead, detail, warn = false) => ({ lead, detail, warn, action: null });
  const doing = (lead, action) => ({ lead, detail: '', warn: false, action });

  const armedText = (s, label) => {
    const qty = s.bait.armed ? (s.baitKey ? s[s.baitKey] : s.bait.qty) : null;
    return `${label} armed${qty != null ? ` (${Number(qty).toLocaleString()})` : ''}`;
  };

  // Crafting a cheese up to `target`: { action } or { note, warn }.
  function craftDecision(s, ctx, which = 'swiss', target = MIN_SWISS) {
    const c = CRAFTS[which];
    const last = ctx.lastCraft;
    if (last && last.which === which && ctx.now - last.at < CRAFT_STALE_MS && s[which] <= last.before) {
      return { note: 'Crafted, waiting for inventory refresh (reload if stuck)' };
    }
    if (ctx.backedOff('craft')) return { note: 'Craft retry backing off', warn: true };
    const plan = which === 'swiss' ? craftPlan(s, target, ctx.cfg) : boccCraftPlan(s, target, ctx.cfg);
    if (!plan) {
      return { note: which === 'swiss'
        ? `Need ${target} Swiss, not enough Curd + ${ctx.cfg.craftEssence ? 'Essence/Gold' : 'Gold'}`
        : `Need ${target} Bocconcini, not enough Spice + ${ctx.cfg.craftEssence ? 'Essence/Gold' : 'Gold'}` };
    }
    if (!s.ui.craftButtons[which]) return { note: `Need ${c.label}, open Camp to auto-craft` };
    const label = `Craft ${plan.times * (plan.recipe === 2 ? 2 : 1)} ${c.label} (${plan.recipe === 2 ? 'Essence' : 'Gold'})`;
    return { action: { kind: 'craft', label, run: () => craftCheese(c, plan, s[which]) } };
  }

  // RaidBuster Cannonballs ("fuel"): +1 to Skyport loot drops per hunt; Ingots (raids) are worth the most, so
  // raids fire while any are left and shipments only above the reserve kept for raids. The HUD toggle
  // switches them; a stage whose setting is off leaves the switch as the player set it.
  // Returns true/false, or null when that stage's setting is off.
  function fuelWanted(s, c = cfg) {
    if (s.isIntercepting) return c.cannonRaid ? s.cannonball > 0 : null;
    if (s.inFlight) return c.cannonShip ? s.cannonball > Math.max(0, toNum(c.cannonKeep)) : null;
    return null;
  }

  function fuelAction(s, ctx) {
    const want = fuelWanted(s, ctx.cfg);
    if (want === null || want === s.fuelOn) return null;
    if (want && !s.canFuel) return null;
    if (ctx.backedOff('fuel') || !s.ui.fuelToggle) return null;
    return { kind: 'fuel', label: `Turn RaidBuster Cannonballs ${want ? 'on' : 'off'}`, done: `✔ Cannonballs ${want ? 'on' : 'off'}`, run: () => setFuel(want) };
  }

  // The trap step: base first (the Denture Base's luck changes the weapon and charm picks), then the weapon.
  const trapStep = (s, ctx) => ctx.base.action(s) || ctx.weapon.action(s);

  // ctx: { cfg, backedOff(kind), lastCraft, now, shipCharm, raids, weapon, base } (the live objects in tick(), fakes in tests).
  // Whatever the stage decides, a decision without an action still gets the trap step (base, then weapon), so
  // no branch (out of cheese, bait idle, backing off…) can leave the trap unchecked. Steps that depend on the
  // trap (the shipment luck check, the raid charm) call trapStep themselves first.
  function decide(s, ctx) {
    const p = stageDecision(s, ctx);
    if (p.action) return p;
    const trap = trapStep(s, ctx);
    return trap ? doing(p.lead, trap) : p;
  }

  function stageDecision(s, ctx) {
    const { cfg, backedOff, shipCharm, raids } = ctx;
    const lead = s.isIntercepting || raids.isActive() ? 'Raid' : s.inFlight ? 'In flight' : 'Docked';
    const fuel = fuelAction(s, ctx);
    if (s.isIntercepting) {
      const r = raidDecision(s, ctx);
      return r.action || !fuel ? r : doing(lead, fuel);   // weapon / charm / bait setup first, then cannonballs
    }
    if (fuel) return doing(lead, fuel);
    if (raids.isActive()) {
      if (backedOff('raid')) return decision(lead, 'Raid over, trap restore backing off', true);
      return doing(lead, { kind: 'raid', label: 'Restore trap', done: '', run: () => raids.restore() });
    }
    const cleanup = shipCharm.cleanupAction(s);
    if (cleanup) return doing(lead, cleanup);

    if (s.inFlight) {
      const head = `${s.shipName || 'shipment'}, ${s.hunts} hunts left`;
      if (!cfg.autoBait) {
        const wpn = trapStep(s, ctx);
        return wpn ? doing(lead, wpn) : decision(lead, `${head} (bait swap off)`);
      }
      const bait = shipmentBait(s, cfg);
      const want = bait.forShipment(s.shipType, s.shipIntel);
      const capped = bait.capped(s.shipType, s.shipIntel);
      const full = capped ? ` · intel ${s.shipIntel}/${INTEL_CAP}, Swiss` : '';
      if (s.baitKey === want) {
        const wpn = trapStep(s, ctx);
        if (wpn) return doing(lead, wpn);
        const luck = shipCharm.luckAction(s);
        if (luck) return doing(lead, luck);
        return decision(lead, `${head}, ${armedText(s, BAITS[want].label)}${full}${shipCharm.note ? ` · ${shipCharm.note}` : ''}`);
      }
      if (s[want] <= 0) {
        if (want === 'swiss' && cfg.autoCraft) {
          const c = craftDecision(s, ctx);
          if (c.action) return doing(lead, c.action);
          return decision(lead, `${head}, out of Swiss. ${c.note}`, !!c.warn);
        }
        return decision(lead, `${head}, out of ${BAITS[want].label}`);
      }
      if (backedOff('bait')) return decision(lead, `${head}, bait swap backing off`, true);
      const why = capped ? ` (location at ${s.shipIntel} intel)` : '';
      return doing(lead, { kind: 'bait', label: `Arm ${BAITS[want].label}${why}`, run: () => armBait(want) });
    }

    // Docked: a raid, else a launch, else the docked bait. `note` says why nothing launched.
    let note = '';
    let warn = false;
    if (cfg.autoRaid && !s.isShipping) {
      const raid = pickRaid(s);
      if (raid) {
        if (s.bocconcini < RAID_MIN_BOCCONCINI) {
          const c = cfg.autoCraft ? craftDecision(s, ctx, 'bocconcini', RAID_MIN_BOCCONCINI) : { note: 'auto-craft off' };
          if (c.action) return doing(lead, c.action);
          note = `${raid.name} raid ready, need ${RAID_MIN_BOCCONCINI} Bocconcini (${c.note})`;
          warn = !!c.warn;
        } else if (!s.ui.raidButton && !s.ui.raidDialog) {
          note = `${raid.name} raid ready, open Camp to start`;
        } else if (backedOff('raidStart')) {
          note = 'Raid start retry backing off';
          warn = true;
        } else {
          return doing(lead, { kind: 'raidStart', label: `Start ${raid.name} raid`, done: '', run: () => startRaid(raid) });
        }
      }
    }
    if (cfg.autoLaunch && !s.isShipping) {
      const { sh, skipped, allCapped } = pickShipment(s, cfg);
      if (skipped) note = note ? `${note} · ${skipped}` : skipped;
      if (!sh) {
        note = allCapped
          ? `${skipped}, every affordable route is full; start a raid or wait for rotation`
          : 'No shipment affordable above reserves';
        warn = false;
      } else if (!s.ui.shipButtons[sh.type] && !s.ui.shipDialog) {
        note = `Ready for ${sh.label}, open Camp to launch`;
        warn = false;
      } else {
        const live = s.shipments[sh.type];
        const cheese = shipmentBait(s, cfg).forShipment(sh.type, live ? live.intel : null);
        if (cheese === 'swiss' && s.swiss < MIN_SWISS) {
          if (cfg.autoCraft) {
            const c = craftDecision(s, ctx);
            if (c.action) return doing(lead, c.action);
            note = c.note;
            warn = !!c.warn;
          } else {
            note = `Need ${MIN_SWISS} Swiss to launch (auto-craft off)`;
            warn = false;
          }
        } else if (backedOff('launch')) {
          note = 'Launch retry backing off';
          warn = true;
        } else {
          const label = `Launch ${SHIP_SHORT[sh.type]} Shipment (${BAITS[cheese].label})`;
          return doing(lead, { kind: 'launch', label, done: '', run: () => launchShipment(sh, cheese) });
        }
      }
    }
    return dockedBaitDecision(s, ctx, note, warn);
  }

  function dockedBaitDecision(s, ctx, note, warn) {
    const { cfg, backedOff } = ctx;
    const parts = note ? [note] : [];
    const docked = (tail, w = warn) => decision('Docked', [...parts, tail].filter(Boolean).join(' · '), w);
    const wpn = trapStep(s, ctx);
    if (!cfg.autoBait || cfg.dockedAction === 'none') return wpn ? doing('Docked', wpn) : docked('');
    if (backedOff('bait')) return docked('bait swap backing off', true);
    if (cfg.dockedAction === 'gouda' || cfg.dockedAction === 'superbrie') {
      // Only the selected cheese; no switching to the other one when it runs out.
      const want = cfg.dockedAction;
      if (s.baitKey === want) return wpn ? doing('Docked', wpn) : docked(armedText(s, BAITS[want].label));
      if (s[want] > 0) return doing('Docked', { kind: 'bait', label: `Arm ${BAITS[want].label} (docked)`, run: () => armBait(want) });
      parts.push(`out of ${BAITS[want].label}`);
    }
    const premium = s.baitKey === 'swiss' || s.baitKey === 'bocconcini' || s.baitKey === 'romano';
    if (s.bait.armed && (cfg.dockedAction === 'disarm' || premium)) {
      return doing('Docked', { kind: 'bait', label: 'Disarm bait (docked)', run: () => disarmBait() });
    }
    return docked(s.bait.armed ? 'bait idle' : 'disarmed');
  }

  // Intercepting a raid: raid setup, Bocconcini (armed or crafted), the weapon (Auto Trap), the raid charm.
  function raidDecision(s, ctx) {
    const { cfg, raids } = ctx;
    const r = s.raid;
    const head = `${r.name}, ${r.hunts} hunts left`;
    const init = raids.initAction(s);
    if (init) return doing('Raid', init);
    if (cfg.autoBait && s.baitKey !== 'bocconcini') {
      if (s.bocconcini > 0) return doing('Raid', { kind: 'bait', label: 'Arm Aurora Bocconcini (raid)', run: () => armBait('bocconcini') });
      if (cfg.autoCraft) {
        const c = craftDecision(s, ctx, 'bocconcini', Math.max(2, r.hunts));
        if (c.action) return doing('Raid', c.action);
        return decision('Raid', `${head}, out of Bocconcini. ${c.note}`, !!c.warn);
      }
      return decision('Raid', `${head}, out of Bocconcini`);
    }
    const wpn = trapStep(s, ctx);
    if (wpn) return doing('Raid', wpn);
    const step = raids.stepAction(s);
    if (step) return doing('Raid', step);
    return decision('Raid', `${head}${raids.note ? ` · ${raids.note}` : ''}`);
  }
  // #endregion decision

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */
  function trapControl() {
    const TC = window.hg && window.hg.utils && window.hg.utils.TrapControl;
    if (!TC) throw new Error('hg.utils.TrapControl not found');
    return TC;
  }

  // TrapControl.go(successCallback, errorCallback) does not return a promise.
  function goChain(chain) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TrapControl timed out')), 15000);
      chain.go(
        () => { clearTimeout(timer); resolve(); },
        () => { clearTimeout(timer); reject(new Error('TrapControl request failed')); }
      );
    });
  }

  async function setFuel(on) {
    const btn = $1(SEL.hudFuelToggle);
    if (!btn) throw new Error('cannonball toggle not found');
    btn.click();
    if (!(await waitFor(() => { const q = getQuest(); return !!(q && q.is_fuel_enabled) === on; }, 8000))) {
      throw new Error(`cannonballs did not turn ${on ? 'on' : 'off'}`);
    }
  }

  async function armBait(key) {
    const b = BAITS[key];
    await goChain(trapControl().armItem(b.type, 'bait'));
    if (!(await waitFor(() => b.re.test(currentBait().name), 5000))) {
      throw new Error(`bait did not change to ${b.label}`);
    }
  }

  async function disarmBait() {
    await goChain(trapControl().disarmBait());
    if (!(await waitFor(() => !currentBait().armed, 5000))) throw new Error('bait did not disarm');
  }

  function closeHudDialog() {
    const btn = $1(SEL.hudDialogClose);
    if (btn && $1(SEL.hudDialog)) btn.click();
  }

  function closeShipDialog() {
    const dlg = $1(SEL.shipDialog);
    if (!dlg) return;
    const cancel = $1(SEL.shipCancel, dlg) || $1('.jsDialogClose', dlg);
    if (cancel) cancel.click();
  }

  /* ------------------------------------------------------------------ *
   * Raids: weapon by power type + luck charms via the Minluck & CRE tool
   * ------------------------------------------------------------------ */
  const RAID_KEY = 'mhCeruleanSkyport.raid.v1';

  function loadRaidStore() {
    try {
      const d = JSON.parse(localStorage.getItem(RAID_KEY) || 'null');
      if (d && typeof d === 'object') return Object.assign({ active: null, minluck: {} }, d);
    } catch (e) { /* corrupt or unavailable */ }
    return { active: null, minluck: {} };
  }

  function saveRaidStore() {
    try { localStorage.setItem(RAID_KEY, JSON.stringify(raidStore)); } catch (e) { /* storage unavailable */ }
  }

  const raidStore = loadRaidStore();
  let gearCache = null;

  // The game's inventory reads as a promise of an item list: by class (with stats) or by item type.
  function inventory(byClass, which) {
    return new Promise((resolve, reject) => {
      const UI = window.hg && window.hg.utils && window.hg.utils.UserInventory;
      if (!UI) { reject(new Error('hg.utils.UserInventory not found')); return; }
      const t = setTimeout(() => reject(new Error('inventory request timed out')), 10000);
      const ok = (d) => { clearTimeout(t); resolve(Array.isArray(d) ? d : Object.values(d || {})); };
      const fail = () => { clearTimeout(t); reject(new Error('inventory request failed')); };
      if (byClass) UI.getItemsByClass(which, true, ok, fail);
      else UI.getItems(which, ok, fail);
    });
  }

  async function getGear(force) {
    if (!force && gearCache && Date.now() - gearCache.at < 60000) return gearCache;
    const list = await inventory(true, ['weapon', 'trinket']);
    const weapons = list.filter((i) => i.classification === 'weapon' && toNum(i.quantity) > 0)
      .map((i) => ({ type: i.type, name: i.name, powerType: i.power_type_name, luck: toNum(i.luck), power: toNum(i.power) }));
    const charms = list.filter((i) => i.classification === 'trinket' && toNum(i.quantity) > 0)
      .map((i) => ({ type: i.type, name: i.name, luck: toNum(i.luck), qty: toNum(i.quantity) }));
    gearCache = { at: Date.now(), weapons, charms };
    return gearCache;
  }

  // Everything armed that a trap decision can depend on. Each module re-checks when this changes, so no
  // module has to list (and risk forgetting) the parts it cares about.
  function trapSignature() {
    const u = window.user || {};
    return `${u.weapon_name || ''}|${u.base_name || ''}|${u.bait_name || ''}|${u.trinket_name || ''}`;
  }

  function armedGear(gear) {
    const u = window.user || {};
    return {
      weapon: gear.weapons.find((w) => w.name === u.weapon_name) || null,
      charm: u.trinket_name ? (gear.charms.find((c) => c.name === u.trinket_name) || { name: u.trinket_name, luck: 0, type: null }) : null,
      luck: toNum(u.trap_luck),
    };
  }

  async function armGear(type, classification, name) {
    await goChain(trapControl().armItem(type, classification));
    const field = { weapon: 'weapon_name', base: 'base_name' }[classification] || 'trinket_name';
    if (!(await waitFor(() => (window.user || {})[field] === name, 6000))) throw new Error(`${name} did not arm`);
    gearCache = null;
  }

  async function disarmCharm() {
    if (!(window.user || {}).trinket_name) return;
    await goChain(trapControl().disarmTrinket());
    if (!(await waitFor(() => !(window.user || {}).trinket_name, 6000))) throw new Error('charm did not disarm');
    gearCache = null;
  }

  // Reads the overall minimum luck from the Minluck & CRE tool for the current trap and location.
  async function readMinluck() {
    const btn = $1(SEL.minluckButton);
    if (!btn) throw new Error('Minluck & CRE tool not found (open Camp, check it is enabled)');
    await sleep(1500); // the tool refreshes its mouse list after each trap change
    btn.click();
    const luckNow = () => toNum((window.user || {}).trap_luck);
    const shown = await waitFor(() => {
      const l = $1(SEL.minluckLuck);
      return l && toNum(l.textContent) === luckNow() ? l : null;
    }, 8000);
    if (!shown) throw new Error('Minluck tool did not show the current trap');
    await sleep(2500); // let a pending refresh re-render the open box
    const td = $1(SEL.minluckOverall);
    const text = td ? td.textContent.trim() : '';
    const closeBtn = $1(SEL.minluckClose);
    if (closeBtn) closeBtn.click();
    if (text === '∞') return Infinity;
    const n = parseInt(text, 10);
    if (!(n > 0)) throw new Error(`Minluck tool gave no overall value ("${text}")`);
    return n;
  }

  // Minluck formula from the Minluck & CRE tool (credits: Beeejk and Neb).
  function mouseMinluck(power, effPct) {
    const eff = effPct / 100;
    if (eff === 0) return Infinity;
    let ml = Math.ceil(Math.ceil(Math.sqrt(power / 2)) / Math.min(eff, 1.4));
    if (ml >= 9999) return Infinity;
    if (!(2 * Math.pow(Math.floor(Math.min(1.4, eff) * ml), 2) >= power)) ml += 1;
    return ml;
  }

  let miceCache = null;

  // Mice the game says can be caught right now (same endpoint the Minluck tool uses).
  async function fetchCurrentMice() {
    const u = window.user || {};
    const key = `${u.environment_id}|${u.bait_item_id}|${JSON.stringify((getQuest() || {}).current_raid || '')}`;
    if (miceCache && miceCache.key === key && Date.now() - miceCache.at < 30000) return miceCache.mice;
    const res = await fetch('/managers/ajax/users/getmiceeffectiveness.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `sn=Hitgrab&hg_is_ajax=1&uh=${encodeURIComponent(u.unique_hash || '')}`,
    });
    const json = await res.json();
    const mice = [];
    for (const group of Object.values((json && json.effectiveness) || {})) {
      for (const m of (group && group.mice) || []) if (m && m.name) mice.push(m.name);
    }
    miceCache = { key, at: Date.now(), mice };
    return mice;
  }

  // Overall minluck per power type from the built-in table, or null if any current mouse is unknown.
  async function builtinMinluck(powerTypes) {
    let mice;
    try { mice = await fetchCurrentMice(); } catch (e) { return null; }
    if (!mice.length || !mice.every((n) => MICE[n])) return null;
    const values = {};
    for (const pt of powerTypes) {
      const idx = POWER_TYPES.indexOf(pt);
      values[pt] = idx < 0 ? Infinity : Math.max(...mice.map((n) => mouseMinluck(MICE[n][0], MICE[n][1][idx])));
    }
    return values;
  }

  // Minluck source order, in one place: built-in table → Minluck tool → `fallback` (FALLBACK_LUCK).
  // Seams: table(powerTypes) -> { [powerType]: minluck } | null, toolAvailable(), readTool(), log(msg, level).
  function makeMinluck({ table, toolAvailable, readTool, fallback, log }) {
    return {
      fallback,
      readTool,

      // The armed power type: { value, source: 'table' | 'tool' | 'fallback' }.
      async current(powerType) {
        const t = await table([powerType]);
        if (t && isFinite(t[powerType])) return { value: t[powerType], source: 'table' };
        if (toolAvailable()) {
          try { return { value: await readTool(), source: 'tool' }; } catch (e) { log(`Minluck tool: ${e.message}`, 'error'); }
        }
        return { value: fallback, source: 'fallback' };
      },

      // Several power types at once (raid weapon choice): the table answers all of them ({ source: 'table',
      // values }), else 'tool' (each weapon is armed and measured) or 'fallback'.
      async forTypes(powerTypes) {
        const values = await table(powerTypes);
        if (values) return { source: 'table', values };
        return { source: toolAvailable() ? 'tool' : 'fallback', values: null };
      },
    };
  }

  const minluck = makeMinluck({
    table: (powerTypes) => builtinMinluck(powerTypes),
    toolAvailable: () => !!$1(SEL.minluckButton),
    readTool: () => readMinluck(),
    fallback: FALLBACK_LUCK,
    log: (msg, level) => log(msg, level),
  });

  // Charm choice for the current setup; returns a short note for the panel.
  // Returns { note, short }: `short` when even the chosen charm (or no charm above the minimum) leaves the
  // luck below minluck.
  async function applyLuckCharm(minluck, gear, source, onArm) {
    const cur = armedGear(gear);
    const luckNoCharm = cur.luck - (cur.charm ? cur.charm.luck : 0);
    const need = minluck - luckNoCharm;
    const src = source === 'fallback' ? ` [target ${FALLBACK_LUCK}, minluck unknown]` : source === 'tool' ? ' [Minluck tool]' : '';
    if (need <= 0) {
      if (cur.charm && cur.charm.luck > 0) await disarmCharm();
      return { note: `luck ${luckNoCharm}/${minluck}, no charm needed${src}`, short: false };
    }
    const pick = chooseCharm(gear.charms, need);
    if (!pick) return { note: `luck ${luckNoCharm}/${minluck}, no luck charm above ${charmMin()}${src}`, short: true };
    if (!cur.charm || cur.charm.name !== pick.charm.name) {
      if (onArm) onArm(pick.charm.name);
      await armGear(pick.charm.type, 'trinket', pick.charm.name);
    }
    return { note: `${pick.charm.name} +${pick.charm.luck} → luck ${luckNoCharm + pick.charm.luck}/${minluck}${pick.enough ? '' : ' (not guaranteed)'}${src}`,
      short: !pick.enough };
  }

  // One raid at a time: setup (the raid's luck charm, after Auto Trap has picked the weapon) → done, and the
  // charm comes off after the raid. The stored record also caches Minluck tool readings per raid and power type.
  // Seams: storage { load, save }, gear { list() }, trap { weapon(), trinket(), signature(), powerType(), disarmCharm() },
  // minluck (makeMinluck), luck { apply(minluck, gear, source) -> note }, plus config(), backedOff(kind), log(msg)
  // and onStart() (the raid takes over the charm).
  function makeRaid({ storage, gear, trap, minluck, luck, config, backedOff, log, onStart }) {
    const store = storage.load();
    if (store.active && store.active.phase === 'weapon') store.active.phase = 'charm';   // older builds picked the weapon here
    delete store.pending;
    const save = () => storage.save();
    const activeFor = (name) => (store.active && store.active.name === name ? store.active : null);

    function init(r) {
      store.active = { name: r.name, phase: 'charm', weaponName: null, charmName: null, note: '' };
      save();
      onStart();
    }

    async function charmStep(r, a) {
      a.weaponName = trap.weapon();
      if (!config().luckCharmsRaid) {
        a.note = 'luck charms off for raids';
        a.charmTouched = false;
        a.charmName = null;
        a.phase = 'done';
        save();
        return;
      }
      a.charmTouched = true;
      // Minluck for the armed weapon's type; if the lookup falls back, an earlier Minluck tool reading for it.
      const pt = trap.powerType();
      const cur = await minluck.current(pt);
      const cached = cur.source === 'fallback' ? store.minluck[`${r.name}|${pt}`] : null;
      const ml = cached != null ? { value: cached === 'inf' ? Infinity : cached, source: 'tool' } : cur;
      const res = await luck.apply(ml.value, await gear.list(), ml.source);
      a.note = res.note;
      a.short = res.short;   // read by Auto Base ('Charm first': the Denture only when no charm is enough)
      a.charmName = trap.trinket();
      a.signature = trap.signature();
      a.phase = 'done';
      save();
      log(`✔ Raid luck: ${a.note}`);
    }

    // After a raid: the raid's charm off (left alone if raids didn't use charms). Auto Trap picks the weapon.
    async function restore() {
      const a = store.active;
      const touched = !a || a.charmTouched !== false;
      if (touched) await trap.disarmCharm();
      store.active = null;
      save();
      log(`✔ Raid over${touched ? ', charm removed' : ''}`);
    }

    return {
      get store() { return store; },
      get note() { return store.active ? store.active.note || '' : ''; },
      // For the current raid: true when the charm can't reach minluck, false when it can, null until checked.
      short(s) {
        const a = s.isIntercepting && s.raid && activeFor(s.raid.name);
        return a && a.phase === 'done' && typeof a.short === 'boolean' ? a.short : null;
      },
      isActive: () => !!store.active,

      // Every tick: a finished setup re-checks the charm when anything armed changed since it was picked
      // (you swap the charm or weapon, Auto Base takes the Denture off when the Toothlets run out…).
      sync(s) {
        const a = s.isIntercepting && activeFor(s.raid.name);
        if (!a || a.phase !== 'done') return;
        // A raid set up by an older version has no signature: check its charm once against the current trap.
        if (!a.signature || trap.signature() !== a.signature) {
          a.phase = 'charm';
          save();
        }
      },

      // Intercepting a raid this module isn't tracking yet.
      initAction(s) {
        if (activeFor(s.raid.name)) return null;
        return { kind: 'raid', label: `Raid setup (${s.raid.name})`, done: '', run: async () => init(s.raid) };
      },

      // The charm step while the setup isn't done.
      stepAction(s) {
        const a = activeFor(s.raid.name);
        if (!a || a.phase === 'done' || backedOff('raid')) return null;
        return { kind: 'raid', label: `Raid charm (${s.raid.name})`, done: '', run: () => charmStep(s.raid, a) };
      },

      restore,
    };
  }

  const raids = makeRaid({
    storage: { load: () => raidStore, save: () => saveRaidStore() },
    gear: { list: () => getGear(true) },
    trap: {
      weapon: () => (window.user || {}).weapon_name,
      signature: () => trapSignature(),
      trinket: () => (window.user || {}).trinket_name || null,
      powerType: () => (window.user || {}).trap_power_type_name,
      disarmCharm: () => disarmCharm(),
    },
    minluck,
    luck: { apply: (ml, g, source) => applyLuckCharm(ml, g, source) },
    config: () => cfg,
    backedOff: (kind) => backedOff(kind),
    log: (msg) => log(msg),
    onStart: () => shipCharm.raidStarted(),
  });

  /* ------------------------------------------------------------------ *
   * Ship charms: luck charms this script armed for a shipment
   * ------------------------------------------------------------------ */
  const SHIP_CHARM_KEY = 'mhCeruleanSkyport.shipCharm.v1';

  // Only a ship charm is ever swapped or removed on shipments; any other charm is yours. `charm` is the
  // armed ship charm, `pending` the one being armed (an arm that times out but lands later is still ours).
  // Seams: storage { load, save }, trap { trinket, signature, disarm }, luck { apply(onArm) -> note },
  // plus config(), raidActive(), backedOff(kind) and log(msg).
  function makeShipCharm({ storage, trap, luck, config, raidActive, backedOff, log }) {
    const own = Object.assign({ charm: null, pending: null }, storage.load());
    let note = '';         // last luck result, shown in the panel
    let checkedKey = null; // shipment + trap setup the luck check last ran for

    const owns = (name) => !!name && (name === own.charm || name === own.pending);
    const save = () => storage.save({ charm: own.charm, pending: own.pending });
    function release() {
      if (!own.charm && !own.pending) return;
      own.charm = own.pending = null;
      save();
    }
    const setupKey = (s) => `${s.shipType}|${trap.signature()}`;
    // 'always', or 'bocconcini' only while Aurora Bocconcini is the armed bait.
    const wanted = (s) => config().luckCharmsNormal === 'always'
      || (config().luckCharmsNormal === 'bocconcini' && s.baitKey === 'bocconcini');

    async function luckStep(s) {
      const armed = trap.trinket();
      if (armed && !owns(armed)) {
        release();
        note = `${armed} is yours, left alone`;
        checkedKey = setupKey(s);
        log(`Shipment luck: ${note}`);
        return;
      }
      note = await luck.apply((name) => { own.pending = name; save(); });
      checkedKey = setupKey(s);
      own.charm = trap.trinket();
      own.pending = null;
      save();
      log(`✔ Shipment luck: ${note}`);
    }

    return {
      owns,
      get note() { return note; },

      // Every tick: shipment charms set to Off hands the charm over to you, however Off was set.
      sync() {
        if (config().luckCharmsNormal === 'off') release();
      },

      // A raid manages (and later removes) its own charm.
      raidStarted: release,

      // 'Only with Bocconcini': the ship charm comes off as soon as another bait is armed (Swiss after
      // Bocconcini runs out, or the docked bait). Call before launch and raid decisions.
      cleanupAction(s) {
        if (!own.charm && !own.pending) return null;
        if (config().luckCharmsNormal !== 'bocconcini' || s.isIntercepting || raidActive() || s.baitKey === 'bocconcini') return null;
        const charm = trap.trinket();
        if (!owns(charm)) { release(); return null; }
        if (backedOff('luck')) return null;
        const label = `Remove ${charm} (Bocconcini not armed)`;
        return { status: label, kind: 'luck', label, run: async () => {
          await trap.disarm();
          release();
          note = '';
          checkedKey = null;
        } };
      },

      // In flight with the right bait armed: a luck check when wanted and the setup changed since the last one.
      luckAction(s) {
        if (!wanted(s) || checkedKey === setupKey(s) || backedOff('luck')) return null;
        return { kind: 'luck', label: 'Luck check (shipment)', done: '', run: () => luckStep(s) };
      },
    };
  }

  const shipCharm = makeShipCharm({
    storage: {
      load() {
        try {
          const d = JSON.parse(localStorage.getItem(SHIP_CHARM_KEY) || 'null');
          if (d && typeof d === 'object') return d;
        } catch (e) { /* corrupt or unavailable */ }
        // One-time move out of the raid store (1.0.3 development builds kept it there).
        const moved = { charm: raidStore.shipCharm || null, pending: raidStore.shipCharmPending || null };
        if ('shipCharm' in raidStore || 'shipCharmPending' in raidStore) {
          try { localStorage.setItem(SHIP_CHARM_KEY, JSON.stringify(moved)); } catch (e) { /* storage unavailable */ }
          delete raidStore.shipCharm;
          delete raidStore.shipCharmPending;
          saveRaidStore();
        }
        return moved;
      },
      save(d) {
        try { localStorage.setItem(SHIP_CHARM_KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ }
      },
    },
    trap: {
      trinket: () => (window.user || {}).trinket_name || null,
      signature: () => trapSignature(),
      disarm: () => disarmCharm(),
    },
    luck: {
      async apply(onArm) {
        const gear = await getGear(true);
        const ml = await minluck.current((window.user || {}).trap_power_type_name);
        return (await applyLuckCharm(ml.value, gear, ml.source, onArm)).note;
      },
    },
    config: () => cfg,
    raidActive: () => raids.isActive(),
    backedOff: (kind) => backedOff(kind),
    log: (msg) => log(msg),
  });

  /* ------------------------------------------------------------------ *
   * Auto Trap: the weapon for every stage
   * ------------------------------------------------------------------ */
  // Role 'claw' while Gouda or SUPER|brie+ is armed: the C.L.A.W. Machine doubles Corsair's Curds, which those
  // mice drop on every catch (without one, the luckiest Law weapon). Role 'law' while Swiss, Romano or Bocconcini
  // is armed: Skyport shipment mice are all Law. Role 'raid' while intercepting: the raid location's allowed
  // power types, the luckiest weapon that reaches minluck with the best raid charm (else the luckiest).
  // Seams: gear { list(), armed(gear) }, trap { weapon(), signature(), powerType(), arm(type, classification, name) },
  // minluck (makeMinluck), cache { get(key), set(key, minluck) } for Minluck tool readings per raid and type,
  // plus config(), charmMin(), backedOff(kind), log(msg).
  function makeWeapon({ gear, trap, minluck, cache, config, charmMin, backedOff, log }) {
    const STANDARD = ['gouda', 'superbrie'];
    const PREMIUM = ['swiss', 'romano', 'bocconcini'];
    const LABELS = { claw: 'Weapon check (curds)', law: 'Weapon check (shipment)', raid: 'Weapon check (raid)' };
    let checkedKey = null;     // role (+ raid) and weapon the last check ran for
    const warned = new Set();  // "no weapon" lines, logged once each

    function role(s) {
      if (!config().autoTrap) return null;
      if (s.isIntercepting) return s.raid ? 'raid' : null;
      if (STANDARD.includes(s.baitKey)) return 'claw';
      if (PREMIUM.includes(s.baitKey)) return 'law';
      return null;
    }

    // Docked / shipments: { weapon, reason } or null (no Law weapon).
    function pick(weapons, r) {
      const claw = r === 'claw' && weapons.find((w) => /C\.L\.A\.W\./i.test(w.name));
      if (claw) return { weapon: claw, reason: "doubles Corsair's Curds" };
      const law = weapons.filter((w) => w.powerType === 'Law').sort((a, b) => b.luck - a.luck || b.power - a.power)[0];
      if (!law) return null;
      return { weapon: law, reason: r === 'claw' ? 'no C.L.A.W. Machine, luckiest Law weapon' : 'luckiest Law weapon' };
    }

    // Raids: { weapon, reason }, { measure: weapon } (arm it, read the Minluck tool next tick) or { none: types }.
    async function pickRaid(raid, g) {
      const allowed = raid.powerTypes.length ? raid.powerTypes : [trap.powerType()];
      // Best (highest-luck) weapon per allowed type, types ordered by that luck.
      const best = allowed.map((pt) => g.weapons.filter((w) => w.powerType === pt).sort((x, y) => y.luck - x.luck || y.power - x.power)[0])
        .filter(Boolean).sort((x, y) => y.luck - x.luck);
      if (!best.length) return { none: allowed.join('/') };
      const topCharm = config().luckCharmsRaid ? Math.max(0, ...g.charms.filter((c) => c.qty > charmMin()).map((c) => c.luck)) : 0;
      const cur = gear.armed(g);
      const baseLuck = cur.luck - (cur.weapon ? cur.weapon.luck : 0) - (cur.charm ? cur.charm.luck : 0);
      const ml = await minluck.forTypes(best.map((w) => w.powerType));
      const known = (w) => {
        if (ml.source === 'table') return ml.values[w.powerType];
        if (ml.source === 'fallback') return minluck.fallback;
        return cache.get(`${raid.name}|${w.powerType}`);
      };
      for (const w of best) {
        let v = known(w);
        if (v == null) {
          if (trap.weapon() !== w.name) return { measure: w };
          v = await minluck.readTool();
          cache.set(`${raid.name}|${w.powerType}`, v);
        }
        if (baseLuck + w.luck + topCharm >= v) return { weapon: w, reason: `${w.powerType}, reaches minluck ${v}` };
      }
      return { weapon: best[0], reason: `${best[0].powerType}, luckiest, minluck out of reach` };
    }

    // Role (+ raid) and the trap signature: a raid pick depends on the other luck too (base, charm).
    const key = (r, s) => `${r === 'raid' ? `raid:${s.raid.name}` : r}|${trap.signature()}`;

    async function check(r, s) {
      const g = await gear.list();
      const p = r === 'raid' ? await pickRaid(s.raid, g) : pick(g.weapons, r);
      if (p && p.measure) {   // measured on the next check, with this weapon armed
        await trap.arm(p.measure.type, 'weapon', p.measure.name);
        return;
      }
      if (!p || p.none) {
        const msg = `Auto Trap: no ${p ? p.none : 'Law'} weapon owned, weapon left alone`;
        if (!warned.has(msg)) log(msg);
        warned.add(msg);
      } else if (trap.weapon() !== p.weapon.name) {
        await trap.arm(p.weapon.type, 'weapon', p.weapon.name);
        log(`✔ Weapon: ${p.weapon.name} (${p.reason})`);
      }
      checkedKey = key(r, s);
    }

    return {
      role,
      pick,
      // A weapon check when the role (or raid) or the armed weapon changed since the last one.
      action(s) {
        const r = role(s);
        if (!r || checkedKey === key(r, s) || backedOff('weapon')) return null;
        return { kind: 'weapon', label: LABELS[r], done: '', run: () => check(r, s) };
      },
    };
  }

  const weapon = makeWeapon({
    gear: { list: () => getGear(true), armed: (g) => armedGear(g) },
    trap: {
      weapon: () => (window.user || {}).weapon_name,
      signature: () => trapSignature(),
      powerType: () => (window.user || {}).trap_power_type_name,
      arm: (type, classification, name) => armGear(type, classification, name),
    },
    minluck,
    cache: {
      get: (k) => { const v = raidStore.minluck[k]; return v === 'inf' ? Infinity : v; },
      set: (k, v) => { raidStore.minluck[k] = v === Infinity ? 'inf' : v; saveRaidStore(); },
    },
    config: () => cfg,
    charmMin: () => charmMin(),
    backedOff: (kind) => backedOff(kind),
    log: (msg) => log(msg),
  });

  /* ------------------------------------------------------------------ *
   * Auto Base: the Signature Series Denture Base while Toothlets last
   * ------------------------------------------------------------------ */
  const BASE_KEY = 'mhCeruleanSkyport.base.v1';
  const DENTURE = { type: 'upgraded_denture_base', name: 'Signature Series Denture Base', short: 'Denture Base',
    charge: 'fulmina_charged_tooth_stat_item' };

  // The Denture Base has 3,750 power and 50 luck while any Ful'mina's Charged Toothlet is held (one decays per
  // catch). cfg.dentureBase says when: 'raid', 'ship' (raids + shipments) or 'always'. The base it replaces is
  // remembered (`prev`) and armed again when the Denture is no longer wanted. Only a Denture this script armed
  // is ever taken off; `pending` marks an arm in progress (one that times out but lands later is still ours).
  // Seams: storage { load, save }, gear { charge() -> { owned, toothlets }, bases() -> [{ type, name, luck }] },
  // trap { base(), signature(), arm(type, name) }, raid { short(s) } (the raid charm can't reach minluck: true /
  // false / null until checked), plus config(), backedOff(kind), log(msg).
  function makeBase({ storage, gear, trap, raid, config, backedOff, log }) {
    // `yielded`: the stage in which you swapped the Denture off yourself; Auto Base waits for the next stage.
    const own = Object.assign({ prev: null, ours: false, pending: false, yielded: null }, storage.load());
    const save = () => storage.save({ prev: own.prev, ours: own.ours, pending: own.pending, yielded: own.yielded });
    let owned = null;       // Denture owned (null = not read yet)
    let toothlets = null;   // last Toothlet count read
    let hunt = 0;           // bumped on every horn: one check per hunt catches the Toothlets running out
    let checkedKey = null;
    const warned = new Set();

    const mode = () => config().dentureBase || 'off';
    const min = () => Math.max(0, toNum(config().toothletMin));
    const covers = (s) => (mode() === 'always') || (mode() === 'ship' && (s.isIntercepting || s.inFlight))
      || (mode() === 'raid' && s.isIntercepting);
    const stage = (s) => (s.isIntercepting ? 'raid' : s.inFlight ? 'ship' : 'docked');
    const charmFirst = () => config().basePrefer === 'charm' && config().luckCharmsRaid;
    const key = (s) => `${mode()}|${stage(s)}|${min()}|${charmFirst()}|${raid.short(s)}|${trap.signature()}|${hunt}`;

    function release() {
      own.prev = null;
      own.yielded = null;
      own.ours = own.pending = false;
      save();
    }

    // Why the Denture is not wanted (for the log), or '' when it is.
    function why(s) {
      if (mode() === 'off') return 'Auto Base off';
      if (!covers(s)) return s.isIntercepting ? 'raid' : s.inFlight ? 'shipment' : 'docked';
      if (!owned) return 'not owned';
      if (toothlets <= 0) return 'out of Toothlets';
      if (toothlets <= min()) return `Toothlets at minimum (${min()})`;
      // Charm first: on a raid the Denture only goes on once the best charm can't reach minluck, then stays.
      if (s.isIntercepting && charmFirst() && !own.ours && raid.short(s) !== true) return 'a charm is enough';
      return '';
    }

    async function check(s) {
      const c = await gear.charge();
      owned = c.owned;
      toothlets = c.toothlets;
      const armed = trap.base();
      if (own.pending) {          // an arm that never confirmed: ours only if it landed
        own.ours = armed === DENTURE.name;
        own.pending = false;
        if (!own.ours) own.prev = null;
        save();
      }
      if (own.ours && armed !== DENTURE.name) {
        log(`Base: you armed ${armed}, Auto Base leaves it this ${stage(s) === 'ship' ? 'shipment' : stage(s)}`);
        release();
        own.yielded = stage(s);
        save();
      }
      if (own.yielded && own.yielded !== stage(s)) { own.yielded = null; save(); }
      const reason = why(s) || (own.yielded ? 'you chose another base' : '');
      if (!reason && armed !== DENTURE.name) {
        own.prev = armed ? { type: ((await gear.bases()).find((b) => b.name === armed) || {}).type || null, name: armed } : null;
        own.pending = true;
        save();
        await trap.arm(DENTURE.type, DENTURE.name);
        own.ours = true;
        own.pending = false;
        save();
        log(`✔ Base: ${DENTURE.short} (${toothlets.toLocaleString()} Toothlets)`);
      } else if (reason === 'a charm is enough') {
        // nothing to do: the base you have stays on
      } else if (reason && own.ours) {
        const bases = (await gear.bases()).filter((b) => b.type !== DENTURE.type);
        let back = own.prev && bases.find((b) => b.type === own.prev.type || b.name === own.prev.name);
        let note = '';
        if (!back) {
          back = bases.slice().sort((a, b) => b.luck - a.luck)[0];
          note = own.prev ? `, ${own.prev.name} not owned` : '';
        }
        if (back) await trap.arm(back.type, back.name);
        release();
        log(`✔ Base: ${back ? back.name : 'none'} back (${reason}${note})`);
      } else if (mode() !== 'off' && covers(s) && owned === false && !warned.has('owned')) {
        warned.add('owned');
        log(`Auto Base: no ${DENTURE.name} owned, base left alone`);
      }
      checkedKey = key(s);
    }

    return {
      get toothlets() { return toothlets; },
      get owned() { return owned; },
      noteHunt() { hunt++; },

      // Toothlet count for the panel, read without touching the trap (also while Auto Base is off).
      async refresh() {
        try { const c = await gear.charge(); owned = c.owned; toothlets = c.toothlets; } catch (e) { /* next hunt */ }
      },

      // One line under the Base setting: Toothlets left and the base the Denture gives way to.
      hint() {
        if (mode() === 'off') return '';
        if (owned === false) return `You don't own the ${DENTURE.name}.`;
        const n = toothlets == null ? '? Toothlets' : toothlets <= 0 ? 'No Toothlets'
          : `${toothlets.toLocaleString()} Toothlets${toothlets <= min() ? ' (at minimum)' : ''}`;
        const armed = trap.base();
        if (!own.ours && armed === DENTURE.name) return `${n} · You armed the Denture yourself: left on.`;
        // Plain words for a new player: when the Denture goes on, and which base comes back after.
        const other = own.ours ? (own.prev ? own.prev.name : 'your luckiest base') : armed || 'your base';
        const when = (charmFirst()
          ? { raid: 'Swaps in for raids when no charm is enough', ship: 'Swaps in for shipments, and for raids when no charm is enough',
            always: 'Stays on until the Toothlets run out (raids: only when no charm is enough)' }
          : { raid: 'Swaps in for raids', ship: 'Swaps in for raids and shipments',
            always: 'Stays on until the Toothlets run out' })[mode()];
        return `${n} · ${when}, then back to ${other}.`;
      },

      action(s) {
        if (mode() === 'off' && !own.ours && !own.pending) return null;
        if (checkedKey === key(s) || backedOff('base')) return null;
        return { kind: 'base', label: 'Base check', done: '', run: () => check(s) };
      },
    };
  }

  const base = makeBase({
    storage: {
      load() {
        try { const d = JSON.parse(localStorage.getItem(BASE_KEY) || 'null'); if (d && typeof d === 'object') return d; } catch (e) { /* corrupt or unavailable */ }
        return {};
      },
      save(d) {
        try { localStorage.setItem(BASE_KEY, JSON.stringify(d)); } catch (e) { /* storage unavailable */ }
      },
    },
    gear: {
      async charge() {
        const list = await inventory(false, [DENTURE.type, DENTURE.charge]);
        const qty = (type) => toNum((list.find((i) => i.type === type) || {}).quantity);
        return { owned: qty(DENTURE.type) > 0, toothlets: qty(DENTURE.charge) };
      },
      async bases() {
        return (await inventory(true, ['base'])).filter((i) => i.classification === 'base' && toNum(i.quantity) > 0)
          .map((i) => ({ type: i.type, name: i.name, luck: toNum(i.luck) }));
      },
    },
    trap: {
      base: () => (window.user || {}).base_name || null,
      signature: () => trapSignature(),
      arm: (type, name) => armGear(type, 'base', name),
    },
    raid: { short: (s) => raids.short(s) },
    config: () => cfg,
    backedOff: (kind) => backedOff(kind),
    log: (msg) => log(msg),
  });

  async function startRaid(raid) {
    let view = $1(SEL.raidDialog);
    if (!view) {
      if ($1(SEL.hudDialog)) closeHudDialog();
      const btn = $1(SEL.hudRaidButton);
      if (!btn) throw new Error('"Locate Captain Crook" button not found');
      btn.click();
      view = await waitFor(() => { const v = $1(SEL.raidDialog); return isVisible(v) ? v : null; }, 8000);
      if (!view) throw new Error('raid dialog did not open');
    }

    // Handlers read e.target, so click the exact elements.
    const pick = await waitFor(() => $1(SEL.raidSelect(raid.type), view), 4000);
    if (!pick) throw new Error(`raid "${raid.name}" not offered`);
    pick.click();
    const bait = await waitFor(() => { const b = $1(SEL.raidBait(BAITS.bocconcini.type), view); return isVisible(b) ? b : null; }, 4000);
    if (!bait) throw new Error('Bocconcini not offered for the raid');
    if (!bait.classList.contains(SEL.raidBaitSelected)) bait.click();
    if (!bait.classList.contains(SEL.raidBaitSelected)) throw new Error('could not select Bocconcini');

    const disarmCb = $1(SEL.raidDisarmCheckbox, view);
    if (disarmCb && disarmCb.checked) disarmCb.click(); // leave bait armed; the script swaps it after the raid
    await sleep(300);

    const enter = $1(SEL.raidEnter, view);
    if (!enter) throw new Error('raid confirm button not found');
    enter.click();
    const ok = await waitFor(() => { const q = getQuest(); return (q && q.is_intercepting) || $1(SEL.raidView); }, 12000);
    if (!ok) throw new Error('raid start not confirmed by the game');
  }

  function closeRaidDialog() {
    const v = $1(SEL.raidDialog);
    if (!v) return;
    const popup = v.closest('#overlayPopup');
    const btn = (popup && $1('.jsDialogClose', popup)) || $1(SEL.raidCancel, v);
    if (btn) btn.click();
  }

  async function craftCheese(c, plan, before) {
    let view = $1(`${SEL.hudDialog} ${c.view}`);
    if (!view) {
      if ($1(SEL.hudDialog)) closeHudDialog();
      if ($1(SEL.shipDialog)) throw new Error('shipment dialog is open');
      const btn = $1(c.button);
      if (!btn) throw new Error(`${c.label} craft button not found`);
      btn.click();
      view = await waitFor(() => $1(`${SEL.hudDialog} ${c.view}`), 6000);
      if (!view) throw new Error('craft dialog did not open');
    }

    const ingredient = plan.recipe === 2 ? 'magic_essence_craft_item' : 'gold_stat_item';
    const recipe = [...view.querySelectorAll(SEL.craftRecipe)]
      .find((r) => r.querySelector(`[data-item-type="${ingredient}"]`));
    if (!recipe) throw new Error(`Recipe ${plan.recipe} not found in craft dialog`);

    const input = $1(SEL.craftQty, recipe);
    const button = $1(SEL.craftBtn, recipe);
    if (!input || !button) throw new Error('craft quantity/button not found');

    const max = toNum(($1(SEL.craftMax, recipe) || {}).textContent);
    const times = max > 0 ? Math.min(plan.times, max) : plan.times;
    setInputValue(input, times);
    await sleep(300);
    if (toNum(input.value) !== times) throw new Error(`quantity input rejected ${times}`);

    rt.lastCraft = { which: c.key, before, at: Date.now() };
    button.click();

    // The game closes the dialog itself once the craft completes.
    const done = await waitFor(() => !$1(SEL.hudDialog), 10000);
    if (!done) {
      closeHudDialog();
      throw new Error('craft dialog did not close, craft may have failed');
    }
  }

  async function launchShipment(sh, cheeseKey) {
    let dlg = $1(SEL.shipDialog);
    if (!dlg) {
      if ($1(SEL.hudDialog)) closeHudDialog();
      const hudBtn = $1(SEL.hudShipButton(sh.type));
      if (!hudBtn) throw new Error(`HUD button for ${sh.label} not found`);
      hudBtn.click();
      dlg = await waitFor(() => { const d = $1(SEL.shipDialog); return isVisible(d) ? d : null; }, 8000);
      if (!dlg) throw new Error('"Select a Shipment" dialog did not open');
    }

    // 1) Shipment card (the handler reads e.target, so click the card element itself)
    const card = await waitFor(() => $1(SEL.shipCard(sh.type), dlg), 4000);
    if (!card) throw new Error(`card "${sh.label}" not found`);
    if (!card.classList.contains(SEL.shipCardSelected)) card.click();
    if (!card.classList.contains(SEL.shipCardSelected)) throw new Error(`could not select ${sh.label}`);

    // 2) Cheese (same e.target rule: click the bait container, not the image inside)
    let cheese = cheeseKey;
    let baitEl = $1(SEL.shipBait(BAITS[cheese].type), dlg);
    if (!baitEl && cheese !== 'swiss') {
      log(`${BAITS[cheese].label} not offered, using Sky Pirate Swiss`, 'error');
      cheese = 'swiss';
      baitEl = $1(SEL.shipBait(BAITS[cheese].type), dlg);
    }
    if (!baitEl) throw new Error(`cheese "${BAITS[cheese].label}" not offered`);
    if (!baitEl.classList.contains(SEL.shipBaitSelected)) baitEl.click();
    if (!baitEl.classList.contains(SEL.shipBaitSelected)) throw new Error(`could not select ${BAITS[cheese].label}`);

    // 3) Post-trade option: always "Leave my Bait Armed" (unchecked). The script picks the next bait
    //    itself after landing, so the trap is never empty in between.
    const disarmCb = $1(SEL.shipDisarmCheckbox, dlg);
    if (disarmCb) {
      if (disarmCb.checked) disarmCb.click();
    } else {
      log('Post-trade toggle not found, leaving game default', 'error');
    }
    await sleep(300);

    // 4) Confirm
    const enter = $1(SEL.shipEnter, dlg);
    if (!enter) throw new Error('confirm "Start Trading" button not found');
    enter.click();

    const ok = await waitFor(() => {
      const q = getQuest();
      return (q && q.is_shipping) || $1(SEL.shippingView);
    }, 12000);
    if (!ok) throw new Error('launch not confirmed by the game');
  }

  /* ------------------------------------------------------------------ *
   * Scheduler
   * ------------------------------------------------------------------ */
  function scheduleTick(ms) {
    clearTimeout(rt.tickTimer);
    rt.tickTimer = setTimeout(tick, Math.max(0, ms));
  }

  async function runAction(kind, label, fn, done) {
    rt.busy = true;
    if (!rt.pending) { rt.pendingSince = Date.now(); flushChain(); rt.chain = { lines: [] }; }
    rt.pending = true;
    rt.lastAction = Date.now();
    try {
      await fn();
      rt.backoff[kind] = 0;
      if (kind === 'launch') rt.launchedAt = Date.now();
      if (kind === 'raidStart') rt.raidStartedAt = Date.now();
      if (done !== '') log(done || `✔ ${label}`);   // '' = an event line covers it (launch, raid start)
    } catch (e) {
      rt.backoff[kind] = Date.now() + FAIL_BACKOFF_MS;
      log(`✖ ${label}: ${(e && e.message) || e}`, 'error');
      if (kind === 'launch') closeShipDialog();
      if (kind === 'craft') closeHudDialog();
      if (kind === 'raidStart') closeRaidDialog();
      if (kind === 'raid' || kind === 'luck') { const x = $1(SEL.minluckClose); if (x) x.click(); }
    } finally {
      rt.busy = false;
      rt.lastAction = Date.now();
      rt.cooldown = QUICK_KINDS.has(kind) && !rt.backoff[kind] ? QUICK_COOLDOWN_MS : COOLDOWN_MS;
      updateUI();
      scheduleTick(rt.cooldown + 200);
    }
  }

  const SHIP_SHORT = { gas_shipment: 'Gas', cloudstone_shipment: 'Cloudstone', spice_shipment: 'Spice' };
  try { localStorage.removeItem('mhCeruleanSkyport.flights.v1'); } catch (e) { /* old intel-tracker data */ }

  /* ------------------------------------------------------------------ *
   * Event log: launches, returns (with gains), raids, problems on/off
   * ------------------------------------------------------------------ */
  const EVENTS_KEY = 'mhCeruleanSkyport.events.v1';
  const LOOT = [['debris', 'Debris'], ['gas', 'Gas'], ['cloudstone', 'Cloudstone'], ['ingot', 'Ingot'], ['spice', 'Spice'], ['cannonball', 'Cannonballs']];
  const events = (() => {
    try { return Object.assign({ ship: null, raid: null, problems: {} }, JSON.parse(localStorage.getItem(EVENTS_KEY) || 'null')); }
    catch (e) { return { ship: null, raid: null, problems: {} }; }
  })();
  const saveEvents = () => { try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch (e) { /* storage unavailable */ } };

  function lootSnapshot(s) {
    const items = (getQuest() || {}).items || {};
    const snap = {};
    for (const [k] of LOOT) snap[k] = s[k];
    for (const k of Object.keys(items)) if (/_intel_stat_item$/.test(k)) snap[k] = toNum(items[k]);
    return snap;
  }

  function gainsText(before, after) {
    const name = (k) => (LOOT.find(([x]) => x === k) || [])[1]
      || `${k.replace(/_intel_stat_item$/, '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} intel`;
    return Object.keys(after).filter((k) => after[k] > (before[k] || 0)).map((k) => `+${after[k] - (before[k] || 0)} ${name(k)}`).join(', ');
  }

  // Each problem is logged once when it starts and (if it has a clear message) once when it clears.
  function problemsFor(s) {
    const out = Object.assign({}, shipmentBait(s).problems);
    if (s.swiss <= 0) out['out:swiss'] = ['⚠ Out of Sky Pirate Swiss', '✔ Sky Pirate Swiss back in stock'];
    if (cfg.autoLaunch && !s.isShipping && !s.isIntercepting) {
      const { sh, allCapped } = pickShipment(s);
      if (!sh && allCapped) out.capped = ['⚠ All affordable routes at 50 intel', ''];
      else if (!sh) out.broke = ['⚠ No shipment affordable above reserves', ''];
    }
    return out;
  }

  function setProblems(now) {
    for (const [k, msg] of Object.entries(now)) {
      if (!(k in events.problems)) { log(msg[0]); events.problems[k] = msg[1]; }
    }
    for (const k of Object.keys(events.problems)) {
      if (!now[k]) { if (events.problems[k] !== '') log(events.problems[k]); delete events.problems[k]; }
    }
  }

  function trackEvents(s, u) {
    if (u.has_puzzle) {
      if (!events.problems.kr) { log("⚠ King's Reward, paused"); events.problems.kr = "✔ King's Reward solved"; saveEvents(); }
      return;
    }
    setProblems(problemsFor(s));   // also clears the King's Reward entry
    const fresh = (t) => Date.now() - (t || 0) < 60000;   // started by the script just now, or already under way
    if (s.isShipping && !events.ship) {
      const name = `${SHIP_SHORT[s.shipType] || 'Unknown'} Shipment`;
      events.ship = { name, items: lootSnapshot(s) };
      log(`✈ ${name} ${fresh(rt.launchedAt) ? 'launched' : 'in flight'}${s.baitKey ? ` (${BAITS[s.baitKey].label})` : ''}`);
    } else if (!s.isShipping && events.ship) {
      const gains = gainsText(events.ship.items, lootSnapshot(s));
      log(`⚓ ${events.ship.name} back${gains ? `: ${gains}` : ''}`);
      events.ship = null;
    }
    if (s.isIntercepting && !events.raid) {
      events.raid = s.raid.name;
      log(`⚔ ${s.raid.name} raid ${fresh(rt.raidStartedAt) ? 'started' : 'under way'}`);
    } else if (!s.isIntercepting && events.raid) {
      log(`⚔ ${events.raid} raid finished`);
      events.raid = null;
    }
    saveEvents();
  }

  // Status line parts: a coloured dot (kind), a bold lead word and the detail text.
  // kind: ok (in flight), idle (docked), pause (Pause toggle), work (raid / acting), err (failing, KR).
  function planStatus(p, paused) {
    if (p.action) return paused ? { kind: 'pause', lead: 'Paused', detail: `would: ${p.action.label}` } : { kind: 'work', lead: 'Working', detail: p.action.label };
    if (paused) return { kind: 'pause', lead: 'Paused', detail: p.detail ? `${p.lead.toLowerCase()}: ${p.detail}` : p.lead.toLowerCase() };
    const kind = p.warn ? 'err' : p.lead === 'Raid' ? 'work' : p.lead === 'In flight' ? 'ok' : 'idle';
    return { kind, lead: p.lead, detail: p.detail };
  }

  async function tick() {
    rt.tickTimer = null;
    if (rt.busy) return;
    const wasPending = rt.pending;
    rt.pending = false;
    try {
      const u = window.user;
      if (!u) { rt.status = { kind: 'idle', lead: 'Waiting for game…', detail: '' }; return; }
      const s = readState();
      if (!s) { flushChain(); rt.status = { kind: 'idle', lead: 'Not at Cerulean Skyport', detail: 'travel there to use the autopilot' }; return; }
      try { trackEvents(s, u); } catch (e) { console.warn(`[${SCRIPT}] events`, e); }
      shipCharm.sync();
      raids.sync(s);
      if (u.has_puzzle) { flushChain(); rt.status = { kind: 'err', lead: "King's Reward", detail: 'paused until it is solved' }; return; }

      const wait = rt.cooldown - (Date.now() - rt.lastAction);
      if (wait > 0) {
        // Waiting out the gap after a step: keep busy() on so the horn waits for the next step, if any.
        rt.pending = wasPending && !cfg.dryRun;
        if (rt.chain && Date.now() - rt.pendingSince > PENDING_MAX_MS) flushChain();
        scheduleTick(wait + 100);
        return;
      }
      const p = decide(s, { cfg, backedOff, lastCraft: rt.lastCraft, now: Date.now(), shipCharm, raids, weapon, base });
      rt.status = planStatus(p, cfg.dryRun);
      if (!p.action || cfg.dryRun) flushChain();   // the chain of steps is over
      if (p.action && !cfg.dryRun) {
        updateUI();
        await runAction(p.action.kind, p.action.label, p.action.run, p.action.done);
      }
    } catch (e) {
      log(`tick error: ${(e && e.message) || e}`, 'error');
      rt.status = { kind: 'err', lead: 'Error', detail: `${(e && e.message) || e}, retrying` };
    } finally {
      updateUI();
    }
  }

  /* ------------------------------------------------------------------ *
   * UI
   * ------------------------------------------------------------------ */
  const CSS = `
#${PANEL_ID}{position:fixed;top:10px;right:10px;z-index:99999;width:280px;background:#1b1f27;color:#e6e9ef;
  border:1px solid #3a4150;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.45);
  font:12px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;}
#${PANEL_ID} *{box-sizing:border-box;}
#${PANEL_ID} .mhcs-head{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;
  background:#252b36;border-radius:8px 8px 0 0;user-select:none;}
#${PANEL_ID}.mhcs-collapsed .mhcs-head{border-radius:8px;}
#${PANEL_ID} .mhcs-title{font-weight:600;color:#9ecbff;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#${PANEL_ID} .mhcs-hstate{display:none;align-items:center;gap:5px;margin:0 8px 0 6px;font-size:11px;color:#c9d1d9;white-space:nowrap;}
#${PANEL_ID}.mhcs-collapsed .mhcs-hstate{display:inline-flex;}
#${PANEL_ID} .mhcs-min{background:none;border:1px solid #4a5263;color:#e6e9ef;border-radius:4px;width:22px;height:20px;
  line-height:16px;cursor:pointer;padding:0;}
#${PANEL_ID}.mhcs-collapsed .mhcs-body{display:none;}
#${PANEL_ID} .mhcs-toggles{display:grid;grid-template-columns:1fr 1fr;gap:0 8px;}
#${PANEL_ID} .mhcs-body{padding:8px 10px 10px;max-height:calc(100vh - 60px);overflow:auto;}
#${PANEL_ID}{--ok:#56d364;--idle:#8b93a3;--pause:#e3b341;--work:#58a6ff;--err:#ff7b72;}
#${PANEL_ID} .mhcs-status{display:flex;gap:7px;align-items:baseline;color:#aab2c0;margin-bottom:6px;}
#${PANEL_ID} .mhcs-status b{color:#e6e9ef;font-weight:600;}
#${PANEL_ID} .mhcs-status.mhcs-err,#${PANEL_ID} .mhcs-status.mhcs-err b{color:var(--err);}
#${PANEL_ID} .mhcs-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--c,var(--idle));transform:translateY(-1px);box-shadow:0 0 0 3px color-mix(in srgb,var(--c,var(--idle)) 18%,transparent);}
#${PANEL_ID}.mhcs-away .mhcs-body > :not(.mhcs-status){display:none;}
#${PANEL_ID}.mhcs-away .mhcs-status{margin-bottom:0;}
#${PANEL_ID} .mhcs-group{color:#9ecbff;font-size:11px;font-weight:600;margin-top:7px;}
#${PANEL_ID} .mhcs-res{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 10px;margin:2px 0;}
#${PANEL_ID} .mhcs-res span{display:flex;align-items:center;gap:5px;}
#${PANEL_ID} .mhcs-res img{width:16px;height:16px;border-radius:3px;object-fit:contain;}
#${PANEL_ID} .mhcs-res b{margin-left:auto;}
#${PANEL_ID} .mhcs-res b{font-weight:600;}
#${PANEL_ID} .mhcs-low{color:#ff7b72;}
#${PANEL_ID} .mhcs-sec{border-top:1px solid #303747;padding-top:6px;margin-top:6px;}
#${PANEL_ID} label{display:flex;align-items:center;gap:6px;margin:3px 0;color:#e6e9ef !important;font:inherit;}
#${PANEL_ID} label.mhcs-row{justify-content:space-between;}
#${PANEL_ID} label.mhcs-stack{flex-direction:column;align-items:stretch;gap:3px;}
#${PANEL_ID} label.mhcs-stack select{max-width:none;width:100%;}
#${PANEL_ID} .mhcs-reset{display:block;margin:8px 0 0 auto;background:none;border:0;padding:0;color:#8b93a3;font:inherit;font-size:11px;text-decoration:underline;cursor:pointer;}
#${PANEL_ID} .mhcs-reset:hover,#${PANEL_ID} .mhcs-reset.mhcs-armed{color:var(--err);}
#${PANEL_ID} .mhcs-line{display:flex;align-items:center;gap:6px;margin:3px 0;}
#${PANEL_ID} .mhcs-line label{margin:0;}
#${PANEL_ID} .mhcs-line select{flex:1;min-width:0;max-width:none;}
#${PANEL_ID} .mhcs-lbl{flex:none;width:62px;}
#${PANEL_ID} .mhcs-lbl.mhcs-gap{width:auto;}
#${PANEL_ID} .mhcs-gap{margin-left:4px;}
#${PANEL_ID} .mhcs-grow{flex:1;min-width:0;margin:0;}
#${PANEL_ID} .mhcs-lbl.mhcs-gap{margin-left:0;}
#${PANEL_ID} .mhcs-mini{flex:none;display:flex;align-items:center;gap:4px;color:#aab2c0;}
#${PANEL_ID} .mhcs-mini input[type=number]{width:42px;}
#${PANEL_ID} .mhcs-res3{display:grid;grid-template-columns:repeat(3,1fr);gap:0 8px;}
#${PANEL_ID} .mhcs-res3 label{flex-direction:column;align-items:stretch;gap:2px;margin:0;font-size:11px;color:#aab2c0 !important;}
#${PANEL_ID} .mhcs-res3 input[type=number]{width:100%;}
#${PANEL_ID} .mhcs-bocc,#${PANEL_ID} .mhcs-base{display:none !important;}
#${PANEL_ID}.mhcs-show-bocc .mhcs-bocc,#${PANEL_ID}.mhcs-show-base .mhcs-mini.mhcs-base{display:flex !important;}
#${PANEL_ID}.mhcs-show-base .mhcs-hint.mhcs-base{display:block !important;}
#${PANEL_ID}.mhcs-show-base .mhcs-line.mhcs-base{display:flex !important;}
#${PANEL_ID} .mhcs-hint{color:#8b93a3;font-size:11px;line-height:1.35;margin:2px 0 4px;}
#${PANEL_ID} .mhcs-subhead{color:#9ecbff;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;margin:10px 0 4px;padding-bottom:2px;border-bottom:1px solid #303747;}
#${PANEL_ID} .mhcs-subhead:first-of-type{margin-top:4px;}
#${PANEL_ID} .mhcs-pause{flex:none;margin-right:6px;padding:1px 8px;height:20px;border-radius:999px;cursor:pointer;font:600 11px/16px -apple-system,Segoe UI,Roboto,Arial,sans-serif;white-space:nowrap;border:1px solid var(--pause);background:color-mix(in srgb,var(--pause) 18%,transparent);color:var(--pause);}
#${PANEL_ID}.mhcs-is-paused .mhcs-hstate{display:none;}
#${PANEL_ID} .mhcs-pause:hover{background:color-mix(in srgb,var(--pause) 28%,transparent);}
#${PANEL_ID} .mhcs-pause.mhcs-running{border-color:color-mix(in srgb,var(--ok) 55%,transparent);background:color-mix(in srgb,var(--ok) 10%,transparent);color:var(--ok);}
#${PANEL_ID} .mhcs-pause.mhcs-running:hover{background:color-mix(in srgb,var(--ok) 18%,transparent);}
#${PANEL_ID} select,#${PANEL_ID} input[type=number]{background:#11151b;color:#e6e9ef;border:1px solid #3a4150;border-radius:4px;
  padding:2px 4px;font:inherit;}
#${PANEL_ID} select{max-width:165px;}
#${PANEL_ID} input[type=number]{width:70px;}
#${PANEL_ID} .mhcs-tip{position:absolute;left:8px;right:8px;z-index:3;display:none;pointer-events:none;background:#0d1117;color:#e6e9ef;border:1px solid #3a4150;border-radius:6px;padding:6px 8px;font-size:11px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,.5);}
#${PANEL_ID} summary{cursor:pointer;color:#e6e9ef;font-weight:600;font-size:12.5px;user-select:none;padding:2px 0;}
#${PANEL_ID} summary:hover{color:#9ecbff;}
#${PANEL_ID} .mhcs-sub{color:#8b93a3;font-size:11px;margin-top:1px;}
#${PANEL_ID} .mhcs-log{margin-top:4px;max-height:220px;overflow-y:auto;font-size:11.5px;line-height:1.4;color:#c9d1d9;}
#${PANEL_ID} .mhcs-ent{display:grid;grid-template-columns:36px 1fr;gap:6px;padding:4px 2px;border-bottom:1px solid #262c38;word-break:break-word;}
#${PANEL_ID} .mhcs-ent:last-child{border-bottom:0;}
#${PANEL_ID} .mhcs-t{color:#6e7681;font-variant-numeric:tabular-nums;}
#${PANEL_ID} .mhcs-warn{color:#e3b341;}
`;

  const TOGGLES = [
    ['autoLaunch', 'Auto Launch', `Launches the best affordable shipment above your reserves. Skips ${INTEL_CAP}+ intel.`],
    ['autoRaid', 'Auto Raid', `Starts a raid at ${INTEL_CAP} intel with ${RAID_MIN_BOCCONCINI}+ Bocconcini.`],
    ['autoBait', 'Auto Bait', 'Arms the right bait in flight, on raids and docked.'],
    ['autoTrap', 'Auto Trap', 'C.L.A.W. for curds with Gouda or SUPER|brie+, else luckiest Law; best allowed type on raids.'],
    ['autoCraft', 'Auto Craft', `Crafts Swiss below ${MIN_SWISS}, and ${RAID_MIN_BOCCONCINI} Bocconcini before a raid.`],
  ];

  const HTML = `
<div class="mhcs-head"><span class="mhcs-title">☁ ${SCRIPT}</span><span class="mhcs-hstate"><i class="mhcs-dot"></i><span data-f="hlead"></span></span><button class="mhcs-pause" type="button" data-a="pause" data-tip="Paused: shows what it would do, without acting."></button><button class="mhcs-min" type="button" title="Minimize">–</button></div>
<div class="mhcs-body">
  <div class="mhcs-status"><i class="mhcs-dot"></i><span data-f="status"></span></div>
  <details class="mhcs-sec" data-fold="showResources"><summary>Resources</summary>
${RESOURCE_GROUPS.map(([group, items]) => `  <div class="mhcs-group">${group}</div>
  <div class="mhcs-res">${items.map(([key, name, img]) =>
    `<span><img src="${IMG}${img}" alt="">${name} <b data-r="${key}"></b></span>`).join('')}</div>
`).join('')}  </details>
  <div class="mhcs-sec">
    <div class="mhcs-toggles">
${TOGGLES.map(([key, text, tip]) => `    <label data-tip="${tip}"><input type="checkbox" data-c="${key}"> ${text}</label>
`).join('')}    </div>
  </div>
  <details class="mhcs-sec" data-fold="showSettings"><summary>Settings</summary>
    <div class="mhcs-subhead">Bait</div>
    <div class="mhcs-line" data-tip="Cheese on shipments."><span class="mhcs-lbl">Shipment</span>
      <select data-c="spiceMode">
        <option value="swiss">Swiss</option>
        <option value="romano">Romano</option>
        <option value="bocconcini">Bocconcini</option>
        <option value="bocconcini_spice">Bocc. on Spice</option>
      </select><span class="mhcs-mini mhcs-bocc" data-tip="Bocconcini kept for raids (a raid needs ${RAID_MIN_BOCCONCINI}). 0 = none.">Min <input type="number" min="0" step="1" data-c="boccMin"></span></div>
    <div class="mhcs-hint" data-f="baitHint"></div>
    <div class="mhcs-line" data-tip="Gouda and SUPER|brie+ farm Corsair's Curds."><span class="mhcs-lbl">Docked</span>
      <select data-c="dockedAction">
        <option value="gouda">Gouda</option>
        <option value="superbrie">SUPER|brie+</option>
        <option value="disarm">Disarm</option>
        <option value="none">Leave as-is</option>
      </select></div>
    <div class="mhcs-subhead">Base</div>
    <div class="mhcs-line" data-tip="Signature Series Denture Base: 3,750 power, 50 luck while you hold Toothlets (one used per catch)."><span class="mhcs-lbl">Denture</span>
      <select data-c="dentureBase">
        <option value="off">Off</option>
        <option value="raid">Raids only</option>
        <option value="ship">Raids and shipments</option>
        <option value="always">Every hunt</option>
      </select><span class="mhcs-mini mhcs-base" data-tip="Toothlets to keep. At or below it, your old base goes back on. 0 = none.">Min <input type="number" min="0" step="1" data-c="toothletMin"></span></div>
    <div class="mhcs-line mhcs-base" data-tip="Charm first: on raids the Denture only goes on if no charm reaches minluck. Saves Toothlets."><span class="mhcs-lbl">Prefer</span>
      <select data-c="basePrefer">
        <option value="charm">Charm first</option>
        <option value="denture">Denture first</option>
      </select></div>
    <div class="mhcs-hint mhcs-base" data-f="baseHint"></div>
    <div class="mhcs-subhead">Luck Charms</div>
    <label class="mhcs-line" data-tip="Closes the gap to minluck. Removed after the raid."><span class="mhcs-lbl">Raids</span><input type="checkbox" data-c="luckCharmsRaid"></label>
    <div class="mhcs-line" data-tip="With Bocconcini: removed when another bait goes on."><span class="mhcs-lbl">Shipments</span>
      <select data-c="luckCharmsNormal">
        <option value="off">Off</option>
        <option value="bocconcini">With Bocconcini</option>
        <option value="always">Always</option>
      </select></div>
    <div class="mhcs-line" data-tip="Only charms you hold more of. 0 = any."><span class="mhcs-lbl">Min held</span><input type="number" min="0" step="1" data-c="charmMinQty"></div>
    <div class="mhcs-subhead">Cannonballs</div>
    <label class="mhcs-line" data-tip="+1 Ingot or intel per raid hunt, while any are left."><span class="mhcs-lbl">Raids</span><input type="checkbox" data-c="cannonRaid"></label>
    <div class="mhcs-line"><label class="mhcs-line mhcs-grow" data-tip="+1 shipment loot per hunt, only above the number kept for raids."><span class="mhcs-lbl">Shipments</span><input type="checkbox" data-c="cannonShip"></label><span class="mhcs-mini" data-tip="Cannonballs kept for raids. 25 covers one raid.">Keep <input type="number" min="0" step="1" data-c="cannonKeep"></span></div>
    <div class="mhcs-subhead">Crafting</div>
    <label data-tip="2 cheese per craft; Gold when out. Off: Gold only."><input type="checkbox" data-c="craftEssence"> Use Magic Essence (Recommended)</label>
    <div class="mhcs-subhead">Reserves</div>
    <div class="mhcs-res3">
      <label data-tipfor="minDebris"><span>Debris</span><input type="number" min="0" step="1" data-c="minDebris"></label>
      <label data-tipfor="minGas"><span>Gas</span><input type="number" min="0" step="1" data-c="minGas"></label>
      <label data-tipfor="minCloudstone"><span>Cloudstone</span><input type="number" min="0" step="1" data-c="minCloudstone"></label>
    </div>
    <button class="mhcs-reset" type="button" data-a="reset" data-tip="Every setting, Pause too. Click twice.">Reset to defaults</button>
  </details>
  <details class="mhcs-sec" data-fold="showLog"><summary>Log</summary><div class="mhcs-log" data-f="log"></div></details>
</div>`;

  let panel = null;

  const RESERVE_TIPS = {
    minDebris: { item: 'Debris', ship: 'gas_shipment', shipLabel: 'Gas' },
    minGas: { item: 'Gas', ship: 'cloudstone_shipment', shipLabel: 'Cloudstone' },
    minCloudstone: { item: 'Cloudstone', ship: 'spice_shipment', shipLabel: 'Spice' },
  };

  // Reserve tooltips use the current setting, e.g. "Always keep 100 Debris. Gas Shipments (20 Debris)
  // only launch at 120+ Debris."
  function refreshTips(s) {
    if (!panel) return;
    for (const el of panel.querySelectorAll('[data-tipfor]')) {
      const t = RESERVE_TIPS[el.dataset.tipfor];
      const min = toNum(cfg[el.dataset.tipfor]);
      const def = SHIPMENTS.find((x) => x.type === t.ship);
      const live = s && s.shipments[t.ship];
      const cost = live && live.cost != null ? live.cost : def.cost;
      const text = `${t.shipLabel} Shipments (${cost}) launch at ${min + cost}+ ${t.item}.`;
      el.dataset.tip = text;
    }
  }

  // Hover tooltips for [data-tip] rows, drawn inside the panel: below the row, or above it if that would
  // run past the panel's bottom edge.
  function initTooltips() {
    const tip = document.createElement('div');
    tip.className = 'mhcs-tip';
    panel.appendChild(tip);
    let timer = null;
    const hide = () => { clearTimeout(timer); tip.style.display = 'none'; };
    panel.addEventListener('mouseover', (e) => {
      const row = e.target.closest('[data-tip]');
      if (!row || row.contains(e.relatedTarget)) return;
      hide();
      if (panel.classList.contains('mhcs-collapsed')) return;   // no room inside a minimised panel
      timer = setTimeout(() => {
        tip.textContent = row.dataset.tip;
        tip.style.display = 'block';
        const p = panel.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        const below = r.bottom - p.top + 4;
        const above = r.top - p.top - tip.offsetHeight - 4;
        tip.style.top = `${below + tip.offsetHeight <= p.height || above < 0 ? below : above}px`;
      }, 350);
    });
    panel.addEventListener('mouseout', (e) => {
      const row = e.target.closest('[data-tip]');
      if (row && !row.contains(e.relatedTarget)) hide();
    });
    panel.querySelector('.mhcs-body').addEventListener('scroll', hide);
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = HTML;
    if (cfg.minimized) panel.classList.add('mhcs-collapsed');
    document.body.appendChild(panel);
    initTooltips();

    const minBtn = panel.querySelector('.mhcs-min');
    minBtn.textContent = cfg.minimized ? '+' : '–';
    minBtn.addEventListener('click', () => {
      cfg.minimized = !cfg.minimized;
      panel.classList.toggle('mhcs-collapsed', cfg.minimized);
      minBtn.textContent = cfg.minimized ? '+' : '–';
      saveConfig();
    });

    for (const el of panel.querySelectorAll('[data-fold]')) {
      const key = el.dataset.fold;
      el.open = !!cfg[key];
      el.addEventListener('toggle', () => { cfg[key] = el.open; saveConfig(); });
    }

    // Spells out which cheese each shipment gets, including the fallback to Swiss.
    const showBaitMode = () => {
      panel.classList.toggle('mhcs-show-bocc', !!baitMode().useMin);
      panel.classList.toggle('mhcs-show-base', (cfg.dentureBase || 'off') !== 'off');
      panel.querySelector('[data-f="baitHint"]').textContent = baitMode().hint;
      panel.querySelector('[data-f="baseHint"]').textContent = base.hint();
    };
    const syncInputs = () => {
      for (const el of panel.querySelectorAll('[data-c]')) {
        if (el.type === 'checkbox') el.checked = !!cfg[el.dataset.c];
        else el.value = cfg[el.dataset.c];
      }
      showBaitMode();
    };
    syncInputs();
    for (const el of panel.querySelectorAll('[data-c]')) {
      const key = el.dataset.c;
      el.addEventListener('change', () => {
        if (el.type === 'checkbox') cfg[key] = el.checked;
        else if (el.type === 'number') {
          const n = Math.max(0, Math.floor(toNum(el.value)));
          cfg[key] = n;
          el.value = n;
        } else cfg[key] = el.value;
        showBaitMode();
        saveConfig();
        refreshTips(readState());
        rt.backoff = {};
        scheduleTick(300);
      });
    }

    const pauseBtn = panel.querySelector('[data-a="pause"]');
    const showPause = () => {
      pauseBtn.textContent = cfg.dryRun ? '❚❚ Paused' : '▶ Running';
      pauseBtn.classList.toggle('mhcs-running', !cfg.dryRun);
      panel.classList.toggle('mhcs-is-paused', !!cfg.dryRun);   // the pill already says Paused
    };
    showPause();
    pauseBtn.addEventListener('click', () => {
      cfg.dryRun = !cfg.dryRun;
      saveConfig();
      showPause();
      log(cfg.dryRun ? 'Paused' : 'Running');
      rt.backoff = {};
      scheduleTick(300);
    });

    const resetBtn = panel.querySelector('[data-a="reset"]');
    let resetTimer = null;
    resetBtn.addEventListener('click', () => {
      if (!resetBtn.classList.contains('mhcs-armed')) {
        resetBtn.classList.add('mhcs-armed');
        resetBtn.textContent = 'Click again to reset';
        resetTimer = setTimeout(() => { resetBtn.classList.remove('mhcs-armed'); resetBtn.textContent = 'Reset to defaults'; }, 4000);
        return;
      }
      clearTimeout(resetTimer);
      for (const k of Object.keys(DEFAULTS)) if (k !== 'minimized' && !k.startsWith('show')) cfg[k] = DEFAULTS[k];
      saveConfig();
      syncInputs();
      showPause();
      refreshTips(readState());
      resetBtn.classList.remove('mhcs-armed');
      resetBtn.textContent = 'Reset to defaults';
      log('✔ Settings reset to defaults');
      rt.backoff = {};
      scheduleTick(300);
    });

  }

  function renderStatus() {
    const { kind, lead, detail } = rt.status;
    const line = panel.querySelector('[data-f="status"]');
    line.textContent = '';
    const b = document.createElement('b');
    b.textContent = lead;
    line.appendChild(b);
    if (detail) line.appendChild(document.createTextNode(` · ${detail}`));
    line.parentNode.classList.toggle('mhcs-err', kind === 'err');
    for (const dot of panel.querySelectorAll('.mhcs-dot')) dot.style.setProperty('--c', `var(--${kind})`);
    panel.querySelector('[data-f="hlead"]').textContent = lead;
  }

  function updateUI() {
    if (!panel) return;
    const set = (f, v) => { const el = panel.querySelector(`[data-f="${f}"]`); if (el) el.textContent = v; };
    renderStatus();
    const box = panel.querySelector('[data-f="log"]');
    box.textContent = '';
    for (const entry of rt.log) {
      const { time, msg, count } = splitLog(entry);
      const row = document.createElement('div');
      row.className = `mhcs-ent${/^[✖⚠]/.test(msg) ? ' mhcs-warn' : ''}`;
      const tm = document.createElement('span');
      tm.className = 'mhcs-t';
      tm.textContent = time;
      const tx = document.createElement('span');
      const [head, sub] = msg.split('\n');
      tx.textContent = count > 1 ? `${head} ×${count}` : head;
      if (sub) {
        const d = document.createElement('div');
        d.className = 'mhcs-sub';
        d.textContent = sub;
        tx.appendChild(d);
      }
      row.append(tm, tx);
      box.appendChild(row);
    }
    refreshTips(readState());

    const s = readState();
    panel.classList.toggle('mhcs-away', !s);   // away from Cerulean Skyport: status line only
    if (!s) return;
    set('baseHint', base.hint());

    const low = {
      debris: s.debris < toNum(cfg.minDebris),
      gas: s.gas < toNum(cfg.minGas),
      cloudstone: s.cloudstone < toNum(cfg.minCloudstone),
      swiss: s.swiss < MIN_SWISS,
      toothlet: cfg.dentureBase !== 'off' && base.toothlets != null && base.toothlets <= toNum(cfg.toothletMin),
    };
    for (const el of panel.querySelectorAll('[data-r]')) {
      const k = el.dataset.r;
      if (k === 'toothlet') el.parentNode.style.display = base.owned === false ? 'none' : '';
      const v = k === 'toothlet' ? base.toothlets : s[k];
      el.textContent = v == null ? '?' : Number(v || 0).toLocaleString();
      el.classList.toggle('mhcs-low', !!low[k]);
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  function init() {
    buildPanel();

    const $ = window.jQuery;
    if ($ && $.fn) {
      $(document).ajaxComplete((ev, xhr, settings) => {
        const url = (settings && settings.url) || '';
        if (/turn\.php/i.test(url)) { base.noteHunt(); if (cfg.dentureBase === 'off' && cfg.showResources) base.refresh(); }
        if (/turn\.php|changetrap\.php/i.test(url)) scheduleTick(1500);
        else if (/skyport|cerulean|craft|convert|page\.php/i.test(url)) scheduleTick(2500);
        updateUI();
      });
    } else {
      log('jQuery not found, relying on heartbeat only', 'error');
    }

    base.refresh().then(updateUI);
    window.addEventListener('pagehide', () => flushChain());   // a reload mid-chain keeps its lines
    setInterval(() => { if (!rt.tickTimer) tick(); }, HEARTBEAT_MS);
    scheduleTick(2000);

    // Console handle: mhSkyport.state(), mhSkyport.tick(). busy() is read by the Auto Horn script.
    window.mhSkyport = { state: readState, tick: () => scheduleTick(0), busy: () => rt.busy || (rt.pending && Date.now() - rt.pendingSince < PENDING_MAX_MS), config: cfg, raid: () => raids.store, readMinluck, currentMinluck: () => minluck.current((window.user || {}).trap_power_type_name), builtinMinluck };
    console.log(`[${SCRIPT}] Loaded`);
  }

  waitFor(() => window.user && document.body && document.head, 30000, 500).then((ok) => {
    if (ok) init();
    else console.warn(`[${SCRIPT}] window.user never appeared, not starting`);
  });
})();
