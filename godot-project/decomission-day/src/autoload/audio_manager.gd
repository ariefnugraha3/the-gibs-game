extends Node

## Manajer Audio: 4 track musik (menu, battle 1/2, boss), pool SFX polifonik,
## loop tanpa jeda, ducking saat slow-mo kematian, serta synthesizer epilog.

const SFX_FILES := {
	"shoot": "res://assets/sounds/gun-shoot.mp3",
	"shotgun": "res://assets/sounds/shotgun-shot.mp3",
	"empty": "res://assets/sounds/empty-gun.mp3",
	"switch": "res://assets/sounds/switch-weapon.mp3",
	"explode": "res://assets/sounds/grenade-explode.mp3",
	"hit": "res://assets/sounds/jokowi-kaget.mp3",
	"pistol": "res://assets/sounds/pistol-shoot.mp3",
	"pickup": "res://assets/sounds/pick-up-item.mp3",
	"purchase": "res://assets/sounds/success-purchase.mp3",
	"melee_break": "res://assets/sounds/smash-melee-attack.mp3",
	"throw": "res://assets/sounds/throwing-grenade.mp3",
	"nade_roll": "res://assets/sounds/grenade-rolling.mp3",
	"robot_bite": "res://assets/sounds/robot-attack-melee.mp3",
	"footstep": "res://assets/sounds/player-footstep.mp3",
	"robot_step": "res://assets/sounds/robot-step.mp3",
	"launcher_shot": "res://assets/sounds/grenade-launcher-shot.mp3",
	"rocket_shot": "res://assets/sounds/rocket-launcher-shot.mp3",
	"rocket_explode": "res://assets/sounds/rocket-explode.mp3",
	"heal": "res://assets/sounds/player-heal.mp3",
	"melee_swing": "res://assets/sounds/player-melee-attack.mp3",
	"melee_hit": "res://assets/sounds/player-melee-attack-hit.mp3",
	"robot_shot": "res://assets/sounds/robot-shot.mp3",
	"heli": "res://assets/sounds/helicopter-flying.mp3",
	"tank_explode": "res://assets/sounds/boss-tank/tank-explode.mp3",
	"tank_blast": "res://assets/sounds/boss-tank/tank-explosive-attack.mp3",
	"tank_incoming": "res://assets/sounds/boss-tank/tank-incoming-mortar.mp3",
	"tank_mg": "res://assets/sounds/boss-tank/tank-machine-gun.mp3",
	"tank_mortar": "res://assets/sounds/boss-tank/tank-mortar-shot.mp3",
	"tank_move": "res://assets/sounds/boss-tank/tank-moving.mp3",
	"tank_turret": "res://assets/sounds/boss-tank/tank-turret-rotate.mp3",
	"robot_spawn": "res://assets/sounds/robot-spawn.mp3",
	"door_open": "res://assets/sounds/door-open.mp3",
	"door_close": "res://assets/sounds/door-closed.mp3",
	"train": "res://assets/sounds/train-sound.mp3",
}

const MUSIC_FILES := {
	"menu": "res://assets/sounds/bg-music-main-menu.mp3",
	"battle1": "res://assets/sounds/bg-music-in-game.mp3",
	"battle2": "res://assets/sounds/bg-music-in-game-2.mp3",
	"boss": "res://assets/sounds/bg-music-boss-fight.mp3",
}

const SFX_BASE := 0.7
const POOL_SIZE := 18

var _streams: Dictionary = {}
var _music_streams: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _pool_idx := 0
var _loops: Dictionary = {}

var _music_player: AudioStreamPlayer = null
var _current_context := ""
var _allow_battle_music := true

var music_vol := 0.8
var sfx_vol := 1.0
var _duck := 1.0


func _ready() -> void:
	music_vol = SaveSystem.get_music_vol()
	sfx_vol = SaveSystem.get_sfx_vol()

	_music_player = AudioStreamPlayer.new()
	_music_player.name = "MusicPlayer"
	add_child(_music_player)

	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.name = "SFX_%d" % i
		add_child(p)
		_pool.append(p)

	_preload_streams()
	_apply_music_volume()


func _preload_streams() -> void:
	for key in SFX_FILES.keys():
		var path: String = SFX_FILES[key]
		if ResourceLoader.exists(path):
			_streams[key] = load(path)
	for key in MUSIC_FILES.keys():
		var path: String = MUSIC_FILES[key]
		if ResourceLoader.exists(path):
			var s := load(path)
			if s is AudioStreamMP3:
				s.loop = true
			_music_streams[key] = s


func set_allow_battle_music(allow: bool) -> void:
	_allow_battle_music = allow


func set_music_volume(v: float) -> void:
	music_vol = clampf(v, 0.0, 1.0)
	SaveSystem.set_music_vol(music_vol)
	_apply_music_volume()


func set_sfx_volume(v: float) -> void:
	sfx_vol = clampf(v, 0.0, 1.0)
	SaveSystem.set_sfx_vol(sfx_vol)


func duck_music(k: float) -> void:
	_duck = clampf(k, 0.0, 1.0)
	_apply_music_volume()


func _apply_music_volume() -> void:
	if not _music_player:
		return
	var effective := music_vol * _duck
	_music_player.volume_db = -80.0 if effective <= 0.001 else linear_to_db(effective)


func start_menu_music() -> void:
	if _current_context == "menu" and _music_player.playing:
		return
	_play_track("menu", "menu")


func start_battle_music() -> void:
	if not _allow_battle_music:
		return
	if _current_context == "battle" or _current_context == "boss":
		return
	var track := "battle1" if randf() < 0.5 else "battle2"
	_play_track("battle", track)


func start_boss_music() -> void:
	if _current_context == "boss" and _music_player.playing:
		return
	_play_track("boss", "boss")


func stop_music() -> void:
	_current_context = ""
	_duck = 1.0
	if _music_player:
		_music_player.stop()


func _play_track(ctx: String, stream_key: String) -> void:
	_current_context = ctx
	_duck = 1.0
	_apply_music_volume()
	var s: AudioStream = _music_streams.get(stream_key)
	if not s:
		return
	_music_player.stream = s
	_music_player.play()


func play_sfx(key: String, vol: float = 0.7, pitch: float = 1.0) -> AudioStreamPlayer:
	var s: AudioStream = _streams.get(key)
	if not s or _pool.is_empty():
		return null
	var p := _pool[_pool_idx % _pool.size()]
	_pool_idx += 1
	p.stop()
	p.stream = s
	p.pitch_scale = maxf(0.1, pitch)
	var scaled := clampf(vol * (sfx_vol / SFX_BASE), 0.0, 1.5)
	p.volume_db = -80.0 if scaled <= 0.001 else linear_to_db(scaled)
	p.play()
	return p


func start_loop(tag: String, key: String, vol: float = 0.7) -> void:
	var s: AudioStream = _streams.get(key)
	if not s:
		return
	var p: AudioStreamPlayer = _loops.get(tag)
	if p == null:
		p = AudioStreamPlayer.new()
		p.name = "Loop_%s" % tag
		add_child(p)
		_loops[tag] = p
	if s is AudioStreamMP3:
		s.loop = true
	p.stream = s
	var scaled := clampf(vol * (sfx_vol / SFX_BASE), 0.0, 1.5)
	p.volume_db = -80.0 if scaled <= 0.001 else linear_to_db(scaled)
	if not p.playing:
		p.play()


func set_loop_volume(tag: String, vol: float) -> void:
	var p: AudioStreamPlayer = _loops.get(tag)
	if not p:
		return
	var scaled := clampf(vol * (sfx_vol / SFX_BASE), 0.0, 1.5)
	p.volume_db = -80.0 if scaled <= 0.001 else linear_to_db(scaled)


func stop_loop(tag: String) -> void:
	var p: AudioStreamPlayer = _loops.get(tag)
	if p and p.playing:
		p.stop()


func stop_all_loops() -> void:
	for tag in _loops.keys():
		stop_loop(tag)


func play_carrier_beep() -> void:
	# Nada radio sintetis pendek untuk epilog Stage 12 tanpa butuh file tambahan
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = 22050.0
	gen.buffer_length = 0.4
	var p := AudioStreamPlayer.new()
	p.stream = gen
	var scaled := clampf(0.25 * sfx_vol, 0.0, 1.0)
	p.volume_db = -80.0 if scaled <= 0.001 else linear_to_db(scaled)
	add_child(p)
	p.play()
	var pb := p.get_stream_playback() as AudioStreamGeneratorPlayback
	if pb:
		var total := int(22050 * 0.32)
		for i in total:
			var t := float(i) / 22050.0
			var env := sin(PI * clampf(t / 0.32, 0.0, 1.0))
			var sample := sin(TAU * 740.0 * t) * 0.35 * env
			pb.push_frame(Vector2(sample, sample))
	get_tree().create_timer(0.45).timeout.connect(p.queue_free)
