# Tennis

`/works/laboratory/tennis` is a procedural Three.js singles tennis game. The lower, white-shirted player is human; the upper, coral-shirted player is the computer. No downloaded models, textures, or game assets are used.

## Controls

- WASD / arrow keys: movement. Mobile: left movement pad.
- Move the mouse as the ball enters the player's contact ring; no click is needed. Mobile: swipe on the court with a second finger.
- Upward swing: topspin. Downward swing: slice. Horizontal motion: aim and sidespin. Faster motion adds power and depth.
- Space / swipe / serve button: serve. P: pause. Escape / M: settings.
- Menu: opponent difficulty, landing/contact guides, new match, navigation.

A mouse swing needs at least 50 CSS pixels of straight travel at 720 pixels/second within a 120 ms window; touch needs 42 pixels at 600 pixels/second. Slow cursor motion and short jitter do not animate the racket. The input window is 190 ms with a 230 ms swing cooldown. A contact needs the ball on the receiver's side, within 1.65 world units and 0.2–2.25 units high. Serves must bounce before a return. The landing marker is a prediction, not an additional input target.

## Simulation

Fixed 120 Hz physics is independent of rendering. `tennisPhysics.ts` handles gravity, simplified Magnus acceleration, drag, spin-dependent bounce, launch trajectories and scoring. `TennisApp.ts` handles first/second serves, net/out/second bounce, alternating service games, AI interception with speed/reaction limits and the match state machine. A short match requires at least three games and a two-game lead; points use deuce/advantage. This is an arcade interpretation: assisted net clearance, enlarged ball/contact zone and no service lets or foot-fault rules.

`tennisModels.ts` builds the blue court, net, articulated players, racket hoops/strings and shoes. Directional shadow mapping supplies the long shadows. `TennisExperience.tsx` owns UI and lifecycle. Resize changes only the camera/render size, not the match. Opening the menu or leaving the tab pauses play; unmount releases GPU resources, input listeners, resize observer and RAF.

## References

- [ITF Rules of Tennis](https://www.itftennis.com/en/about-us/governance/rules-and-regulations/): court dimensions and basic singles scoring.
- [Tennis Warehouse University — trajectory](https://twu.tennis-warehouse.com/learning_center/trajectory_info.php) and [spin](https://twu.tennis-warehouse.com/learning_center/spindemo.php): qualitative topspin/slice behavior. Coefficients here are tuned for playability, not a physical measurement model.
- [TopSpin 2K25 manual](https://assets.2k.com/1a6ngf98576c/711e3fTXcev5myflo3nHF4/1e2ba7b37efe3e7895f5cda4081b498b/2KSWIN_TOPSPIN_2K25_PC_Online_Manual_ENG.pdf): timing/power/spin gameplay reference. No assets or code reused.

## Verification

`node scripts/verify-tennis.mjs <path-to-playwright-package.json>` runs deterministic physics/scoring assertions and Chrome integration tests. `VERIFY_BASE_URL` selects the server (default `http://127.0.0.1:3000`). Tests drive actual keyboard, mouse and CDP touch events: serve, AI return, a human rally, pause, settings, restart, route remount and mobile movement. Screenshots go to ignored `artifacts/tennis/`.
