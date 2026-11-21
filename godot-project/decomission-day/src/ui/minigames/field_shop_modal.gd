class_name FieldShopModal
extends CanvasLayer

## Field Shop Quartermaster (Survival & antar-stage Campaign): 4 tab,
## persistent unlocked_weapons, chooser pengganti slot 3 senjata, tier upgrade
## bertahap (Alpha..Delta), aksi Monas khusus Survival, serta 1-step Undo.

signal closed_next

var _mode := "campaign"
var _stage_no := 1
var _active_tab := "general"
var _selected_id := ""
var _pending_weapon := ""
var _last_snapshot: Variant = null
var _monas_hooks: Dictionary = {}

var _root: ColorRect
var _money_lbl: Label
var _tab_row: HBoxContainer
var _item_list: VBoxContainer
var _desc_title: Label
var _desc_body: Label
var _desc_cost: Label
var _buy_btn: Button
var _undo_btn: Button
var _notice_lbl: Label
var _replace_box: VBoxContainer
var _next_btn: Button


func _ready() -> void:
	layer = 20
	visible = false
	_build_ui()


func _build_ui() -> void:
	var f_blk := Pal.font_black()
	var f_reg := Pal.font_regular()

	_root = ColorRect.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.color = Color(0.03, 0.04, 0.055, 0.92)
	add_child(_root)

	var cc := CenterContainer.new(); cc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(cc)

	var frame := PanelContainer.new()
	frame.custom_minimum_size = Vector2(820, 520)
	var sb := StyleBoxFlat.new(); sb.bg_color = Color.html("#13171d"); sb.border_color = Pal.AMBER
	sb.set_border_width_all(2); sb.set_corner_radius_all(4)
	frame.add_theme_stylebox_override("panel", sb)
	cc.add_child(frame)

	var m := MarginContainer.new()
	for s in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		m.add_theme_constant_override(s, 18)
	frame.add_child(m)

	var main_v := VBoxContainer.new(); main_v.add_theme_constant_override("separation", 12)
	m.add_child(main_v)

	# Header
	var head := HBoxContainer.new()
	var h_lbl := _lbl("FIELD SHOP // QUARTERMASTER", 22, Pal.AMBER, f_blk)
	head.add_child(h_lbl)
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; head.add_child(sp)
	_money_lbl = _lbl("FUNDS: 0", 20, Pal.WHITE, f_blk)
	head.add_child(_money_lbl)
	main_v.add_child(head)

	# Tab row
	_tab_row = HBoxContainer.new(); _tab_row.add_theme_constant_override("separation", 8)
	main_v.add_child(_tab_row)
	for t in [["general", "GENERAL"], ["weapon", "WEAPONS"], ["armor", "ARMOR"], ["upgrade", "UPGRADES"]]:
		var b := Button.new(); b.text = t[1]; b.custom_minimum_size = Vector2(120, 36)
		b.add_theme_font_override("font", f_blk)
		b.pressed.connect(func(): _active_tab = t[0]; _pending_weapon = ""; _rebuild_items())
		_tab_row.add_child(b)

	# Split workspace
	var split := HBoxContainer.new(); split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 14)
	main_v.add_child(split)

	var scroll := ScrollContainer.new(); scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scroll.size_flags_stretch_ratio = 1.25
	split.add_child(scroll)
	_item_list = VBoxContainer.new(); _item_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_item_list.add_theme_constant_override("separation", 6)
	scroll.add_child(_item_list)

	var detail := PanelContainer.new(); detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var dsb := StyleBoxFlat.new(); dsb.bg_color = Color.html("#0d1015"); dsb.border_color = Pal.STEEL
	dsb.set_border_width_all(1); detail.add_theme_stylebox_override("panel", dsb)
	split.add_child(detail)
	var dm := MarginContainer.new(); dm.add_theme_constant_override("margin_left", 14); dm.add_theme_constant_override("margin_right", 14)
	dm.add_theme_constant_override("margin_top", 12); dm.add_theme_constant_override("margin_bottom", 12)
	detail.add_child(dm)
	var dv := VBoxContainer.new(); dv.add_theme_constant_override("separation", 8); dm.add_child(dv)
	_desc_title = _lbl("Select an item", 20, Pal.AMBER, f_blk)
	_desc_body = _lbl("", 15, Pal.WHITE, f_reg); _desc_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_desc_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_desc_cost = _lbl("", 18, Pal.TECH, f_blk)
	_buy_btn = Button.new(); _buy_btn.text = "PURCHASE"; _buy_btn.custom_minimum_size = Vector2(0, 44)
	_buy_btn.add_theme_font_override("font", f_blk); _buy_btn.pressed.connect(_on_buy_pressed)
	_replace_box = VBoxContainer.new(); _replace_box.visible = false; _replace_box.add_theme_constant_override("separation", 6)
	_notice_lbl = _lbl("", 14, Pal.AMBER, f_reg)
	for n in [_desc_title, _desc_body, _desc_cost, _buy_btn, _replace_box, _notice_lbl]:
		dv.add_child(n)

	# Footer
	var foot := HBoxContainer.new(); foot.add_theme_constant_override("separation", 10)
	main_v.add_child(foot)
	_undo_btn = Button.new(); _undo_btn.text = "UNDO LAST"; _undo_btn.custom_minimum_size = Vector2(140, 42)
	_undo_btn.add_theme_font_override("font", f_blk); _undo_btn.pressed.connect(_on_undo)
	foot.add_child(_undo_btn)
	var sp2 := Control.new(); sp2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; foot.add_child(sp2)
	_next_btn = Button.new(); _next_btn.text = "DEPLOY NEXT >>"; _next_btn.custom_minimum_size = Vector2(210, 44)
	_next_btn.add_theme_font_override("font", f_blk)
	_next_btn.pressed.connect(close_and_continue)
	foot.add_child(_next_btn)


func open_shop(p_mode: String, p_stage: int = 1, next_label: String = "START NEXT >>", monas_cb: Dictionary = {}) -> void:
	_mode = p_mode
	_stage_no = p_stage
	_monas_hooks = monas_cb
	_active_tab = "general"
	_selected_id = ""
	_pending_weapon = ""
	_last_snapshot = null
	_next_btn.text = next_label
	_notice_lbl.text = ""
	GameState.is_paused = true
	Input.set_mouse_mode(Input.MOUSE_MODE_VISIBLE)
	visible = true
	_rebuild_items()


func close_and_continue() -> void:
	visible = false
	GameState.is_paused = false
	closed_next.emit()


func _catalog() -> Array[Dictionary]:
	var sc: Dictionary = Config.section("shop")
	var items: Array[Dictionary] = []

	items.append({"id": "ammo", "tab": "general", "name": "Refill Ammo", "cost": int(sc.get("ammoCost", 700)),
		"desc": "Restock all equipped weapons to full capacity."})
	items.append({"id": "health", "tab": "general", "name": "Replenish Health", "cost": int(sc.get("healthCost", 500)),
		"desc": "Restore player HP to full maximum."})
	items.append({"id": "medkit", "tab": "general", "name": "Field Medkit", "cost": int(sc.get("medkitCost", 700)),
		"desc": "Carryable healing charge (max %d)." % int(Config.section("player").get("maxMedkits", 2))})
	if _mode == "survival":
		items.append({"id": "healMonas", "tab": "general", "name": "Repair Monument", "cost": int(sc.get("healMonasCost", 500)),
			"desc": "Restore 25% of Monas monument structural integrity."})
	if not bool(GameState.player["has_radar"]):
		items.append({"id": "radar", "tab": "general", "name": "Tactical Radar", "cost": int(sc.get("radarCost", 5000)),
			"desc": "Unlock persistent radar display tracking landmarks & hostiles."})

	# Weapons (selalu 4 senjata; milik yang terlepas tampil OWNED -> EQUIP)
	var max_w_lvl := int(Config.section("weapons").get("maxWeaponLevel", 4))
	for w in GameState.WEAPON_ORDER:
		var equipped := GameState.has_weapon_equipped(w)
		var unlocked := GameState.has_unlocked_weapon(w)
		var lvl := int(GameState.player["weapon_lvl"].get(w, 0))
		if not unlocked:
			var cost := int(sc.get("%sCost" % w, 2500))
			items.append({"id": "buy_%s" % w, "tab": "weapon", "kind": "buy_weapon", "weapon": w,
				"name": "Acquire %s" % GameState.WEAPON_DEF[w]["name"], "cost": cost,
				"desc": "Equip new weapon to active arsenal."})
		elif not equipped:
			items.append({"id": "equip_%s" % w, "tab": "weapon", "kind": "equip_weapon", "weapon": w,
				"name": "%s (OWNED)" % GameState.weapon_display_name(w), "cost": 0,
				"desc": "Previously acquired weapon. Equip into active 3-slot loadout at no cost."})
		elif lvl < max_w_lvl:
			var next_lvl := lvl + 1
			var tier := Config.upgrade_tier(next_lvl)
			var costs: Array = sc.get("upgradeCosts", {}).get(w, [1000, 2000, 3000, 4000])
			var cost := int(costs[mini(lvl, costs.size() - 1)])
			items.append({"id": "up_%s" % w, "tab": "weapon", "kind": "upgrade_weapon", "weapon": w,
				"tier_level": next_lvl,
				"name": "%s -> %s" % [GameState.WEAPON_DEF[w]["name"], str(tier.get("name", "Lv%d" % next_lvl))],
				"cost": cost, "desc": "+40% weapon damage per upgrade tier."})

	# Armor tiers
	var a_costs: Array = sc.get("armorCosts", [1000, 2000, 3000, 4000])
	var a_tiers: Array = Config.section("armor").get("tiers", [])
	for i in a_tiers.size():
		var t: Dictionary = a_tiers[i]
		items.append({"id": "armor_%d" % (i + 1), "tab": "armor", "kind": "armor", "tier": i + 1,
			"cost": int(a_costs[mini(i, a_costs.size() - 1)]),
			"name": "Armor Tier %d" % (i + 1),
			"desc": "Blocks %d%% incoming damage (%d durability)." % [roundi(float(t.get("reduce", 0.3)) * 100.0), int(t.get("durability", 100))]})

	# Upgrades
	var hp_lvl := int(GameState.player["hp_lvl"])
	var hp_ups: Array = Config.section("player").get("hpUpgrades", [150, 200, 250, 300])
	var hp_costs: Array = sc.get("healthUpCosts", [2000, 3000, 4000, 5000])
	if hp_lvl - 1 < hp_ups.size():
		items.append({"id": "hpup", "tab": "upgrade", "kind": "hpup",
			"cost": int(hp_costs[mini(hp_lvl - 1, hp_costs.size() - 1)]),
			"name": "Vitality Tier %d (%d Max HP)" % [hp_lvl + 1, int(hp_ups[hp_lvl - 1])],
			"desc": "Permanently increases Max HP and restores health."})

	var ammo_lvl := int(GameState.player["ammo_lvl"])
	var ammo_ups: Array = Config.section("weapons").get("ammoUpgrades", [])
	var ammo_costs: Array = sc.get("ammoUpCosts", [1500, 2000, 2500, 3000])
	if ammo_lvl - 1 < ammo_ups.size():
		items.append({"id": "ammoup", "tab": "upgrade", "kind": "ammoup",
			"cost": int(ammo_costs[mini(ammo_lvl - 1, ammo_costs.size() - 1)]),
			"name": "Ammo Capacity Tier %d" % (ammo_lvl + 1),
			"desc": "Expands maximum ammunition capacity across all weapons and refills reserves."})

	if _mode == "survival":
		items.append({"id": "strengthenMonas", "tab": "upgrade", "kind": "strengthen_monas",
			"cost": int(sc.get("strengthenMonasCost", 1600)),
			"name": "Reinforce Monument",
			"desc": "Increases maximum Monas monument structural HP."})

	return items


func _rebuild_items() -> void:
	_money_lbl.text = "FUNDS: %d" % GameState.score
	_undo_btn.disabled = _last_snapshot == null
	for ch in _item_list.get_children():
		ch.queue_free()

	var f_blk := Pal.font_black()
	var tab_items: Array[Dictionary] = []
	for it in _catalog():
		if it["tab"] == _active_tab:
			tab_items.append(it)

	for it in tab_items:
		var b := Button.new()
		var cost := int(it["cost"])
		b.text = "%s   —   %s" % [str(it["name"]), "FREE EQUIP" if cost == 0 else str(cost)]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(0, 40)
		b.add_theme_font_override("font", f_blk)
		var it_copy := it.duplicate()
		b.pressed.connect(func(): _select_item(it_copy))
		_item_list.add_child(b)

	if not tab_items.is_empty():
		var found := false
		for it in tab_items:
			if it["id"] == _selected_id:
				_select_item(it)
				found = true
				break
		if not found:
			_select_item(tab_items[0])
	else:
		_desc_title.text = "No items available"
		_desc_body.text = ""
		_desc_cost.text = ""
		_buy_btn.disabled = true


func _select_item(it: Dictionary) -> void:
	_selected_id = str(it["id"])
	_desc_title.text = str(it["name"])
	_desc_body.text = str(it["desc"])
	var cost := int(it["cost"])
	var locked := false
	if _mode == "campaign" and it.has("tier_level"):
		var tier := Config.upgrade_tier(int(it["tier_level"]))
		var req := int(tier.get("shopStage", 1))
		if _stage_no < req:
			locked = true
			_desc_cost.text = "LOCKED (Stage %d)" % req
	if not locked:
		_desc_cost.text = "EQUIP ACTION (0)" if cost == 0 else "COST: %d" % cost
	_buy_btn.text = "EQUIP" if cost == 0 else "PURCHASE"
	_buy_btn.disabled = locked or (cost > GameState.score)
	_replace_box.visible = false


func _on_buy_pressed() -> void:
	var target: Dictionary = {}
	for it in _catalog():
		if it["id"] == _selected_id:
			target = it
			break
	if target.is_empty():
		return

	var kind := str(target.get("kind", target["id"]))
	if kind in ["buy_weapon", "equip_weapon"]:
		var w := str(target["weapon"])
		var max_slots := int(Config.section("weapons").get("maxWeapons", 3))
		if GameState.player["weapons"].size() >= max_slots:
			_show_replace_chooser(w, int(target["cost"]))
			return

	_execute_purchase(target, -1)


func _show_replace_chooser(new_w: String, cost: int) -> void:
	_pending_weapon = new_w
	for ch in _replace_box.get_children():
		ch.queue_free()
	_replace_box.visible = true
	var hdr := _lbl("LOADOUT FULL — REPLACE WHICH SLOT?", 13, Pal.AMBER, Pal.font_black())
	_replace_box.add_child(hdr)
	var list: Array = GameState.player["weapons"]
	for i in list.size():
		var w_old := str(list[i])
		var b := Button.new()
		b.text = "Replace Slot %d (%s)" % [i + 1, GameState.weapon_display_name(w_old)]
		b.custom_minimum_size = Vector2(0, 34)
		var slot_i := i
		b.pressed.connect(func():
			var item := {"id": _selected_id, "kind": "equip_weapon" if cost == 0 else "buy_weapon", "weapon": new_w, "cost": cost}
			_execute_purchase(item, slot_i)
		)
		_replace_box.add_child(b)


func _execute_purchase(it: Dictionary, replace_idx: int) -> void:
	var cost := int(it.get("cost", 0))
	if cost > GameState.score:
		_notice_lbl.text = "Insufficient funds"
		return
	var snap := _snapshot()
	var kind := str(it.get("kind", it["id"]))
	var ok := true

	match kind:
		"ammo":
			for w in GameState.player["weapons"]:
				GameState.player["ammo"][w] = GameState.max_ammo_for(str(w))
		"health":
			if float(GameState.player["hp"]) >= float(GameState.player["max_hp"]):
				_notice_lbl.text = "Health already full"; ok = false
			else:
				GameState.player["hp"] = float(GameState.player["max_hp"])
		"medkit":
			var cap := int(Config.section("player").get("maxMedkits", 2))
			if int(GameState.player["medkits"]) >= cap:
				_notice_lbl.text = "Medkits already full"; ok = false
			else:
				GameState.player["medkits"] = int(GameState.player["medkits"]) + 1
		"radar":
			GameState.player["has_radar"] = true
		"buy_weapon":
			var w := str(it["weapon"])
			GameState.player["ammo"][w] = GameState.max_ammo_for(w)
			GameState.equip_or_add_weapon(w, replace_idx)
		"equip_weapon":
			GameState.equip_or_add_weapon(str(it["weapon"]), replace_idx)
		"upgrade_weapon":
			var w := str(it["weapon"])
			GameState.player["weapon_lvl"][w] = int(GameState.player["weapon_lvl"][w]) + 1
		"armor":
			var tier := int(it["tier"])
			var a_tiers: Array = Config.section("armor").get("tiers", [])
			var dur := float(a_tiers[tier - 1].get("durability", 100))
			if int(GameState.player["armor_lvl"]) > tier:
				_notice_lbl.text = "Stronger armor already equipped"; ok = false
			else:
				GameState.player["armor_lvl"] = tier
				GameState.player["armor"] = dur
				GameState.player["armor_max"] = dur
		"hpup":
			var ups: Array = Config.section("player").get("hpUpgrades", [150, 200, 250, 300])
			var lvl := int(GameState.player["hp_lvl"])
			GameState.player["hp_lvl"] = lvl + 1
			GameState.player["max_hp"] = float(ups[lvl - 1])
			GameState.player["hp"] = float(GameState.player["max_hp"])
		"ammoup":
			GameState.player["ammo_lvl"] = int(GameState.player["ammo_lvl"]) + 1
			for w in GameState.WEAPON_ORDER:
				GameState.player["ammo"][w] = GameState.max_ammo_for(w)
		"healMonas":
			if _monas_hooks.has("heal"):
				var err: Variant = _monas_hooks["heal"].call()
				if err != null and not str(err).is_empty():
					_notice_lbl.text = str(err); ok = false
		"strengthen_monas":
			if _monas_hooks.has("strengthen"):
				var err: Variant = _monas_hooks["strengthen"].call()
				if err != null and not str(err).is_empty():
					_notice_lbl.text = str(err); ok = false

	if not ok:
		return

	GameState.set_score(GameState.score - cost)
	_last_snapshot = snap
	_replace_box.visible = false
	_notice_lbl.text = "Purchased: %s" % str(it.get("name", kind))
	AudioManager.play_sfx("purchase", 0.75)
	GameState.ui_dirty.emit()
	_rebuild_items()


func _snapshot() -> Dictionary:
	return {
		"score": GameState.score,
		"player": GameState.player.duplicate(true),
		"monas": _monas_hooks["get_state"].call() if _monas_hooks.has("get_state") else null,
	}


func _on_undo() -> void:
	if _last_snapshot == null:
		return
	var snap: Dictionary = _last_snapshot
	_last_snapshot = null
	GameState.player = (snap["player"] as Dictionary).duplicate(true)
	GameState.set_score(int(snap["score"]))
	if snap["monas"] != null and _monas_hooks.has("set_state"):
		_monas_hooks["set_state"].call(snap["monas"])
	_notice_lbl.text = "Last transaction cancelled"
	AudioManager.play_sfx("purchase", 0.6)
	GameState.ui_dirty.emit()
	_rebuild_items()


func _lbl(txt: String, sz: int, col: Color, font: Font) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", col)
	return l
