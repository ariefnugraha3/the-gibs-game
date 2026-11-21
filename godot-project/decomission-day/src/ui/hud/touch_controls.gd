class_name TouchControls
extends Control

## Kontrol sentuh adaptif Android/iOS (dan mode uji Touch di Desktop):
## Dual virtual thumbstick (kiri = gerak, kanan = bidik 360 + auto-tembak) +
## tombol aksi multi-sentuh independen.

signal dodge_pressed
signal melee_pressed
signal medkit_pressed
signal cycle_weapon_pressed
signal bomb_pressed
signal pause_pressed
signal skip_pressed

var move_vec := Vector2.ZERO
var aim_vec := Vector2.ZERO
var is_shooting := false

var _left_idx := -1
var _left_origin := Vector2.ZERO
var _left_knob := Vector2.ZERO
var _right_idx := -1
var _right_origin := Vector2.ZERO
var _right_knob := Vector2.ZERO
var _max_r := 76.0

var _btn_dodge: Button
var _btn_melee: Button
var _btn_medkit: Button
var _btn_wpn: Button
var _btn_bomb: Button
var _btn_pause: Button
var _btn_skip: Button

var _aircraft_mode := false
var _cutscene_mode := false
var _bound_player: PlayerController = null


func bind_player(p: PlayerController) -> void:
	_bound_player = p
	if not p:
		return
	if not dodge_pressed.is_connected(p.try_dodge):
		dodge_pressed.connect(p.try_dodge)
	if not melee_pressed.is_connected(p.try_melee):
		melee_pressed.connect(p.try_melee)
	if not medkit_pressed.is_connected(p.toggle_medkit):
		medkit_pressed.connect(p.toggle_medkit)
	if not cycle_weapon_pressed.is_connected(_on_cycle_weapon):
		cycle_weapon_pressed.connect(_on_cycle_weapon)


func _on_cycle_weapon() -> void:
	if not _bound_player:
		return
	var weapons: Array = GameState.player.get("weapons", ["pistol"])
	if weapons.size() > 1:
		var cur := weapons.find(str(GameState.player.get("current_weapon", "pistol")))
		_bound_player.switch_slot((cur + 1) % weapons.size())


func _process(_dt: float) -> void:
	if _bound_player and is_instance_valid(_bound_player):
		_bound_player.touch_move_vec = move_vec
		_bound_player.touch_aim_vec = aim_vec
		_bound_player.touch_shooting = is_shooting


func _ready() -> void:
	set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build_buttons()
	refresh_visibility()


func _build_buttons() -> void:
	var font := Pal.font_black()
	_btn_pause = _mk_btn("PAUSE", Vector2(94, 44), font, func(): pause_pressed.emit())
	_btn_pause.anchor_left = 1.0; _btn_pause.anchor_right = 1.0
	_btn_pause.offset_left = -114; _btn_pause.offset_right = -20
	_btn_pause.offset_top = 18; _btn_pause.offset_bottom = 62

	_btn_skip = _mk_btn("SKIP >>", Vector2(116, 46), font, func(): skip_pressed.emit())
	_btn_skip.anchor_left = 1.0; _btn_skip.anchor_right = 1.0
	_btn_skip.anchor_top = 1.0; _btn_skip.anchor_bottom = 1.0
	_btn_skip.offset_left = -140; _btn_skip.offset_right = -24
	_btn_skip.offset_top = -110; _btn_skip.offset_bottom = -64
	_btn_skip.visible = false

	_btn_dodge = _mk_btn("DODGE", Vector2(88, 56), font, func(): dodge_pressed.emit())
	_btn_melee = _mk_btn("MELEE", Vector2(88, 56), font, func(): melee_pressed.emit())
	_btn_medkit = _mk_btn("MEDKIT", Vector2(88, 48), font, func(): medkit_pressed.emit())
	_btn_wpn = _mk_btn("WEAPON", Vector2(88, 48), font, func(): cycle_weapon_pressed.emit())
	_btn_bomb = _mk_btn("BOMB", Vector2(96, 62), font, func(): bomb_pressed.emit())

	for b in [_btn_dodge, _btn_melee, _btn_medkit, _btn_wpn, _btn_bomb]:
		b.anchor_left = 1.0; b.anchor_right = 1.0
		b.anchor_top = 1.0; b.anchor_bottom = 1.0

	_btn_dodge.offset_left = -112; _btn_dodge.offset_right = -24; _btn_dodge.offset_top = -248; _btn_dodge.offset_bottom = -192
	_btn_melee.offset_left = -212; _btn_melee.offset_right = -124; _btn_melee.offset_top = -248; _btn_melee.offset_bottom = -192
	_btn_medkit.offset_left = -112; _btn_medkit.offset_right = -24; _btn_medkit.offset_top = -312; _btn_medkit.offset_bottom = -264
	_btn_wpn.offset_left = -212; _btn_wpn.offset_right = -124; _btn_wpn.offset_top = -312; _btn_wpn.offset_bottom = -264
	_btn_bomb.offset_left = -120; _btn_bomb.offset_right = -24; _btn_bomb.offset_top = -236; _btn_bomb.offset_bottom = -174
	_btn_bomb.visible = false


func _mk_btn(txt: String, min_sz: Vector2, font: Font, cb: Callable) -> Button:
	var b := Button.new()
	b.text = txt
	b.custom_minimum_size = min_sz
	b.add_theme_font_override("font", font)
	b.add_theme_font_size_override("font_size", 15)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.08, 0.10, 0.13, 0.72)
	sb.border_color = Pal.AMBER
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(8)
	b.add_theme_stylebox_override("normal", sb)
	b.add_theme_color_override("font_color", Pal.WHITE)
	b.pressed.connect(cb)
	add_child(b)
	return b


func set_modes(aircraft: bool, cutscene: bool) -> void:
	_aircraft_mode = aircraft
	_cutscene_mode = cutscene
	refresh_visibility()


func refresh_visibility() -> void:
	var on := SceneRouter.is_touch_active() and not GameState.is_paused and not GameState.is_game_over
	visible = on
	if not on:
		_reset_sticks()
		return
	_btn_pause.visible = not _cutscene_mode
	_btn_skip.visible = _cutscene_mode
	_btn_dodge.visible = not _cutscene_mode and not _aircraft_mode
	_btn_melee.visible = not _cutscene_mode and not _aircraft_mode
	_btn_medkit.visible = not _cutscene_mode and not _aircraft_mode
	_btn_wpn.visible = not _cutscene_mode and not _aircraft_mode
	_btn_bomb.visible = not _cutscene_mode and _aircraft_mode


func _reset_sticks() -> void:
	_left_idx = -1
	_right_idx = -1
	move_vec = Vector2.ZERO
	aim_vec = Vector2.ZERO
	is_shooting = false
	queue_redraw()


func _input(event: InputEvent) -> void:
	if not visible or _cutscene_mode:
		return
	var sz := get_viewport_rect().size
	if event is InputEventScreenTouch:
		var ev := event as InputEventScreenTouch
		if ev.pressed:
			# Jangan tangkap jika menyentuh area tombol kanan atas/bawah
			if ev.position.x < sz.x * 0.45 and _left_idx == -1:
				_left_idx = ev.index
				_left_origin = ev.position
				_left_knob = ev.position
				queue_redraw()
			elif ev.position.x >= sz.x * 0.45 and ev.position.y > sz.y * 0.45 and _right_idx == -1:
				_right_idx = ev.index
				_right_origin = ev.position
				_right_knob = ev.position
				queue_redraw()
		else:
			if ev.index == _left_idx:
				_left_idx = -1
				move_vec = Vector2.ZERO
				queue_redraw()
			elif ev.index == _right_idx:
				_right_idx = -1
				aim_vec = Vector2.ZERO
				is_shooting = false
				queue_redraw()
	elif event is InputEventScreenDrag:
		var dv := event as InputEventScreenDrag
		if dv.index == _left_idx:
			var delta := dv.position - _left_origin
			var clamped := delta.limit_length(_max_r)
			_left_knob = _left_origin + clamped
			move_vec = clamped / _max_r
			queue_redraw()
		elif dv.index == _right_idx:
			var delta := dv.position - _right_origin
			var clamped := delta.limit_length(_max_r)
			_right_knob = _right_origin + clamped
			var norm := clamped / _max_r
			if norm.length() > 0.22:
				aim_vec = norm.normalized()
				is_shooting = true
			else:
				is_shooting = false
			queue_redraw()


func _draw() -> void:
	if not visible or _cutscene_mode:
		return
	if _left_idx != -1:
		draw_arc(_left_origin, _max_r, 0, TAU, 28, Color(Pal.AMBER, 0.45), 2.5)
		draw_circle(_left_knob, 26.0, Color(Pal.AMBER, 0.65))
	if _right_idx != -1:
		draw_arc(_right_origin, _max_r, 0, TAU, 28, Color(Pal.TECH, 0.45), 2.5)
		draw_circle(_right_knob, 26.0, Color(Pal.TECH, 0.72))
