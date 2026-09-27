#!/usr/bin/env python3
"""公式サイトの防具・武器ページから data/gear.js を生成する。

使い方: python3 tools/update_data.py
"""
import datetime
import html
import json
import re
import urllib.request
from pathlib import Path

ARMOR_URL = "https://monsterhunternow.com/ja/armor"
WEAPON_URL = "https://monsterhunternow.com/ja/weapons"
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "gear.js"
PARTS = {"HEAD": "head", "CHEST": "chest", "ARMS": "arms", "TORSO": "waist", "LEGS": "legs"}
WEAPON_TYPES = {
    "SWORD_SHIELD": "片手剣",
    "DUAL_BLADES": "双剣",
    "GREAT_SWORD": "大剣",
    "LONG_SWORD": "太刀",
    "HAMMER": "ハンマー",
    "HUNTING_HORN": "狩猟笛",
    "LANCE": "ランス",
    "GUNLANCE": "ガンランス",
    "SWITCH_AXE": "スラッシュアックス",
    "CHARGE_BLADE": "チャージアックス",
    "INSECT_GLAIVE": "操虫棍",
    "LIGHT_BOWGUN": "ライトボウガン",
    "HEAVY_BOWGUN": "ヘビィボウガン",
    "BOW": "弓",
}


def fetch_props(url, component):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    page = urllib.request.urlopen(req, timeout=120).read().decode("utf-8")
    # 一覧コンポーネントの props 属性に全データが JSON で埋め込まれている
    m = re.search(rf'component="{component}"[^>]*?props="([^"]+)"', page)
    if not m:
        raise SystemExit(f"{url} でデータが見つかりませんでした。公式ページの構成が変わった可能性があります。")
    return json.loads(html.unescape(m.group(1)))


def convert(item, d, tr, skill_name, used_skills):
    """公式データ1件を、名前・シリーズ・スキルが変わるグレードだけの形に変換する"""
    steps, prev = [], None
    for g in item["grades"]:
        skills = [{"skill": skill_name[s["kind"]], "lv": s["level"]} for s in g["skills"]]
        used_skills.update(s["skill"] for s in skills)
        if skills != prev:
            steps.append({"grade": g["grade"], "skills": skills})
            prev = skills
    return {
        # 骨系の武器だけシリーズ名の翻訳がない
        "series": tr.get(f"SERIES_NAME_{item['seriesId']}", "ボーン" if "BONE" in item["series"] else "").removesuffix("シリーズ"),
        "name": re.sub(r"[0-9０-９]+$", "", tr.get(item["grades"][0]["name"], "")),
        "order": d["series"].get(item["series"], {}).get("sortOrder", item["seriesId"]),
        "steps": steps,
    }


def main():
    armor_src = fetch_props(ARMOR_URL, "SortableArmorList")
    weapon_src = fetch_props(WEAPON_URL, "SortableWeaponList")
    # 翻訳はページごとに一部しか載っていないので両方を合わせて使う
    tr = {**armor_src["guideTranslations"], **weapon_src["guideTranslations"]}
    skill_src = {**armor_src["skills"], **weapon_src["skills"]}
    skill_name = {k: tr[v["name"]] for k, v in skill_src.items()}
    used_skills = set()

    armor = []
    for a in armor_src["armor"].values():
        armor.append({**convert(a, armor_src, tr, skill_name, used_skills), "part": PARTS[a["category"]]})
    armor.sort(key=lambda x: (x["order"], list(PARTS.values()).index(x["part"])))

    weapons = []
    for w in weapon_src["weapons"].values():
        if not w.get("enabled", True):
            continue
        element = "NO" if w["element"] == "NO_ELEMENT" else w["element"]
        weapons.append({
            **convert(w, weapon_src, tr, skill_name, used_skills),
            "type": w["category"],
            "element": tr.get(f"ELEMENT_{element}", ""),
            # グレードごとの最大強化時の [グレード, 攻撃力, 属性値]
            "stats": [[g["grade"], g["levels"][-1]["attack"], g["levels"][-1]["elementAttack"]] for g in w["grades"]],
        })
    weapons.sort(key=lambda x: (list(WEAPON_TYPES).index(x["type"]), x["order"]))

    skills = {
        skill_name[k]: {"maxLevel": v["maxLevel"], "order": v["sortOrder"]}
        for k, v in skill_src.items()
        if skill_name[k] in used_skills
    }
    data = {
        "sources": [ARMOR_URL, WEAPON_URL],
        "updated": datetime.date.today().isoformat(),
        "skills": skills,
        "weaponTypes": [{"key": k, "label": v} for k, v in WEAPON_TYPES.items()],
        "armor": armor,
        "weapons": weapons,
    }
    OUT.write_text(
        "// 自動生成ファイル（tools/update_data.py）。直接編集しないでください。\n"
        "window.GEAR_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"防具 {len(armor)} 件 / 武器 {len(weapons)} 件 / スキル {len(skills)} 種 を {OUT} に書き出しました")


if __name__ == "__main__":
    main()
