# Captions and dubbing — measured on real speech, offline (2026-11-07)

Machine: 4 CPU cores, no GPU. Models from `models.lock.json`; **downloads disabled** (`MODELS_OFFLINE=1`, proxy pointed at a dead address). App speech-to-text model: Whisper **small**. Reproduce: `backend/scripts/eval_dubbing.py` (FLEURS dev, CC-BY-4.0) and `backend/scripts/e2e_dubbing.py`.

## 1. Captions (speech-to-text) on human recordings

| Language | Utterances | Error rate | Speed (processing ÷ audio) | Language detected |
|---|---|---|---|---|
| English | 25 | WER 6.4% | 0.35× | {'en': 25} |
| Spanish | 15 | WER 3.7% | 0.38× | {'es': 15} |
| Hindi | 25 | CER 34.4% | 1.07× | {'hi': 23, 'jw': 1, 'ur': 1} |

WER = word error rate (English, Spanish); CER = character error rate (Hindi, where word boundaries vary). FLEURS records each sentence from several speakers, so the 25 Hindi utterances repeat some sentences.

**Hindi model choice** (10 *different* FLEURS sentences, language set to Hindi):

| Whisper | Decoding | Hindi CER | Speed (× audio) |
|---|---|---|---|
| small (default) | default | 23.1% | 0.72× |
| small | strict (no fallback, Devanagari prompt) | 28.3% | 0.79× |
| medium | default | **19.5%** | 1.89× |
| medium | strict | 22.5% | 1.76× |

Recommendation: Whisper **medium** for Hindi-first channels once the worker has ≥ 4 GB RAM (`WHISPER_MODEL=medium`, already pinned); small stays the default because it fits the current 2 GB worker. The 'strict' settings were rejected (worse).

## 2. Mixed-language speech (Hindi + English in one clip)

File language detected: **Hindi**, marked mixed: **True**, seconds per language: {'hi': 22.88, 'en': 16.5}. Sentence spans with the right language: **3/5**.

| Truth | Detected |
|---|---|
| hi | hi ✅ |
| en | en, hi ❌ |
| hi | hi ✅ |
| en | en ✅ |
| hi | en ❌ |

## 3. Speakers

Six real utterances alternating male/female: labels ['S1', 'S2', 'S3', 'S4', 'S3', 'S2'] → **4 speakers found**, purity **1.0** (1.0 = every label belongs to one gender group). FLEURS gives gender but not speaker ids; utterances of the same gender may be different people.

## 4. Every target language, end to end

Source: 8 English sentences from FLEURS (48.0 s, over a quiet music bed, as an MP4); Whisper's English transcript WER vs the human text: 16.7%. For each language: translate → voice on the original timing → mix → export MP4/M4A/SRT/VTT, then:

- **Pronunciation:** an independent judge (Whisper *medium*) re-recognises every voiced line in that language; CER vs the text the voice was asked to say (lower is better; human Hindi speech scores ~20–27% on the same judge family).
- **Translation:** the translation is translated back to English; chrF vs the English source (0–100, higher is better; a proxy, not a human rating).
- **Sync:** lines sped up (max 1.45×), lines that ran past the next line's start, largest shift. **Files:** MP4 has video+audio at the right length, SRT/VTT cue count = lines, M4A plays.

| Language | Voice (engine) | Pronunciation CER | Judge heard | Back-translation chrF | Sped up / overruns / max shift | Render time (× clip) | Files OK |
|---|---|---|---|---|---|---|---|
| Catalan `ca` | ca-female (piper) | 0.7% | ca×8 | 87.5 | 1/8 · 2 · 0.209 s | 10.5 s (0.22×) | ✅ |
| Czech `cs` | cs-male (piper) | 4.1% | cs×8 | 86.4 | 5/8 · 5 · 0.331 s | 11.8 s (0.25×) | ✅ |
| Danish `da` | da-male (piper) | 6.8% | da×8 | 84.8 | 1/8 · 1 · 0.074 s | 9.2 s (0.19×) | ✅ |
| German `de` | de-male (piper) | 2.7% | de×8 | 88.2 | 3/8 · 0 · 0.039 s | 10.6 s (0.22×) | ✅ |
| Greek `el` | el-female (piper) | 9.1% | el×8 | 86.3 | 3/8 · 7 · 5.374 s | 10.4 s (0.22×) | ✅ |
| English `en` | en-female (kokoro) | 1.6% | en×8 | 100.0 | 0/8 · 0 · 0.0 s | 14.1 s (0.29×) | ✅ |
| Spanish `es` | es-female (kokoro) | 1.7% | es×8 | 79.3 | 3/8 · 1 · 0.075 s | 17.2 s (0.36×) | ✅ |
| Persian `fa` | fa-male (piper) | 26.9% | fa×8 | 74.3 | 3/8 · 1 · 0.106 s | 13.4 s (0.28×) | ✅ |
| Finnish `fi` | fi-male (piper) | 5.3% | fi×8 | 78.7 | 4/8 · 4 · 0.117 s | 12.7 s (0.26×) | ✅ |
| French `fr` | fr-female (kokoro) | 1.4% | fr×8 | 82.5 | 2/8 · 0 · 0.0 s | 17.2 s (0.36×) | ✅ |
| Hindi `hi` | hi-female (kokoro) | 9.5% | hi×8 | 80.9 | 4/8 · 3 · 0.139 s | 24.8 s (0.52×) | ✅ |
| Hungarian `hu` | hu-female (piper) | 2.8% | hu×8 | 75.3 | 2/8 · 2 · 0.104 s | 10.1 s (0.21×) | ✅ |
| Italian `it` | it-female (kokoro) | 1.4% | it×8 | 93.5 | 2/8 · 0 · 0.0 s | 15.9 s (0.33×) | ✅ |
| Japanese `ja` | ja-female (kokoro) | 308.8% | ja×7, en×1 | 70.7 | 8/8 · 8 · 46.616 s | 72.7 s (1.51×) | ✅ |
| Latvian `lv` | lv-male (piper) | 18.7% | lt×2, de×1, lv×2, hr×1, pt×1, sk×1 | 81.7 | 3/8 · 1 · 0.144 s | 12.7 s (0.26×) | ✅ |
| Norwegian Bokmål `nb` | nb-male (piper) | 4.0% | no×8 | 83.1 | 0/8 · 0 · 0.0 s | 8.0 s (0.17×) | ✅ |
| Dutch `nl` | nl-male (piper) | 0.7% | nl×8 | 84.7 | 4/8 · 5 · 0.337 s | 14.9 s (0.31×) | ✅ |
| Polish `pl` | pl-female (piper) | 2.3% | pl×8 | 79.6 | 3/8 · 2 · 0.175 s | 10.3 s (0.21×) | ✅ |
| Portuguese `pt` | pt-female (kokoro) | 0.0% | pt×8 | 75.7 | 2/8 · 2 · 0.117 s | 14.2 s (0.3×) | ✅ |
| Romanian `ro` | ro-male (piper) | 8.3% | ro×8 | 86.4 | 3/8 · 3 · 0.162 s | 10.1 s (0.21×) | ✅ |
| Russian `ru` | ru-male (piper) | 5.1% | ru×8 | 73.8 | 0/8 · 0 · 0.0 s | 10.3 s (0.21×) | ✅ |
| Slovak `sk` | sk-female (piper) | 10.4% | sk×6, hr×1, ru×1 | 87.5 | 1/8 · 0 · 0.004 s | 9.0 s (0.19×) | ✅ |
| Slovenian `sl` | sl-male (piper) | 5.4% | sl×6, pl×1, hr×1 | 75.5 | 3/8 · 3 · 0.271 s | 10.3 s (0.21×) | ✅ |
| Swedish `sv` | sv-female (piper) | 0.0% | sv×8 | 87.9 | 4/8 · 4 · 0.396 s | 10.8 s (0.22×) | ✅ |
| Turkish `tr` | tr-male (piper) | 2.2% | tr×8 | 80.9 | 1/8 · 1 · 0.127 s | 9.5 s (0.2×) | ✅ |
| Ukrainian `uk` | uk-female (piper) | 4.9% | uk×8 | 67.3 | 3/8 · 3 · 0.675 s | 12.1 s (0.25×) | ✅ |
| Vietnamese `vi` | vi-female (piper) | 6.9% | vi×8 | 52.8 | 0/8 · 0 · 0.0 s | 8.4 s (0.17×) | ✅ |
| Chinese `zh` | zh-female (kokoro) | 60.0% | zh×8 | 70.1 | 4/8 · 2 · 0.204 s | 22.5 s (0.47×) | ✅ |

Sample lines (first sentence; translation → what the judge heard):

- **ca**: La cervesa local és No. No és una cervesa complexa, sinó agradable i refrescant. → _La cervesa local és no. No és una cervesa complexa, sinó agradable i refrescant._
- **cs**: Hlavní místní pivo je č. 1. Není to složité pivo, ale příjemné a osvěžující. → _Hlavní místní pivo je Č. 1. Není to složité pivo, ale příjemné a osvěžující._
- **da**: Den vigtigste lokale øl er nr. 1. Det er ikke en kompleks øl, men behagelig og forfriskende. → _Den vigtigste lokale øl er NR. N. Det er ikke en kompleks øl, men behageligere for friskende._
- **de**: Das wichtigste lokale Bier ist Nr. 1. Es ist kein komplexes Bier, aber angenehm und erfrischend. → _Das wichtigste lokale Bier ist Ernähr. 1. Es ist kein komplexes Bier, aber angenehm und erfrischend._
- **el**: Η κύρια τοπική μπύρα είναι η Αρ. 1. Δεν είναι σύνθετη μπύρα, αλλά ευχάριστη και αναζωογονητική. → _Η κυριατοπική πύρα είναι η Άρ. Δεν είναι σύνθετη πύρα, αλλά ευχάριστη και ένα ζωογρητική._
- **en**: The main local beer is No. 1. It is not a complex beer, but pleasant and refreshing. → _The main local beer is no. One, it is not a complex beer, but pleasant and refreshing._
- **es**: La cerveza local principal es No. 1. No es una cerveza compleja, pero agradable y refrescante. → _La cerveza local principal es no. Uno, no es una cerveza compleja pero agradable y refrescante._
- **fa**: آبجو اصلی محلی شماره ۱ است، یک آبجو پیچیده نیست، بلکه دلپذیر و طراوت است. → _آبجا اصفی محلی شماره یه است، یه آبجا پیشیده نیست، ولطف دلپزی رو ترابطه._
- **fi**: Tärkein paikallinen olut on nro 1. Se ei ole monimutkainen olut, mutta miellyttävä ja virkistävä. → _Tärkein paikallinen olut on numero yksi. Se ei ole monimutkainen olut, mutta miellyttävän ja virkistävä._
- **fr**: La principale bière locale est No. 1. Ce n'est pas une bière complexe, mais agréable et rafraîchissante. → _La principale bière locale est nos 1. Ce n'est pas une bière complexe, mais agréable et rafraîchissante._
- **hi**: मुख्य स्थानीय बीयर नंबर 1 है। यह एक जटिल बीयर नहीं है, बल्कि सुखद और ताज़ा है। → _मुख्यस्थानी बियर नंबर एक है, यह एक चतिल बियर नहीं है, बल्कि सुखध और ताजा है।_
- **hu**: A fő helyi sör az 1-es szám. Ez nem egy komplex sör, hanem kellemes és frissítő. → _A főhelyi sör az egyes szám. Ez nem egy komplex sör, hanem kellemes és frissítő._
- **it**: La birra locale principale è No. 1. Non è una birra complessa, ma piacevole e rinfrescante. → _La birra locale principale è no, uno, non è una birra complessa ma piacevole e rinfrescante._
- **ja**: 地元のビールはNo.1。複雑なビールではありませんが、快適で爽やかです。 → __
- **lv**: Galvenais vietējais alus ir Nr. 1. Tas nav sarežģīts alus, bet patīkams un atsvaidzinošs. → _Galvenai svietējies alusirenē. Viens, tas nav sarežģīts alus, bet patīkams un atsvaidzinoš._
- **nb**: Den viktigste lokale ølen er nr. 1. Det er ikke en kompleks øl, men hyggelig og forfriskende. → _Den viktigste lokale ølen er en er 1. Det er ikke en komplex øl, men hyggelig og forfriskende._
- **nl**: Het belangrijkste lokale bier is nummer 1. Het is geen complex bier, maar aangenaam en verfrissend. → _Het belangrijkste lokale bier is nummer 1. Het is geen complex bier, maar aangenaam en verfrissend._
- **pl**: Głównym lokalnym piwem jest nr 1. Nie jest to złożone piwo, ale przyjemne i orzeźwiające. → _Głównym lokalnym piwem jest NR1, nie jest to złożone piwo, ale przyjemne i ożywiające._
- **pt**: Não é uma cerveja complexa, mas agradável e refrescante. → _Não é uma cerveja complexa, mas agradável e refrescante._
- **ro**: Principala bere locală este nr. 1. Nu este o bere complexă, ci plăcută și răcoritoare. → _principala bere locală este Nere. Bunu', nu este o bere complexă, ci plăcută și răcoritoare._
- **ru**: Главное местное пиво - No1. Это не сложное пиво, а приятное и освежающее. → _Главное – местное пиво на один. Это не сложное пиво, а приятное, освежающее._
- **sk**: Hlavným miestnym pivom je č. 1. Nie je to komplexné pivo, ale príjemné a osviežujúce. → _Hladným miestním pivomieče. 1. Nije to komplexné pivo, ale prijemné a osviežujúce._
- **sl**: Glavno lokalno pivo je št. 1. To ni kompleksno pivo, ampak prijetno in osvežujoče. → _Glavno lokalno pivo je ešte bena, to ni kompleksno pivo, ampak trijetno in osvežujoče._
- **sv**: Den huvudsakliga lokala öl är nr 1. Det är inte en komplex öl, men behaglig och uppfriskande. → _Den huvudsakliga lokala öl är NR1. Det är inte en komplex öl, men behaglig och uppfriskande._
- **tr**: Ana yerel bira hayır. 1. Karmaşık bir bira değil, hoş ve ferahlatıcı. → _Anan Yerel Bira Hayır 1.Karmaşık bir bira değil, hoş ve ferahlatıcı_
- **uk**: Головне місцеве пиво No 1. Це не комплексне пиво, але приємне і освіження. → _Головне місцеве пиво. Це не комплексне пиво, але приєнне ріосвіження._
- **vi**: Bia chính ở địa phương là số 1, không phải bia phức tạp, mà là bia tươi mát và thoải mái. → _Đi chính ở địa phương là số 1 không phải đìa phức tạp mà là đìa tươi mát và thoải mái._
- **zh**: 当地主要的啤酒是1号,它并不是一种复杂的啤酒,而是令人愉快和清新. → _当地租谣的啤酒系,一绕踏冰箔系,一种复杂的啤酒二系令人越快乐清醒_

## 5. Real-speech sources into other languages (incl. pivots through English)

| Pair | Detected | Route | First source line | First translated line | Overruns | Time |
|---|---|---|---|---|---|---|
| hi>en | hi | argos | इतालविध्यमग रूक्disciplinary ज detonateṅ light green has the mostر thanq words as you write | This is the most important words as you write | 0 | 4.5 s |
| hi>es | hi | argos via English | इतालविध्यमग रूक्disciplinary ज detonateṅ light green has the mostر thanq words as you write | Estas son las palabras más importantes que escribes | 0 | 2.7 s |
| hi>de | hi | argos via English | इतालविध्यमग रूक्disciplinary ज detonateṅ light green has the mostر thanq words as you write | Dies sind die wichtigsten Wörter, wie Sie schreiben | 0 | 2.3 s |
| es>hi | es | argos via English | Podemos comenzar a llevar una vida más amigable con el planeta, formar parte de movimientos ambientalistas | हम पर्यावरण आंदोलनों के हिस्से के रूप में अधिक ग्रह के अनुकूल जीवन का नेतृत्व शुरू कर सकते हैं। | 2 | 19.0 s |
| es>en | es | argos | Podemos comenzar a llevar una vida más amigable con el planeta, formar parte de movimientos ambientalistas | We can start leading a more planet-friendly life, as part of environmental movements. | 0 | 9.8 s |

## 6. Through the running app (upload → studio → render → download), worker verified models offline before starting

Upload: {'status': 'ready', 'duration_s': 49.82, 'seconds': 11}. Recognition: detected **hi**, mixed **True** ({'en': 11.28, 'hi': 34.33}), **4 sentences**, speakers ['S1', 'S2', 'S3', 'S4'], 139 s. All languages rendered in 40 s.

| Language | Status | MP4 | M4A | Voice WAV | SRT cues | VTT cues | Render report |
|---|---|---|---|---|---|---|---|
| English | done | audio+video 49.8s | audio 50.1s | audio 50.1s | 4 | 4 | 13.0 s, 0 sped up, 0 overruns, peak 1639.1 MB |
| Spanish | done | audio+video 49.8s | audio 50.1s | audio 50.1s | 4 | 4 | 11.9 s, 0 sped up, 0 overruns, peak 1639.1 MB |
| Hindi | done | audio+video 49.8s | audio 50.1s | audio 50.1s | 4 | 4 | 13.4 s, 0 sped up, 0 overruns, peak 1639.1 MB |

First subtitle cue per language:

- **en**: `1 / 00:00:01,460 --> 00:00:09,076 / In the upper age, you will be able to do the next day. You will be able to guide the draughter which is the only thing you have to do. (edited)`
- **es**: `1 / 00:00:01,460 --> 00:00:10,036 / En la edad superior, usted será capaz de hacer al día siguiente. Usted será capaz de guiar a la draughter que es la única cosa que usted tiene que hacer.`
- **hi**: `1 / 00:00:01,460 --> 00:00:10,356 / अदी अप स्रदीअ में आप्तेंग या अप्ताटेग क्याद्टोंग। तु आप द्रूभीराध का औग़ूएंगे जिसका अरत्टाः है च्रतिच सरे उक्ता है।`

## 7. Resources

Whole evaluation: 3630.5 s; peak memory of the evaluation process 6725 MB (it holds Whisper small + Whisper medium judge + Kokoro at once; the worker releases models after each job).


## 8. What these numbers decided

- **Japanese and Chinese are switched off as dub targets.** Their rows above (judge CER 309% / 60%) show the Kokoro voices with
  kokoro-onnx's espeak phonemizer don't say the words they are given. They stay available as **sources**.
- **Worker start-up gate, observed in the running app:**
  - With an empty model folder and downloads forbidden, the worker logged `models NOT ready, not accepting jobs yet: whisper-small/config.json is missing … MODELS_OFFLINE=1 forbids downloading it`. A user's upload stayed `queued` and unclaimed.
  - With the real folder and a dead proxy, it logged `models verified in 47s … 26 voices; 69 translation pairs — accepting jobs` and processed the waiting upload.
- **Hindi as a source is the weak link:** Whisper small has 23–34% CER on Hindi read speech, and noisy clips can come out garbled (section 6's first line), which makes the translations wrong. For Hindi-first channels: use `WHISPER_MODEL=medium` (19.5% CER) on a ≥ 4 GB worker, and have creators check the transcript in the studio before rendering (the studio is built for that). English → Hindi (translation + voice) measured well: judge CER 9.5%, chrF 80.9.
- **Original voice under the dub:** not removed, only lowered to 15% during speech (no source-separation model yet).
- **Memory:**
  - The worker peaked at **1.64 GB** while dubbing a 50 s clip into 3 languages, inside the 2 GB worker.
  - The evaluation process itself peaks higher, because it also holds the Whisper medium judge.
