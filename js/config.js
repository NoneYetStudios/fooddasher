/* Food Dasher — configuration, vehicles, upgrades, food archetypes & hazard notes. */
(function (root) {
  'use strict';
  const FD = (root.FD = root.FD || {});

  FD.CONFIG = {
    ARCADE_URL: 'https://arcade.stabthefinger.com/',
    API_LEADERBOARD: 'api/leaderboard.php',
    API_SUBMIT: 'api/submit_score.php',
    LEADERBOARD_SIZE: 25,
    GAMEOVER_BOARD_SIZE: 8,
    STARTING_RATING: 5.00,
    DEACTIVATION_RATING: 2.00,
    BULLSEYE_BONUS: 2.00,
    CANVAS_W: 1280,
    CANVAS_H: 720,
    VERSION: '1.0.0'
  };

  FD.VEHICLE_ORDER = ['scooter', 'hatchback', 'van', 'hover_moped'];

  FD.VEHICLES = {
    scooter: {
      id: 'scooter',
      name: '2004 Scooter',
      shortName: 'SCOOTER',
      cost: 0,
      maxSpeed: 290,
      minSpeed: 120,
      accel: 260,
      steerSpeed: 2.4,
      bumpResist: 1.0,
      grabRadius: 1.0,
      hover: false,
      color: '#ff3b1f',
      accent: '#ffbe0b',
      desc: 'Beat-up 50cc 2-stroke. Smells like fry oil and regret.'
    },
    hatchback: {
      id: 'hatchback',
      name: 'Rusty Hatchback',
      shortName: 'HATCHBACK',
      cost: 18,
      maxSpeed: 345,
      minSpeed: 135,
      accel: 310,
      steerSpeed: 2.6,
      bumpResist: 1.35,
      grabRadius: 1.15,
      hover: false,
      color: '#eab308',
      accent: '#fffbeb',
      desc: '1997 3-cylinder econobox. Missing one hubcap, extra trunk space.'
    },
    van: {
      id: 'van',
      name: 'Turbo Delivery Van',
      shortName: 'TURBO VAN',
      cost: 42,
      maxSpeed: 400,
      minSpeed: 150,
      accel: 360,
      steerSpeed: 2.75,
      bumpResist: 1.75,
      grabRadius: 1.25,
      hover: false,
      color: '#22d3ee',
      accent: '#ff3b1f',
      desc: 'Commercial panel van with twin-scroll turbo and heated racks.'
    },
    hover_moped: {
      id: 'hover_moped',
      name: 'Hover-Moped',
      shortName: 'HOVER-MOPED',
      cost: 85,
      maxSpeed: 460,
      minSpeed: 165,
      accel: 430,
      steerSpeed: 3.1,
      bumpResist: 2.2,
      grabRadius: 1.35,
      hover: true,
      color: '#a3e635',
      accent: '#38bdf8',
      desc: 'Experimental repulsor-lift moped. Glides right over open potholes!'
    }
  };

  FD.UPGRADE_ORDER = ['thermal_bag', 'shock_rack', 'porch_cannon'];

  FD.UPGRADES = {
    thermal_bag: {
      id: 'thermal_bag',
      name: 'Insulated Thermal Bag',
      maxLevel: 2,
      costs: [14, 28],
      multipliers: [1.0, 0.65, 0.40],
      desc: 'NASA-grade foil lining slows thermal decay (Lv1: 0.65x, Lv2: 0.40x).'
    },
    shock_rack: {
      id: 'shock_rack',
      name: 'Shock-Absorbing Rack',
      maxLevel: 2,
      costs: [16, 32],
      multipliers: [1.0, 0.50, 0.20],
      desc: 'Hydraulic gimbal keeps hot soup from spilling over curbs & potholes.'
    },
    porch_cannon: {
      id: 'porch_cannon',
      name: 'Precision Porch Cannon',
      maxLevel: 2,
      costs: [22, 44],
      matMultipliers: [1.0, 1.35, 1.70],
      desc: 'Widens Welcome Mat bullseye & projects live landing reticule.'
    }
  };

  FD.FOOD_TYPES = {
    burrito: {
      id: 'burrito',
      name: 'Foil Burrito',
      icon: '🌯',
      decayRate: 0.7,
      fragility: 0.15,
      potholeSpill: 4,
      tossSpeed: 1.0,
      arcSpread: 0.0,
      tag: 'STURDY FOIL'
    },
    soup: {
      id: 'soup',
      name: 'Hot Pho Soup',
      icon: '🍜',
      decayRate: 1.1,
      fragility: 0.85,
      potholeSpill: 24,
      tossSpeed: 0.95,
      arcSpread: 0.08,
      tag: 'SPILLS ON POTHOLES'
    },
    ice_cream: {
      id: 'ice_cream',
      name: 'Artisanal Gelato',
      icon: '🍨',
      decayRate: 2.2,
      fragility: 0.30,
      potholeSpill: 8,
      tossSpeed: 1.05,
      arcSpread: 0.05,
      tag: 'MELTS RAPIDLY'
    },
    pizza: {
      id: 'pizza',
      name: 'Giant 36" Pizza',
      icon: '🍕',
      decayRate: 1.0,
      fragility: 0.45,
      potholeSpill: 10,
      tossSpeed: 0.82,
      arcSpread: 0.22,
      tag: 'WIDE TOSS ARC'
    }
  };

  FD.HAZARD_NOTES = {
    no_knock: {
      id: 'no_knock',
      note: 'LEAVE AT DOOR — DO NOT KNOCK',
      hazardTag: 'ANGRY CUSTOMER',
      yardHazard: 'angry_customer'
    },
    goose: {
      id: 'goose',
      note: 'BEWARE OF GOOSE — DO NOT MAKE EYE CONTACT',
      hazardTag: 'AGGRESSIVE GOOSE IN YARD',
      yardHazard: 'goose'
    },
    sprinklers: {
      id: 'sprinklers',
      note: 'LAWN JUST WATERED — KEEP BAG DRY',
      hazardTag: 'SPRINKLERS ON',
      yardHazard: 'sprinklers'
    },
    hand_to_me: {
      id: 'hand_to_me',
      note: 'HAND IT TO ME — DOG IS "FRIENDLY"',
      hazardTag: 'GUARD DOG IN YARD',
      yardHazard: 'dog'
    }
  };

  FD.ORDER_COLORS = ['#ff3b1f', '#ffbe0b', '#22d3ee', '#a3e635', '#f472b6'];

  FD.RESTAURANTS = [
    { name: "Tio's Foil Bomb", food: 'burrito' },
    { name: 'Saigon Steam Kettle', food: 'soup' },
    { name: 'Frostbite Gelateria', food: 'ice_cream' },
    { name: "Big Tony's 36\" Pie", food: 'pizza' },
    { name: 'Greasy Spoon Diner', food: 'burrito' },
    { name: 'Boiling Cauldron Pho', food: 'soup' },
    { name: 'Zero-G Creamery', food: 'ice_cream' },
    { name: 'Pizzageddon Express', food: 'pizza' }
  ];

  FD.CUSTOMERS = [
    { name: 'Chad V.', street: '114 Sycamore Ct' },
    { name: 'Brenda K.', street: '208 Mulberry Ln' },
    { name: 'Mr. Henderson', street: '412 Gooseberry Way' },
    { name: 'Tiffany M.', street: '519 Neon Blvd' },
    { name: 'Carl (No Stairs)', street: '633 Cul-de-Sac Cir' },
    { name: 'Gorgantor Fan #1', street: '742 Atomic Ave' },
    { name: 'Karen R.', street: '809 Sprinkler Dr' },
    { name: 'Biff W.', street: '925 Recliner Pkwy' }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
