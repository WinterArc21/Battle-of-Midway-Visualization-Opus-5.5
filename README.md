# MIDWAY · 10:22

4 June 1942, 10:22 a.m. A Dauntless dive-bomber from USS Enterprise falls from 13,000 feet onto the Japanese flagship Akagi.
A 77-second film made entirely in code: every frame is rendered by a WebGL program, every sound is synthesized.

**Watch:** [`video/midway-1022.mp4`](video/midway-1022.mp4) (1920×1080, 24 fps, 77 s).
**Play it live:** `npx http-server . -p 8080`, open `http://localhost:8080/web/`.

## What happens

| Time | |
|---|---|
| 0:02 | Cockpit, high over broken cloud. The Japanese carriers were not where they were supposed to be; fuel is running low. |
| 0:07 | Far below, one Japanese destroyer races north. Its wake points the way. |
| 0:11 | From above the Dauntless: through a gap in the cloud, the carriers turning hard, their wakes curling. *No Japanese fighter is above them.* |
| 0:16 | The perforated dive brakes split open. Wing-over. |
| 0:19 – 0:49 | The dive, at 70°. An altimeter reading unwinds from 13,000 ft. Through the telescopic sight the carrier grows in the reticle; flak; the lens fogs as the plane drops into warm, wet air. |
| 0:34 | On Akagi's flight deck, among the aircraft being readied, a man looks up and points. Three black dots, out of the sun. |
| 0:49 | Release at 1,800 ft. Pull-out; the picture greys out. |
| 0:52 | From the rear seat: the bomb goes through the flight deck into the hangar. |
| 1:00 | The reckoning, and why nobody stopped them. |

## Facts it is built on

* The Enterprise dive bombers, led by Wade McClusky, found the Japanese carriers late and low on fuel, by following the destroyer *Arashi*, which was racing to rejoin the fleet.
* Japan's fighter cover was down at low altitude, destroying the American torpedo planes that had attacked just before. Of 41 torpedo bombers from the three US carriers, 35 were lost.
* The SBD Dauntless dived at about 70° with its split, perforated dive brakes open, and released at around 1,500–2,000 ft. The telescopic sight could fog in the dive.
* Akagi was hit by one bomb (plus a near miss). It exploded among armed and fuelled aircraft in the hangar and she was lost. Between about 10:22 and 10:28, Kaga, Akagi and Soryu were all set on fire.

Simplifications: the fleet's geometry, the flak, the camera's path and the exact altitudes are illustrative. The pilot is not named, and the radio line and the lookout's cry are dramatised. Deck markings follow common reconstructions.

## How it is made

```
web/engine/world.js     timeline; the fleet turning; our Dauntless's flight path, solved so the bomb lands on Akagi's deck
web/engine/models.js    Akagi / Kaga-type carriers, escorts, the SBD (articulated dive brakes), Japanese aircraft, the bomb
web/engine/shaders.js   sky and sun, a cumulus layer with gaps and shadows, the ocean with curved wakes, lit meshes, particles
web/engine/deck.js      painted flight decks: planking, elevators, hinomaru, identification kana
web/engine/post.js      bloom / grade / finish, the fogged lens, the grey-out
web/film.js             the shots, fire, smoke, flak, tracers, captions
tools/mix.py            the soundtrack: radial engine, wind, oxygen mask, radio, dive-brake shriek, flak, guns,
                        drones and a Shepard tone (no melody), heartbeat, explosions; voices by Kokoro TTS
tools/render.mjs        headless Chromium -> ffmpeg
```

Rebuild: `npm install`, Kokoro model files in `build/tts-model/`, then
`node -e "import('./web/film.js').then(m=>require('fs').writeFileSync('build/cues.json', JSON.stringify(m.CUES)))"`,
`python3 tools/mix.py`, `node tools/render.mjs --out video/midway-1022.mp4`.
