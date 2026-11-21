class_name GameHUD
extends CanvasLayer

## HUD Utama Game (Desktop + Mobile): status objektif, Boss HP bar, bar armor/HP/stamina,
## slot senjata/uang/amunisi, radar vektor custom, dialog radio, feed pickup,
## fade sinematik, menu jeda, konsol cheat, layar Game Over / Stage Complete, dan toast achievement.

signal resume_requested
signal restart_requested
signal exit_requested
signal gameover_primary_requested
signal skip_cutscene_requested

var touch_controls: TouchControls

var _wave_lbl: Label
var _boss_box: PanelContainer
var _boss_name: Label
var _boss_bar: ProgressBar

var _progress_box: PanelContainer
var _progress_lbl: Label
var _progress_bar: ProgressBar

var _armor_row: VBoxContainer
var _armor_num: Label
var _armor_bar: ProgressBar
var _hp_lbl: Label
var _hp_num: Label
var _hp_bar: ProgressBar
var _sta_row: VBoxContainer
var _sta_bar: ProgressBar

var _money_lbl: Label
var _ammo_name_lbl: Label
var _ammo_cnt_lbl: Label
var _inv_labels: Array[Label] = []
var _bomb_box: PanelContainer
var _bomb_lbl: Label

var _radar_ctrl: _RadarWidget
var _pickup_lbl: Label
var _pickup_t := 0.0
var _stage_msg_lbl: Label
var _stage_msg_t := 0.0
var _dmg_flash: ColorRect
var _dmg_alpha := 0.0

var _cine_top: ColorRect
var _cine_bot: ColorRect
var _cine_fade: ColorRect
var _radio_box: PanelContainer
var _radio_spk: Label
var _radio_txt: Label
var _caption_lbl: Label
var _skip_btn: Button

var _pause_panel: ColorRect
var _pause_main: VBoxContainer
var _pause_tut: VBoxContainer
var _cheat_box: PanelContainer
var _cheat_input: LineEdit
var _cheat_fb: Label

var _gameover_panel: ColorRect
var _go_title: Label
var _go_money: Label
var _go_best: Label
var _go_stats: Label
var _go_stage_stats: Label
var _go_primary_btn: Button
var _go_primary_cb: Callable = Callable()

var _toast_panel: PanelContainer
var _toast_name: Label
var _toast_desc: Label
var _toast_queue: Array[Dictionary] = []
var _toast_t := 0.0
var _aim_reticle: _AimReticle


func _ready() -> void:
	layer = 10
	_build_ui()
	GameState.ui_dirty.connect(refresh_stats)
	GameState.cheat_executed.connect(_on_cheat_feedback)
	AchievementManager.achievement_unlocked.connect(_on_achievement_unlocked)
	refresh_stats()


func _build_ui() -> void:
	var f_reg := Pal.font_regular()
	var f_blk := Pal.font_black()

	# Flash damage layar
	_dmg_flash = ColorRect.new()
	_dmg_flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_dmg_flash.color = Color(0.85, 0.08, 0.08, 0.0)
	_dmg_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dmg_flash)

	_aim_reticle = _AimReticle.new()
	_aim_reticle.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_aim_reticle.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_aim_reticle)

	# Letterbox & fade sinematik
	_cine_top = ColorRect.new()
	_cine_top.anchor_right = 1.0; _cine_top.offset_bottom = 0.0
	_cine_top.color = Color.BLACK; _cine_top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cine_top)

	_cine_bot = ColorRect.new()
	_cine_bot.anchor_top = 1.0; _cine_bot.anchor_right = 1.0; _cine_bot.anchor_bottom = 1.0
	_cine_bot.offset_top = 0.0
	_cine_bot.color = Color.BLACK; _cine_bot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cine_bot)

	_cine_fade = ColorRect.new()
	_cine_fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_cine_fade.color = Color(0, 0, 0, 0)
	_cine_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cine_fade)

	# Banner objektif atas
	var wave_wrap := CenterContainer.new()
	wave_wrap.anchor_right = 1.0; wave_wrap.offset_top = 12; wave_wrap.offset_bottom = 52
	wave_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(wave_wrap)
	var wave_bg := _panel(Color(0.04, 0.055, 0.08, 0.78), Color(1.0, 0.72, 0.30, 0.45), 1, 2)
	wave_wrap.add_child(wave_bg)
	_wave_lbl = _lbl("OBJECTIVE", 16, Pal.AMBER, f_blk)
	_wave_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var wp := MarginContainer.new(); wp.add_theme_constant_override("margin_left", 24); wp.add_theme_constant_override("margin_right", 24)
	wp.add_theme_constant_override("margin_top", 6); wp.add_theme_constant_override("margin_bottom", 6)
	wave_bg.add_child(wp); wp.add_child(_wave_lbl)

	# Boss HUD
	var boss_wrap := CenterContainer.new()
	boss_wrap.anchor_right = 1.0; boss_wrap.offset_top = 58; boss_wrap.offset_bottom = 104
	boss_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(boss_wrap)
	_boss_box = _panel(Color(0.05, 0.06, 0.08, 0.86), Pal.HAZARD, 1, 2)
	_boss_box.custom_minimum_size = Vector2(460, 42)
	_boss_box.visible = false
	boss_wrap.add_child(_boss_box)
	var bv := VBoxContainer.new(); bv.add_theme_constant_override("separation", 4)
	var bm := MarginContainer.new(); bm.add_theme_constant_override("margin_left", 14); bm.add_theme_constant_override("margin_right", 14)
	bm.add_theme_constant_override("margin_top", 6); bm.add_theme_constant_override("margin_bottom", 6)
	_boss_box.add_child(bm); bm.add_child(bv)
	_boss_name = _lbl("BOSS", 13, Pal.WHITE, f_blk); _boss_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bv.add_child(_boss_name)
	_boss_bar = _bar(Pal.HAZARD, 10)
	bv.add_child(_boss_bar)

	# Progress download/fuel/upload tengah atas
	var pr_wrap := CenterContainer.new()
	pr_wrap.anchor_right = 1.0; pr_wrap.offset_top = 112; pr_wrap.offset_bottom = 158
	pr_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(pr_wrap)
	_progress_box = _panel(Color(0.04, 0.07, 0.10, 0.85), Pal.TECH, 1, 2)
	_progress_box.custom_minimum_size = Vector2(360, 40)
	_progress_box.visible = false
	pr_wrap.add_child(_progress_box)
	var pv := VBoxContainer.new()
	var pm := MarginContainer.new(); pm.add_theme_constant_override("margin_left", 12); pm.add_theme_constant_override("margin_right", 12)
	pm.add_theme_constant_override("margin_top", 5); pm.add_theme_constant_override("margin_bottom", 5)
	_progress_box.add_child(pm); pm.add_child(pv)
	_progress_lbl = _lbl("PROGRESS", 12, Pal.TECH, f_blk); _progress_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	pv.add_child(_progress_lbl)
	_progress_bar = _bar(Pal.TECH, 8)
	pv.add_child(_progress_bar)

	# Radar kiri atas
	_radar_ctrl = _RadarWidget.new()
	_radar_ctrl.position = Vector2(20, 20)
	_radar_ctrl.size = Vector2(146, 146)
	add_child(_radar_ctrl)

	# Kiri bawah: Armor, Health, Stamina
	var bars_box := VBoxContainer.new()
	bars_box.anchor_top = 1.0; bars_box.anchor_bottom = 1.0
	bars_box.offset_left = 22; bars_box.offset_right = 272
	bars_box.offset_top = -152; bars_box.offset_bottom = -20
	bars_box.add_theme_constant_override("separation", 6)
	bars_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bars_box)

	_armor_row = VBoxContainer.new(); _armor_row.visible = false
	var ar_top := HBoxContainer.new()
	ar_top.add_child(_lbl("ARMOR", 12, Color.html("#7ab8ff"), f_blk))
	var sp1 := Control.new(); sp1.size_flags_horizontal = Control.SIZE_EXPAND_FILL; ar_top.add_child(sp1)
	_armor_num = _lbl("0", 12, Pal.WHITE, f_blk); ar_top.add_child(_armor_num)
	_armor_row.add_child(ar_top)
	_armor_bar = _bar(Color.html("#4aa3ff"), 9); _armor_row.add_child(_armor_bar)
	bars_box.add_child(_armor_row)

	var hp_row := VBoxContainer.new()
	var hp_top := HBoxContainer.new()
	_hp_lbl = _lbl("HEALTH", 13, Pal.WHITE, f_blk); hp_top.add_child(_hp_lbl)
	var sp2 := Control.new(); sp2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hp_top.add_child(sp2)
	_hp_num = _lbl("100", 14, Pal.WHITE, f_blk); hp_top.add_child(_hp_num)
	hp_row.add_child(hp_top)
	_hp_bar = _bar(Color.html("#e03c31"), 12); hp_row.add_child(_hp_bar)
	bars_box.add_child(hp_row)

	_sta_row = VBoxContainer.new()
	_sta_row.add_child(_lbl("STAMINA", 11, Color.html("#9be8b0"), f_blk))
	_sta_bar = _bar(Color.html("#3ddc6a"), 7); _sta_row.add_child(_sta_bar)
	bars_box.add_child(_sta_row)

	# Kanan bawah: Money + Inventory + Ammo
	var stats_box := VBoxContainer.new()
	stats_box.anchor_left = 1.0; stats_box.anchor_right = 1.0
	stats_box.anchor_top = 1.0; stats_box.anchor_bottom = 1.0
	stats_box.offset_left = -280; stats_box.offset_right = -22
	stats_box.offset_top = -170; stats_box.offset_bottom = -20
	stats_box.add_theme_constant_override("separation", 6)
	stats_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(stats_box)

	var money_panel := _panel(Color(0.05, 0.06, 0.09, 0.8), Color(1, 0.72, 0.3, 0.35))
	stats_box.add_child(money_panel)
	var mh := HBoxContainer.new()
	var mm := MarginContainer.new(); mm.add_theme_constant_override("margin_left", 10); mm.add_theme_constant_override("margin_right", 10)
	mm.add_theme_constant_override("margin_top", 4); mm.add_theme_constant_override("margin_bottom", 4)
	money_panel.add_child(mm); mm.add_child(mh)
	mh.add_child(_lbl("MONEY", 12, Pal.AMBER, f_blk))
	var sp3 := Control.new(); sp3.size_flags_horizontal = Control.SIZE_EXPAND_FILL; mh.add_child(sp3)
	_money_lbl = _lbl("0", 16, Pal.WHITE, f_blk); mh.add_child(_money_lbl)

	var inv_row := HBoxContainer.new(); inv_row.add_theme_constant_override("separation", 6)
	stats_box.add_child(inv_row)
	for i in 4:
		var slot := _panel(Color(0.05, 0.06, 0.09, 0.82), Color(0.5, 0.55, 0.6, 0.45))
		slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		slot.custom_minimum_size = Vector2(56, 36)
		inv_row.add_child(slot)
		var l := _lbl("%d" % (i + 1), 11, Pal.WHITE, f_reg)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		slot.add_child(l)
		_inv_labels.append(l)

	var ammo_panel := _panel(Color(0.05, 0.06, 0.09, 0.85), Color(0.5, 0.55, 0.6, 0.45))
	stats_box.add_child(ammo_panel)
	var av := VBoxContainer.new()
	var am := MarginContainer.new(); am.add_theme_constant_override("margin_left", 10); am.add_theme_constant_override("margin_right", 10)
	am.add_theme_constant_override("margin_top", 5); am.add_theme_constant_override("margin_bottom", 5)
	ammo_panel.add_child(am); am.add_child(av)
	_ammo_name_lbl = _lbl("Pistol", 13, Pal.AMBER, f_blk)
	_ammo_cnt_lbl = _lbl("300 / 300", 18, Pal.WHITE, f_blk)
	av.add_child(_ammo_name_lbl); av.add_child(_ammo_cnt_lbl)

	_bomb_box = _panel(Color(0.06, 0.08, 0.11, 0.85), Pal.AMBER)
	_bomb_box.visible = false
	stats_box.add_child(_bomb_box)
	_bomb_lbl = _lbl("BOMBS: 3 (SPACE / RMB)", 14, Pal.AMBER, f_blk)
	_bomb_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_bomb_box.add_child(_bomb_lbl)

	# Stage message & pickup feed
	_stage_msg_lbl = _lbl("", 24, Pal.AMBER, f_blk)
	_stage_msg_lbl.anchor_right = 1.0; _stage_msg_lbl.offset_top = 175; _stage_msg_lbl.offset_bottom = 225
	_stage_msg_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_stage_msg_lbl.visible = false
	add_child(_stage_msg_lbl)

	_pickup_lbl = _lbl("", 15, Pal.WHITE, f_reg)
	_pickup_lbl.anchor_top = 1.0; _pickup_lbl.anchor_bottom = 1.0
	_pickup_lbl.offset_left = 24; _pickup_lbl.offset_right = 520
	_pickup_lbl.offset_top = -195; _pickup_lbl.offset_bottom = -165
	_pickup_lbl.visible = false
	add_child(_pickup_lbl)

	# Radio & caption dialogue
	var rad_wrap := CenterContainer.new()
	rad_wrap.anchor_top = 1.0; rad_wrap.anchor_bottom = 1.0; rad_wrap.anchor_right = 1.0
	rad_wrap.offset_top = -170; rad_wrap.offset_bottom = -70
	rad_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(rad_wrap)
	_radio_box = _panel(Color(0.05, 0.07, 0.1, 0.90), Pal.AMBER, 1, 4)
	_radio_box.custom_minimum_size = Vector2(680, 74)
	_radio_box.visible = false
	rad_wrap.add_child(_radio_box)
	var rv := VBoxContainer.new()
	var rm := MarginContainer.new(); rm.add_theme_constant_override("margin_left", 16); rm.add_theme_constant_override("margin_right", 16)
	rm.add_theme_constant_override("margin_top", 8); rm.add_theme_constant_override("margin_bottom", 8)
	_radio_box.add_child(rm); rm.add_child(rv)
	_radio_spk = _lbl("", 13, Pal.AMBER, f_blk)
	_radio_txt = _lbl("", 16, Pal.WHITE, f_reg)
	_radio_txt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rv.add_child(_radio_spk); rv.add_child(_radio_txt)

	_caption_lbl = _lbl("", 19, Pal.WHITE, f_reg)
	_caption_lbl.anchor_top = 1.0; _caption_lbl.anchor_bottom = 1.0; _caption_lbl.anchor_right = 1.0
	_caption_lbl.offset_top = -70; _caption_lbl.offset_bottom = -20
	_caption_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caption_lbl.visible = false
	add_child(_caption_lbl)

	_skip_btn = Button.new()
	_skip_btn.text = "SKIP [SPACE]"
	_skip_btn.anchor_left = 1.0; _skip_btn.anchor_right = 1.0
	_skip_btn.anchor_top = 1.0; _skip_btn.anchor_bottom = 1.0
	_skip_btn.offset_left = -165; _skip_btn.offset_right = -24
	_skip_btn.offset_top = -62; _skip_btn.offset_bottom = -22
	_skip_btn.add_theme_font_override("font", f_blk)
	_skip_btn.visible = false
	_skip_btn.pressed.connect(func(): skip_cutscene_requested.emit())
	add_child(_skip_btn)

	# Touch overlay (mobile / test mode)
	touch_controls = TouchControls.new()
	touch_controls.pause_pressed.connect(func(): resume_requested.emit())
	touch_controls.skip_pressed.connect(func(): skip_cutscene_requested.emit())
	add_child(touch_controls)

	_build_pause_and_overlays(f_reg, f_blk)


func _build_pause_and_overlays(f_reg: Font, f_blk: Font) -> void:
	# Pause menu
	_pause_panel = ColorRect.new()
	_pause_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pause_panel.color = Color(0.02, 0.03, 0.04, 0.82)
	_pause_panel.visible = false
	add_child(_pause_panel)

	var pc := CenterContainer.new()
	pc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pause_panel.add_child(pc)

	var card := _panel(Color(0.06, 0.08, 0.11, 0.96), Pal.AMBER, 1, 4)
	card.custom_minimum_size = Vector2(360, 290)
	pc.add_child(card)
	var pm := MarginContainer.new(); pm.add_theme_constant_override("margin_left", 24); pm.add_theme_constant_override("margin_right", 24)
	pm.add_theme_constant_override("margin_top", 20); pm.add_theme_constant_override("margin_bottom", 20)
	card.add_child(pm)

	_pause_main = VBoxContainer.new(); _pause_main.add_theme_constant_override("separation", 10)
	pm.add_child(_pause_main)
	var ptitle := _lbl("PAUSED", 26, Pal.AMBER, f_blk); ptitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pause_main.add_child(ptitle)
	for pair in [
		["RESUME", func(): resume_requested.emit()],
		["HOW TO PLAY", func(): _pause_main.visible = false; _pause_tut.visible = true],
		["RESTART", func(): restart_requested.emit()],
		["EXIT TO MENU", func(): exit_requested.emit()],
	]:
		var b := Button.new(); b.text = pair[0]; b.custom_minimum_size = Vector2(0, 42)
		b.add_theme_font_override("font", f_blk); b.pressed.connect(pair[1])
		_pause_main.add_child(b)

	_pause_tut = VBoxContainer.new(); _pause_tut.add_theme_constant_override("separation", 8); _pause_tut.visible = false
	pm.add_child(_pause_tut)
	var tt := _lbl("CONTROLS", 22, Pal.AMBER, f_blk); tt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pause_tut.add_child(tt)
	var tut_copy := _lbl(
		"Desktop: WASD Move · Mouse Aim · L-Click Shoot · R-Click Move\n" +
		"1/2/3 Weapons · Q Swap · 4 Medkit · F Melee · Shift Dodge\n" +
		"Mobile: Left Stick Move · Right Stick Aim+Shoot · Touch Buttons",
		14, Pal.WHITE, f_reg
	)
	tut_copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_pause_tut.add_child(tut_copy)
	var tback := Button.new(); tback.text = "BACK"; tback.custom_minimum_size = Vector2(0, 40)
	tback.add_theme_font_override("font", f_blk); tback.pressed.connect(func(): _pause_tut.visible = false; _pause_main.visible = true)
	_pause_tut.add_child(tback)

	# Cheat console (` key)
	_cheat_box = _panel(Color(0.03, 0.04, 0.06, 0.94), Pal.TECH, 1, 2)
	_cheat_box.anchor_left = 0.25; _cheat_box.anchor_right = 0.75
	_cheat_box.offset_top = 80; _cheat_box.offset_bottom = 160
	_cheat_box.visible = false
	add_child(_cheat_box)
	var cv := VBoxContainer.new()
	var cm := MarginContainer.new(); cm.add_theme_constant_override("margin_left", 12); cm.add_theme_constant_override("margin_right", 12)
	cm.add_theme_constant_override("margin_top", 8); cm.add_theme_constant_override("margin_bottom", 8)
	_cheat_box.add_child(cm); cm.add_child(cv)
	_cheat_input = LineEdit.new()
	_cheat_input.placeholder_text = "god-mode | more-money | give-weapon-2..4 | give-armor-1..4 | skip-to-stage-N | skip-to-wave-N"
	_cheat_input.text_submitted.connect(func(txt: String): GameState.run_cheat_command(txt); _cheat_input.clear())
	cv.add_child(_cheat_input)
	_cheat_fb = _lbl("", 13, Pal.TECH, f_reg)
	cv.add_child(_cheat_fb)

	# Game Over / Stage Complete
	_gameover_panel = ColorRect.new()
	_gameover_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_gameover_panel.color = Color(0.48, 0.03, 0.03, 0.86)
	_gameover_panel.visible = false
	add_child(_gameover_panel)
	var gc := CenterContainer.new(); gc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_gameover_panel.add_child(gc)
	var gv := VBoxContainer.new(); gv.add_theme_constant_override("separation", 10)
	gc.add_child(gv)
	_go_title = _lbl("GAME OVER", 44, Pal.WHITE, f_blk); _go_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_go_money = _lbl("Money: 0", 22, Pal.AMBER, f_blk); _go_money.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_go_best = _lbl("Best: 0", 18, Pal.WHITE, f_reg); _go_best.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_go_stats = _lbl("Kills 0 · Accuracy 0%", 16, Pal.STEEL, f_reg); _go_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_go_stage_stats = _lbl("", 15, Pal.TECH, f_blk); _go_stage_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; _go_stage_stats.visible = false
	for l in [_go_title, _go_money, _go_best, _go_stats, _go_stage_stats]:
		gv.add_child(l)
	var gbtns := HBoxContainer.new(); gbtns.alignment = BoxContainer.ALIGNMENT_CENTER; gbtns.add_theme_constant_override("separation", 14)
	gv.add_child(gbtns)
	_go_primary_btn = Button.new(); _go_primary_btn.text = "RESTART"; _go_primary_btn.custom_minimum_size = Vector2(180, 44)
	_go_primary_btn.add_theme_font_override("font", f_blk)
	_go_primary_btn.pressed.connect(func():
		if _go_primary_cb.is_valid():
			_gameover_panel.visible = false
			GameState.is_game_over = false
			_go_primary_cb.call()
		else:
			gameover_primary_requested.emit()
	)
	var gexit := Button.new(); gexit.text = "EXIT TO MAIN MENU"; gexit.custom_minimum_size = Vector2(180, 44)
	gexit.add_theme_font_override("font", f_blk); gexit.pressed.connect(func(): exit_requested.emit())
	gbtns.add_child(_go_primary_btn); gbtns.add_child(gexit)

	# Achievement toast
	_toast_panel = _panel(Color(0.05, 0.08, 0.11, 0.94), Pal.AMBER, 1, 2)
	_toast_panel.anchor_left = 1.0; _toast_panel.anchor_right = 1.0
	_toast_panel.offset_left = -330; _toast_panel.offset_right = -20
	_toast_panel.offset_top = 74; _toast_panel.offset_bottom = 148
	_toast_panel.visible = false
	add_child(_toast_panel)
	var tv := VBoxContainer.new()
	var tm := MarginContainer.new(); tm.add_theme_constant_override("margin_left", 12); tm.add_theme_constant_override("margin_right", 12)
	tm.add_theme_constant_override("margin_top", 6); tm.add_theme_constant_override("margin_bottom", 6)
	_toast_panel.add_child(tm); tm.add_child(tv)
	tv.add_child(_lbl("ACHIEVEMENT UNLOCKED", 11, Pal.AMBER, f_blk))
	_toast_name = _lbl("", 15, Pal.WHITE, f_blk)
	_toast_desc = _lbl("", 12, Pal.STEEL, f_reg)
	tv.add_child(_toast_name); tv.add_child(_toast_desc)


func _process(dt: float) -> void:
	if _pickup_t > 0.0:
		_pickup_t -= dt
		if _pickup_t <= 0.0:
			_pickup_lbl.visible = false
	if _stage_msg_t > 0.0:
		_stage_msg_t -= dt
		if _stage_msg_t <= 0.0:
			_stage_msg_lbl.visible = false
	if _dmg_alpha > 0.0:
		_dmg_alpha = maxf(0.0, _dmg_alpha - dt * 2.4)
		_dmg_flash.color.a = _dmg_alpha
	if _toast_t > 0.0:
		_toast_t -= dt
		if _toast_t <= 0.0:
			_next_toast()
	if _aim_reticle:
		var show_ret := not SceneRouter.is_touch_active() and not GameState.is_paused and not GameState.is_game_over and not GameState.cinematic_active
		_aim_reticle.visible = show_ret
		if show_ret:
			_aim_reticle.set_cursor(get_viewport().get_mouse_position())


func refresh_stats() -> void:
	var p := GameState.player
	_money_lbl.text = str(GameState.score)
	var hp := float(p.get("hp", 100.0))
	var mhp := maxf(1.0, float(p.get("max_hp", 100.0)))
	_hp_bar.value = (hp / mhp) * 100.0
	_hp_num.text = str(maxi(0, ceili(hp)))

	var alvl := int(p.get("armor_lvl", 0))
	var amax := float(p.get("armor_max", 0.0))
	_armor_row.visible = alvl > 0 and amax > 0.0
	if _armor_row.visible:
		var arm := float(p.get("armor", 0.0))
		_armor_bar.value = (arm / amax) * 100.0
		_armor_num.text = str(maxi(0, ceili(arm)))

	var cur_w := str(p.get("current_weapon", "pistol"))
	_ammo_name_lbl.text = GameState.weapon_display_name(cur_w)
	var ammo := int(p["ammo"].get(cur_w, 0))
	_ammo_cnt_lbl.text = "%d / %d" % [ammo, GameState.max_ammo_for(cur_w)]

	var equipped: Array = p.get("weapons", [])
	for i in 3:
		if i < equipped.size():
			var wk := str(equipped[i])
			_inv_labels[i].text = "[%d] %s" % [i + 1, wk.left(3).to_upper()]
			_inv_labels[i].modulate = Pal.AMBER if wk == cur_w else Pal.WHITE
		else:
			_inv_labels[i].text = "[%d] —" % [i + 1]
			_inv_labels[i].modulate = Color(0.5, 0.5, 0.5, 0.6)
	_inv_labels[3].text = "[4] MED %d" % int(p.get("medkits", 0))
	_radar_ctrl.visible = bool(p.get("has_radar", false))


func update_runtime(stamina_val: float, objective_text: String, player_pos: Vector3, landmarks: Array) -> void:
	_sta_bar.value = stamina_val
	_wave_lbl.text = objective_text
	if _radar_ctrl.visible:
		_radar_ctrl.set_data(player_pos, landmarks)


func set_aircraft_mode(on: bool, bombs: int = 0) -> void:
	_hp_lbl.text = "AIRFRAME INTEGRITY" if on else "HEALTH"
	_sta_row.visible = not on
	_ammo_name_lbl.get_parent().get_parent().visible = not on
	_bomb_box.visible = on
	if on:
		_bomb_lbl.text = "BOMBS: ×%d (SPACE / RMB)" % bombs
	if touch_controls:
		touch_controls.set_modes(on, GameState.cinematic_active)


func set_objective(text: String) -> void:
	_wave_lbl.text = text


func show_boss_hud(title: String, cur_hp: float, max_hp: float) -> void:
	_boss_box.visible = true
	_boss_name.text = title
	_boss_bar.value = (cur_hp / maxf(1.0, max_hp)) * 100.0


func hide_boss_hud() -> void:
	_boss_box.visible = false


func show_progress_bar(label: String, pct: float) -> void:
	_progress_box.visible = true
	_progress_lbl.text = "%s — %d%%" % [label, roundi(clampf(pct, 0.0, 1.0) * 100.0)]
	_progress_bar.value = clampf(pct, 0.0, 1.0) * 100.0


func hide_progress_bar() -> void:
	_progress_box.visible = false


func show_stage_msg(msg: String, sec: float = 3.5) -> void:
	_stage_msg_lbl.text = msg
	_stage_msg_lbl.visible = not msg.is_empty()
	_stage_msg_t = sec


func show_pickup(msg: String, col: Color = Pal.WHITE) -> void:
	_pickup_lbl.text = msg
	_pickup_lbl.modulate = col
	_pickup_lbl.visible = not msg.is_empty()
	_pickup_t = 3.2


func flash_damage() -> void:
	_dmg_alpha = 0.45


func set_cine_bars(on: bool) -> void:
	var h := 62.0 if on else 0.0
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(_cine_top, "offset_bottom", h, 0.45)
	tw.tween_property(_cine_bot, "offset_top", -h, 0.45)
	_skip_btn.visible = on
	if touch_controls:
		touch_controls.set_modes(_bomb_box.visible, on)


func set_cine_fade(alpha: float) -> void:
	_cine_fade.color.a = clampf(alpha, 0.0, 1.0)


func show_radio_dialogue(speaker: String, text: String) -> void:
	_radio_box.visible = true
	_radio_spk.text = speaker
	_radio_txt.text = text


func hide_radio_dialogue() -> void:
	_radio_box.visible = false


func show_caption(text: String) -> void:
	_caption_lbl.text = text
	_caption_lbl.visible = not text.is_empty()


func set_pause_visible(on: bool) -> void:
	_pause_panel.visible = on
	_pause_main.visible = true
	_pause_tut.visible = false
	if touch_controls:
		touch_controls.refresh_visibility()


func toggle_cheat_console() -> bool:
	_cheat_box.visible = not _cheat_box.visible
	if _cheat_box.visible:
		_cheat_input.grab_focus()
		GameState.is_paused = true
		Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	else:
		GameState.is_paused = false
		if not SceneRouter.is_touch_active():
			Input.set_mouse_mode(Input.MOUSE_MODE_CONFINED)
	return _cheat_box.visible


func _on_cheat_feedback(msg: String, ok: bool) -> void:
	_cheat_fb.text = msg
	_cheat_fb.modulate = Color.html("#7fe0a0") if ok else Color.html("#ff6b6b")


func show_game_over(won: bool, title: String = "", continue_label: String = "", on_continue: Callable = Callable()) -> void:
	_go_primary_cb = on_continue
	_gameover_panel.visible = true
	_gameover_panel.color = Color(0.0, 0.35, 0.12, 0.84) if won else Color(0.55, 0.03, 0.03, 0.84)
	_go_title.text = title if not title.is_empty() else ("MISSION COMPLETE" if won else "GAME OVER")
	_go_money.text = "Money: %d" % GameState.score
	_go_best.text = "Best: %d" % GameState.high_score
	var shots := int(GameState.stats.get("shots", 0))
	var hits := int(GameState.stats.get("hits", 0))
	var acc := roundi((float(hits) / float(shots)) * 100.0) if shots > 0 else 0
	_go_stats.text = "Kills %d · Accuracy %d%%" % [int(GameState.stats.get("kills", 0)), acc]
	if won and bool(GameState.stage_stats.get("active", false)):
		_go_stage_stats.visible = true
		_go_stage_stats.text = "TOTAL TIME %s  |  LOOT BOXES DESTROYED %d" % [
			GameState.format_time(float(GameState.stage_stats.get("elapsed_sec", 0.0))),
			int(GameState.stage_stats.get("loot_boxes_destroyed", 0)),
		]
	else:
		_go_stage_stats.visible = false
	_go_primary_btn.text = continue_label if not continue_label.is_empty() else ("RESTART STAGE" if GameState.mode == "campaign" else "RESTART")
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	if touch_controls:
		touch_controls.refresh_visibility()


func _on_achievement_unlocked(ach: Dictionary) -> void:
	_toast_queue.append(ach)
	if _toast_t <= 0.0:
		_next_toast()


func _next_toast() -> void:
	if _toast_queue.is_empty():
		_toast_panel.visible = false
		_toast_t = 0.0
		return
	var a: Dictionary = _toast_queue.pop_front()
	_toast_name.text = str(a.get("name", ""))
	_toast_desc.text = str(a.get("description", ""))
	_toast_panel.visible = true
	_toast_t = float(Config.section("achievements").get("toastSec", 4.0))


func _panel(bg: Color, border: Color, bw: int = 1, rad: int = 4) -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(bw)
	sb.set_corner_radius_all(rad)
	p.add_theme_stylebox_override("panel", sb)
	return p


func _lbl(txt: String, sz: int, col: Color, font: Font) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", col)
	return l


func _bar(fill_col: Color, h: int) -> ProgressBar:
	var pb := ProgressBar.new()
	pb.show_percentage = false
	pb.custom_minimum_size = Vector2(0, h)
	var bg := StyleBoxFlat.new(); bg.bg_color = Color(0.08, 0.1, 0.12, 0.9)
	var fg := StyleBoxFlat.new(); fg.bg_color = fill_col
	pb.add_theme_stylebox_override("background", bg)
	pb.add_theme_stylebox_override("fill", fg)
	return pb


class _RadarWidget extends Control:
	var _ppos := Vector3.ZERO
	var _marks: Array = []

	func set_data(ppos: Vector3, marks: Array) -> void:
		_ppos = ppos
		_marks = marks
		queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		var r := minf(c.x, c.y) - 3.0
		# Latar & cincin grid radar sesuai src/core/hud.js drawRadar
		draw_circle(c, r, Color(0.031, 0.067, 0.098, 0.86))
		var grid_col := Color(0.455, 0.725, 1.0, 0.16)
		draw_arc(c, r * 0.38, 0, TAU, 28, grid_col, 1.0)
		draw_arc(c, r * 0.72, 0, TAU, 32, grid_col, 1.0)
		draw_line(c + Vector2(-r, 0), c + Vector2(r, 0), grid_col, 1.0)
		draw_line(c + Vector2(0, -r), c + Vector2(0, r), grid_col, 1.0)

		# Proyeksi sejajar layar (SCREEN_UP = (0.7071, -0.7071))
		var fx := 0.7071
		var fz := -0.7071
		var radar_range := 420.0
		for m in _marks:
			var dx := float(m["x"]) - _ppos.x
			var dz := float(m["z"]) - _ppos.z
			var px := (dx * -fz + dz * fx) / radar_range * r
			var py := -(dx * fx + dz * fz) / radar_range * r
			var v := Vector2(px, py)
			if v.length() > r - 5.0:
				if bool(m.get("clamp", false)):
					v = v.normalized() * (r - 6.0)
				else:
					continue
			var mcol: Color = m.get("color", Pal.AMBER)
			var msz := float(m.get("size", 3.5))
			draw_circle(c + v, msz + 1.5, Color(mcol.r, mcol.g, mcol.b, 0.25))
			draw_circle(c + v, msz, mcol)

		# Panah chevron player di pusat & bezel luar
		draw_colored_polygon(PackedVector2Array([
			c + Vector2(0, -6.5),
			c + Vector2(4.4, 5.0),
			c + Vector2(0, 2.4),
			c + Vector2(-4.4, 5.0),
		]), Color("#cfe9ff"))
		draw_arc(c, r, 0, TAU, 40, Color(0.455, 0.725, 1.0, 0.48), 1.6)


class _AimReticle extends Control:
	var _mpos := Vector2.ZERO

	func set_cursor(p: Vector2) -> void:
		if not _mpos.is_equal_approx(p):
			_mpos = p
			queue_redraw()

	func _draw() -> void:
		var col := Color(1.0, 0.72, 0.25, 0.85)
		draw_arc(_mpos, 11.0, 0, TAU, 24, col, 1.4)
		draw_circle(_mpos, 2.2, Pal.WHITE)
		for dir in [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]:
			draw_line(_mpos + dir * 7.0, _mpos + dir * 15.0, col, 1.4)
