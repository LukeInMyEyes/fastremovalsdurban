// Move-sheet estimator. Pure functions, no DOM, so it can be tested in node.
// Prices are the DRAFT rate card from the business plan (23 Nov 2026); volumes are rough guides.
(function (root) {
  // Inside of the K2700 box body, usable cubic metres. GUESS until the box is tape-measured.
  var CAPACITY_M3 = 7.0;

  // DRAFT rate card in rand, from the business plan. Costed at R400 a day per worker,
  // diesel R34/L, 13 L/100km, R2.50/km wear; insurance still to be quoted.
  var RATES = {
    singleItem: 950,      // a few pieces, up to SMALL_M3: Donnie + 1
    room: 1600,           // one load up to ROOM_M3: Donnie + 2
    studio: 1900,         // a fuller single load: Donnie + 2
    twoLoads: 3000,       // a 1-bed, two loads in a day: Donnie + 3
    metro: 300,           // across Durban
    stairsPerFloor: 100,  // per floor without a lift, at each end
    packDay: 1400,        // we pack: two packers for the day
    packPerBox: 40,       // we pack: box, tape and wrap, per box
    boxesPerPackDay: 30
  };
  var SMALL_M3 = 2.0, ROOM_M3 = 4.5, MAX_LOADS = 2; // over MAX_LOADS, or out of town, we quote

  var BOX_M3 = 0.06; // a medium moving box, about 45 x 35 x 40 cm

  // Rough volumes in cubic metres, by size. Pick the closest, no tape measure needed.
  var CATALOG = {
    couch:     { label: 'Couch', room: 'Lounge', sizes: { '2-seater': 1.0, '3-seater': 1.4, 'L-shape': 2.2 }, def: '3-seater' },
    armchair:  { label: 'Armchair', room: 'Lounge', sizes: { std: 0.6 } },
    coffee:    { label: 'Coffee table', room: 'Lounge', sizes: { std: 0.3 } },
    tvunit:    { label: 'TV unit', room: 'Lounge', sizes: { std: 0.4 } },
    tv:        { label: 'TV', room: 'Lounge', sizes: { std: 0.2 } },
    shelf:     { label: 'Bookshelf', room: 'Lounge', sizes: { std: 0.6 } },
    fridge:    { label: 'Fridge', room: 'Kitchen', sizes: { 'bar fridge': 0.3, 'single door': 0.7, 'double door': 1.0, 'side-by-side': 1.4 }, def: 'double door' },
    freezer:   { label: 'Chest freezer', room: 'Kitchen', sizes: { small: 0.5, big: 0.9 }, def: 'small' },
    washer:    { label: 'Washing machine', room: 'Kitchen', sizes: { std: 0.5 } },
    dryer:     { label: 'Tumble dryer', room: 'Kitchen', sizes: { std: 0.5 } },
    table:     { label: 'Dining table', room: 'Kitchen', sizes: { '4-seater': 0.8, '6-seater': 1.2 }, def: '4-seater' },
    chair:     { label: 'Dining chair', room: 'Kitchen', sizes: { std: 0.2 } },
    bed:       { label: 'Bed', room: 'Bedroom', sizes: { single: 0.9, double: 1.3, queen: 1.5, king: 1.8 }, def: 'queen' },
    wardrobe:  { label: 'Wardrobe', room: 'Bedroom', sizes: { small: 1.0, big: 1.8 }, def: 'small' },
    drawers:   { label: 'Chest of drawers', room: 'Bedroom', sizes: { std: 0.5 } },
    bedside:   { label: 'Bedside table', room: 'Bedroom', sizes: { std: 0.15 } },
    desk:      { label: 'Desk', room: 'Bedroom', sizes: { std: 0.6 } },
    ochair:    { label: 'Office chair', room: 'Bedroom', sizes: { std: 0.3 } },
    bike:      { label: 'Bicycle', room: 'Outside', sizes: { std: 0.4 } },
    braai:     { label: 'Braai', room: 'Outside', sizes: { std: 0.5 } },
    garden:    { label: 'Garden table set', room: 'Outside', sizes: { std: 1.0 } },
    mower:     { label: 'Lawnmower', room: 'Outside', sizes: { std: 0.4 } }
  };

  // Rooms per home, used only for the box count.
  var HOMES = {
    room:   { label: 'Just a room', rooms: { bed: 1, kitchen: 0, lounge: 0, bath: 0 } },
    studio: { label: 'Studio',      rooms: { bed: 1, kitchen: 1, lounge: 0, bath: 1 } },
    one:    { label: '1-bed',       rooms: { bed: 1, kitchen: 1, lounge: 1, bath: 1 } },
    two:    { label: '2-bed',       rooms: { bed: 2, kitchen: 1, lounge: 1, bath: 1 } },
    three:  { label: '3-bed',       rooms: { bed: 3, kitchen: 1, lounge: 1, bath: 2 } },
    few:    { label: 'A few things', rooms: { bed: 0, kitchen: 0, lounge: 0, bath: 0 } }
  };

  // Rule-of-thumb boxes per room at "normal" fullness.
  var BOXES_PER_ROOM = { bed: 7, kitchen: 10, lounge: 5, bath: 2 };
  var FULLNESS = { minimalist: 0.7, normal: 1.0, hoarder: 1.5 };

  // What a typical home of each size holds, as a starting point people then edit.
  var PRESETS = {
    room:   [['bed', 'double'], ['wardrobe', 'small'], ['drawers'], ['desk'], ['ochair'], ['tv']],
    studio: [['bed', 'double'], ['couch', '2-seater'], ['fridge', 'single door'], ['tv'], ['desk'], ['ochair'], ['wardrobe', 'small']],
    one:    [['couch', '3-seater'], ['armchair'], ['coffee'], ['tvunit'], ['tv'], ['fridge', 'double door'], ['washer'], ['table', '4-seater'], ['chair', null, 4], ['bed', 'queen'], ['wardrobe', 'small'], ['bedside', null, 2]],
    two:    [['couch', '3-seater'], ['armchair'], ['coffee'], ['tvunit'], ['tv'], ['fridge', 'double door'], ['freezer', 'small'], ['washer'], ['table', '4-seater'], ['chair', null, 4], ['bed', 'queen'], ['bed', 'double'], ['wardrobe', 'small', 2], ['bedside', null, 2], ['drawers'], ['desk'], ['ochair'], ['bike']],
    three:  [['couch', 'L-shape'], ['armchair', null, 2], ['coffee'], ['tvunit'], ['tv'], ['shelf'], ['fridge', 'side-by-side'], ['freezer', 'big'], ['washer'], ['dryer'], ['table', '6-seater'], ['chair', null, 6], ['bed', 'king'], ['bed', 'double'], ['bed', 'single'], ['wardrobe', 'big', 2], ['wardrobe', 'small'], ['bedside', null, 4], ['drawers', null, 2], ['desk'], ['ochair'], ['bike', null, 2], ['braai'], ['garden'], ['mower']],
    few:    []
  };

  function sizeOf(k, size) {
    var c = CATALOG[k]; if (!c) return 0;
    var s = size && c.sizes[size] != null ? size : (c.def || Object.keys(c.sizes)[0]);
    return c.sizes[s];
  }

  function presetItems(home) {
    return (PRESETS[home] || []).map(function (p) {
      var c = CATALOG[p[0]];
      return { k: p[0], size: p[1] || c.def || Object.keys(c.sizes)[0], n: p[2] || 1 };
    });
  }

  function round50(x) { return Math.round(x / 50) * 50; }

  // state: { home, fullness, packing:'us'|'you', items:[{k,size,n}], custom:[{name,l,w,h,n}],
  //          from:{floors}, to:{floors}, zone:'local'|'metro'|'out' }
  function estimate(state, opts) {
    opts = opts || {};
    var rates = opts.rates || RATES, cap = opts.capacity || CAPACITY_M3;
    var home = HOMES[state.home] || HOMES.few;

    var furniture = 0, pieces = 0;
    (state.items || []).forEach(function (it) { var n = it.n == null ? 1 : it.n; furniture += sizeOf(it.k, it.size) * n; pieces += n; });
    (state.custom || []).forEach(function (c) {
      // add 20% for wrapping and the gaps around an odd shape
      var n = c.n == null ? 1 : c.n;
      furniture += (c.l * c.w * c.h) / 1e6 * 1.2 * n; pieces += n;
    });

    var f = FULLNESS[state.fullness] || 1, mid = 0;
    Object.keys(BOXES_PER_ROOM).forEach(function (r) { mid += (home.rooms[r] || 0) * BOXES_PER_ROOM[r]; });
    mid = mid * f;
    if (state.extraBoxes) mid = Math.max(0, mid + state.extraBoxes);
    var boxesLo = Math.max(0, Math.floor(mid * 0.85)), boxesHi = Math.ceil(mid * 1.15);
    var boxesMid = Math.round(mid);

    var volume = furniture + boxesHi * BOX_M3;
    var trips = volume > 0 ? Math.ceil(volume / cap) : 0;
    var pct = Math.round(volume / cap * 100);

    var floors = ((state.from && state.from.floors) || 0) + ((state.to && state.to.floors) || 0);
    var price = 0, quote = trips > MAX_LOADS || (trips > 0 && state.zone === 'out');
    if (trips > 0 && !quote) {
      price = volume <= SMALL_M3 ? rates.singleItem : trips === 1 ? (volume <= ROOM_M3 ? rates.room : rates.studio) : rates.twoLoads;
      if (state.zone === 'metro') price += rates.metro;
      price += floors * rates.stairsPerFloor;
      if (state.packing === 'us' && boxesMid > 0) price += Math.ceil(boxesMid / rates.boxesPerPackDay) * rates.packDay + boxesMid * rates.packPerBox;
    }

    var kit = [];
    if (state.packing === 'you' && boxesHi > 0) {
      kit.push(boxesLo + ' to ' + boxesHi + ' boxes');
      kit.push(Math.max(1, Math.ceil(boxesHi / 8)) + ' rolls of packing tape');
      var wrap = (home.rooms.kitchen || 0) * 10 + (home.rooms.lounge || 0) * 5;
      if (wrap) kit.push(wrap + ' m of bubble wrap');
      kit.push('2 thick markers');
    }

    var notes = [];
    if (floors > 0) notes.push(floors + (floors > 1 ? ' floors' : ' floor') + ' of stairs in total');
    if (trips > 1) notes.push(trips + ' loads in the bakkie on the same day');
    (state.custom || []).forEach(function (c) { if (c.n !== 0) notes.push(c.name + ' (' + c.l + ' x ' + c.w + ' x ' + c.h + ' cm)'); });

    return {
      volume: Math.round(volume * 10) / 10,
      trips: trips, pct: pct, pieces: pieces,
      boxesLo: boxesLo, boxesHi: boxesHi, boxesMid: boxesMid,
      // the rate card is the floor; the top of the range leaves room for what the sheet can't see
      priceLo: price ? round50(price) : 0,
      priceHi: price ? round50(price * 1.1) : 0,
      quote: quote,
      kit: kit, notes: notes
    };
  }

  var api = { estimate: estimate, presetItems: presetItems, CATALOG: CATALOG, HOMES: HOMES, RATES: RATES, CAPACITY_M3: CAPACITY_M3, FULLNESS: FULLNESS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Estimator = api;
})(this);
