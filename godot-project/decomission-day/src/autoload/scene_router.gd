extends Node

## Router scene & kontrol kualitas grafis lintas desktop/mobile.

signal stage_jump_requested(stage_no: int, chapter_no: int)
signal survival_wave_skip_requested(wave_no: int)
signal world_quality_changed(tier: int)

const MAIN_MENU_SCENE := "res://src/scenes/menu/main_menu.tscn"
const PROLOGUE_SCENE := "res://src/scenes/cutscenes/prologue.tscn"
const INTRO_SCENE := "res://src/scenes/cutscenes/intro_cutscene.tscn"
const SURVIVAL_SCENE := "res://src/scenes/survival/survival_mode.tscn"
const CAMPAIGN_HOST_SCENE := "res://src/scenes/campaign/campaign_host.tscn"

# 0 Ultra, 1 High, 2 Medium, 3 Low, 4 Very Low
const QUALITY_TIERS := [
	{"name": "Ultra", "scale": 1.0, "msaa": Viewport.MSAA_4X, "shadow_size": 2048, "shadows": true, "bloom": true},
	{"name": "High", "scale": 1.0, "msaa": Viewport.MSAA_2X, "shadow_size": 1024, "shadows": true, "bloom": true},
	{"name": "Medium", "scale": 0.9, "msaa": Viewport.MSAA_DISABLED, "shadow_size": 1024, "shadows": true, "bloom": false},
	{"name": "Low", "scale": 0.75, "msaa": Viewport.MSAA_DISABLED, "shadow_size": 512, "shadows": true, "bloom": false},
	{"name": "Very Low", "scale": 0.65, "msaa": Viewport.MSAA_DISABLED, "shadow_size": 0, "shadows": false, "bloom": false},
]

var quality_tier := 0
var input_mode := "auto" # "auto" | "desktop" | "touch"
var pending_campaign_stage := 1
var pending_campaign_chapter := 1
var pending_survival_intro := true


func _ready() -> void:
	_ensure_input_map()
	quality_tier = SaveSystem.get_quality()
	input_mode = SaveSystem.get_input_mode()
	apply_quality_tier(quality_tier)


func _ensure_input_map() -> void:
	var key_map := {
		"move_up": [KEY_W, KEY_UP],
		"move_down": [KEY_S, KEY_DOWN],
		"move_left": [KEY_A, KEY_LEFT],
		"move_right": [KEY_D, KEY_RIGHT],
		"dodge": [KEY_SHIFT],
		"melee": [KEY_F],
		"medkit": [KEY_4],
		"weapon_1": [KEY_1],
		"weapon_2": [KEY_2],
		"weapon_3": [KEY_3],
		"weapon_swap": [KEY_Q],
		"bomb": [KEY_SPACE],
		"pause": [KEY_ESCAPE],
		"cheat_console": [KEY_QUOTELEFT],
	}
	for action in key_map:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.2)
		if InputMap.action_get_events(action).is_empty():
			for kc in key_map[action]:
				var ev := InputEventKey.new()
				ev.physical_keycode = kc
				InputMap.action_add_event(action, ev)
	var mouse_map := {
		"shoot": MOUSE_BUTTON_LEFT,
		"move_click": MOUSE_BUTTON_RIGHT,
	}
	for action in mouse_map:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.2)
		if InputMap.action_get_events(action).is_empty():
			var ev := InputEventMouseButton.new()
			ev.button_index = mouse_map[action]
			InputMap.action_add_event(action, ev)


func is_touch_active() -> bool:
	if input_mode == "touch":
		return true
	if input_mode == "desktop":
		return false
	return DisplayServer.is_touchscreen_available() or OS.get_name() in ["Android", "iOS"]


func set_input_mode(m: String) -> void:
	input_mode = m
	SaveSystem.set_input_mode(m)


func apply_quality_tier(tier: int) -> void:
	quality_tier = clampi(tier, 0, QUALITY_TIERS.size() - 1)
	SaveSystem.set_quality(quality_tier)
	var q: Dictionary = QUALITY_TIERS[quality_tier]
	var vp := get_viewport()
	if vp:
		vp.msaa_3d = int(q["msaa"])
		vp.scaling_3d_scale = float(q["scale"])
	var shadow_sz := int(q["shadow_size"])
	if shadow_sz > 0:
		RenderingServer.directional_shadow_atlas_set_size(shadow_sz, true)
	world_quality_changed.emit(quality_tier)


func go_to_menu() -> void:
	AudioManager.stop_all_loops()
	AudioManager.stop_music()
	GameState.is_paused = false
	GameState.is_game_over = false
	GameState.cinematic_active = false
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	get_tree().change_scene_to_file(MAIN_MENU_SCENE)


func start_game(mode_name: String, stage: int = 1) -> void:
	AudioManager.stop_all_loops()
	GameState.mode = mode_name
	GameState.configure_player()
	GameState.is_paused = false
	GameState.is_game_over = false
	GameState.cinematic_active = false
	pending_campaign_stage = clampi(stage, 1, 12)
	pending_campaign_chapter = 1

	if mode_name != "campaign" or stage <= 1:
		AchievementManager.start_session(mode_name, 1)
		if GameState.god_mode:
			AchievementManager.invalidate_run()
	else:
		AchievementManager.start_session("campaign", stage)
		if GameState.god_mode:
			AchievementManager.invalidate_run()

	if mode_name == "survival":
		AudioManager.stop_music()
		pending_survival_intro = true
		get_tree().change_scene_to_file(SURVIVAL_SCENE)
	else:
		var show_prologue := stage == 1 and bool(Config.campaign().get("prologue", {}).get("enabled", true))
		if show_prologue:
			get_tree().change_scene_to_file(PROLOGUE_SCENE)
		elif stage == 1:
			AudioManager.stop_music()
			get_tree().change_scene_to_file(INTRO_SCENE)
		else:
			AudioManager.stop_music()
			get_tree().change_scene_to_file(CAMPAIGN_HOST_SCENE)


func enter_intro_from_prologue() -> void:
	AudioManager.stop_music()
	get_tree().change_scene_to_file(INTRO_SCENE)


func enter_campaign_from_intro() -> void:
	pending_campaign_stage = 1
	pending_campaign_chapter = 1
	get_tree().change_scene_to_file(CAMPAIGN_HOST_SCENE)


func jump_to_stage(stage_no: int, chapter_no: int = 1) -> void:
	pending_campaign_stage = clampi(stage_no, 1, 12)
	pending_campaign_chapter = maxi(1, chapter_no)
	stage_jump_requested.emit(pending_campaign_stage, pending_campaign_chapter)


func cheat_skip_to_wave(wave_no: int) -> void:
	survival_wave_skip_requested.emit(wave_no)
