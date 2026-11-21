extends Node

## Persistensi lintas platform (PC Desktop, Android, iOS) berbasis ConfigFile user://.

const DEFAULT_PATH := "user://gibs_save.cfg"
const SAVE_VERSION := 2

var save_path := DEFAULT_PATH
var _data := ConfigFile.new()


func _ready() -> void:
	load_from_disk()


func set_save_path_for_test(path: String) -> void:
	save_path = path
	_data = ConfigFile.new()
	load_from_disk()


func load_from_disk() -> void:
	_data = ConfigFile.new()
	if FileAccess.file_exists(save_path):
		_data.load(save_path)


func flush() -> bool:
	var err := _data.save(save_path)
	return err == OK


func get_quality() -> int:
	return clampi(int(_data.get_value("settings", "quality", 0)), 0, 4)


func set_quality(q: int) -> void:
	_data.set_value("settings", "quality", clampi(q, 0, 4))
	flush()


func get_music_vol() -> float:
	return clampf(float(_data.get_value("settings", "music_vol", 0.8)), 0.0, 1.0)


func set_music_vol(v: float) -> void:
	_data.set_value("settings", "music_vol", clampf(v, 0.0, 1.0))
	flush()


func get_sfx_vol() -> float:
	return clampf(float(_data.get_value("settings", "sfx_vol", 1.0)), 0.0, 1.0)


func set_sfx_vol(v: float) -> void:
	_data.set_value("settings", "sfx_vol", clampf(v, 0.0, 1.0))
	flush()


func get_difficulty() -> String:
	var d := str(_data.get_value("settings", "difficulty", "normal"))
	return d if d in ["easy", "normal", "hard"] else "normal"


func set_difficulty(d: String) -> void:
	_data.set_value("settings", "difficulty", d)
	flush()


func get_input_mode() -> String:
	var m := str(_data.get_value("settings", "input_mode", "auto"))
	return m if m in ["auto", "desktop", "touch"] else "auto"


func set_input_mode(m: String) -> void:
	if m in ["auto", "desktop", "touch"]:
		_data.set_value("settings", "input_mode", m)
		flush()


func get_high_score(diff: String) -> int:
	return maxi(0, int(_data.get_value("scores", diff, 0)))


func set_high_score(diff: String, val: int) -> void:
	_data.set_value("scores", diff, maxi(0, val))
	flush()


func save_campaign_stage(stage_no: int) -> bool:
	if stage_no < 1 or stage_no > 12:
		return false
	_data.set_value("campaign", "stage", stage_no)
	_data.set_value("campaign", "version", SAVE_VERSION)
	return flush()


func load_campaign_stage() -> int:
	var n := int(_data.get_value("campaign", "stage", 0))
	var v := int(_data.get_value("campaign", "version", 0))
	if n < 1 or n > 13:
		return 0
	if v == SAVE_VERSION:
		return n if n <= 12 else 0
	if n >= 11:
		return n - 1
	return n


func clear_campaign_save() -> void:
	_data.set_value("campaign", "stage", 0)
	_data.set_value("campaign", "version", SAVE_VERSION)
	flush()


func get_achievements_data() -> Dictionary:
	var raw: Variant = _data.get_value("achievements", "data", {})
	return raw.duplicate(true) if typeof(raw) == TYPE_DICTIONARY else {}


func set_achievements_data(payload: Dictionary) -> bool:
	_data.set_value("achievements", "data", payload.duplicate(true))
	return flush()


func get_achievement_run() -> Variant:
	var raw: Variant = _data.get_value("achievements", "run", null)
	return raw.duplicate(true) if typeof(raw) == TYPE_DICTIONARY else null


func set_achievement_run(payload: Variant) -> bool:
	if payload == null:
		if _data.has_section_key("achievements", "run"):
			_data.erase_section_key("achievements", "run")
	else:
		_data.set_value("achievements", "run", (payload as Dictionary).duplicate(true))
	return flush()
