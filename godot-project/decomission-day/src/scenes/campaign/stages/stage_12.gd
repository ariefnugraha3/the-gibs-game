extends CampaignStageBase

## Stage 12 — Final Showdown di Taman Monas & Epilog "The Last Signal":
## Menggunakan kembali dunia Taman Monas + boulevard barat, lighting night,
## musik duel dibungkam hingga Mahapatih muncul, penjaga idle terbangun saat masuk viewport,
## Duel 4-fase M-0 MAHAPATIH -> Epilog (hening -> jalan ke Terminal Arsip Monas ->
## siaran publik -> terbit fajar Sunrise -> Judul & Kredit -> Relay di Luar Jawa -> Kemenangan Akhir!).

var _monas_world: MonasWorld
var _mahapatih: MahapatihBoss
var _phase := "approach" # approach | mahapatih | silence | radio_walk | transmit | dawn | credits | relay | complete
var _gate_sealed := false
var _west_barrier: Node3D
var _archive_stand := Vector3(-115, 0, -55)
var _archive_mk: MeshInstance3D

var _epi_t := 0.0
var _epi_lines: Array = []
var _epi_idx := 0
var _sunrise_done := false
var _broadcast_pct := 0.0


func enter_stage(p_host: Node, p_chapter: int = 1) -> void:
	super.enter_stage(p_host, p_chapter)
	stage_no = 12
	AudioManager.set_allow_battle_music(false)
	AudioManager.stop_music()
	ProceduralBuilder.setup_lighting(host.world_root, "night")

	_monas_world = MonasWorld.new()
	host.world_root.add_child(_monas_world)
	_monas_world.build(true)

	# Terminal Arsip Monas untuk epilog "The Last Signal"
	var arch_t := PropFactory.build_terminal(Pal.AMBER)
	arch_t["root"].position = _archive_stand + Vector3(0, 0, -14.0)
	_monas_world.add_child(arch_t["root"])
	_archive_mk = PropFactory.build_stand_marker(Pal.EXIT_GREEN, 16.0, 16.0)
	_archive_mk.position = _archive_stand + Vector3(0, 0.3, 0); _archive_mk.visible = false
	_monas_world.add_child(_archive_mk)

	_west_barrier = ProceduralBuilder.add_box(_monas_world, Vector3(4, 18, 84), Pal.mat(Pal.HAZARD, Pal.HAZARD, 0.5), Vector3(-MonasWorld.PARK_HX, 9, 0))
	_west_barrier.visible = false

	# Penjaga Boulevard Barat & Pelataran (tidur sampai masuk viewport nyata)
	for g in [
		["C", -860, -24], ["C", -860, 24], ["B", -740, -18], ["B", -740, 18],
		["B", -520, -40], ["A", -520, 40], ["C", -420, -25], ["A", -420, 25],
	]:
		host.spawn_robot(g[0], Vector3(g[1], 0, g[2]), "guard", true)

	for cp in [Vector3(-790, 0, 32), Vector3(-480, 0, -110), Vector3(-120, 0, 140), Vector3(160, 0, -140)]:
		host.spawn_crate(cp)
	for bp in [Vector3(-760, 0, 0), Vector3(-430, 0, 0), Vector3(-110, 0, -110), Vector3(140, 0, 110)]:
		host.spawn_barrel(bp)

	# Boss M-0 MAHAPATIH & 4 Anchor kabel tetap di taman
	_mahapatih = MahapatihBoss.new()
	host.world_root.add_child(_mahapatih)
	_mahapatih.setup_anchors([
		Vector3(160, 0, -140), Vector3(160, 0, 140),
		Vector3(-90, 0, -140), Vector3(-90, 0, 140),
	])
	_mahapatih.reset_boss(Vector3(240, 0, 0))
	_mahapatih.arena_bounds = Rect2(-MonasWorld.PARK_HX + 35, -MonasWorld.PARK_HZ + 35, MonasWorld.PARK_HX * 2 - 70, MonasWorld.PARK_HZ * 2 - 70)
	_mahapatih.avoid_center = Vector3(0, 0, 32.0)
	_mahapatih.player_hit_requested.connect(func(dmg: float, _push: Vector2, is_elec: bool):
		var hit := GameState.damage_player(dmg)
		if hit:
			host.hud.flash_damage()
			if is_elec:
				AudioManager.play_sfx("emp", 0.7)
	)
	_mahapatih.boss_wrecked.connect(_on_mahapatih_wrecked)

	host.player.global_position = Vector3(-1060, 0, 0)
	host.top_cam.snap_to(host.player.global_position)
	host.hud.show_stage_msg("STAGE 12 // RETURN TO MONAS — END THIS", 3.2)


func exit_stage() -> void:
	AudioManager.set_allow_battle_music(true)
	AudioManager.stop_all_loops()


func step_stage(dt: float, dt_real: float) -> void:
	# Bangunkan penjaga hanya saat tubuhnya masuk viewport nyata
	for r in host.robots:
		if is_instance_valid(r) and r.state == "idle" and host.top_cam.is_point_in_view(r.global_position, 10.0):
			r.state = "chasing"

	var p: Vector3 = host.player.global_position
	if _phase == "approach":
		if p.x > -240.0:
			_gate_sealed = true
			_west_barrier.visible = true
			_phase = "mahapatih"
			_mahapatih.activate_boss()
			AudioManager.start_boss_music()
			host.hud.show_stage_msg("M-0 MAHAPATIH // FINAL JUDGMENT", 3.2)
	elif _phase == "mahapatih":
		_mahapatih.step(dt, p, host.fx)
		var sub := "M-0 MAHAPATIH"
		match _mahapatih.phase:
			"siege": sub = "M-0 MAHAPATIH — SIEGE ANOA"
			"combat": sub = "M-0 MAHAPATIH — DUAL BLADES"
			"hardline": sub = "M-0 MAHAPATIH — SEVER 4 ANCHORS"
			"core": sub = "M-0 MAHAPATIH — EXPOSED CORE"
		host.hud.show_boss_hud(sub, _mahapatih.hp, _mahapatih.max_hp)
	else:
		_step_epilogue(dt_real)


func _on_mahapatih_wrecked(_m: MahapatihBoss) -> void:
	AchievementManager.record_boss("mahapatih")
	AudioManager.stop_music()
	host.hud.hide_boss_hud()
	_phase = "silence"
	_epi_t = 0.0
	_epi_lines = Config.dialogue_list("campaign.stage12.lines")
	_epi_idx = 0
	for r in host.robots:
		if is_instance_valid(r) and r.state != "dead":
			r.take_damage(99999.0, false)
	host.hud.show_stage_msg("MAHAPATIH DESTROYED — SILENCE FALLS OVER JAKARTA...", 3.5)


func _step_epilogue(dt: float) -> void:
	_epi_t += dt
	match _phase:
		"silence":
			if _epi_t >= 2.2:
				_phase = "radio_walk"
				_archive_mk.visible = true
				if not _epi_lines.is_empty():
					var d: Dictionary = _epi_lines[0]
					host.hud.show_radio_dialogue(str(d.get("speaker", "CIVILIAN RADIO")), str(d.get("text", "")))
				host.hud.show_stage_msg("REACH MONAS ARCHIVE TERMINAL TO BROADCAST THE LAST SIGNAL", 3.5)
		"radio_walk":
			if Vector2(host.player.global_position.x - _archive_stand.x, host.player.global_position.z - _archive_stand.z).length() < 16.0:
				_phase = "transmit"
				_epi_t = 0.0
				_archive_mk.visible = false
				_broadcast_pct = 0.0
				GameState.cinematic_active = true
				host.hud.set_cine_bars(true)
				host.hud.hide_radio_dialogue()
		"transmit":
			_broadcast_pct = minf(100.0, _broadcast_pct + dt * 32.0)
			host.hud.show_progress_bar("BROADCASTING PUBLIC TRANSMISSION", _broadcast_pct)
			if _broadcast_pct >= 100.0:
				host.hud.hide_progress_bar()
				_phase = "dawn"
				_epi_t = 0.0
				ProceduralBuilder.setup_lighting(host.world_root, "sunrise")
				host.hud.show_caption("SUNRISE OVER JAKARTA — DECOMMISSION COMPLETE")
		"dawn":
			if _epi_t >= 3.2:
				_phase = "credits"
				_epi_t = 0.0
				host.hud.show_caption("DECOMMISSION DAY\nCreated in Godot 4.7 — Project GIBS 2045")
		"credits":
			if _epi_t >= 3.8:
				_phase = "relay"
				_epi_t = 0.0
				var relay_txt := "A distant receiver outside Java acknowledges the clean signal."
				if _epi_lines.size() > 1:
					relay_txt = str(_epi_lines[_epi_lines.size() - 1].get("text", relay_txt))
				host.hud.show_radio_dialogue("OUTSIDE JAVA RELAY", relay_txt)
				host.hud.show_caption("")
		"relay":
			if _epi_t >= 3.6:
				_finish_campaign_victory()


func skip_cinematic() -> void:
	if _phase in ["transmit", "dawn", "credits", "relay"]:
		_finish_campaign_victory()


func _finish_campaign_victory() -> void:
	if _phase == "complete":
		return
	_phase = "complete"
	GameState.cinematic_active = false
	host.hud.set_cine_bars(false)
	host.hud.hide_progress_bar()
	host.hud.hide_radio_dialogue()
	host.hud.show_caption("")
	AchievementManager.complete_campaign()
	SaveSystem.clear_campaign_save()
	host.hud.show_game_over(true, "DECOMMISSION COMPLETE", "RETURN TO MAIN MENU", func(): SceneRouter.go_to_menu())


func handle_player_bullet(b: Dictionary) -> bool:
	if _phase == "mahapatih" and _mahapatih and is_instance_valid(_mahapatih):
		return _mahapatih.bullet_hit_test(b["prev"], b["pos"], 0.0 if bool(b.get("probe_only", false)) else float(b.get("dmg", 0.0)))
	return false


func handle_explosion(center: Vector3, radius: float, dmg: float, is_enemy: bool) -> void:
	if not is_enemy and _phase == "mahapatih" and _mahapatih:
		if Vector2(center.x - _mahapatih.global_position.x, center.z - _mahapatih.global_position.z).length() <= radius + 24.0:
			_mahapatih.bullet_hit_test(center, _mahapatih.global_position, dmg)


func get_objective_text() -> String:
	match _phase:
		"approach": return "STAGE 12 // FIGHT INTO MONAS COURTYARD"
		"mahapatih": return "STAGE 12 // DESTROY M-0 MAHAPATIH"
		"radio_walk": return "EPILOGUE // REACH MONAS ARCHIVE TERMINAL"
		"complete": return "DECOMMISSION COMPLETE"
		_: return "EPILOGUE // THE LAST SIGNAL"


func get_radar_landmarks() -> Array[Dictionary]:
	if _phase == "approach":
		return [{"x": 0.0, "z": 0.0, "color": Pal.AMBER, "size": 5.0, "clamp": true}]
	if _phase == "mahapatih" and _mahapatih:
		return [{"x": _mahapatih.global_position.x, "z": _mahapatih.global_position.z, "color": Pal.HAZARD, "size": 5.5, "clamp": true}]
	if _phase == "radio_walk":
		return [{"x": _archive_stand.x, "z": _archive_stand.z, "color": Pal.EXIT_GREEN, "size": 5.0, "clamp": true}]
	return []


func ground_height(x: float, z: float, cur_y: float) -> float:
	return _monas_world.ground_height(x, z, cur_y) if _monas_world else 0.0


func resolve_world(pos: Vector3, radius: float, _feet_y: float) -> Vector3:
	if not _monas_world:
		return pos
	pos = _monas_world.resolve_body(pos, radius, not _gate_sealed)
	if _gate_sealed and pos.x < -MonasWorld.PARK_HX + radius + 5.0:
		pos.x = -MonasWorld.PARK_HX + radius + 5.0
	return pos


func is_bullet_blocked(b: Dictionary) -> bool:
	return MonasWorld.monas_shot_blocked(b["prev"], b["pos"])
