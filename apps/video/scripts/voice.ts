/**
 * The narration, from the parts in voice/ to public/voice.mp3 and
 * src/words.json.
 *
 * The parts were voiced on openai.fm (gpt-4o-mini-tts, voice Cedar), which
 * takes 999 characters at a time; voice/partN.txt is what it was given.
 *
 * 1. Trim each part's silence, join them with a breath between, speed the
 *    whole up by SPEED (pitch kept) and level its loudness.
 * 2. Time every word with whisper.cpp, then line the script up with what
 *    whisper heard: the script spells the words, whisper times them.
 *
 * Needs ffmpeg and whisper-cli (brew install ffmpeg whisper-cpp). The model
 * is downloaded into models/ on the first run, unless WHISPER_MODEL names one.
 *
 * Usage: npm run voice
 */
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** How much faster than the voice's own pace. */
const SPEED = 1.2;
/** Seconds of quiet between one part and the next, before speeding up. */
const BREATH = 0.45;

const root = new URL("..", import.meta.url).pathname;
const parts = readdirSync(join(root, "voice"))
	.filter((name) => /^part\d+\.mp3$/.test(name))
	.sort();
const scratch = mkdtempSync(join(tmpdir(), "cdl-voice-"));

// Quiet unless it fails: the error then carries what the tool said.
const run = (command: string, args: string[]) =>
	execFileSync(command, args, { stdio: ["ignore", "ignore", "pipe"] });

// 1. One track.
const trim =
	"silenceremove=start_periods=1:start_threshold=-50dB,areverse," +
	"silenceremove=start_periods=1:start_threshold=-50dB,areverse";
const inputs = parts.flatMap((name) => ["-i", join(root, "voice", name)]);
const chain = parts
	.map((_, i) => `[${i}]${trim}[p${i}]`)
	.concat(
		parts
			.slice(1)
			.map((_, i) => `aevalsrc=0:d=${BREATH}:s=24000:c=mono[g${i}]`),
	);
const joined = parts.flatMap((_, i) =>
	i ? [`[g${i - 1}]`, `[p${i}]`] : ["[p0]"],
);
const filter = `${chain.join(";")};${joined.join("")}concat=n=${joined.length}:v=0:a=1,asetpts=N/SR/TB,atempo=${SPEED},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]`;
const voice = join(root, "public", "voice.mp3");
run("ffmpeg", [
	"-v",
	"error",
	"-y",
	...inputs,
	"-filter_complex",
	filter,
	"-map",
	"[out]",
	"-ar",
	"48000",
	"-b:a",
	"192k",
	voice,
]);

// 2. Word timings.
const model =
	process.env.WHISPER_MODEL ??
	join(root, "models", "ggml-large-v3-turbo-q5_0.bin");
if (!existsSync(model)) {
	mkdirSync(join(root, "models"), { recursive: true });
	run("curl", [
		"-L",
		"-o",
		model,
		"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
	]);
}
const wav = join(scratch, "voice.wav");
run("ffmpeg", [
	"-v",
	"error",
	"-y",
	"-i",
	voice,
	"-ar",
	"16000",
	"-ac",
	"1",
	"-c:a",
	"pcm_s16le",
	wav,
]);
run("whisper-cli", [
	"-m",
	model,
	"-f",
	wav,
	"-l",
	"en",
	"-ml",
	"1",
	"-sow",
	"-ojf",
	"-np",
	"-of",
	join(scratch, "whisper"),
]);

type Word = { w: string; s: number; e: number };

// Whisper with -ml 1 gives about one word per segment. A hyphenated word
// comes as one, so it is split into its parts, sharing the time.
const norm = (word: string) =>
	word
		.toLowerCase()
		.replace(/[’']/g, "")
		.replace(/[^a-z0-9]/g, "");
const transcription: { text: string; offsets: { from: number; to: number } }[] =
	JSON.parse(readFileSync(join(scratch, "whisper.json"), "utf8")).transcription;
const heard: Word[] = transcription.flatMap(({ text, offsets }) => {
	const pieces = text
		.trim()
		.split(/[-–/.]/)
		.filter(norm);
	const span = (offsets.to - offsets.from) / (pieces.length || 1);
	return pieces.map((w, i) => ({
		w,
		s: offsets.from + i * span,
		e: offsets.from + (i + 1) * span,
	}));
});

// The script as shown on screen: "dot com" is said, ".com" is written.
const script = parts
	.map((name) =>
		readFileSync(join(root, "voice", name.replace(/\.mp3$/, ".txt")), "utf8"),
	)
	.join("\n\n")
	.replace(/ dot com\b/g, ".com");
const sentences = script
	.split(/(?<=[.!?])\s+/)
	.map((text) => text.replace(/\s+/g, " ").trim())
	.filter(Boolean)
	.map((text) => ({
		text,
		words: text.split(" ").map((w): Word => ({ w, s: NaN, e: NaN })),
	}));
const words = sentences.flatMap((sentence) => sentence.words);
// Each written word against the tokens whisper would hear for it.
const said = words.map(({ w }) =>
	w
		.split(/[-–/.]/)
		.map(norm)
		.filter(Boolean),
);
const tokens = said.flatMap((pieces, i) => pieces.map((t) => ({ t, i })));

// Needleman–Wunsch over the tokens: match 2, mismatch -1, gap -1.
const a = tokens.map(({ t }) => t);
const b = heard.map(({ w }) => norm(w));
const cols = b.length + 1;
const score = new Int32Array((a.length + 1) * cols);
for (let i = 0; i <= a.length; i++) score[i * cols] = -i;
for (let j = 0; j <= b.length; j++) score[j] = -j;
const at = (i: number, j: number) => score[i * cols + j]!;
for (let i = 1; i <= a.length; i++) {
	for (let j = 1; j <= b.length; j++) {
		score[i * cols + j] = Math.max(
			at(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 2 : -1),
			at(i - 1, j) - 1,
			at(i, j - 1) - 1,
		);
	}
}
let matched = 0;
for (let i = a.length, j = b.length; i > 0 && j > 0;) {
	if (at(i, j) === at(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 2 : -1)) {
		const word = words[tokens[i - 1]!.i]!;
		const { s, e } = heard[j - 1]!;
		word.s = Number.isNaN(word.s) ? s : Math.min(word.s, s);
		word.e = Number.isNaN(word.e) ? e : Math.max(word.e, e);
		if (a[i - 1] === b[j - 1]) matched++;
		i--;
		j--;
	} else if (at(i, j) === at(i - 1, j) - 1) i--;
	else j--;
}

// Words whisper missed are spread between their timed neighbours.
for (let i = 0; i < words.length; i++) {
	if (!Number.isNaN(words[i]!.s)) continue;
	let end = i;
	while (end < words.length && Number.isNaN(words[end]!.s)) end++;
	const from = i > 0 ? words[i - 1]!.e : 0;
	const to = end < words.length ? words[end]!.s : from + (end - i) * 250;
	const step = (to - from) / (end - i);
	for (let k = i; k < end; k++) {
		words[k]!.s = from + (k - i) * step;
		words[k]!.e = from + (k - i + 1) * step;
	}
	i = end - 1;
}

const duration = Number(
	execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"csv=p=0",
			voice,
		],
		{
			encoding: "utf8",
		},
	),
);
writeFileSync(
	join(root, "src", "words.json"),
	JSON.stringify(
		{ durationMs: Math.round(duration * 1000), sentences },
		(_key, value) => (typeof value === "number" ? Math.round(value) : value),
		2,
	) + "\n",
);
console.log(
	`${duration.toFixed(1)}s at ${SPEED}×, ${matched}/${tokens.length} words heard as written`,
);
