const PARTS = [
  { key: "weapon", label: "武器" },
  { key: "head", label: "頭" },
  { key: "chest", label: "胴" },
  { key: "arms", label: "腕" },
  { key: "waist", label: "腰" },
  { key: "legs", label: "脚" },
];
const GRADES = Array.from({ length: 10 }, (_, i) => i + 1);
const MAX_COMBOS = 20;

const DATA = window.GEAR_DATA;
const weaponTypeLabel = Object.fromEntries(DATA.weaponTypes.map((t) => [t.key, t.label]));
// 武器も「武器」部位の装備として防具と同じ配列で扱う
const pieces = [...DATA.weapons.map((w) => ({ ...w, part: "weapon" })), ...DATA.armor].map((p, i) => ({ ...p, id: i }));
// スキルは読み仮名のあいうえお順に並べる（カタカナはひらがなに直して比べる）
const toHiragana = (s) => s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const reading = (skill) => (window.SKILL_READINGS || {})[skill] ?? toHiragana(skill);
const collator = new Intl.Collator("ja");
const allSkills = Object.keys(DATA.skills).sort((a, b) => collator.compare(reading(a), reading(b)));
const KANA_ROWS = [
  ["あ", "ぁ-お"], ["か", "か-ご"], ["さ", "さ-ぞ"], ["た", "た-ど"], ["な", "な-の"],
  ["は", "は-ぽ"], ["ま", "ま-も"], ["や", "ゃ-よ"], ["ら", "ら-ろ"], ["わ", "ゎ-ん"],
];
const kanaRow = (skill) => {
  const c = reading(skill)[0];
  const row = KANA_ROWS.find(([, range]) => new RegExp(`[${range}]`).test(c));
  return row ? `${row[0]}行` : "その他";
};
const maxLevel = (skill) => DATA.skills[skill]?.maxLevel ?? 5;

// 状態: 選択スキル（目標Lv付き）、装備中の防具、想定グレード
const state = {
  targets: new Map(), // skill -> 目標Lv
  equip: {}, // part -> piece id
  grade: 10,
  weaponType: "", // 空なら全武器種、"none" なら武器を使わない（防具のみ）
};

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};
const partLabel = (key) => PARTS.find((p) => p.key === key).label;
const NO_WEAPON = "none";
// 画面と組み合わせ探索で使う部位（防具のみのときは武器を除く）
const activeParts = () => (state.weaponType === NO_WEAPON ? PARTS.filter((p) => p.key !== "weapon") : PARTS);

// 指定グレードでのスキル。そのグレードでまだ作れない防具は null
function skillsAt(piece, grade = state.grade) {
  let skills = null;
  for (const step of piece.steps) if (step.grade <= grade) skills = step.skills;
  return skills;
}
const available = (piece) =>
  skillsAt(piece) !== null &&
  (piece.part !== "weapon" || !state.weaponType || (state.weaponType !== NO_WEAPON && piece.type === state.weaponType));

// 武器の攻撃力・属性値（指定グレードの最大強化時）
function weaponStats(piece) {
  let stats = null;
  for (const s of piece.stats) if (s[0] <= state.grade) stats = s;
  if (!stats) return "";
  const element = stats[2] ? ` / ${piece.element}${stats[2]}` : "";
  return `${weaponTypeLabel[piece.type]} / 攻撃${stats[1]}${element}`;
}

function addSkill(name) {
  name = name.trim();
  if (!allSkills.includes(name) || state.targets.has(name)) return;
  state.targets.set(name, 1);
  render();
}
function toggleSkill(name) {
  if (state.targets.has(name)) state.targets.delete(name);
  else state.targets.set(name, 1);
  render();
}

function renderSkillPicker() {
  const selected = [...state.targets].map(([skill, lv]) => {
    const select = el(
      "select",
      { title: "目標Lv", onchange: (e) => { state.targets.set(skill, +e.target.value); render(); } },
      ...Array.from({ length: maxLevel(skill) }, (_, i) =>
        el("option", { value: i + 1, textContent: `Lv${i + 1}`, selected: lv === i + 1 })
      )
    );
    const remove = el("button", { className: "x", textContent: "×", title: "外す", onclick: () => toggleSkill(skill) });
    return el("li", {}, skill, select, remove);
  });
  $("selected-skills").replaceChildren(
    ...(selected.length ? selected : [el("p", { className: "empty", textContent: "スキルが選ばれていません" })])
  );

  const groups = new Map();
  for (const s of allSkills) groups.set(kanaRow(s), [...(groups.get(kanaRow(s)) || []), s]);
  $("all-skills").replaceChildren(
    ...[...groups].map(([row, skills]) =>
      el(
        "div",
        { className: "kana-group" },
        el("h4", { textContent: row }),
        el(
          "ul",
          { className: "chips small" },
          ...skills.map((s) =>
            el("li", { textContent: s, className: state.targets.has(s) ? "on" : "", onclick: () => toggleSkill(s) })
          )
        )
      )
    )
  );
}

// 現在のグレードより後でスキルが増える・上がる箇所の説明
function upgradeNote(piece) {
  const now = new Map((skillsAt(piece) || []).map((k) => [k.skill, k.lv]));
  const notes = [];
  for (const step of piece.steps) {
    if (step.grade <= state.grade) continue;
    for (const k of step.skills) {
      if ((now.get(k.skill) || 0) < k.lv) {
        notes.push(`G${step.grade}で${k.skill}Lv${k.lv}`);
        now.set(k.skill, k.lv);
      }
    }
  }
  return notes.join("、");
}

function pieceView(piece) {
  const skills = el("div", { className: "skills" });
  (skillsAt(piece) || []).forEach((k, i) => {
    if (i) skills.append("、");
    skills.append(el("span", { className: state.targets.has(k.skill) ? "hit" : "", textContent: `${k.skill} Lv${k.lv}` }));
  });
  const note = upgradeNote(piece);
  const equipped = state.equip[piece.part] === piece.id;
  return el(
    "li",
    {
      className: "piece" + (equipped ? " equipped" : ""),
      title: equipped ? "クリックで外す" : "クリックで装備",
      onclick: () => {
        if (equipped) delete state.equip[piece.part];
        else state.equip[piece.part] = piece.id;
        render();
      },
    },
    el("div", { className: "name" }, piece.name, " ", el("span", { className: "series", textContent: piece.series })),
    piece.part === "weapon" ? el("div", { className: "unlock", textContent: weaponStats(piece) }) : "",
    skills,
    note ? el("div", { className: "unlock", textContent: `↑ ${note}` }) : ""
  );
}

function renderResults() {
  const targets = [...state.targets.keys()];
  if (!targets.length) {
    $("results").replaceChildren(el("p", { className: "empty", textContent: "上でスキルを選ぶと、ここに武器・防具が表示されます。" }));
    return;
  }
  const matchAll = $("match-all").checked;
  const score = (p) => skillsAt(p).filter((k) => state.targets.has(k.skill)).reduce((n, k) => n + k.lv, 0);

  $("results").replaceChildren(
    ...activeParts().map((part) => {
      const list = pieces
        .filter((p) => p.part === part.key && available(p))
        .filter((p) => {
          const names = skillsAt(p).map((k) => k.skill);
          return matchAll ? targets.every((t) => names.includes(t)) : targets.some((t) => names.includes(t));
        })
        .sort((a, b) => score(b) - score(a));
      return el(
        "div",
        { className: "part" },
        el("h3", { textContent: `${part.label}（${list.length}）` }),
        list.length ? el("ul", {}, ...list.map(pieceView)) : el("p", { className: "empty", textContent: "該当なし" })
      );
    })
  );
}

function sumSkills(pieceList) {
  const totals = new Map();
  for (const p of pieceList)
    for (const k of skillsAt(p) || []) totals.set(k.skill, Math.min(maxLevel(k.skill), (totals.get(k.skill) || 0) + k.lv));
  return totals;
}

function renderEquip() {
  $("equip").replaceChildren(
    ...activeParts().map((part) => {
      const p = pieces[state.equip[part.key]];
      return el(
        "div",
        { className: "slot" + (p ? " filled" : "") },
        el("div", { className: "label", textContent: part.label }),
        p ? p.name : "未装備"
      );
    })
  );

  const totals = sumSkills(Object.values(state.equip).map((id) => pieces[id]));
  // 目標スキルは未達でも表示し、その後に他のスキルを並べる
  const names = [...new Set([...state.targets.keys(), ...[...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a))])];
  $("totals").replaceChildren(
    ...(names.length
      ? names.map((s) => {
          const lv = totals.get(s) || 0;
          const target = state.targets.get(s);
          const cls = target ? (lv >= target ? "met" : "short") : "";
          const max = lv >= maxLevel(s) ? "（上限）" : "";
          return el("li", { className: cls, textContent: target ? `${s} Lv${lv}${max} / 目標${target}` : `${s} Lv${lv}${max}` });
        })
      : [el("p", { className: "empty", textContent: "武器・防具をクリックして装備してください。" })])
  );
}

// 目標Lvをすべて満たす組み合わせを探す（使う部位が少ないほど上位）
function findCombos() {
  const targets = [...state.targets];
  if (!targets.length) return null;
  const need = targets.map(([, lv]) => lv);
  const gainOf = (p) => targets.map(([s]) => skillsAt(p).filter((k) => k.skill === s).reduce((n, k) => n + k.lv, 0));

  // 部位ごとに、目標スキルの伸び方が同じ防具をまとめ、他より劣る組は除外する
  const parts = activeParts();
  const cands = parts.map((part) => {
    const groups = new Map();
    for (const p of pieces) {
      if (p.part !== part.key || !available(p)) continue;
      const g = gainOf(p);
      if (!g.some((v) => v > 0)) continue;
      const key = g.join(",");
      if (!groups.has(key)) groups.set(key, { g, list: [] });
      groups.get(key).list.push(p);
    }
    const all = [...groups.values()];
    const dominated = (a) => all.some((b) => b !== a && b.g.every((v, t) => v >= a.g[t]) && b.g.some((v, t) => v > a.g[t]));
    return [{ g: targets.map(() => 0), list: [] }, ...all.filter((a) => !dominated(a))]; // 先頭は自由枠
  });
  // 残りの部位で各スキルが最大いくつ伸ばせるか（枝刈り用）
  const maxRest = Array.from({ length: parts.length + 1 }, () => targets.map(() => 0));
  for (let i = parts.length - 1; i >= 0; i--)
    maxRest[i] = targets.map((_, t) => maxRest[i + 1][t] + Math.max(...cands[i].map((c) => c.g[t])));

  const results = [];
  const walk = (i, acc, chosen) => {
    if (acc.some((v, t) => v + maxRest[i][t] < need[t])) return;
    if (i === parts.length) {
      const used = chosen.filter((c) => c.list.length).length;
      const total = acc.reduce((n, v, t) => n + Math.min(v, maxLevel(targets[t][0])), 0);
      results.push({ chosen: [...chosen], used, total });
      return;
    }
    for (const c of cands[i]) {
      chosen.push(c);
      walk(i + 1, acc.map((v, t) => v + c.g[t]), chosen);
      chosen.pop();
    }
  };
  walk(0, targets.map(() => 0), []);
  results.sort((a, b) => a.used - b.used || b.total - a.total);
  return { parts, total: results.length, list: results.slice(0, MAX_COMBOS) };
}

// 同じ効果の装備が多いときは先頭だけ並べる
function namesText(list, limit = 4) {
  const label = (p) => (p.part === "weapon" && !state.weaponType ? `${p.name}（${weaponTypeLabel[p.type]}）` : p.name);
  const shown = list.slice(0, limit).map(label).join(" / ");
  return list.length > limit ? `${shown} 他${list.length - limit}件` : shown;
}

function renderCombos(result) {
  if (!result) {
    $("combos").replaceChildren(el("p", { className: "empty", textContent: "スキルを選んでからボタンを押してください。" }));
    return;
  }
  if (!result.total) {
    $("combos").replaceChildren(
      el("p", { className: "empty", textContent: `グレード${state.grade}では目標Lvを満たす組み合わせが見つかりませんでした。目標Lvを下げるか、グレードを上げてみてください。` })
    );
    return;
  }
  $("combos").replaceChildren(
    el("p", {
      className: "empty",
      textContent: `${result.total}通り見つかりました（使う部位が少ない順に上位${result.list.length}件）。「自由」の部位は好きな装備を付けられます。同じ効果の装備は「/」で並べています。`,
    }),
    ...result.list.map((r) => {
      const lines = r.chosen.map((c, i) =>
        el("div", {}, el("strong", { textContent: `${result.parts[i].label}: ` }), c.list.length ? namesText(c.list) : "自由")
      );
      const totals = sumSkills(r.chosen.filter((c) => c.list.length).map((c) => c.list[0]));
      const sum = [...state.targets.keys()].map((s) => `${s} Lv${totals.get(s) || 0}`).join("、");
      const apply = el("button", {
        textContent: "この装備にする",
        onclick: () => {
          state.equip = {};
          r.chosen.forEach((c, i) => c.list.length && (state.equip[result.parts[i].key] = c.list[0].id));
          render();
          $("equip").scrollIntoView({ behavior: "smooth" });
        },
      });
      return el("div", { className: "combo" }, el("div", { className: "pieces" }, ...lines, el("div", { className: "sum", textContent: sum })), apply);
    })
  );
}

function render() {
  renderSkillPicker();
  renderResults();
  renderEquip();
}

$("skill-list").replaceChildren(...allSkills.map((s) => el("option", { value: s })));
$("grade").replaceChildren(...GRADES.map((g) => el("option", { value: g, textContent: `G${g}`, selected: g === state.grade })));
// グレードや武器種を変えたら、条件に合わなくなった装備を外す
function onFilterChange() {
  for (const [part, id] of Object.entries(state.equip)) if (!available(pieces[id])) delete state.equip[part];
  render();
  renderCombos(null);
}
$("grade").onchange = (e) => {
  state.grade = +e.target.value;
  onFilterChange();
};
$("weapon-type").replaceChildren(
  el("option", { value: "", textContent: "すべて" }),
  el("option", { value: NO_WEAPON, textContent: "表示しない（防具のみ）" }),
  ...DATA.weaponTypes.map((t) => el("option", { value: t.key, textContent: t.label }))
);
$("weapon-type").onchange = (e) => {
  state.weaponType = e.target.value;
  onFilterChange();
};
$("add-skill").onclick = () => {
  addSkill($("skill-input").value);
  $("skill-input").value = "";
};
$("skill-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) $("add-skill").click();
});
$("skill-input").addEventListener("change", (e) => {
  if (allSkills.includes(e.target.value)) $("add-skill").click();
});
$("match-all").onchange = renderResults;
$("clear-equip").onclick = () => {
  state.equip = {};
  render();
};
$("find-combos").onclick = () => renderCombos(findCombos());
$("sources").replaceChildren(
  ...DATA.sources.flatMap((url, i) => [i ? "、" : "", el("a", { href: url, target: "_blank", rel: "noopener", textContent: url })])
);
$("updated").textContent = DATA.updated;

render();
renderCombos(null);
