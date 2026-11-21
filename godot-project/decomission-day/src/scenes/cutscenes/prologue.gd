extends Control

## Prolog Campaign 9 Era (2028-2045): Teks ketik di setengah kiri,
## Tableau ASCII ber-font Courier Prime di setengah kanan atas latar hitam pekat.

var _chapters: Array = []
var _idx := 0
var _phase := "year" # year | title | body
var _t := 0.0
var _typed_chars := 0

var _year_lbl: Label
var _title_lbl: Label
var _body_lbl: RichTextLabel
var _art_ctrl: _AsciiTableau
var _skip_btn: Button


func _ready() -> void:
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	_chapters = Config.dialogue_list("campaign.prologue.chapters")
	_build_ui()
	if _chapters.is_empty():
		SceneRouter.enter_intro_from_prologue()
		return
	_start_chapter(0)


func _build_ui() -> void:
	var bg := ColorRect.new(); bg.set_anchors_and_offsets_preset(PRESET_FULL_RECT); bg.color = Color.BLACK
	add_child(bg)

	var hbox := HBoxContainer.new(); hbox.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	hbox.add_theme_constant_override("separation", 36)
	var m := MarginContainer.new(); m.set_anchors_and_offsets_preset(PRESET_FULL_RECT)
	for s in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		m.add_theme_constant_override(s, 56)
	add_child(m); m.add_child(hbox)

	var left := VBoxContainer.new(); left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 14); hbox.add_child(left)

	_year_lbl = Label.new()
	_year_lbl.add_theme_font_override("font", Pal.font_black()); _year_lbl.add_theme_font_size_override("font_size", 52)
	_year_lbl.add_theme_color_override("font_color", Pal.AMBER)
	left.add_child(_year_lbl)

	_title_lbl = Label.new()
	_title_lbl.add_theme_font_override("font", Pal.font_black()); _title_lbl.add_theme_font_size_override("font_size", 28)
	_title_lbl.add_theme_color_override("font_color", Pal.WHITE); _title_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(_title_lbl)

	_body_lbl = RichTextLabel.new()
	_body_lbl.bbcode_enabled = true
	_body_lbl.fit_content = false
	_body_lbl.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body_lbl.add_theme_font_override("normal_font", Pal.font_regular())
	_body_lbl.add_theme_font_override("bold_font", Pal.font_black())
	_body_lbl.add_theme_font_size_override("normal_font_size", 20)
	_body_lbl.add_theme_font_size_override("bold_font_size", 20)
	_body_lbl.add_theme_color_override("default_color", Pal.WHITE)
	left.add_child(_body_lbl)

	_art_ctrl = _AsciiTableau.new(); _art_ctrl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hbox.add_child(_art_ctrl)

	_skip_btn = Button.new(); _skip_btn.text = "SKIP PROLOGUE [SPACE]"
	_skip_btn.anchor_left = 1.0; _skip_btn.anchor_right = 1.0; _skip_btn.anchor_top = 1.0; _skip_btn.anchor_bottom = 1.0
	_skip_btn.offset_left = -220; _skip_btn.offset_right = -32; _skip_btn.offset_top = -64; _skip_btn.offset_bottom = -24
	_skip_btn.add_theme_font_override("font", Pal.font_black())
	_skip_btn.pressed.connect(func(): SceneRouter.enter_intro_from_prologue())
	add_child(_skip_btn)


func _start_chapter(idx: int) -> void:
	if idx >= _chapters.size():
		SceneRouter.enter_intro_from_prologue()
		return
	_idx = idx
	_phase = "year"
	_t = 0.0
	_typed_chars = 0
	var ch: Dictionary = _chapters[idx]
	_year_lbl.text = str(ch.get("year", ""))
	_title_lbl.text = str(ch.get("title", ""))
	_title_lbl.modulate.a = 0.0
	_body_lbl.text = ""
	_body_lbl.modulate.a = 0.0
	_art_ctrl.set_chapter(idx)


func _process(dt: float) -> void:
	if _idx >= _chapters.size():
		return
	_t += dt
	var pc: Dictionary = Config.campaign().get("prologue", {})
	var cps := float(pc.get("typeCps", 20.0))
	var ch: Dictionary = _chapters[_idx]
	var raw_body := str(ch.get("body", ""))
	var bb := _to_bbcode(raw_body)
	var plain := raw_body.replace("**", "").replace("*", "")

	_art_ctrl.set_progress(clampf(_t / 14.0, 0.0, 1.0))

	match _phase:
		"year":
			_year_lbl.modulate.a = clampf(_t / 0.5, 0.0, 1.0)
			if _t >= 2.2:
				_phase = "title"; _t = 0.0
		"title":
			_title_lbl.modulate.a = clampf(_t / 0.5, 0.0, 1.0)
			if _t >= 2.6:
				_phase = "body"; _t = 0.0; _body_lbl.text = bb; _body_lbl.visible_characters = 0
		"body":
			_body_lbl.modulate.a = clampf(_t / 0.4, 0.0, 1.0)
			_typed_chars = mini(plain.length(), int(_t * cps))
			_body_lbl.visible_characters = _typed_chars
			if _typed_chars >= plain.length() and _t >= float(plain.length()) / cps + float(pc.get("tailSec", 3.0)):
				_start_chapter(_idx + 1)


func _to_bbcode(src: String) -> String:
	var out := ""
	var i := 0
	var bold := false
	var italic := false
	while i < src.length():
		if i + 1 < src.length() and src.substr(i, 2) == "**":
			bold = not bold
			out += "[b]" if bold else "[/b]"
			i += 2
		elif src[i] == "*":
			italic = not italic
			out += "[i]" if italic else "[/i]"
			i += 1
		else:
			out += src[i]
			i += 1
	return out


func _input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo:
		var k := (event as InputEventKey).keycode
		if k == KEY_SPACE or k == KEY_ENTER or k == KEY_ESCAPE:
			SceneRouter.enter_intro_from_prologue()
			return
	if (event is InputEventMouseButton and (event as InputEventMouseButton).pressed) or (event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed):
		var raw_body := str(_chapters[_idx].get("body", ""))
		var plain := raw_body.replace("**", "").replace("*", "")
		if _phase != "body":
			_phase = "body"; _t = 0.0
			_year_lbl.modulate.a = 1.0; _title_lbl.modulate.a = 1.0; _body_lbl.modulate.a = 1.0
			_body_lbl.text = _to_bbcode(raw_body); _body_lbl.visible_characters = plain.length()
		elif _typed_chars < plain.length():
			_t = float(plain.length()) / 20.0
			_body_lbl.visible_characters = plain.length()
		else:
			_start_chapter(_idx + 1)


class _AsciiTableau extends Control:
	const TABLEAUX := [
		["       /|       ", "      _||_      ", "      |==|      ", "    __|  |__    ", "   | JAKARTA|   ", "   |__2028__|   "],
		["   __________   ", "  | PT N.U.S.A| ", "  | [======]  | ", "  |   CORE    | ", "  |___________| "],
		["   _  ____  _   ", "  / \\/GARU\\/ \\  ", " /   \\ DA /   \\ ", "      \\__/      "],
		["     _____      ", "    |[===]|     ", "   /| ::: |\\    ", "  / | === | \\   ", "    |_| |_|     "],
		["   __\\_____/__  ", "  ====[===]==== ", "    2039 OPS    "],
		["  [MAHAPATIH]   ", "   /|=====|\\    ", "  / | [X] | \\   ", "    |_| |_|     "],
		["  IRON BATTALION", "  [#][#][#][#]  ", "  ||||||||||||  "],
		["  ZERO HOUR 2044", "  *  *   *  *   ", " |\\ /|\\ /|\\ /|  "],
		["  BANDUNG LINE  ", "    _O_   [>]   ", "   / | \\        ", "    / \\         "],
	]
	var _idx := 0
	var _p := 0.0

	func set_chapter(i: int) -> void:
		_idx = clampi(i, 0, TABLEAUX.size() - 1)
		_p = 0.0
		queue_redraw()

	func set_progress(p: float) -> void:
		_p = p
		queue_redraw()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.03, 0.035, 0.045, 0.9))
		draw_rect(Rect2(Vector2.ZERO, size), Color(Pal.STEEL, 0.35), false, 1.5)
		var lines: Array = TABLEAUX[_idx]
		var font := Pal.font_mono()
		var fsize := 22
		var start_y := size.y * 0.35 - _p * 12.0
		for i in lines.size():
			var col := Pal.AMBER if i == 0 else Pal.TECH
			draw_string(font, Vector2(size.x * 0.14 + _p * 8.0, start_y + float(i) * 32.0), lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, fsize, col)
