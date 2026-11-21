extends Node3D

## Cutscene Pembuka Campaign: Helikopter turun ke atap N.U.S.A. sambil
## memutar briefing misi Major Gibran sebelum masuk Stage 1.

var _rig: Dictionary
var _cam: TopDownCamera
var _heli: Node3D
var _rotor: Node3D
var _brief_lbl: Label
var _text := ""
var _t := 0.0
var _done := false


func _ready() -> void:
	_rig = ProceduralBuilder.create_lighting_rig(self)
	ProceduralBuilder.apply_light_preset(_rig, "night")
	CityscapeBuilder.build_skyline_ring(self, Vector3.ZERO, 420.0, 1200.0, 80, -40.0)
	CityscapeBuilder.build_ambient_embers(self)

	# Rooftop platform
	ProceduralBuilder.add_box(self, Vector3(140, 20, 140), Pal.mat(Pal.CONCRETE), Vector3(0, -10, 0))
	ProceduralBuilder.add_ring(self, 28, 34, Pal.mat(Pal.AMBER, Pal.AMBER, 0.7), Vector3(0, 0.25, 0))

	_heli = Node3D.new(); _heli.position = Vector3(0, 95, 0); add_child(_heli)
	ProceduralBuilder.add_box(_heli, Vector3(16, 10, 42), Pal.mat(Pal.GUNMETAL), Vector3.ZERO)
	ProceduralBuilder.add_box(_heli, Vector3(5, 5, 28), Pal.mat(Pal.INK), Vector3(0, 2, -32))
	_rotor = Node3D.new(); _rotor.position = Vector3(0, 7, 2); _heli.add_child(_rotor)
	ProceduralBuilder.add_box(_rotor, Vector3(68, 0.6, 3.5), Pal.mat(Pal.STEEL), Vector3.ZERO)
	ProceduralBuilder.add_box(_rotor, Vector3(3.5, 0.6, 68), Pal.mat(Pal.STEEL), Vector3.ZERO)

	_cam = TopDownCamera.new(); add_child(_cam)
	_cam.snap_to(Vector3(0, 12, 0))

	_text = str(Config.dialogue_at("campaign.intro.briefing"))
	_build_overlay()
	AudioManager.start_loop("intro_heli", "heli", 0.55)


func _build_overlay() -> void:
	var cl := CanvasLayer.new(); add_child(cl)
	var box := PanelContainer.new()
	box.anchor_top = 1.0; box.anchor_bottom = 1.0; box.anchor_left = 0.1; box.anchor_right = 0.9
	box.offset_top = -180; box.offset_bottom = -28
	var sb := StyleBoxFlat.new(); sb.bg_color = Color(0.04, 0.06, 0.09, 0.88); sb.border_color = Pal.AMBER; sb.set_border_width_all(2)
	box.add_theme_stylebox_override("panel", sb); cl.add_child(box)

	var m := MarginContainer.new(); m.add_theme_constant_override("margin_left", 20); m.add_theme_constant_override("margin_right", 20)
	m.add_theme_constant_override("margin_top", 14); m.add_theme_constant_override("margin_bottom", 14)
	box.add_child(m)

	_brief_lbl = Label.new(); _brief_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_brief_lbl.add_theme_font_override("font", Pal.font_regular()); _brief_lbl.add_theme_font_size_override("font_size", 18)
	_brief_lbl.add_theme_color_override("font_color", Pal.WHITE)
	m.add_child(_brief_lbl)

	var skip := Button.new(); skip.text = "SKIP [SPACE]"
	skip.anchor_left = 1.0; skip.anchor_right = 1.0; skip.offset_left = -168; skip.offset_right = -24
	skip.offset_top = 24; skip.offset_bottom = 66
	skip.add_theme_font_override("font", Pal.font_black())
	skip.pressed.connect(_finish)
	cl.add_child(skip)


func _process(dt: float) -> void:
	if _done:
		return
	_t += dt
	_rotor.rotation.y += dt * 16.0
	var k := clampf(_t / 6.5, 0.0, 1.0)
	_heli.position.y = lerpf(95.0, 9.0, 1.0 - pow(1.0 - k, 2.0))
	_cam.follow(Vector3(0, _heli.position.y * 0.35, 0), dt)

	var cps := float(Config.campaign().get("intro", {}).get("dialogueCps", 28.0))
	var chars := mini(_text.length(), int(_t * cps))
	_brief_lbl.text = _text.substr(0, chars)
	if _t >= float(_text.length()) / cps + 2.2:
		_finish()


func _input(event: InputEvent) -> void:
	if event is InputEventKey and (event as InputEventKey).pressed and not (event as InputEventKey).echo:
		var kc := (event as InputEventKey).keycode
		if kc == KEY_SPACE or kc == KEY_ENTER or kc == KEY_ESCAPE:
			_finish()


func _finish() -> void:
	if _done:
		return
	_done = true
	AudioManager.stop_loop("intro_heli")
	SceneRouter.enter_campaign_from_intro()
