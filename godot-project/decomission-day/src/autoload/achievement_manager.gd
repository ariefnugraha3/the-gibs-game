extends Node

## Sistem pencapaian independen: lifetime milestone (lootBoxes, robots),
## 6 boss awards, dan 2 secret perfect-run awards (Still Standing / Untouchable).

signal achievement_unlocked(achievement: Dictionary)

const BOSSES := [
	["tank", "Steel Breaker", "Defeat the Stage 4 Tank."],
	["locomotive", "End of the Line", "Destroy the hostile locomotive miniboss."],
	["gunship", "Grounded", "Destroy the Combat Gunship."],
	["bomber", "Clear Skies", "Destroy the Heavy Siege Bomber."],
	["warden", "Root Access", "Defeat the Nusantara Warden."],
	["mahapatih", "End of the Mandate", "Defeat M-0 Mahapatih."],
]

var _catalog: Array[Dictionary] = []
var _valid_ids: Dictionary = {}
var _totals := {"lootBoxes": 0, "robots": 0}
var _unlocked: Dictionary = {}
var _run: Variant = null
var _session := ""


func _ready() -> void:
	reload()


func reload() -> void:
	_build_catalog()
	var saved := SaveSystem.get_achievements_data()
	_totals = {"lootBoxes": 0, "robots": 0}
	_unlocked = {}
	if int(saved.get("version", 0)) == 1:
		var t: Variant = saved.get("totals", {})
		if typeof(t) == TYPE_DICTIONARY:
			_totals["lootBoxes"] = maxi(0, int(t.get("lootBoxes", 0)))
			_totals["robots"] = maxi(0, int(t.get("robots", 0)))
		var u: Variant = saved.get("unlocked", {})
		if typeof(u) == TYPE_DICTIONARY:
			for id in u.keys():
				if _valid_ids.has(id) and int(u[id]) > 0:
					_unlocked[id] = int(u[id])
	_run = null
	_session = ""


func _build_catalog() -> void:
	_catalog.clear()
	_valid_ids.clear()
	var tuning: Dictionary = Config.section("achievements")
	var loot_goals: Array = tuning.get("lootBoxes", [1, 10, 100, 200])
	var robot_goals: Array = tuning.get("robots", [1, 100, 1000, 2000])
	var loot_names := ["First Find", "Supply Hunter", "Salvage Expert", "Leave No Crate Behind"]
	var robot_names := ["First Contact", "Resistance", "Decommissioner", "One-Person Army"]

	for i in loot_goals.size():
		var goal := int(loot_goals[i])
		var id := "lootBoxes_%d" % goal
		var title: String = loot_names[i] if i < loot_names.size() else "Loot Box: %d" % goal
		var desc := "Destroy %s loot box%s across Campaign and Survival." % [
			"your first" if goal == 1 else str(goal),
			"" if goal == 1 else "es",
		]
		_catalog.append({
			"id": id, "name": title, "counter": "lootBoxes", "goal": goal,
			"description": desc, "group": "Milestones", "hidden": false,
		})

	for i in robot_goals.size():
		var goal := int(robot_goals[i])
		var id := "robots_%d" % goal
		var title: String = robot_names[i] if i < robot_names.size() else "Robot: %d" % goal
		var desc := "Kill %s robot%s across Campaign and Survival." % [
			"your first" if goal == 1 else str(goal),
			"" if goal == 1 else "s",
		]
		_catalog.append({
			"id": id, "name": title, "counter": "robots", "goal": goal,
			"description": desc, "group": "Milestones", "hidden": false,
		})

	for b in BOSSES:
		_catalog.append({
			"id": "boss_%s" % b[0], "name": b[1], "description": b[2],
			"group": "Bosses", "hidden": false,
		})

	_catalog.append({
		"id": "campaign_deathless", "name": "Still Standing",
		"group": "Secrets", "hidden": true,
		"description": "Complete the entire campaign from Stage 1 without dying.",
	})
	_catalog.append({
		"id": "campaign_untouched", "name": "Untouchable",
		"group": "Secrets", "hidden": true,
		"description": "Complete the entire campaign from Stage 1 without taking a single hit.",
	})

	for item in _catalog:
		_valid_ids[item["id"]] = true


func _persist() -> void:
	SaveSystem.set_achievements_data({
		"version": 1,
		"totals": _totals.duplicate(),
		"unlocked": _unlocked.duplicate(),
	})


func _save_run() -> void:
	if _run == null:
		return
	var payload: Dictionary = (_run as Dictionary).duplicate()
	payload["version"] = 1
	SaveSystem.set_achievement_run(payload)


func _unlock(id: String) -> bool:
	if not _valid_ids.has(id) or _unlocked.has(id):
		return false
	_unlocked[id] = maxi(1, int(Time.get_unix_time_from_system()))
	_persist()
	for a in _catalog:
		if a["id"] == id:
			achievement_unlocked.emit(a.duplicate())
			break
	return true


func _campaign_active() -> bool:
	return _session == "campaign" and typeof(_run) == TYPE_DICTIONARY and not bool(_run.get("finished", true))


func _valid_saved_run(v: Variant, stage: int) -> bool:
	if typeof(v) != TYPE_DICTIONARY:
		return false
	var d: Dictionary = v
	if int(d.get("version", 0)) != 1 or int(d.get("stage", 0)) != stage:
		return false
	var comp := int(d.get("completed", -1))
	if comp != stage - 1 and comp != stage:
		return false
	if d.get("fromStart", false) != true or d.get("finished", true) != false:
		return false
	for k in ["valid", "dead", "hit"]:
		if typeof(d.get(k, null)) != TYPE_BOOL:
			return false
	return true


func start_session(mode: String, stage: int = 1) -> void:
	_session = mode if mode in ["campaign", "survival"] else ""
	_run = null
	if _session != "campaign":
		return
	if stage == 1:
		_run = {
			"fromStart": true, "stage": 1, "completed": 0,
			"valid": true, "dead": false, "hit": false, "finished": false,
		}
	else:
		var prev: Variant = SaveSystem.get_achievement_run()
		if _valid_saved_run(prev, stage):
			_run = prev
		else:
			_run = {
				"fromStart": false, "stage": stage, "completed": stage - 1,
				"valid": false, "dead": false, "hit": false, "finished": false,
			}
	_save_run()


func visit_stage(stage: int) -> void:
	if not _campaign_active():
		return
	var r: Dictionary = _run
	if stage != int(r["stage"]) and stage != int(r["completed"]) + 1:
		r["valid"] = false
	r["stage"] = stage
	_save_run()


func complete_stage(stage: int) -> void:
	if not _campaign_active():
		return
	var r: Dictionary = _run
	if stage == int(r["completed"]):
		return
	if stage != int(r["stage"]) or stage != int(r["completed"]) + 1 or stage >= 12:
		r["valid"] = false
	else:
		r["completed"] = stage
	_save_run()


func record_hit() -> void:
	if not _campaign_active():
		return
	var r: Dictionary = _run
	if bool(r["hit"]):
		return
	r["hit"] = true
	_save_run()


func record_death() -> void:
	if not _campaign_active():
		return
	var r: Dictionary = _run
	if bool(r["dead"]):
		return
	r["dead"] = true
	r["hit"] = true
	_save_run()


func invalidate_run() -> void:
	if not _campaign_active():
		return
	var r: Dictionary = _run
	if not bool(r["valid"]):
		return
	r["valid"] = false
	_save_run()


func complete_campaign() -> void:
	if not _campaign_active():
		return
	var r: Dictionary = _run
	if bool(r["fromStart"]) and bool(r["valid"]) and int(r["stage"]) == 12 and int(r["completed"]) == 11:
		if not bool(r["dead"]):
			_unlock("campaign_deathless")
		if not bool(r["dead"]) and not bool(r["hit"]):
			_unlock("campaign_untouched")
	r["finished"] = true
	_save_run()


func clear_run() -> void:
	_run = null
	SaveSystem.set_achievement_run(null)


func record_robot_kill() -> void:
	_record_counter("robots")


func record_loot_box() -> void:
	_record_counter("lootBoxes")


func _record_counter(counter: String) -> void:
	if _session.is_empty() or not _totals.has(counter):
		return
	_totals[counter] = int(_totals[counter]) + 1
	for a in _catalog:
		if a.get("counter", "") == counter and int(_totals[counter]) >= int(a.get("goal", 9999999)):
			_unlock(a["id"])
	_persist()


func record_boss(boss_id: String) -> void:
	if not _session.is_empty():
		_unlock("boss_%s" % boss_id)


func view() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for a in _catalog:
		var unlocked_at := int(_unlocked.get(a["id"], 0))
		if bool(a.get("hidden", false)) and unlocked_at <= 0:
			out.append({
				"id": a["id"], "name": "Hidden Achievement",
				"description": "Keep playing to discover this achievement.",
				"group": a["group"], "hidden": true,
				"unlocked_at": 0, "progress": -1, "goal": -1,
			})
		else:
			var goal := int(a.get("goal", 0))
			var progress := mini(goal, int(_totals.get(a.get("counter", ""), 0))) if goal > 0 else -1
			out.append({
				"id": a["id"], "name": a["name"],
				"description": a["description"],
				"group": a["group"], "hidden": bool(a.get("hidden", false)),
				"unlocked_at": unlocked_at,
				"progress": progress,
				"goal": goal if goal > 0 else -1,
			})
	return out


func is_unlocked(id: String) -> bool:
	return _unlocked.has(id)


func debug_state() -> Dictionary:
	return {
		"totals": _totals.duplicate(),
		"unlocked": _unlocked.duplicate(),
		"run": _run.duplicate() if typeof(_run) == TYPE_DICTIONARY else null,
		"session": _session,
	}
