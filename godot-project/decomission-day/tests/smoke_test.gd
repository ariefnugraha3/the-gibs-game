extends SceneTree

## Suite Uji Asap (Smoke Test) Headless lengkap untuk Decommission Day (Godot 4.7).
## Menjalankan verifikasi Config, Difficulty scaling, SaveSystem, Achievements,
## NavGrid2D, Minigame Modals, MainMenu, Cutscenes, Survival Mode, dan semua 12 Stage Campaign.

var _failures := 0


func _init() -> void:
	call_deferred("_run_all")


func _assert(cond: bool, msg: String) -> void:
	if not cond:
		_failures += 1
		printerr("FAIL: " + msg)
	else:
		print("PASS: " + msg)


func _run_all() -> void:
	print("=== DECOMMISSION DAY HEADLESS SMOKE SUITE ===")
	_test_config()
	_test_save_and_achievements()
	_test_nav_and_collision()
	await _test_ui_and_minigames()
	await _test_menus_and_cutscenes()
	await _test_survival()
	await _test_campaign_all_stages()

	if _failures == 0:
		print("=== ALL SMOKE CHECKS PASSED ===")
		quit(0)
	else:
		printerr("=== %d SMOKE CHECKS FAILED ===" % _failures)
		quit(1)


func _test_config() -> void:
	var cfg := root.get_node("Config")
	_assert(not cfg.section("player").is_empty(), "gameplay.json loaded player section")
	_assert(not cfg.stage_cfg(10).get("flight", {}).is_empty(), "stage10.json merged under campaign.stage10.flight")

	cfg.apply_difficulty("normal")
	var norm_hp := float(cfg.section("robot").get("classes", {}).get("C", {}).get("hp", 50.0))
	cfg.apply_difficulty("hard")
	var hard_hp := float(cfg.section("robot").get("classes", {}).get("C", {}).get("hp", 50.0))
	cfg.apply_difficulty("hard")
	var hard2_hp := float(cfg.section("robot").get("classes", {}).get("C", {}).get("hp", 50.0))
	_assert(hard_hp > norm_hp, "Hard difficulty scales robot HP above Normal")
	_assert(is_equal_approx(hard_hp, hard2_hp), "apply_difficulty is idempotent")
	cfg.apply_difficulty("normal")


func _test_save_and_achievements() -> void:
	var save := root.get_node("SaveSystem")
	var ach := root.get_node("AchievementManager")
	var gs := root.get_node("GameState")
	save.set_save_path_for_test("user://smoke_test_save.cfg")
	save.save_campaign_stage(6)
	_assert(save.load_campaign_stage() == 6, "SaveSystem persists campaign stage checkpoint")
	save.clear_campaign_save()
	_assert(save.load_campaign_stage() == 0, "SaveSystem clears campaign checkpoint")

	# Perfect-run achievement audit (Stage 1 -> Stage 12 without damage/death/cheat)
	ach.start_session("campaign", 1)
	for s in range(1, 13):
		ach.visit_stage(s)
		if s < 12:
			ach.complete_stage(s)
	ach.complete_campaign()
	_assert(ach.is_unlocked("campaign_deathless"), "Deathless award unlocked after ordered clean run")
	_assert(ach.is_unlocked("campaign_untouched"), "Untouched award unlocked after clean run")
	gs.configure_player()


func _test_nav_and_collision() -> void:
	var NavCls := load("res://src/world/nav_grid_2d.gd")
	var nav = NavCls.new()
	nav.build(-70.0, -70.0, 14.0, 10, 10, func(wx: float, wz: float) -> bool:
		var c := int(floorf((wx + 70.0) / 14.0))
		var r := int(floorf((wz + 70.0) / 14.0))
		if c == 5 and r >= 1 and r <= 8:
			return false
		return c >= 0 and r >= 0 and c < 10 and r < 10
	)
	_assert(not nav.grid_los(-28.0, 0.0, 28.0, 0.0, 3.5), "NavGrid2D LOS detects middle wall")
	var path: Array = nav.find_path(-28.0, 0.0, 28.0, 0.0)
	_assert(path.size() >= 2, "NavGrid2D A* routes around middle obstacle (nodes=%d)" % path.size())


func _test_ui_and_minigames() -> void:
	var gs := root.get_node("GameState")
	gs.configure_player()
	gs.set_score(10000)

	var ice = load("res://src/ui/minigames/ice_breach_modal.gd").new(); root.add_child(ice)
	ice.open_minigame("TEST ICE")
	_assert(ice.visible, "IceBreachModal opens visibly")
	ice.queue_free()

	var sig = load("res://src/ui/minigames/signal_trace_modal.gd").new(); root.add_child(sig)
	sig.open_minigame("TEST SIGNAL")
	_assert(sig.visible, "SignalTraceModal opens visibly")
	sig.queue_free()

	var rep = load("res://src/ui/minigames/field_repair_modal.gd").new(); root.add_child(rep)
	rep.open_minigame("TEST REPAIR", false, 0)
	_assert(rep.visible, "FieldRepairModal opens visibly")
	rep.queue_free()

	var shop = load("res://src/ui/minigames/field_shop_modal.gd").new(); root.add_child(shop)
	shop.open_shop("campaign", 4, "DEPLOY")
	_assert(shop.visible, "FieldShopModal opens cleanly")
	shop.close_and_continue()
	_assert(not shop.visible, "FieldShopModal closes on continue")
	shop.queue_free()
	gs.is_paused = false
	await process_frame


func _test_menus_and_cutscenes() -> void:
	var menu_sc := load("res://src/scenes/menu/main_menu.tscn") as PackedScene
	var menu := menu_sc.instantiate()
	root.add_child(menu)
	await process_frame
	_assert(menu != null, "MainMenu instantiates and ticks cleanly")
	menu.queue_free()

	var pro_sc := load("res://src/scenes/cutscenes/prologue.tscn") as PackedScene
	var pro := pro_sc.instantiate()
	root.add_child(pro)
	await process_frame
	_assert(pro != null, "Prologue instantiates cleanly")
	pro.queue_free()

	var intro_sc := load("res://src/scenes/cutscenes/intro_cutscene.tscn") as PackedScene
	var intro := intro_sc.instantiate()
	root.add_child(intro)
	await process_frame
	_assert(intro != null, "IntroCutscene instantiates cleanly")
	intro.queue_free()
	await process_frame


func _test_survival() -> void:
	var sr := root.get_node("SceneRouter")
	sr.pending_survival_intro = true
	var surv_sc := load("res://src/scenes/survival/survival_mode.tscn") as PackedScene
	var surv := surv_sc.instantiate()
	root.add_child(surv)
	await process_frame
	surv._skip_intro()
	for i in 6:
		await process_frame
	_assert(surv.monas_world != null and surv.monas_world.monas_top != null, "SurvivalMode MonasWorld & monument built")
	surv.queue_free()
	await process_frame


func _test_campaign_all_stages() -> void:
	var sr := root.get_node("SceneRouter")
	sr.pending_campaign_stage = 1
	sr.pending_campaign_chapter = 1
	var host_sc := load("res://src/scenes/campaign/campaign_host.tscn") as PackedScene
	var chost := host_sc.instantiate()
	root.add_child(chost)
	await process_frame

	for s in range(1, 13):
		chost.load_stage(s, 1)
		await process_frame
		await process_frame
		_assert(chost.active_stage != null and chost.current_stage_no == s, "Campaign Stage %d loaded & stepped" % s)
		if s == 6 or s == 9 or s == 11:
			chost.load_stage(s, 2)
			await process_frame
			_assert(chost.current_chapter == 2, "Campaign Stage %d Ch2 loaded & stepped" % s)
		if s == 9 or s == 11:
			chost.load_stage(s, 3)
			await process_frame
			_assert(chost.current_chapter == 3, "Campaign Stage %d Ch3 loaded & stepped" % s)

	chost.queue_free()
	await process_frame
