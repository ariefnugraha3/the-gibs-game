class_name IceBreachModal
extends CanvasLayer

## Minigame ICE BREACH (Stage 1, 3, 11): Papan sirkuit 5x5 selalu-solvable
## (jalur DFS acak + BFS daya live + trace meter + rotasi CW/CCW sentuh & mouse).

signal completed(success: bool)

const DC := [0, 1, 0, -1]
const DR := [-1, 0, 1, 0]

var _grid_size := 5
var _tiles: Array[Dictionary] = []
var _power_on: Array[bool] = []
var _phase := "idle" # idle | play | won | lost
var _trace_left := 60.0
var _trace_max := 60.0
var _result_t := 0.0

var _root: ColorRect
var _head_lbl: Label
var _status_lbl: Label
var _trace_bar: ProgressBar
var _board_grid: GridContainer
var _tile_btns: Array[_PipeCell] = []
var _abort_btn: Button


func _ready() -> void:
	layer = 25
	visible = false
	_build_ui()


func _build_ui() -> void:
	var f_blk := Pal.font_black()
	_root = ColorRect.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.color = Color(0.05, 0.06, 0.08, 0.94)
	add_child(_root)

	var cc := CenterContainer.new(); cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(cc)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 12)
	cc.add_child(v)

	_head_lbl = Label.new(); _head_lbl.text = "ICE BREACH"
	_head_lbl.add_theme_font_override("font", f_blk); _head_lbl.add_theme_font_size_override("font_size", 26)
	_head_lbl.add_theme_color_override("font_color", Pal.AMBER)
	_head_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_head_lbl)

	var obj := Label.new(); obj.text = "ROUTE POWER FROM INGRESS (LEFT) TO DATA CORE (RIGHT)"
	obj.add_theme_font_override("font", Pal.font_regular()); obj.add_theme_font_size_override("font_size", 14)
	obj.add_theme_color_override("font_color", Pal.WHITE); obj.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(obj)

	_status_lbl = Label.new(); _status_lbl.text = "TRACE ACTIVE"
	_status_lbl.add_theme_font_override("font", f_blk); _status_lbl.add_theme_font_size_override("font_size", 16)
	_status_lbl.add_theme_color_override("font_color", Pal.TECH); _status_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_status_lbl)

	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10)
	v.add_child(row)
	var ing := Label.new(); ing.text = "IN >"; ing.add_theme_font_override("font", f_blk); ing.add_theme_color_override("font_color", Pal.AMBER)
	row.add_child(ing)

	_board_grid = GridContainer.new(); _board_grid.columns = 5
	_board_grid.add_theme_constant_override("h_separation", 6); _board_grid.add_theme_constant_override("v_separation", 6)
	row.add_child(_board_grid)

	var core_l := Label.new(); core_l.text = "> CORE"; core_l.add_theme_font_override("font", f_blk); core_l.add_theme_color_override("font_color", Pal.TECH)
	row.add_child(core_l)

	_trace_bar = ProgressBar.new(); _trace_bar.show_percentage = false; _trace_bar.custom_minimum_size = Vector2(360, 12)
	var bg := StyleBoxFlat.new(); bg.bg_color = Pal.INK
	var fg := StyleBoxFlat.new(); fg.bg_color = Pal.TECH
	_trace_bar.add_theme_stylebox_override("background", bg); _trace_bar.add_theme_stylebox_override("fill", fg)
	v.add_child(_trace_bar)

	_abort_btn = Button.new(); _abort_btn.text = "ABORT [ESC]"; _abort_btn.custom_minimum_size = Vector2(160, 40)
	_abort_btn.add_theme_font_override("font", f_blk)
	_abort_btn.pressed.connect(func():
		if _phase == "play":
			_finish(false)
	)
	v.add_child(_abort_btn)


func open_minigame(head: String = "ICE BREACH") -> void:
	var hc: Dictionary = Config.campaign().get("hack", {})
	_grid_size = int(hc.get("gridSize", 5))
	_trace_max = float(hc.get("traceSec", 60.0))
	_trace_left = _trace_max
	_head_lbl.text = head
	_phase = "play"
	_status_lbl.text = "SIGNAL ROUTING..."
	_status_lbl.add_theme_color_override("font_color", Pal.TECH)
	_abort_btn.disabled = false

	_build_puzzle()
	_rebuild_board_ui()
	_recompute_power()
	GameState.is_paused = true
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	visible = true


func _rot_m(m: int, r: int) -> int:
	var rr := posmod(r, 4)
	return ((m << rr) | (m >> (4 - rr))) & 15


func _build_puzzle() -> void:
	var n := _grid_size
	var mid := (n - 1) >> 1
	var path := _random_path(n, 0, mid, n - 1, mid)
	var sol: Array[int] = []
	sol.resize(n * n)
	sol.fill(0)
	for k in path.size():
		var c: int = path[k].x
		var r: int = path[k].y
		var m := 0
		if k == 0:
			m |= 1 << 3
		else:
			var p: Vector2i = path[k - 1]
			m |= 1 << (1 if p.x > c else (3 if p.x < c else (2 if p.y > r else 0)))
		if k == path.size() - 1:
			m |= 1 << 1
		else:
			var nx: Vector2i = path[k + 1]
			m |= 1 << (1 if nx.x > c else (3 if nx.x < c else (2 if nx.y > r else 0)))
		sol[r * n + c] = m

	var decoys: Array[int] = [3, 5, 7, 1]
	_tiles.clear()
	for i in n * n:
		var base_m: int = sol[i] if sol[i] > 0 else decoys[randi() % decoys.size()]
		var rot := randi() % 4
		_tiles.append({"mask": base_m, "rot": rot})
	# Pastikan tidak langsung solved di frame pertama
	if _recompute_power_only():
		_tiles[mid * n]["rot"] = (_tiles[mid * n]["rot"] + 1) % 4


func _random_path(n: int, sc: int, sr: int, tc: int, tr: int) -> Array[Vector2i]:
	var seen: Array[bool] = []
	seen.resize(n * n); seen.fill(false)
	var path: Array[Vector2i] = []
	_dfs_walk(n, sc, sr, tc, tr, seen, path)
	return path


func _dfs_walk(n: int, c: int, r: int, tc: int, tr: int, seen: Array[bool], path: Array[Vector2i]) -> bool:
	seen[r * n + c] = true
	path.append(Vector2i(c, r))
	if c == tc and r == tr:
		return true
	var dirs := [0, 1, 2, 3]
	dirs.shuffle()
	for d in dirs:
		var nc: int = c + DC[d]
		var nr: int = r + DR[d]
		if nc >= 0 and nr >= 0 and nc < n and nr < n and not seen[nr * n + nc]:
			if _dfs_walk(n, nc, nr, tc, tr, seen, path):
				return true
	path.pop_back()
	return false


func _rebuild_board_ui() -> void:
	for ch in _board_grid.get_children():
		ch.queue_free()
	_tile_btns.clear()
	_board_grid.columns = _grid_size
	for i in _tiles.size():
		var cell := _PipeCell.new()
		cell.custom_minimum_size = Vector2(68, 68)
		var idx := i
		cell.rotated.connect(func(delta: int): _rotate_tile(idx, delta))
		_board_grid.add_child(cell)
		_tile_btns.append(cell)


func _rotate_tile(idx: int, delta: int) -> void:
	if _phase != "play":
		return
	_tiles[idx]["rot"] = posmod(int(_tiles[idx]["rot"]) + delta, 4)
	AudioManager.play_sfx("switch", 0.35, 1.2)
	_recompute_power()


func _recompute_power_only() -> bool:
	var n := _grid_size
	var mid := (n - 1) >> 1
	_power_on.resize(n * n)
	_power_on.fill(false)
	var start_idx := mid * n
	var start_m := _rot_m(int(_tiles[start_idx]["mask"]), int(_tiles[start_idx]["rot"]))
	if (start_m & (1 << 3)) == 0:
		return false
	var q: Array[int] = [start_idx]
	_power_on[start_idx] = true
	while not q.is_empty():
		var cur: int = q.pop_front()
		var c := cur % n
		var r := cur / n
		var m := _rot_m(int(_tiles[cur]["mask"]), int(_tiles[cur]["rot"]))
		for d in 4:
			if (m & (1 << d)) == 0:
				continue
			var nc: int = c + DC[d]
			var nr: int = r + DR[d]
			if nc < 0 or nr < 0 or nc >= n or nr >= n:
				continue
			var ni := nr * n + nc
			if _power_on[ni]:
				continue
			var nm := _rot_m(int(_tiles[ni]["mask"]), int(_tiles[ni]["rot"]))
			if (nm & (1 << ((d + 2) & 3))) != 0:
				_power_on[ni] = true
				q.append(ni)
	var end_idx := mid * n + (n - 1)
	if not _power_on[end_idx]:
		return false
	var end_m := _rot_m(int(_tiles[end_idx]["mask"]), int(_tiles[end_idx]["rot"]))
	return (end_m & (1 << 1)) != 0


func _recompute_power() -> void:
	var won := _recompute_power_only()
	for i in _tiles.size():
		var m := _rot_m(int(_tiles[i]["mask"]), int(_tiles[i]["rot"]))
		_tile_btns[i].set_pipe(m, _power_on[i])
	if won:
		_phase = "won"
		_result_t = 0.85
		_abort_btn.disabled = true
		_status_lbl.text = "ACCESS GRANTED"
		_status_lbl.add_theme_color_override("font_color", Pal.AMBER)
		AudioManager.play_sfx("purchase", 0.85)


func _process(dt: float) -> void:
	if not visible:
		return
	if _phase == "play":
		_trace_left = maxf(0.0, _trace_left - dt)
		_trace_bar.value = (_trace_left / maxf(0.1, _trace_max)) * 100.0
		if _trace_left <= 0.0:
			_phase = "lost"
			_result_t = 1.1
			_abort_btn.disabled = true
			_status_lbl.text = "ICE TRACE ALARM TRIGGERED"
			_status_lbl.add_theme_color_override("font_color", Pal.HAZARD)
			AudioManager.play_sfx("robot_spawn", 0.85)
	elif _phase == "won" or _phase == "lost":
		_result_t -= dt
		if _result_t <= 0.0:
			_finish(_phase == "won")


func _unhandled_input(event: InputEvent) -> void:
	if visible and _phase == "play" and event.is_action_pressed("pause"):
		get_viewport().set_input_as_handled()
		_finish(false)


func _finish(ok: bool) -> void:
	_phase = "idle"
	visible = false
	GameState.is_paused = false
	completed.emit(ok)


class _PipeCell extends Control:
	signal rotated(delta: int)
	var _mask := 0
	var _lit := false

	func set_pipe(m: int, lit: bool) -> void:
		_mask = m
		_lit = lit
		queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			var mb := event as InputEventMouseButton
			if mb.button_index == MOUSE_BUTTON_LEFT:
				rotated.emit(1)
			elif mb.button_index == MOUSE_BUTTON_RIGHT:
				rotated.emit(-1)
		elif event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed:
			rotated.emit(1)

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Pal.INK)
		draw_rect(Rect2(Vector2.ZERO, size), Pal.AMBER if _lit else Pal.STEEL, false, 2.0)
		var c := size * 0.5
		var col := Pal.AMBER if _lit else Pal.STEEL
		var w := 12.0
		draw_circle(c, w * 0.5, col)
		if (_mask & 1) != 0: draw_line(c, Vector2(c.x, 0), col, w)
		if (_mask & 2) != 0: draw_line(c, Vector2(size.x, c.y), col, w)
		if (_mask & 4) != 0: draw_line(c, Vector2(c.x, size.y), col, w)
		if (_mask & 8) != 0: draw_line(c, Vector2(0, c.y), col, w)
