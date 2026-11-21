class_name SignalTraceModal
extends CanvasLayer

## Minigame SIGNAL TRACE (Stage 5 & 6): tangkap pembawa sinyal bergerak di dalam
## jendela target sirkular (termasuk wrap tepi 0..1); salah tekan mengurangi waktu
## dan membalik arah gerak sinyal.

signal completed(success: bool)

var _channels: Array[Dictionary] = []
var _active := 0
var _left := 40.0
var _max_t := 40.0
var _tol := 0.075
var _phase := "idle"
var _result_t := 0.0

var _root: ColorRect
var _head_lbl: Label
var _status_lbl: Label
var _tracks_box: VBoxContainer
var _tracks: Array[_CarrierTrack] = []
var _timer_bar: ProgressBar
var _lock_btn: Button
var _abort_btn: Button


func _ready() -> void:
	layer = 25
	visible = false
	_build_ui()


func _build_ui() -> void:
	var f_blk := Pal.font_black()
	_root = ColorRect.new(); _root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.color = Color(0.05, 0.06, 0.08, 0.94); add_child(_root)
	var cc := CenterContainer.new(); cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); _root.add_child(cc)
	var v := VBoxContainer.new(); v.custom_minimum_size = Vector2(560, 340); v.add_theme_constant_override("separation", 12)
	cc.add_child(v)

	_head_lbl = Label.new(); _head_lbl.text = "SIGNAL TRACE"
	_head_lbl.add_theme_font_override("font", f_blk); _head_lbl.add_theme_font_size_override("font_size", 26)
	_head_lbl.add_theme_color_override("font_color", Pal.AMBER); _head_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_head_lbl)

	_status_lbl = Label.new(); _status_lbl.text = "LOCK ACTIVE CARRIER INSIDE CAPTURE WINDOW"
	_status_lbl.add_theme_font_override("font", f_blk); _status_lbl.add_theme_font_size_override("font_size", 14)
	_status_lbl.add_theme_color_override("font_color", Pal.TECH); _status_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_status_lbl)

	_tracks_box = VBoxContainer.new(); _tracks_box.add_theme_constant_override("separation", 10)
	v.add_child(_tracks_box)

	_timer_bar = ProgressBar.new(); _timer_bar.show_percentage = false; _timer_bar.custom_minimum_size = Vector2(0, 12)
	var bg := StyleBoxFlat.new(); bg.bg_color = Pal.INK
	var fg := StyleBoxFlat.new(); fg.bg_color = Pal.TECH
	_timer_bar.add_theme_stylebox_override("background", bg); _timer_bar.add_theme_stylebox_override("fill", fg)
	v.add_child(_timer_bar)

	var foot := HBoxContainer.new(); foot.add_theme_constant_override("separation", 12)
	v.add_child(foot)
	_lock_btn = Button.new(); _lock_btn.text = "LOCK SIGNAL [SPACE]"; _lock_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_lock_btn.custom_minimum_size = Vector2(0, 44); _lock_btn.add_theme_font_override("font", f_blk)
	_lock_btn.pressed.connect(_try_lock)
	_abort_btn = Button.new(); _abort_btn.text = "ABORT [ESC]"; _abort_btn.custom_minimum_size = Vector2(150, 44)
	_abort_btn.add_theme_font_override("font", f_blk)
	_abort_btn.pressed.connect(func():
		if _phase == "play":
			_finish(false)
	)
	foot.add_child(_lock_btn); foot.add_child(_abort_btn)


func open_minigame(head: String = "SIGNAL TRACE") -> void:
	var s: Dictionary = Config.campaign().get("signalTrace", {})
	var n := maxi(2, int(s.get("channels", 4)))
	_max_t = float(s.get("traceSec", 40.0))
	_left = _max_t
	_tol = float(s.get("lockTolerance", 0.075))
	var smin := float(s.get("speedMin", 0.18))
	var smax := float(s.get("speedMax", 0.31))

	_head_lbl.text = head
	_status_lbl.text = "ACQUIRING CARRIERS..."
	_status_lbl.add_theme_color_override("font_color", Pal.TECH)
	_phase = "play"
	_active = 0
	_lock_btn.disabled = false
	_abort_btn.disabled = false

	var order := range(n); order.shuffle()
	_channels.clear()
	for i in n:
		_channels.append({
			"phase": randf(),
			"target": fposmod(0.12 + float(order[i]) / float(n) * 0.76, 1.0),
			"speed": lerpf(smin, smax, float(i) / maxf(1.0, float(n - 1))),
			"dir": -1.0 if (i & 1) != 0 else 1.0,
			"locked": false,
		})

	for ch in _tracks_box.get_children():
		ch.queue_free()
	_tracks.clear()
	for i in n:
		var tr := _CarrierTrack.new()
		tr.custom_minimum_size = Vector2(540, 44)
		var idx := i
		tr.tapped.connect(func():
			if idx == _active:
				_try_lock()
		)
		_tracks_box.add_child(tr)
		_tracks.append(tr)

	GameState.is_paused = true
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	visible = true


func _try_lock() -> void:
	if _phase != "play" or _active >= _channels.size():
		return
	var c := _channels[_active]
	var dist := absf(float(c["phase"]) - float(c["target"]))
	var circ := minf(dist, 1.0 - dist)
	if circ > _tol:
		var pen := float(Config.campaign().get("signalTrace", {}).get("missPenaltySec", 3.0))
		_left = maxf(0.0, _left - pen)
		c["dir"] = -float(c["dir"])
		AudioManager.play_sfx("empty", 0.75)
		if _left <= 0.0:
			_trigger_lost()
		return

	c["phase"] = c["target"]
	c["locked"] = true
	_active += 1
	AudioManager.play_sfx("switch", 0.7, 1.25)
	if _active >= _channels.size():
		_phase = "won"
		_result_t = 0.85
		_lock_btn.disabled = true
		_abort_btn.disabled = true
		_status_lbl.text = "SIGNAL LOCKED"
		_status_lbl.add_theme_color_override("font_color", Pal.AMBER)
		AudioManager.play_sfx("purchase", 0.85)


func _trigger_lost() -> void:
	_phase = "lost"
	_result_t = 1.1
	_lock_btn.disabled = true
	_abort_btn.disabled = true
	_status_lbl.text = "SIGNAL LOST — TRACE ALARM"
	_status_lbl.add_theme_color_override("font_color", Pal.HAZARD)
	AudioManager.play_sfx("robot_spawn", 0.85)


func _process(dt: float) -> void:
	if not visible:
		return
	if _phase == "play":
		_left = maxf(0.0, _left - dt)
		_timer_bar.value = (_left / maxf(0.1, _max_t)) * 100.0
		for i in range(_active, _channels.size()):
			var c := _channels[i]
			c["phase"] = fposmod(float(c["phase"]) + float(c["speed"]) * float(c["dir"]) * dt, 1.0)
		for i in _channels.size():
			_tracks[i].update_state(_channels[i], _tol, i == _active)
		if _left <= 0.0:
			_trigger_lost()
	elif _phase == "won" or _phase == "lost":
		_result_t -= dt
		if _result_t <= 0.0:
			_finish(_phase == "won")


func _unhandled_input(event: InputEvent) -> void:
	if not visible or _phase != "play":
		return
	if event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		_finish(false)
	elif event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo:
		var k := (event as InputEventKey).keycode
		if k == KEY_SPACE or k == KEY_ENTER:
			get_viewport().set_input_as_handled()
			_try_lock()


func _finish(ok: bool) -> void:
	_phase = "idle"
	visible = false
	GameState.is_paused = false
	completed.emit(ok)


class _CarrierTrack extends Control:
	signal tapped
	var _c: Dictionary = {}
	var _tol := 0.075
	var _is_active := false

	func update_state(c: Dictionary, tol: float, act: bool) -> void:
		_c = c; _tol = tol; _is_active = act
		queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		if (event is InputEventMouseButton and (event as InputEventMouseButton).pressed) or (event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed):
			tapped.emit()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Pal.INK)
		var locked := bool(_c.get("locked", false))
		draw_rect(Rect2(Vector2.ZERO, size), Pal.TECH if locked else (Pal.AMBER if _is_active else Pal.STEEL), false, 2.0)
		var tgt := float(_c.get("target", 0.5))
		var left := tgt - _tol
		var right := tgt + _tol
		var win_col := Color(Pal.TECH if locked else Pal.AMBER, 0.35)
		if left < 0.0:
			draw_rect(Rect2(0, 4, right * size.x, size.y - 8), win_col)
			draw_rect(Rect2((1.0 + left) * size.x, 4, (-left) * size.x, size.y - 8), win_col)
		elif right > 1.0:
			draw_rect(Rect2(left * size.x, 4, (1.0 - left) * size.x, size.y - 8), win_col)
			draw_rect(Rect2(0, 4, (right - 1.0) * size.x, size.y - 8), win_col)
		else:
			draw_rect(Rect2(left * size.x, 4, (right - left) * size.x, size.y - 8), win_col)
		var cx := float(_c.get("phase", 0.0)) * size.x
		draw_line(Vector2(cx, 2), Vector2(cx, size.y - 2), Pal.TECH if locked else Pal.WHITE, 4.0)
