extends Node

## Konfigurasi terpusat yang dimuat dari res://config/gameplay.json dan stage10.json.
## Seluruh angka gameplay dibaca dari sini; apply_difficulty selalu menghitung ulang dari base_data.

const CAMP_M := 7.0
const GAMEPLAY_PATH := "res://config/gameplay.json"
const STAGE10_PATH := "res://config/stage10.json"

var base_data: Dictionary = {}
var cfg: Dictionary = {}
var current_difficulty := "normal"
var loaded := false


func _ready() -> void:
	load_config()


func load_config() -> void:
	var gp := _read_json(GAMEPLAY_PATH)
	var s10 := _read_json(STAGE10_PATH)
	if not gp.is_empty():
		if not gp.has("campaign") or typeof(gp["campaign"]) != TYPE_DICTIONARY:
			gp["campaign"] = {}
		gp["campaign"]["stage10"] = s10
	base_data = gp
	cfg = gp.duplicate(true)
	loaded = not cfg.is_empty()


func _read_json(path: String) -> Dictionary:
	if ResourceLoader.exists(path):
		var res := load(path)
		if res is JSON and typeof(res.data) == TYPE_DICTIONARY:
			return (res.data as Dictionary).duplicate(true)
	if FileAccess.file_exists(path):
		var txt := FileAccess.get_file_as_string(path)
		var parsed: Variant = JSON.parse_string(txt)
		if typeof(parsed) == TYPE_DICTIONARY:
			return parsed
	push_error("Config failed to load JSON: %s" % path)
	return {}


func apply_difficulty(diff_name: String) -> void:
	if base_data.is_empty():
		load_config()
	cfg = base_data.duplicate(true)
	current_difficulty = diff_name if cfg.get("difficulty", {}).has(diff_name) else "normal"
	var d: Dictionary = cfg.get("difficulty", {}).get(current_difficulty, {})
	if d.is_empty():
		return

	var hp_mul := float(d.get("robotHpMul", 1.0))
	var dmg_mul := float(d.get("robotDamageMul", 1.0))
	var spawn_mul := float(d.get("spawnIntervalMul", 1.0))

	var classes: Dictionary = cfg.get("robot", {}).get("classes", {})
	for k in classes.keys():
		var c: Dictionary = classes[k]
		c["hp"] = maxi(1, roundi(float(c.get("hp", 50)) * hp_mul))
		c["attack"] = float(c.get("attack", 5)) * dmg_mul

	var camp: Dictionary = cfg.get("campaign", {})
	var bosses: Dictionary = camp.get("bosses", {})

	if bosses.has("giant"):
		var giant: Dictionary = bosses["giant"]
		giant["hp"] = maxi(1, roundi(float(giant.get("hp", 1800)) * hp_mul))
		giant["clawDamage"] = float(giant.get("clawDamage", 60)) * dmg_mul

	if bosses.has("tank"):
		var tank: Dictionary = bosses["tank"]
		tank["hp"] = maxi(1, roundi(float(tank.get("hp", 7000)) * hp_mul))
		tank["cannonDamage"] = float(tank.get("cannonDamage", 50)) * dmg_mul
		tank["mgDamage"] = float(tank.get("mgDamage", 5)) * dmg_mul
		tank["mortarDamage"] = float(tank.get("mortarDamage", 50)) * dmg_mul

	if bosses.has("gunship"):
		var gs: Dictionary = bosses["gunship"]
		gs["hp"] = maxi(1, roundi(float(gs.get("hp", 12000)) * hp_mul))
		gs["mgDamage"] = float(gs.get("mgDamage", 5)) * dmg_mul
		gs["cannonDamage"] = float(gs.get("cannonDamage", 50)) * dmg_mul
		gs["missileDamage"] = float(gs.get("missileDamage", 45)) * dmg_mul

	if bosses.has("warden"):
		var warden: Dictionary = bosses["warden"]
		warden["hp"] = maxi(1, roundi(float(warden.get("hp", 15000)) * hp_mul))
		if warden.has("capacitors"):
			warden["capacitors"]["hp"] = maxi(1, roundi(float(warden["capacitors"].get("hp", 600)) * hp_mul))
		if warden.has("couplings"):
			warden["couplings"]["hp"] = maxi(1, roundi(float(warden["couplings"].get("hp", 800)) * hp_mul))
		for atk in ["rail", "stomp", "burst", "sector"]:
			if warden.has(atk) and warden[atk].has("damage"):
				warden[atk]["damage"] = float(warden[atk]["damage"]) * dmg_mul
		if warden.has("whirlwind"):
			warden["whirlwind"]["damagePerSec"] = float(warden["whirlwind"].get("damagePerSec", 20)) * dmg_mul
		warden["attackGapSec"] = float(warden.get("attackGapSec", 1.8)) * spawn_mul

	var fv: Dictionary = camp.get("stage11", {}).get("forestVehicles", {})
	if not fv.is_empty():
		for vkey in ["machineGun", "homingMissile"]:
			if fv.has(vkey):
				fv[vkey]["hp"] = maxi(1, roundi(float(fv[vkey].get("hp", 600)) * hp_mul))
				fv[vkey]["damage"] = float(fv[vkey].get("damage", 10)) * dmg_mul
		if fv.has("homingMissile"):
			fv["homingMissile"]["projectileHp"] = maxi(1, roundi(float(fv["homingMissile"].get("projectileHp", 60)) * hp_mul))

	if bosses.has("mahapatih"):
		var m0: Dictionary = bosses["mahapatih"]
		for hkey in ["siegeHp", "combatHp", "coreHp"]:
			m0[hkey] = maxi(1, roundi(float(m0.get(hkey, 15000)) * hp_mul))
		if m0.has("hardline"):
			m0["hardline"]["anchorHp"] = maxi(1, roundi(float(m0["hardline"].get("anchorHp", 1000)) * hp_mul))
			m0["hardline"]["sweepDamage"] = float(m0["hardline"].get("sweepDamage", 24)) * dmg_mul
		for atk in ["artillery", "charge", "seismic", "turret", "blade", "lunge", "wave", "cannon"]:
			if m0.has(atk) and m0[atk].has("damage"):
				m0[atk]["damage"] = float(m0[atk]["damage"]) * dmg_mul
		m0["attackGapSec"] = float(m0.get("attackGapSec", 1.7)) * spawn_mul

	var surv: Dictionary = cfg.get("survival", {})
	surv["monasClawDamage"] = float(surv.get("monasClawDamage", 20)) * dmg_mul
	surv["spawnIntervalBase"] = float(surv.get("spawnIntervalBase", 2.5)) * spawn_mul
	surv["spawnIntervalMin"] = float(surv.get("spawnIntervalMin", 1.0)) * spawn_mul


func m(meters: float) -> float:
	return meters * CAMP_M


func section(key: String) -> Dictionary:
	return cfg.get(key, {})


func campaign() -> Dictionary:
	return cfg.get("campaign", {})


func stage_cfg(n: int) -> Dictionary:
	return campaign().get("stage%d" % n, {})


func dialogue_at(path: String) -> Variant:
	var node: Variant = cfg.get("dialogue", {})
	for part in path.split("."):
		if typeof(node) == TYPE_DICTIONARY and node.has(part):
			node = node[part]
		else:
			return null
	return node


func dialogue_map(path: String) -> Dictionary:
	var v: Variant = dialogue_at(path)
	return v if typeof(v) == TYPE_DICTIONARY else {}


func dialogue_list(path: String) -> Array:
	var v: Variant = dialogue_at(path)
	return v if typeof(v) == TYPE_ARRAY else []


func upgrade_tier(level: int) -> Dictionary:
	if level < 1:
		return {}
	var tiers: Array = cfg.get("shop", {}).get("upgradeTiers", [])
	var idx := level - 1
	if idx >= 0 and idx < tiers.size():
		return tiers[idx]
	return {}
