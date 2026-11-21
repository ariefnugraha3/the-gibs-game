class_name FieldRepairModal
extends CanvasLayer

## Minigame FIELD REPAIR / FIELD RESTART (Stage 2, 5, 6):
## Semua 5 papan (Wiring Match, Chip Install, Pressure Valve, Phase Sync Slider, Rotor RPM).
## Mendukung klik mouse maupun tap/drag sentuh di mobile secara seragam.

signal completed(success: bool, installed_count: int)

var _parts: Array[String] = []
var _board_idx := 0
var _installed := 0
var _phase := "idle"
var _result_t := 0.0

var _root: ColorRect
var _head_lbl: Label
var _sub_lbl: Label
var _workspace: Control
var _abort_btn: Button

# State per board
var _wire_selected := -1
var _wire_pairs: Array[int] = [] # solved indices
var _chip_selected := -1
var _chip_done: Array[bool] = []
var _valve_vals: Array[int] = []
var _valve_targets: Array[int] = []
var _sync_vals: Array[float] = []
var _sync_targets: Array[float] = []
var _sync_wave: _PhaseWaveWidget = null
var _rpm := 0.0
var _rpm_hold := 0.0


func _ready() -> void:
	layer = 25
	visible = false
	_build_ui()


func _build_ui() -> void:
	var f_blk := Pal.font_black()
	_root = ColorRect.new(); _root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.color = Color(0.05, 0.06, 0.08, 0.94); add_child(_root)
	var cc := CenterContainer.new(); cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); _root.add_child(cc)
	var v := VBoxContainer.new(); v.custom_minimum_size = Vector2(620, 420); v.add_theme_constant_override("separation", 12)
	cc.add_child(v)

	_head_lbl = Label.new(); _head_lbl.text = "FIELD REPAIR"
	_head_lbl.add_theme_font_override("font", f_blk); _head_lbl.add_theme_font_size_override("font_size", 26)
	_head_lbl.add_theme_color_override("font_color", Pal.AMBER); _head_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_head_lbl)

	_sub_lbl = Label.new(); _sub_lbl.text = ""
	_sub_lbl.add_theme_font_override("font", f_blk); _sub_lbl.add_theme_font_size_override("font_size", 15)
	_sub_lbl.add_theme_color_override("font_color", Pal.TECH); _sub_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_sub_lbl)

	_workspace = VBoxContainer.new(); _workspace.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_workspace.add_theme_constant_override("separation", 10)
	v.add_child(_workspace)

	_abort_btn = Button.new(); _abort_btn.text = "ABORT [ESC]"; _abort_btn.custom_minimum_size = Vector2(160, 40)
	_abort_btn.add_theme_font_override("font", f_blk)
	_abort_btn.pressed.connect(func():
		if _phase == "play":
			_finish(false)
	)
	v.add_child(_abort_btn)


func open_minigame(head: String, advanced_only: bool = false, start_index: int = 0) -> void:
	_parts.assign(["phase", "rotor"] if advanced_only else ["wire", "chip", "valve"])
	_board_idx = clampi(start_index, 0, _parts.size() - 1)
	_installed = _board_idx
	_head_lbl.text = head
	_phase = "play"
	_abort_btn.disabled = false
	GameState.is_paused = true
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	visible = true
	_load_board()


func _clear_ws() -> void:
	_sync_wave = null
	for ch in _workspace.get_children():
		ch.queue_free()


func _load_board() -> void:
	_clear_ws()
	var kind := _parts[_board_idx]
	match kind:
		"wire": _setup_wire()
		"chip": _setup_chip()
		"valve": _setup_valve()
		"phase": _setup_phase()
		"rotor": _setup_rotor()


func _setup_wire() -> void:
	_sub_lbl.text = "POWER HARNESS — MATCH ALL WIRE SYMBOLS (%d/%d)" % [_board_idx + 1, _parts.size()]
	var symbols := ["[A] +24V", "[B] GND", "[C] BUS", "[D] CLK"]
	_wire_selected = -1
	_wire_pairs = []
	var order := [0, 1, 2, 3]; order.shuffle()

	var hbox := HBoxContainer.new(); hbox.size_flags_vertical = Control.SIZE_EXPAND_FILL; hbox.add_theme_constant_override("separation", 80)
	_workspace.add_child(hbox)
	var left_col := VBoxContainer.new(); left_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; left_col.add_theme_constant_override("separation", 10)
	var right_col := VBoxContainer.new(); right_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; right_col.add_theme_constant_override("separation", 10)
	hbox.add_child(left_col); hbox.add_child(right_col)

	var left_btns: Array[Button] = []
	var right_btns: Array[Button] = []
	for i in 4:
		var lb := Button.new(); lb.text = symbols[i]; lb.custom_minimum_size = Vector2(0, 48)
		lb.add_theme_font_override("font", Pal.font_black())
		var li := i
		lb.pressed.connect(func():
			if _phase != "play" or li in _wire_pairs: return
			_wire_selected = li
			AudioManager.play_sfx("switch", 0.4)
		)
		left_col.add_child(lb); left_btns.append(lb)

		var target_i: int = order[i]
		var rb := Button.new(); rb.text = symbols[target_i]; rb.custom_minimum_size = Vector2(0, 48)
		rb.add_theme_font_override("font", Pal.font_black())
		rb.pressed.connect(func():
			if _phase != "play" or _wire_selected < 0: return
			if target_i == _wire_selected and not (target_i in _wire_pairs):
				_wire_pairs.append(target_i)
				left_btns[target_i].disabled = true
				rb.disabled = true
				_wire_selected = -1
				AudioManager.play_sfx("purchase", 0.6)
				if _wire_pairs.size() >= 4:
					_board_solved()
			else:
				_wire_selected = -1
				AudioManager.play_sfx("empty", 0.6)
		)
		right_col.add_child(rb); right_btns.append(rb)


func _setup_chip() -> void:
	_sub_lbl.text = "CONTROL BOARD — INSTALL ALL LOGIC CHIPS (%d/%d)" % [_board_idx + 1, _parts.size()]
	var chips := ["REG-01", "SYNC-02", "GATE-03", "BUS-04"]
	_chip_selected = -1
	_chip_done = [false, false, false, false]
	var tray := HBoxContainer.new(); tray.add_theme_constant_override("separation", 10)
	var sockets := HBoxContainer.new(); sockets.add_theme_constant_override("separation", 10)
	_workspace.add_child(tray); _workspace.add_child(sockets)

	var tray_btns: Array[Button] = []
	var order := [0, 1, 2, 3]; order.shuffle()
	for i in 4:
		var idx: int = order[i]
		var tb := Button.new(); tb.text = chips[idx]; tb.custom_minimum_size = Vector2(130, 56); tb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tb.add_theme_font_override("font", Pal.font_black())
		tb.pressed.connect(func():
			if _phase != "play" or _chip_done[idx]: return
			_chip_selected = idx
			AudioManager.play_sfx("switch", 0.4)
		)
		tray.add_child(tb); tray_btns.append(tb)

	for i in 4:
		var si := i
		var sb := Button.new(); sb.text = "SOCKET\n%s" % chips[si]; sb.custom_minimum_size = Vector2(130, 86); sb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sb.add_theme_font_override("font", Pal.font_black())
		sb.pressed.connect(func():
			if _phase != "play" or _chip_selected != si: return
			_chip_done[si] = true
			sb.text = "%s\n[INSTALLED]" % chips[si]
			sb.disabled = true
			for k in 4:
				if order[k] == si:
					tray_btns[k].modulate = Color(1, 1, 1, 0.25)
					tray_btns[k].disabled = true
			_chip_selected = -1
			AudioManager.play_sfx("purchase", 0.6)
			if _chip_done.all(func(x): return x):
				_board_solved()
		)
		sockets.add_child(sb)


func _setup_valve() -> void:
	_sub_lbl.text = "COOLANT PUMP — ALIGN ALL PRESSURE VALVES (%d/%d)" % [_board_idx + 1, _parts.size()]
	_valve_vals = [1, 2, 0]
	_valve_targets = [4, 3, 5]
	var hbox := HBoxContainer.new(); hbox.add_theme_constant_override("separation", 18); hbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_workspace.add_child(hbox)
	for i in 3:
		var vi := i
		var col := VBoxContainer.new(); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; col.add_theme_constant_override("separation", 8)
		hbox.add_child(col)
		var lbl := Label.new(); lbl.text = "VALVE %d: %d / %d" % [vi + 1, _valve_vals[vi], _valve_targets[vi]]
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.add_theme_font_override("font", Pal.font_black()); col.add_child(lbl)
		var plus := Button.new(); plus.text = "+ TURN CW"; plus.custom_minimum_size = Vector2(0, 48)
		plus.pressed.connect(func():
			if _phase != "play": return
			_valve_vals[vi] = (_valve_vals[vi] + 1) % 6
			lbl.text = "VALVE %d: %d / %d" % [vi + 1, _valve_vals[vi], _valve_targets[vi]]
			AudioManager.play_sfx("switch", 0.4)
			if _valve_vals == _valve_targets:
				_board_solved()
		)
		col.add_child(plus)


func _setup_phase() -> void:
	_sub_lbl.text = "PHASE SYNC — MATCH ALL BUS PHASES (%d/%d)" % [_board_idx + 1, _parts.size()]
	_sync_vals = [0.2, 0.85, 0.35]
	_sync_targets = [0.72, 0.30, 0.65]
	_sync_wave = _PhaseWaveWidget.new(); _sync_wave.custom_minimum_size = Vector2(0, 120)
	_workspace.add_child(_sync_wave)

	for i in 3:
		var si := i
		var sl := HSlider.new(); sl.min_value = 0.0; sl.max_value = 1.0; sl.step = 0.01; sl.value = _sync_vals[si]
		sl.custom_minimum_size = Vector2(0, 34)
		sl.value_changed.connect(func(v: float):
			if _phase != "play": return
			_sync_vals[si] = v
			_sync_wave.set_data(_sync_vals, _sync_targets)
			var ok := true
			for k in 3:
				if absf(_sync_vals[k] - _sync_targets[k]) > 0.055:
					ok = false
					break
			if ok:
				_board_solved()
		)
		_workspace.add_child(sl)
	_sync_wave.set_data(_sync_vals, _sync_targets)


func _setup_rotor() -> void:
	_sub_lbl.text = "ROTOR SPIN-UP — PUMP CRANK TO HOLD GREEN ZONE (%d/%d)" % [_board_idx + 1, _parts.size()]
	_rpm = 0.15
	_rpm_hold = 0.0
	var bar := ProgressBar.new(); bar.name = "RpmBar"; bar.show_percentage = false; bar.custom_minimum_size = Vector2(0, 32)
	_workspace.add_child(bar)
	var status := Label.new(); status.name = "RpmLbl"; status.text = "TARGET BAND: 62% - 82%"
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status.add_theme_font_override("font", Pal.font_black())
	_workspace.add_child(status)
	var crank := Button.new(); crank.text = "CRANK TURBINE (TAP / CLICK)"; crank.custom_minimum_size = Vector2(0, 64)
	crank.add_theme_font_override("font", Pal.font_black())
	crank.pressed.connect(func():
		if _phase != "play": return
		_rpm = minf(1.0, _rpm + 0.14)
		AudioManager.play_sfx("switch", 0.4, 0.8 + _rpm * 0.5)
	)
	_workspace.add_child(crank)


func _process(dt: float) -> void:
	if not visible:
		return
	if _phase == "play" and _parts[_board_idx] == "rotor":
		_rpm = maxf(0.0, _rpm - dt * 0.16)
		var bar := _workspace.get_node_or_null("RpmBar") as ProgressBar
		if bar:
			bar.value = _rpm * 100.0
		if _rpm >= 0.62 and _rpm <= 0.82:
			_rpm_hold += dt
			var lbl := _workspace.get_node_or_null("RpmLbl") as Label
			if lbl:
				lbl.text = "STABILIZING: %.1fs / 1.5s" % _rpm_hold
			if _rpm_hold >= 1.5:
				_board_solved()
		else:
			_rpm_hold = maxf(0.0, _rpm_hold - dt * 0.5)
	elif _phase == "board_won":
		_result_t -= dt
		if _result_t <= 0.0:
			_board_idx += 1
			if _board_idx >= _parts.size():
				_finish(true)
			else:
				_phase = "play"
				_abort_btn.disabled = false
				_load_board()


func _board_solved() -> void:
	_installed += 1
	_phase = "board_won"
	_result_t = 0.65
	_abort_btn.disabled = true
	_sub_lbl.text = "COMPONENT ONLINE!"
	AudioManager.play_sfx("purchase", 0.8)


func _unhandled_input(event: InputEvent) -> void:
	if visible and _phase == "play" and event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		_finish(false)


func _finish(ok: bool) -> void:
	_phase = "idle"
	visible = false
	GameState.is_paused = false
	completed.emit(ok, _installed)


class _PhaseWaveWidget extends Control:
	var _vals: Array[float] = []
	var _targets: Array[float] = []

	func set_data(vals: Array[float], tgts: Array[float]) -> void:
		_vals = vals.duplicate(); _targets = tgts.duplicate()
		queue_redraw()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Pal.INK)
		draw_rect(Rect2(Vector2.ZERO, size), Pal.STEEL, false, 1.5)
		var pts_tgt := PackedVector2Array()
		var pts_cur := PackedVector2Array()
		for i in 65:
			var k := float(i) / 64.0
			var x := k * size.x
			var yt := 0.0
			var yc := 0.0
			for p in _vals.size():
				yt += sin(k * TAU * 3.0 + _targets[p] * TAU)
				yc += sin(k * TAU * 3.0 + _vals[p] * TAU)
			pts_tgt.append(Vector2(x, size.y * 0.5 + yt * size.y * 0.12))
			pts_cur.append(Vector2(x, size.y * 0.5 + yc * size.y * 0.12))
		draw_polyline(pts_tgt, Color(Pal.TECH, 0.5), 2.0)
		draw_polyline(pts_cur, Pal.AMBER, 3.0)
