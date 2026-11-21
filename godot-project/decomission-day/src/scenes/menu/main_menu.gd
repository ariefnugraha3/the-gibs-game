extends Control

## Menu Utama Decommission Day (PC Desktop + Android/iOS Mobile Ready):
## Latar skyline Jakarta 2045 parallax 3-lapis + Monas, logo distressed,
## navigasi Start / Settings (Quality, Music, SFX, Touch Mode) / Achievements / Credits / Exit,
## serta pilih Mode & Difficulty dengan prompt Continue Campaign.

const MENU_CREDITS := [
	["Created & Directed by", "Sunday Afternoon Games"],
	["Engine", "Godot Engine 4.7"],
	["Visuals", "Original Procedural 3D"],
	["Audio", "Royalty-Free Sources"],
	["Typeface", "Gasalt & Courier Prime"],
	["Special Thanks", "The Playtesters"],
]

var _sky_ctrl: _JakartaSkyline
var _main_panel: VBoxContainer
var _settings_panel: PanelContainer
var _achievements_panel: PanelContainer
var _credits_panel: PanelContainer
var _mode_panel: Control
var _continue_overlay: ColorRect

var _diff := "normal"
var _diff_note_lbl: Label
var _diff_btns: Dictionary = {}
var _q_btns: Dictionary = {}
var _input_btns: Dictionary = {}
var _ach_list: VBoxContainer
var _ach_summary: Label
var _cp_lbl: Label
var _cp_stage := 0


func _ready() -> void:
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	_diff = SaveSystem.get_difficulty()
	_build_ui()
	AudioManager.start_menu_music()


func _process(_dt: float) -> void:
	if _sky_ctrl and not SceneRouter.is_touch_active():
		var vp := get_viewport_rect().size
		if vp.x > 1.0 and vp.y > 1.0:
			var m := get_viewport().get_mouse_position()
			var norm := Vector2((m.x / vp.x) - 0.5, (m.y / vp.y) - 0.5)
			_sky_ctrl.set_parallax(norm)


func _build_ui() -> void:
	var f_blk := Pal.font_black()
	var f_reg := Pal.font_regular()

	var bg := ColorRect.new(); bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	bg.color = Color.html("#0a0c0f"); add_child(bg)

	_sky_ctrl = _JakartaSkyline.new(); _sky_ctrl.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	add_child(_sky_ctrl)

	# --- Main Menu ---
	_main_panel = VBoxContainer.new()
	_main_panel.anchor_top = 0.14; _main_panel.anchor_bottom = 0.92
	_main_panel.offset_left = 72; _main_panel.offset_right = 520
	_main_panel.add_theme_constant_override("separation", 14)
	add_child(_main_panel)

	var logo_tex_path := "res://assets/images/decommission-day-logo-distressed-transparent.png"
	if ResourceLoader.exists(logo_tex_path):
		var tex := load(logo_tex_path)
		if tex is Texture2D:
			var logo := TextureRect.new()
			logo.texture = tex
			logo.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
			logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			logo.custom_minimum_size = Vector2(440, 145)
			_main_panel.add_child(logo)
	else:
		var t_lbl := _lbl("DECOMMISSION DAY", 44, Pal.AMBER, f_blk)
		_main_panel.add_child(t_lbl)

	var nav := VBoxContainer.new(); nav.add_theme_constant_override("separation", 10)
	_main_panel.add_child(nav)
	for entry in [
		["Start Game", _open_mode_select],
		["Settings", func(): _show_sub(_settings_panel)],
		["Achievements", func(): _refresh_achievements(); _show_sub(_achievements_panel)],
		["Credits", func(): _show_sub(_credits_panel)],
		["Exit", func(): get_tree().quit()],
	]:
		var b := _nav_btn(entry[0], f_blk, entry[1])
		if OS.get_name() in ["Android", "iOS"] and entry[0] == "Exit":
			b.visible = false
		nav.add_child(b)

	var stamp := _lbl("DESKTOP & MOBILE EDITION · BUILD GODOT 4.7", 12, Pal.STEEL, f_reg)
	stamp.anchor_top = 1.0; stamp.anchor_bottom = 1.0; stamp.offset_left = 72; stamp.offset_top = -34; stamp.offset_bottom = -12
	add_child(stamp)

	_build_settings_panel(f_blk, f_reg)
	_build_achievements_panel(f_blk, f_reg)
	_build_credits_panel(f_blk, f_reg)
	_build_mode_panel(f_blk, f_reg)
	_build_continue_prompt(f_blk, f_reg)


func _build_settings_panel(f_blk: Font, f_reg: Font) -> void:
	_settings_panel = _modal_panel(560, 440)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 12)
	var m := MarginContainer.new(); _pad(m, 22); _settings_panel.add_child(m); m.add_child(v)
	v.add_child(_lbl("SETTINGS", 26, Pal.AMBER, f_blk))

	v.add_child(_lbl("GRAPHICS QUALITY", 14, Pal.STEEL, f_blk))
	var qrow := HBoxContainer.new(); qrow.add_theme_constant_override("separation", 6); v.add_child(qrow)
	for idx in range(SceneRouter.QUALITY_TIERS.size() - 1, -1, -1):
		var q: Dictionary = SceneRouter.QUALITY_TIERS[idx]
		var b := Button.new(); b.text = str(q["name"]); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 36); b.add_theme_font_override("font", f_blk)
		var tier_i := idx
		b.pressed.connect(func(): SceneRouter.apply_quality_tier(tier_i); _refresh_settings())
		qrow.add_child(b); _q_btns[idx] = b

	v.add_child(_lbl("CONTROLS MODE", 14, Pal.STEEL, f_blk))
	var irow := HBoxContainer.new(); irow.add_theme_constant_override("separation", 6); v.add_child(irow)
	for pair in [["auto", "Auto"], ["desktop", "Desktop"], ["touch", "Mobile Touch"]]:
		var b := Button.new(); b.text = pair[1]; b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 36); b.add_theme_font_override("font", f_blk)
		var mode_k: String = pair[0]
		b.pressed.connect(func(): SceneRouter.set_input_mode(mode_k); _refresh_settings())
		irow.add_child(b); _input_btns[mode_k] = b

	v.add_child(_lbl("MUSIC VOLUME", 14, Pal.STEEL, f_blk))
	var ms := HSlider.new(); ms.min_value = 0.0; ms.max_value = 1.0; ms.step = 0.05; ms.value = AudioManager.music_vol
	ms.value_changed.connect(func(val: float): AudioManager.set_music_volume(val))
	v.add_child(ms)

	v.add_child(_lbl("EFFECTS VOLUME", 14, Pal.STEEL, f_blk))
	var ss := HSlider.new(); ss.min_value = 0.0; ss.max_value = 1.0; ss.step = 0.05; ss.value = AudioManager.sfx_vol
	ss.value_changed.connect(func(val: float): AudioManager.set_sfx_volume(val))
	v.add_child(ss)

	var sp := Control.new(); sp.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(sp)
	var back := Button.new(); back.text = "BACK"; back.custom_minimum_size = Vector2(140, 40)
	back.add_theme_font_override("font", f_blk); back.pressed.connect(_back_to_main)
	v.add_child(back)
	_refresh_settings()


func _refresh_settings() -> void:
	for k in _q_btns.keys():
		(_q_btns[k] as Button).modulate = Pal.AMBER if int(k) == SceneRouter.quality_tier else Pal.WHITE
	for k in _input_btns.keys():
		(_input_btns[k] as Button).modulate = Pal.AMBER if str(k) == SceneRouter.input_mode else Pal.WHITE


func _build_achievements_panel(f_blk: Font, f_reg: Font) -> void:
	_achievements_panel = _modal_panel(680, 480)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 10)
	var m := MarginContainer.new(); _pad(m, 22); _achievements_panel.add_child(m); m.add_child(v)
	var top := HBoxContainer.new(); v.add_child(top)
	top.add_child(_lbl("ACHIEVEMENTS", 26, Pal.AMBER, f_blk))
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; top.add_child(sp)
	_ach_summary = _lbl("0 / 16", 16, Pal.TECH, f_blk); top.add_child(_ach_summary)

	var scroll := ScrollContainer.new(); scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(scroll)
	_ach_list = VBoxContainer.new(); _ach_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ach_list.add_theme_constant_override("separation", 8); scroll.add_child(_ach_list)

	var back := Button.new(); back.text = "BACK"; back.custom_minimum_size = Vector2(140, 40)
	back.add_theme_font_override("font", f_blk); back.pressed.connect(_back_to_main)
	v.add_child(back)


func _refresh_achievements() -> void:
	for ch in _ach_list.get_children():
		ch.queue_free()
	var items := AchievementManager.view()
	var unlocked_cnt := 0
	for a in items:
		var un := int(a["unlocked_at"]) > 0
		if un:
			unlocked_cnt += 1
		var p := PanelContainer.new()
		var sb := StyleBoxFlat.new(); sb.bg_color = Color.html("#151c22") if un else Color.html("#0e1116")
		sb.border_color = Pal.AMBER if un else Pal.GUNMETAL; sb.set_border_width_all(1)
		p.add_theme_stylebox_override("panel", sb)
		var pm := MarginContainer.new(); _pad(pm, 10); p.add_child(pm)
		var row := HBoxContainer.new(); pm.add_child(row)
		var info := VBoxContainer.new(); info.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(info)
		info.add_child(_lbl(str(a["name"]), 16, Pal.AMBER if un else Pal.WHITE, Pal.font_black()))
		info.add_child(_lbl(str(a["description"]), 13, Pal.STEEL, Pal.font_regular()))
		var st_txt := "UNLOCKED" if un else ("%d / %d" % [int(a["progress"]), int(a["goal"])] if int(a["goal"]) > 0 else "LOCKED")
		row.add_child(_lbl(st_txt, 14, Pal.TECH if un else Pal.STEEL, Pal.font_black()))
		_ach_list.add_child(p)
	_ach_summary.text = "%d / %d unlocked" % [unlocked_cnt, items.size()]


func _build_credits_panel(f_blk: Font, f_reg: Font) -> void:
	_credits_panel = _modal_panel(520, 380)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 10)
	var m := MarginContainer.new(); _pad(m, 22); _credits_panel.add_child(m); m.add_child(v)
	v.add_child(_lbl("CREDITS", 26, Pal.AMBER, f_blk))
	for row_data in MENU_CREDITS:
		var h := HBoxContainer.new(); v.add_child(h)
		h.add_child(_lbl(row_data[0], 15, Pal.STEEL, f_reg))
		var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(sp)
		h.add_child(_lbl(row_data[1], 15, Pal.WHITE, f_blk))
	var sp2 := Control.new(); sp2.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(sp2)
	v.add_child(_lbl("MADE IN INDONESIA", 14, Pal.AMBER, f_blk))
	var back := Button.new(); back.text = "BACK"; back.custom_minimum_size = Vector2(140, 40)
	back.add_theme_font_override("font", f_blk); back.pressed.connect(_back_to_main)
	v.add_child(back)


func _build_mode_panel(f_blk: Font, f_reg: Font) -> void:
	_mode_panel = Control.new(); _mode_panel.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_mode_panel.visible = false; add_child(_mode_panel)
	var v := VBoxContainer.new()
	v.anchor_top = 0.14; v.anchor_bottom = 0.90; v.offset_left = 72; v.offset_right = 540
	v.add_theme_constant_override("separation", 14)
	_mode_panel.add_child(v)

	v.add_child(_lbl("SELECT OPERATION", 32, Pal.AMBER, f_blk))
	v.add_child(_lbl("DIFFICULTY", 13, Pal.STEEL, f_blk))
	var drow := HBoxContainer.new(); drow.add_theme_constant_override("separation", 8); v.add_child(drow)
	for d in ["easy", "normal", "hard"]:
		var b := Button.new(); b.text = d.capitalize(); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 38); b.add_theme_font_override("font", f_blk)
		var dk: String = d
		b.pressed.connect(func(): _diff = dk; GameState.set_difficulty(dk); _refresh_diff())
		drow.add_child(b); _diff_btns[dk] = b
	_diff_note_lbl = _lbl("", 13, Pal.WHITE, f_reg); v.add_child(_diff_note_lbl)
	_refresh_diff()

	var surv_b := _nav_btn("Survival\nEndless waves. Keep the Monument standing.", f_blk, func():
		GameState.set_difficulty(_diff)
		SceneRouter.start_game("survival", 1)
	)
	surv_b.custom_minimum_size = Vector2(0, 74)
	v.add_child(surv_b)

	var camp_b := _nav_btn("Campaign\nRobot AI rules Indonesia. Major Gibran must stop it.", f_blk, func():
		GameState.set_difficulty(_diff)
		var saved := SaveSystem.load_campaign_stage()
		if saved > 1:
			_cp_stage = saved
			_cp_lbl.text = "You have a saved campaign at Stage %d. Continue?" % saved
			_continue_overlay.visible = true
		else:
			SceneRouter.start_game("campaign", 1)
	)
	camp_b.custom_minimum_size = Vector2(0, 74)
	v.add_child(camp_b)

	var back := Button.new(); back.text = "BACK"; back.custom_minimum_size = Vector2(140, 42)
	back.add_theme_font_override("font", f_blk); back.pressed.connect(_back_to_main)
	v.add_child(back)


func _build_continue_prompt(f_blk: Font, f_reg: Font) -> void:
	_continue_overlay = ColorRect.new(); _continue_overlay.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	_continue_overlay.color = Color(0.02, 0.03, 0.04, 0.84); _continue_overlay.visible = false
	add_child(_continue_overlay)
	var cc := CenterContainer.new(); cc.set_anchors_and_offsets_preset(PRESET_FULL_RECT); _continue_overlay.add_child(cc)
	var p := PanelContainer.new(); p.custom_minimum_size = Vector2(440, 180)
	var sb := StyleBoxFlat.new(); sb.bg_color = Color.html("#13171d"); sb.border_color = Pal.AMBER; sb.set_border_width_all(2)
	p.add_theme_stylebox_override("panel", sb); cc.add_child(p)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 14)
	var m := MarginContainer.new(); _pad(m, 22); p.add_child(m); m.add_child(v)
	v.add_child(_lbl("CONTINUE?", 22, Pal.AMBER, f_blk))
	_cp_lbl = _lbl("", 15, Pal.WHITE, f_reg); _cp_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(_cp_lbl)
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 12); v.add_child(h)
	var cyes := Button.new(); cyes.text = "Yes, Continue"; cyes.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cyes.custom_minimum_size = Vector2(0, 42)
	cyes.add_theme_font_override("font", f_blk); cyes.pressed.connect(func(): SceneRouter.start_game("campaign", _cp_stage))
	var cno := Button.new(); cno.text = "No, New Game"; cno.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cno.custom_minimum_size = Vector2(0, 42)
	cno.add_theme_font_override("font", f_blk); cno.pressed.connect(func(): SaveSystem.clear_campaign_save(); SceneRouter.start_game("campaign", 1))
	h.add_child(cyes); h.add_child(cno)


func _refresh_diff() -> void:
	for k in _diff_btns.keys():
		(_diff_btns[k] as Button).modulate = Pal.AMBER if str(k) == _diff else Pal.WHITE
	var d: Dictionary = Config.section("difficulty").get(_diff, {})
	if d.is_empty():
		return
	var hp_m := float(d.get("robotHpMul", 1.0))
	var dmg_m := float(d.get("robotDamageMul", 1.0))
	var sp_m := float(d.get("spawnIntervalMul", 1.0))
	if absf(hp_m - 1.0) < 0.01 and absf(dmg_m - 1.0) < 0.01:
		_diff_note_lbl.text = "Baseline — the mission as designed"
	else:
		_diff_note_lbl.text = "Enemy HP ×%.2f · Enemy Damage ×%.2f · Wave Gap ×%.2f" % [hp_m, dmg_m, sp_m]


func _open_mode_select() -> void:
	_main_panel.visible = false
	_settings_panel.visible = false
	_achievements_panel.visible = false
	_credits_panel.visible = false
	_mode_panel.visible = true


func _show_sub(panel: PanelContainer) -> void:
	_main_panel.visible = false
	_mode_panel.visible = false
	_settings_panel.visible = panel == _settings_panel
	_achievements_panel.visible = panel == _achievements_panel
	_credits_panel.visible = panel == _credits_panel


func _back_to_main() -> void:
	_settings_panel.visible = false
	_achievements_panel.visible = false
	_credits_panel.visible = false
	_mode_panel.visible = false
	_continue_overlay.visible = false
	_main_panel.visible = true


func _modal_panel(w: int, h: int) -> PanelContainer:
	var p := PanelContainer.new()
	p.anchor_left = 0.5; p.anchor_right = 0.5; p.anchor_top = 0.5; p.anchor_bottom = 0.5
	p.offset_left = -w * 0.5; p.offset_right = w * 0.5; p.offset_top = -h * 0.5; p.offset_bottom = h * 0.5
	var sb := StyleBoxFlat.new(); sb.bg_color = Color(0.05, 0.06, 0.08, 0.94); sb.border_color = Pal.AMBER; sb.set_border_width_all(2)
	p.add_theme_stylebox_override("panel", sb)
	p.visible = false
	add_child(p)
	return p


func _nav_btn(txt: String, font: Font, cb: Callable) -> Button:
	var b := Button.new()
	b.text = txt
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.custom_minimum_size = Vector2(360, 48)
	b.add_theme_font_override("font", font)
	b.add_theme_font_size_override("font_size", 20)
	b.pressed.connect(cb)
	return b


func _pad(m: MarginContainer, px: int) -> void:
	for s in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		m.add_theme_constant_override(s, px)


func _lbl(txt: String, sz: int, col: Color, font: Font) -> Label:
	var l := Label.new(); l.text = txt
	l.add_theme_font_override("font", font); l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", col)
	return l


class _JakartaSkyline extends Control:
	const FAR_BLOCKS := [
		[10, 92, 96, "flat"], [96, 64, 138, "flat"], [150, 120, 78, "step"],
		[262, 56, 172, "spire"], [310, 104, 110, "flat"], [404, 78, 150, "step"],
		[470, 132, 92, "flat"], [590, 60, 186, "spire"], [640, 110, 124, "flat"],
		[742, 96, 84, "flat"], [826, 70, 160, "step"], [888, 128, 104, "flat"],
		[1006, 58, 178, "spire"], [1056, 116, 90, "flat"], [1164, 84, 142, "step"],
		[1240, 104, 76, "flat"], [1336, 66, 166, "spire"], [1394, 122, 112, "flat"],
		[1508, 100, 88, "flat"],
	]
	const MID_BLOCKS := [
		[-20, 128, 156, "step"], [96, 74, 214, "flat"], [162, 100, 128, "flat"],
		[252, 60, 268, "spire"], [304, 146, 182, "step"], [438, 86, 232, "flat"],
		[516, 116, 142, "flat"], [624, 92, 196, "step"], [672, 64, 262, "spire"],
		[772, 134, 150, "flat"], [812, 86, 208, "step"], [968, 122, 128, "flat"],
		[1082, 64, 206, "flat"], [1216, 96, 176, "step"], [1304, 70, 268, "spire"],
		[1366, 152, 188, "step"], [1508, 112, 236, "flat"],
	]
	const NEAR_BLOCKS := [
		[-40, 210, 118, "roof"], [150, 168, 86, "roof"], [300, 122, 132, "roof"],
		[408, 196, 74, "roof"], [590, 150, 104, "roof"], [728, 210, 82, "roof"],
		[922, 164, 122, "roof"], [1072, 188, 90, "roof"], [1246, 142, 138, "roof"],
		[1376, 264, 100, "roof"],
	]

	var _px := Vector2.ZERO

	func set_parallax(norm: Vector2) -> void:
		_px = norm
		queue_redraw()

	func _draw_tower(x: float, gy: float, w: float, h: float, kind: String, col: Color, sx: float, sy: float, draw_wins: bool, seed_i: int) -> void:
		var y := gy - h
		draw_rect(Rect2(x, y, w, h), col)
		if kind == "spire":
			var cx := x + w * 0.5
			draw_colored_polygon(PackedVector2Array([
				Vector2(x, y), Vector2(x + w, y),
				Vector2(cx + w * 0.24, y - 24 * sy), Vector2(cx - w * 0.24, y - 24 * sy)
			]), col)
			draw_rect(Rect2(cx - 1.4 * sx, y - 56 * sy, 2.8 * sx, 32 * sy), col)
			draw_circle(Vector2(cx, y - 59 * sy), 2.8 * sx, Pal.HAZARD)
		elif kind == "step":
			draw_rect(Rect2(x + w * 0.14, y - 16 * sy, w * 0.72, 16 * sy), col)
			draw_rect(Rect2(x + w * 0.30, y - 28 * sy, w * 0.40, 12 * sy), col)

		if draw_wins:
			var rng := RandomNumberGenerator.new()
			rng.seed = 2045 + seed_i * 97
			var wy := y + 12 * sy
			while wy < gy - 26 * sy:
				var wx := x + 7 * sx
				while wx < x + w - 10 * sx:
					var r := rng.randf()
					if r < 0.16:
						var wcol := Pal.AMBER_DIM if r < 0.11 else Pal.TECH_DIM
						draw_rect(Rect2(wx, wy, 5.5 * sx, 6.5 * sy), wcol)
					wx += 11.5 * sx
				wy += 14.5 * sy

	func _draw() -> void:
		var sx := size.x / 1600.0
		var sy := size.y / 640.0
		var gy := size.y

		# Pijar langit horizon apokaliptik
		draw_rect(Rect2(0, gy - 320 * sy, size.x, 320 * sy), Color(0.18, 0.10, 0.06, 0.26))
		draw_rect(Rect2(0, gy - 190 * sy, size.x, 190 * sy), Color(0.32, 0.16, 0.07, 0.22))

		var far_col := Color("#2b2d34")
		var mid_col := Color("#1b1d22")
		var near_col := Color("#0d0e11")

		for i in FAR_BLOCKS.size():
			var b: Array = FAR_BLOCKS[i]
			_draw_tower(float(b[0]) * sx - _px.x * 14.0, gy, float(b[1]) * sx, float(b[2]) * sy, str(b[3]), far_col, sx, sy, false, i)

		# Pita kabut tipis antara far dan mid
		draw_rect(Rect2(0, gy - 180 * sy, size.x, 85 * sy), Color(0.16, 0.11, 0.08, 0.18))

		for i in MID_BLOCKS.size():
			var b: Array = MID_BLOCKS[i]
			_draw_tower(float(b[0]) * sx - _px.x * 28.0, gy, float(b[1]) * sx, float(b[2]) * sy, str(b[3]), mid_col, sx, sy, true, i + 50)

		# Siluet Monas detail (undakan + cawan bawah + tugu meruncing + pelataran puncak + lidah api emas)
		var mx := 930.0 * sx - _px.x * 28.0
		draw_rect(Rect2(mx - 48 * sx, gy - 18 * sy, 96 * sx, 18 * sy), mid_col)
		draw_colored_polygon(PackedVector2Array([
			Vector2(mx - 36 * sx, gy - 18 * sy), Vector2(mx + 36 * sx, gy - 18 * sy),
			Vector2(mx + 50 * sx, gy - 52 * sy), Vector2(mx - 50 * sx, gy - 52 * sy),
		]), mid_col)
		draw_colored_polygon(PackedVector2Array([
			Vector2(mx - 12 * sx, gy - 52 * sy), Vector2(mx + 12 * sx, gy - 52 * sy),
			Vector2(mx + 7.5 * sx, gy - 278 * sy), Vector2(mx - 7.5 * sx, gy - 278 * sy),
		]), mid_col)
		draw_rect(Rect2(mx - 17 * sx, gy - 286 * sy, 34 * sx, 8 * sy), mid_col)
		draw_circle(Vector2(mx, gy - 300 * sy), 22.0 * sx, Color(1.0, 0.69, 0.23, 0.22))
		draw_circle(Vector2(mx, gy - 300 * sy), 9.5 * sx, Pal.AMBER)

		for i in NEAR_BLOCKS.size():
			var b: Array = NEAR_BLOCKS[i]
			_draw_tower(float(b[0]) * sx - _px.x * 46.0, gy, float(b[1]) * sx, float(b[2]) * sy, str(b[3]), near_col, sx, sy, false, i + 100)
