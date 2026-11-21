extends Node

## State runtime lintas modul: statistik, inventori/arsenal senjata, armor,
## checkpoint, slow-motion + hit-stop tunggal, dan konsol cheat.

signal ui_dirty
signal cheat_executed(feedback: String, ok: bool)

const WEAPON_DEF := {
	"rifle": {"name": "Assault Rifle", "kick": 2.5},
	"pistol": {"name": "Pistol", "kick": 1.6},
	"shotgun": {"name": "Shotgun", "kick": 3.2},
	"launcher": {"name": "Grenade Launcher", "kick": 3.4},
}
const WEAPON_ORDER := ["pistol", "shotgun", "rifle", "launcher"]

var mode := "campaign" # "survival" | "campaign"
var difficulty := "normal"
var score := 0
var high_score := 0

var is_paused := true
var is_game_over := false
var cinematic_active := false
var god_mode := false
var dodge_invuln := false

var current_stage := 1
var current_chapter := 1

# Statistik run & per-stage
var stats := {"kills": 0, "shots": 0, "hits": 0}
var stage_stats := {
	"stage_id": "",
	"active": false,
	"elapsed_sec": 0.0,
	"loot_boxes_destroyed": 0,
}

# Status player persisten antar-stage dalam satu run
var player := {
	"hp": 100.0,
	"max_hp": 100.0,
	"hp_lvl": 1,
	"ammo_lvl": 1,
	"armor_lvl": 0,
	"armor": 0.0,
	"armor_max": 0.0,
	"medkits": 0,
	"has_radar": false,
	"weapons": ["pistol"],
	"unlocked_weapons": {"pistol": true, "rifle": false, "shotgun": false, "launcher": false},
	"weapon_lvl": {"pistol": 0, "rifle": 0, "shotgun": 0, "launcher": 0},
	"ammo": {"pistol": 300, "rifle": 600, "shotgun": 350, "launcher": 25},
	"current_weapon": "pistol",
	"last_weapon": "pistol",
	"speed": 1.5,
	"radius": 5.0,
	"dmg_mul": 1.0,
	"reload_mul": 1.0,
}

# Skala waktu tunggal (Hit-stop melee x Death slow-motion)
var _hit_stop_t := 0.0
var _hit_stop_dur := 0.0
var _hit_stop_scale := 1.0
var _death_slow_scale := 1.0


func _ready() -> void:
	difficulty = SaveSystem.get_difficulty()
	high_score = SaveSystem.get_high_score(difficulty)


func set_difficulty(diff_name: String) -> void:
	difficulty = diff_name
	SaveSystem.set_difficulty(diff_name)
	Config.apply_difficulty(diff_name)
	high_score = SaveSystem.get_high_score(diff_name)


func configure_player() -> void:
	var pc: Dictionary = Config.section("player")
	var wc: Dictionary = Config.section("weapons")
	player["max_hp"] = float(pc.get("maxHp", 100))
	player["hp"] = float(player["max_hp"])
	player["hp_lvl"] = 1
	player["ammo_lvl"] = 1
	player["armor_lvl"] = 0
	player["armor"] = 0.0
	player["armor_max"] = 0.0
	player["speed"] = float(pc.get("speed", 1.5))
	player["radius"] = float(pc.get("radius", 5.0))
	player["medkits"] = 0
	player["has_radar"] = false
	player["weapons"] = ["pistol"]
	player["unlocked_weapons"] = {"pistol": true, "rifle": false, "shotgun": false, "launcher": false}
	player["weapon_lvl"] = {"pistol": 0, "rifle": 0, "shotgun": 0, "launcher": 0}
	player["current_weapon"] = "pistol"
	player["last_weapon"] = "pistol"
	player["dmg_mul"] = 1.0
	player["reload_mul"] = 1.0

	var ammo_dict := {}
	for w in WEAPON_ORDER:
		ammo_dict[w] = max_ammo_for(w)
	player["ammo"] = ammo_dict
	score = 0
	reset_stats()
	reset_stage_stats()
	reset_time_scale()
	ui_dirty.emit()


func max_ammo_for(w: String) -> int:
	var wc: Dictionary = Config.section("weapons")
	var lvl := int(player.get("ammo_lvl", 1))
	if lvl >= 2:
		var upgrades: Array = wc.get("ammoUpgrades", [])
		var idx := lvl - 2
		if idx >= 0 and idx < upgrades.size() and upgrades[idx].has(w):
			return int(upgrades[idx][w])
	return int(wc.get(w, {}).get("maxAmmo", 150))


func weapon_damage(w: String) -> float:
	var wc: Dictionary = Config.section("weapons")
	var base := float(wc.get(w, {}).get("damage", wc.get("bulletDamage", 20)))
	var lvl := int(player["weapon_lvl"].get(w, 0))
	var pct := float(wc.get("upgradeDamagePct", 0.4))
	return base * (1.0 + pct * float(lvl)) * float(player.get("dmg_mul", 1.0))


func weapon_fire_delay_sec(w: String) -> float:
	var wc: Dictionary = Config.section("weapons")
	var wdata: Dictionary = wc.get(w, {})
	var lvl := int(player["weapon_lvl"].get(w, 0))
	if wdata.has("fireDelayByLevel"):
		var arr: Array = wdata["fireDelayByLevel"]
		if lvl >= 0 and lvl < arr.size():
			return float(arr[lvl]) / 1000.0
	return float(wdata.get("fireDelayMs", 200)) / 1000.0


func weapon_display_name(w: String) -> String:
	var base: String = WEAPON_DEF.get(w, {}).get("name", w.capitalize())
	var lvl := int(player["weapon_lvl"].get(w, 0))
	if w == "launcher" and lvl >= 3:
		base = "Rocket Launcher"
	var tier := Config.upgrade_tier(lvl)
	if not tier.is_empty():
		return "%s %s" % [base, str(tier.get("name", ""))]
	return base


func has_weapon_equipped(w: String) -> bool:
	return w in player["weapons"]


func has_unlocked_weapon(w: String) -> bool:
	return bool(player["unlocked_weapons"].get(w, false))


func unlock_weapon(w: String) -> void:
	player["unlocked_weapons"][w] = true


func equip_or_add_weapon(w: String, replace_index: int = -1) -> String:
	if not WEAPON_DEF.has(w):
		return ""
	var list: Array = player["weapons"]
	var dropped := ""
	if w in list:
		set_current_weapon(w)
		return ""
	var max_slots := int(Config.section("weapons").get("maxWeapons", 3))
	if list.size() >= max_slots:
		var idx := replace_index
		if idx < 0 or idx >= list.size():
			idx = list.find("pistol")
			if idx < 0:
				idx = list.size() - 1
		dropped = str(list[idx])
		list[idx] = w
	else:
		list.append(w)
	unlock_weapon(w)
	set_current_weapon(w)
	ui_dirty.emit()
	return dropped


func set_current_weapon(w: String) -> void:
	if not (w in player["weapons"]):
		if player["weapons"].is_empty():
			return
		w = str(player["weapons"][0])
	if player["current_weapon"] != w:
		if player["current_weapon"] in player["weapons"]:
			player["last_weapon"] = player["current_weapon"]
		player["current_weapon"] = w
	ui_dirty.emit()


func swap_last_weapon() -> void:
	var list: Array = player["weapons"]
	if list.size() < 2:
		return
	var target := str(player.get("last_weapon", ""))
	if target == player["current_weapon"] or not (target in list):
		var cur_i := list.find(player["current_weapon"])
		target = str(list[(cur_i + 1) % list.size()])
	set_current_weapon(target)
	AudioManager.play_sfx("switch", 0.65)


func add_score(amount: int) -> void:
	score += amount
	if score > high_score:
		high_score = score
		SaveSystem.set_high_score(difficulty, high_score)
	ui_dirty.emit()


func set_score(val: int) -> void:
	score = maxi(0, val)
	if score > high_score:
		high_score = score
		SaveSystem.set_high_score(difficulty, high_score)
	ui_dirty.emit()


func reset_stats() -> void:
	stats = {"kills": 0, "shots": 0, "hits": 0}


func begin_stage_stats(stage_id: String) -> void:
	stage_stats = {
		"stage_id": stage_id,
		"active": not stage_id.is_empty(),
		"elapsed_sec": 0.0,
		"loot_boxes_destroyed": 0,
	}


func reset_stage_stats() -> void:
	begin_stage_stats("")


func update_stage_stats(dt_real: float) -> void:
	if bool(stage_stats["active"]) and dt_real > 0.0:
		stage_stats["elapsed_sec"] = float(stage_stats["elapsed_sec"]) + dt_real


func record_loot_box_destroyed() -> void:
	if bool(stage_stats["active"]):
		stage_stats["loot_boxes_destroyed"] = int(stage_stats["loot_boxes_destroyed"]) + 1
	AchievementManager.record_loot_box()


func add_hit_stop(sec: float = 0.07, scale: float = 0.08) -> void:
	if sec <= _hit_stop_t:
		return
	_hit_stop_t = sec
	_hit_stop_dur = sec
	_hit_stop_scale = scale


func set_death_slow_scale(scale: float) -> void:
	_death_slow_scale = clampf(scale, 0.05, 1.0)


func update_time_scale(dt_real: float) -> void:
	if _hit_stop_t > 0.0:
		_hit_stop_t = maxf(0.0, _hit_stop_t - dt_real)


func hit_stop_scale() -> float:
	if _hit_stop_t <= 0.0 or _hit_stop_dur <= 0.0:
		return 1.0
	var k := _hit_stop_t / _hit_stop_dur
	var rel := 0.0 if k > 0.35 else 1.0 - (k / 0.35)
	return _hit_stop_scale + (1.0 - _hit_stop_scale) * rel * rel


func global_time_scale() -> float:
	return _death_slow_scale * hit_stop_scale()


func reset_time_scale() -> void:
	_hit_stop_t = 0.0
	_hit_stop_dur = 0.0
	_hit_stop_scale = 1.0
	_death_slow_scale = 1.0


func set_god_mode(on: bool) -> void:
	god_mode = on
	if on:
		AchievementManager.invalidate_run()


func damage_player(raw_dmg: float, record_hit: bool = true) -> float:
	if god_mode or dodge_invuln or is_game_over or raw_dmg <= 0.0:
		return 0.0
	if record_hit:
		AchievementManager.record_hit()
	var dmg := raw_dmg
	var armor_lvl := int(player["armor_lvl"])
	if armor_lvl > 0 and float(player["armor"]) > 0.0:
		var tiers: Array = Config.section("armor").get("tiers", [])
		var t_idx := armor_lvl - 1
		var reduce := float(tiers[t_idx].get("reduce", 0.0)) if (t_idx >= 0 and t_idx < tiers.size()) else 0.0
		dmg = raw_dmg * (1.0 - reduce)
		player["armor"] = maxf(0.0, float(player["armor"]) - raw_dmg)
		if float(player["armor"]) <= 0.0:
			player["armor_lvl"] = 0
			player["armor_max"] = 0.0
			AudioManager.play_sfx("melee_break", 0.8)
	player["hp"] = maxf(0.0, float(player["hp"]) - dmg)
	ui_dirty.emit()
	return dmg


func run_cheat_command(raw_cmd: String) -> Dictionary:
	var c := raw_cmd.strip_edges().to_lower()
	if c.is_empty():
		return {"ok": true, "msg": ""}

	if c == "god-mode":
		set_god_mode(not god_mode)
		var msg := "God mode: ON - player & Monas are invincible" if god_mode else "God mode: OFF"
		cheat_executed.emit(msg, true)
		return {"ok": true, "msg": msg}

	if c == "more-money":
		AchievementManager.invalidate_run()
		add_score(100000)
		var msg := "+100000 money added"
		cheat_executed.emit(msg, true)
		return {"ok": true, "msg": msg}

	if c.begins_with("give-weapon-"):
		var num_str := c.trim_prefix("give-weapon-")
		var map := {"1": "pistol", "2": "shotgun", "3": "rifle", "4": "launcher"}
		if not map.has(num_str):
			var err := "Use give-weapon-1..4 (1 pistol, 2 shotgun, 3 rifle, 4 launcher)"
			cheat_executed.emit(err, false)
			return {"ok": false, "msg": err}
		AchievementManager.invalidate_run()
		var w: String = map[num_str]
		var max_lvl := int(Config.section("weapons").get("maxWeaponLevel", 4))
		player["weapon_lvl"][w] = max_lvl
		player["ammo"][w] = max_ammo_for(w)
		equip_or_add_weapon(w)
		var msg := "%s armed with full ammo" % weapon_display_name(w)
		cheat_executed.emit(msg, true)
		return {"ok": true, "msg": msg}

	if c.begins_with("give-armor-"):
		var tier := int(c.trim_prefix("give-armor-"))
		var tiers: Array = Config.section("armor").get("tiers", [])
		if tier < 1 or tier > tiers.size():
			var err := "Use give-armor-1..%d" % tiers.size()
			cheat_executed.emit(err, false)
			return {"ok": false, "msg": err}
		AchievementManager.invalidate_run()
		var t: Dictionary = tiers[tier - 1]
		var dur := float(t.get("durability", 100))
		player["armor_lvl"] = tier
		player["armor"] = dur
		player["armor_max"] = dur
		ui_dirty.emit()
		var msg := "Armor Level %d equipped (%d durability)" % [tier, int(dur)]
		cheat_executed.emit(msg, true)
		return {"ok": true, "msg": msg}

	if c.begins_with("skip-to-stage-"):
		if mode != "campaign":
			var err := "skip-to-stage only works in Campaign mode"
			cheat_executed.emit(err, false)
			return {"ok": false, "msg": err}
		var rest := c.trim_prefix("skip-to-stage-")
		var parts := rest.split("-ch-")
		var st := int(parts[0])
		var ch := int(parts[1]) if parts.size() > 1 else 1
		if st < 1 or st > 12:
			var err := "Invalid stage - use skip-to-stage-1..12"
			cheat_executed.emit(err, false)
			return {"ok": false, "msg": err}
		AchievementManager.invalidate_run()
		SceneRouter.jump_to_stage(st, ch)
		var msg := "Jumped to Stage %d Chapter %d" % [st, ch]
		cheat_executed.emit(msg, true)
		return {"ok": true, "msg": msg}

	if c.begins_with("skip-to-wave-"):
		if mode != "survival":
			var err := "skip-to-wave only works in Survival mode"
			cheat_executed.emit(err, false)
			return {"ok": false, "msg": err}
		var wv := maxi(1, int(c.trim_prefix("skip-to-wave-")))
		AchievementManager.invalidate_run()
		SceneRouter.cheat_skip_to_wave(wv)
		var msg := "Field Shop opened - prepare for Wave %d" % wv
		cheat_executed.emit(msg, true)
		return {"ok": true, "msg": msg}

	var unknown := "Unknown command: %s" % raw_cmd
	cheat_executed.emit(unknown, false)
	return {"ok": false, "msg": unknown}


static func format_time(seconds: float) -> String:
	var total := maxi(0, int(floorf(seconds)))
	var h := total / 3600
	var m := (total / 60) % 60
	var s := total % 60
	if h > 0:
		return "%d:%02d:%02d" % [h, m, s]
	return "%02d:%02d" % [m, s]
