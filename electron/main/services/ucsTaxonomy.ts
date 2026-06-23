/**
 * UCS (Universal Category System) 游戏音效分类体系
 *
 * 标准 UCS 8 大主类 + 约 40 个子类
 * 每个子类包含用于 CLAP zero-shot 分类的文本描述
 */

export interface UcsCategoryDef {
  code: string;
  nameZh: string;
  nameEn: string;
  clapDescription: string;
  subs?: UcsSubDef[];
}

export interface UcsSubDef {
  code: string;
  nameZh: string;
  nameEn: string;
  clapDescription: string;
}

export const UCS_TAXONOMY: UcsCategoryDef[] = [
  {
    code: 'IMPACT', nameZh: '\u649e\u51fb', nameEn: 'Impact',
    clapDescription: 'impact sound, hit, crash, collision, bang, smash',
    subs: [
      { code: 'IMPACT_METAL_HIT', nameZh: '\u91d1\u5c5e\u649e\u51fb', nameEn: 'Metal Hit', clapDescription: 'metal hitting sound, metallic clang, steel impact, anvil, sword clash' },
      { code: 'IMPACT_WOOD_CRASH', nameZh: '\u6728\u5934\u788e\u88c2', nameEn: 'Wood Crash', clapDescription: 'wood breaking, splintering, wooden crate destruction, timber crack' },
      { code: 'IMPACT_GLASS_BREAK', nameZh: '\u73bb\u7483\u7834\u788e', nameEn: 'Glass Break', clapDescription: 'glass shattering, window breaking, crystal fracture, bottle smash' },
      { code: 'IMPACT_STONE_ROCK', nameZh: '\u77f3\u5934\u649e\u51fb', nameEn: 'Stone Rock', clapDescription: 'rock impact, stone hitting, boulder collision, gravel falling' },
      { code: 'IMPACT_BODY_FALL', nameZh: '\u8eab\u4f53\u5012\u5730', nameEn: 'Body Fall', clapDescription: 'body falling to ground, ragdoll, character death fall, heavy thud' },
      { code: 'IMPACT_EXPLOSION', nameZh: '\u7206\u70b8', nameEn: 'Explosion', clapDescription: 'explosion blast, bomb, detonation, kaboom, grenade' },
    ],
  },
  {
    code: 'FOOTSTEP', nameZh: '\u811a\u6b65', nameEn: 'Footstep',
    clapDescription: 'footstep sound, walking, stepping, footfall, shoes on surface',
    subs: [
      { code: 'FOOTSTEP_GRAVEL_RUN', nameZh: '\u788e\u77f3\u8dd1\u6b65', nameEn: 'Gravel Run', clapDescription: 'running on gravel, crunching stone underfoot, pebbles' },
      { code: 'FOOTSTEP_WOOD_WALK', nameZh: '\u6728\u677f\u884c\u8d70', nameEn: 'Wood Walk', clapDescription: 'walking on wooden floor, creaking planks, hollow footsteps' },
      { code: 'FOOTSTEP_METAL_CLANK', nameZh: '\u91d1\u5c5e\u811a\u6b65', nameEn: 'Metal Clank', clapDescription: 'footsteps on metal grating, metallic walking, steel catwalk' },
      { code: 'FOOTSTEP_GRASS_SOFT', nameZh: '\u8349\u5730\u884c\u8d70', nameEn: 'Grass Soft', clapDescription: 'soft footsteps on grass, rustling vegetation, lawn walking' },
      { code: 'FOOTSTEP_SNOW_CRUNCH', nameZh: '\u96ea\u5730\u8e29\u8e0f', nameEn: 'Snow Crunch', clapDescription: 'walking on snow, crunching snow underfoot, winter footsteps' },
      { code: 'FOOTSTEP_WATER_SPLASH', nameZh: '\u6c34\u4e2d\u884c\u8d70', nameEn: 'Water Splash', clapDescription: 'walking through water, splashing footsteps, puddle stepping' },
    ],
  },
  {
    code: 'WEAPON', nameZh: '\u6b66\u5668', nameEn: 'Weapon',
    clapDescription: 'weapon sound, gun, sword, combat, firearm',
    subs: [
      { code: 'WEAPON_GUN_PISTOL_SHOT', nameZh: '\u624b\u67aa\u5c04\u51fb', nameEn: 'Pistol Shot', clapDescription: 'pistol gunshot, handgun fire, pistol shot, small caliber' },
      { code: 'WEAPON_GUN_RIFLE_SHOT', nameZh: '\u6b65\u67aa\u5c04\u51fb', nameEn: 'Rifle Shot', clapDescription: 'rifle shot, sniper fire, assault rifle burst, large caliber' },
      { code: 'WEAPON_SWING_WHOOSH', nameZh: '\u6325\u821e\u7834\u7a7a', nameEn: 'Swing Whoosh', clapDescription: 'weapon swing whoosh, sword swoosh, blade air movement, axe swing' },
      { code: 'WEAPON_RELOAD', nameZh: '\u6362\u5f39', nameEn: 'Reload', clapDescription: 'weapon reload, magazine click, gun mechanical, slide rack' },
      { code: 'WEAPON_BOW_ARROW', nameZh: '\u5f13\u7bad', nameEn: 'Bow Arrow', clapDescription: 'bow release, arrow flight, string twang, projectile' },
      { code: 'WEAPON_EXPLOSION_GRENADE', nameZh: '\u624b\u96f7\u7206\u70b8', nameEn: 'Grenade', clapDescription: 'grenade explosion, bomb blast, metallic fragmentation' },
    ],
  },
  {
    code: 'UI', nameZh: '\u754c\u9762', nameEn: 'UI',
    clapDescription: 'UI sound, button click, interface feedback, menu navigation, notification',
    subs: [
      { code: 'UI_CLICK_CONFIRM', nameZh: '\u70b9\u51fb\u786e\u8ba4', nameEn: 'Click Confirm', clapDescription: 'confirmation click, approval button, affirmative UI, positive feedback' },
      { code: 'UI_CLICK_CANCEL', nameZh: '\u70b9\u51fb\u53d6\u6d88', nameEn: 'Click Cancel', clapDescription: 'cancel click, negative button, decline UI, back button' },
      { code: 'UI_HOVER_SUBTLE', nameZh: '\u60ac\u505c\u5fae\u54cd', nameEn: 'Hover Subtle', clapDescription: 'subtle hover sound, mouse over, UI rollover feedback, soft tick' },
      { code: 'UI_NOTIFICATION', nameZh: '\u901a\u77e5\u63d0\u793a', nameEn: 'Notification', clapDescription: 'notification alert, popup sound, message arrived, chime' },
      { code: 'UI_REWARD', nameZh: '\u5956\u52b1\u83b7\u5f97', nameEn: 'Reward', clapDescription: 'reward acquisition, achievement unlock, positive jingle, coin' },
      { code: 'UI_ERROR_BUZZ', nameZh: '\u9519\u8bef\u63d0\u793a', nameEn: 'Error Buzz', clapDescription: 'error buzz, failure notification, negative feedback, warning beep' },
    ],
  },
  {
    code: 'AMBIENCE', nameZh: '\u73af\u5883\u97f3', nameEn: 'Ambience',
    clapDescription: 'ambient background sound, environmental audio, atmosphere, soundscape',
    subs: [
      { code: 'AMBIENCE_FOREST_DAY', nameZh: '\u767d\u5929\u68ee\u6797', nameEn: 'Forest Day', clapDescription: 'forest ambience daytime, birds chirping, nature soundscape, breeze' },
      { code: 'AMBIENCE_WIND_STRONG', nameZh: '\u5f3a\u98ce', nameEn: 'Wind Strong', clapDescription: 'strong wind blowing, gale force, howling wind, storm' },
      { code: 'AMBIENCE_RAIN_HEAVY', nameZh: '\u5927\u96e8', nameEn: 'Rain Heavy', clapDescription: 'heavy rain falling, thunderstorm ambience, downpour, rainfall' },
      { code: 'AMBIENCE_INDUSTRIAL_HUM', nameZh: '\u5de5\u4e1a\u557c\u9e23', nameEn: 'Industrial Hum', clapDescription: 'industrial machinery hum, factory ambience, engine drone, mechanical' },
      { code: 'AMBIENCE_CAVE_ECHO', nameZh: '\u6d1e\u7a74\u56de\u58f0', nameEn: 'Cave Echo', clapDescription: 'cave reverberation, underground echo, dungeon ambience, dripping' },
    ],
  },
  {
    code: 'WHOOSH', nameZh: '\u8fc7\u6e21/\u7834\u7a7a', nameEn: 'Whoosh',
    clapDescription: 'whoosh sound, swoosh, transition effect, air movement, cinematic',
    subs: [
      { code: 'WHOOSH_FAST', nameZh: '\u5feb\u901f\u7834\u7a7a', nameEn: 'Fast Whoosh', clapDescription: 'fast whoosh, quick swoosh, speed transition, sharp air' },
      { code: 'WHOOSH_DEEP_BASS', nameZh: '\u4f4e\u9891\u7834\u7a7a', nameEn: 'Deep Bass Whoosh', clapDescription: 'deep bass whoosh, low frequency swoosh, sub rumble, heavy transition' },
      { code: 'WHOOSH_RISER', nameZh: '\u4e0a\u5347\u8fc7\u6e21', nameEn: 'Riser', clapDescription: 'rising transition, build up, tension riser, cinematic rise, crescendo' },
      { code: 'WHOOSH_DOWNER', nameZh: '\u4e0b\u5760\u8fc7\u6e21', nameEn: 'Downer', clapDescription: 'falling transition, descending effect, pitch drop, slowdown' },
    ],
  },
  {
    code: 'MOVEMENT', nameZh: '\u8fd0\u52a8/\u52a8\u4f5c', nameEn: 'Movement',
    clapDescription: 'character movement, body motion, cloth rustle, physical action, foley',
    subs: [
      { code: 'MOVEMENT_CLOTH_RUSTLE', nameZh: '\u5e03\u6599\u6469\u64e6', nameEn: 'Cloth Rustle', clapDescription: 'cloth rustling, fabric movement, clothing friction, jacket swish' },
      { code: 'MOVEMENT_DOOR_OPEN', nameZh: '\u5f00\u95e8', nameEn: 'Door Open', clapDescription: 'door opening, creak, door mechanism, hinge, open close' },
      { code: 'MOVEMENT_JUMP', nameZh: '\u8df3\u8dc3', nameEn: 'Jump', clapDescription: 'jumping sound, character leap, air movement, landing' },
      { code: 'MOVEMENT_SLIDE', nameZh: '\u6ed1\u884c', nameEn: 'Slide', clapDescription: 'sliding movement, skid, surface friction, smooth glide' },
    ],
  },
  {
    code: 'MATERIALS', nameZh: '\u6750\u8d28/\u8868\u9762', nameEn: 'Materials',
    clapDescription: 'material surface sound, texture interaction, surface scraping, foley',
    subs: [
      { code: 'MATERIALS_METAL_SCRAPE', nameZh: '\u91d1\u5c5e\u522e\u64e6', nameEn: 'Metal Scrape', clapDescription: 'metal scraping, steel scratching, metallic friction, sharp drag' },
      { code: 'MATERIALS_WOOD_CREAK', nameZh: '\u6728\u5934\u54af\u5431', nameEn: 'Wood Creak', clapDescription: 'wood creaking, floorboard groan, wooden stress, old house' },
      { code: 'MATERIALS_STONE_GRIND', nameZh: '\u77f3\u5934\u7814\u78e8', nameEn: 'Stone Grind', clapDescription: 'stone grinding, rock scraping, heavy friction, concrete drag' },
    ],
  },
];

/**
 * 将 UCS 分类数据写入数据库
 * 使用 INSERT OR IGNORE 保证幂等性
 */
export function seedUcsTaxonomy(sqlite: any): void {
  const insertCat = sqlite.prepare(`
    INSERT OR IGNORE INTO ucs_categories (cat_code, cat_name_zh, cat_name_en, clap_description, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSub = sqlite.prepare(`
    INSERT OR IGNORE INTO ucs_subcategories (cat_id, code, name_zh, name_en, clap_description)
    VALUES (?, ?, ?, ?, ?)
  `);
  const getCatId = sqlite.prepare('SELECT id FROM ucs_categories WHERE cat_code = ?');

  const seedAll = sqlite.transaction(() => {
    UCS_TAXONOMY.forEach((cat, i) => {
      insertCat.run(cat.code, cat.nameZh, cat.nameEn, cat.clapDescription, i);
      const catRow = getCatId.get(cat.code) as { id: number } | undefined;
      if (!catRow) return;
      for (const sub of (cat.subs || [])) {
        insertSub.run(catRow.id, sub.code, sub.nameZh, sub.nameEn, sub.clapDescription);
      }
    });
  });

  seedAll();

  // 统计
  const catCount = sqlite.prepare('SELECT COUNT(*) as c FROM ucs_categories').get() as { c: number };
  const subCount = sqlite.prepare('SELECT COUNT(*) as c FROM ucs_subcategories').get() as { c: number };
  console.log(`[UCS] Seeded ${catCount.c} categories, ${subCount.c} subcategories`);
}
