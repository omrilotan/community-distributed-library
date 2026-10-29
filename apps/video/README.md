# Explainer video

A minute-long video for people who might open a library on their own street: what a library is, how to open one with Claude Code, setting it up and inviting neighbours, and how little it asks of you after that. Rendered with [Remotion](https://www.remotion.dev) in two shapes: landscape (1920×1080) for the website and YouTube, and portrait (1080×1920) for Reels, Shorts and TikTok. Both come from the same scenes, timed to the narration.

## Making it

Needs ffmpeg and whisper.cpp: `brew install ffmpeg whisper-cpp`.

1. **Narration.** `voice/partN.txt` is the script, `voice/partN.mp3` the same read aloud on [openai.fm](https://www.openai.fm) (voice Cedar), which takes 999 characters at a time. `npm run voice -w @cdl/video` joins the parts, speeds them up by `SPEED` in `scripts/voice.ts` (1.2), and writes `public/voice.mp3` and `src/words.json`, the time of every word. The first run downloads the whisper model (~550 MB) into `models/`, unless `WHISPER_MODEL` names one you have.
2. **Preview.** `npm run studio -w @cdl/video` opens Remotion Studio on port 3100.
3. **Render.** `npm run render -w @cdl/video` writes `out/explainer-landscape.mp4` and `out/explainer-portrait.mp4`. `-- --stills 2,30` renders single frames instead, and `-- --only portrait` one shape.

Scenes start on words of the script, not on seconds (`cue()` in `src/timing.ts`), so a new reading or a different speed keeps them in step; a phrase taken out of the script stops the render rather than leaving a scene waiting.

## Pictures

- `public/images/`: photographs generated with ChatGPT in the website's style, with no real people, places or brands.
- `public/screens/`: the app itself on a phone (412×924 at 2.625×, 1082×2426), as the library's admin sees it. They were taken from local development with the staging library pulled down (`npm run db:pull -- --library staging`), its photos copied into the local store, and made-up neighbours with example.org addresses added so the lists look lived in. Anyone real in the pulled data is renamed or left out before a screen is taken.
- `public/logo.svg` and `public/fonts/`: copies of `packages/design/logo.svg` and the website's Outfit.

In portrait, Reels, TikTok and Shorts lay their own buttons over the bottom fifth of the frame and a strip on the right, so the stage and captions stay above and left of them (`frames` in `src/theme.ts`).
