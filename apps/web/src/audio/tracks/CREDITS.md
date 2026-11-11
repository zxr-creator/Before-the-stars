# Recorded music: credits and licences

Every recording that ships with Before the Stars is listed here. For each one, **both** the composition and the recording itself are in the public domain or dedicated to it (CC0), as stated on the file page it was taken from. No recording under an attribution, share-alike, non-commercial or no-derivatives licence ships, and none whose page does not state a licence for the performance.

The game also composes its own score in code (`src/audio/engine/`); it plays where no recording fits, between plays of the only recording for a moment, when a file cannot be loaded, and always for stings and interface sounds. Players choose *Recorded music*, *Generated score* or *Both* in the sound settings.

All pages were checked and the files downloaded on 2026-11-10. The machine-readable copy of this list, which the game reads, is `tracks.json` beside this file; the loudness of each encoded file is in `loudness.json` (from `scripts/music-encode.mjs`).

## Processing

Each file was cut where noted (an *excerpt*), resampled to 48 kHz stereo, trimmed of leading and trailing silence (below −60 dBFS), given gentle fades, brought to −18 LUFS integrated loudness with a single linear gain (a 4× oversampled look-ahead limiter holds true peaks at or below −1.5 dBTP; most files needed it on a few transients, and the result is measured on the encoded file), and encoded as Opus at 96 kbit/s in WebM: `node scripts/music-encode.mjs <folder of originals>`. A modification of a public-domain recording is itself free to use; no new rights are claimed in these edits.

## Tracks

### Title screen

#### Vltava (The Moldau), from Má vlast

- **Composer:** Bedřich Smetana
- **Performer:** Musopen Symphony
- **Used for:** title — title
- **Length as shipped:** 3:30 (opening 3:30 of 12:51 (the two springs and the river's main theme), faded)
- **File:** `vltava.webm` (2698 kB; -18 LUFS integrated, LRA 20.1 LU, true peak -3.3 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Smetana_-_M%C3%A1_Vlast_-_Vltava_%28Musopen_Symphony%29.flac>
- **Licence as stated on the page:** Public domain — `{{Copyright information |recording={{PD-author|[https://musopen.org/ Musopen]}} |musical composition={{PD-old-auto-expired|deathyear=1884}} }}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Recording commissioned by Musopen (2012 Kickstarter project) and released by Musopen into the public domain ({{PD-author|Musopen}}); composition public domain (Smetana d. 1884).

### Ancient era

#### Danse sacrée, from Danses for harp and strings

- **Composer:** Claude Debussy
- **Performer:** Marine Chamber Orchestra, "The President's Own" United States Marine Band (MSgt Karen Grimsey, harp; Maj Jason K. Fettig)
- **Used for:** ancient, space — peace
- **Length as shipped:** 4:50
- **File:** `danse-sacree.webm` (3795 kB; -18 LUFS integrated, LRA 14.3 LU, true peak -2.2 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Danse_Sacr%C3%A9e.ogg>
- **Licence as stated on the page:** Public domain — `{{PD-USGov-Military-Marines}} {{PD-US}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Performance and recording by a US Marine Corps band in the course of duty: a work of the US federal government, public domain ({{PD-USGov-Military-Marines}}); composition public domain (Debussy d. 1918; published 1904).

#### Lamentation for Holy Saturday (Tonus peregrinus)

- **Composer:** Gregorian chant (anonymous)
- **Performer:** Membeth (voice)
- **Used for:** ancient, classical — peace
- **Length as shipped:** 3:00 (first 3:00 of 6:09, faded)
- **File:** `lamentation.webm` (2380 kB; -18.1 LUFS integrated, LRA 11.7 LU, true peak -2.4 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Lamentation.III.Karsamstag.ogg>
- **Licence as stated on the page:** CC0 — `{{self|Cc-zero}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Own recording by the singer (Wikimedia user Membeth), released under CC0 ({{self|Cc-zero}}); the chant is anonymous medieval liturgical music, public domain.

#### Coriolan Overture, Op. 62

- **Composer:** Ludwig van Beethoven
- **Performer:** Musopen Symphony
- **Used for:** ancient, classical — war
- **Length as shipped:** 3:00 (first 3:00 of 8:19, faded)
- **File:** `coriolan.webm` (2220 kB; -18 LUFS integrated, LRA 18 LU, true peak -3.4 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Beethoven_-_Coriolan_Overture%2C_Op._62_%28Musopen_Symphony%29.flac>
- **Licence as stated on the page:** Public domain — `{{Copyright information |recording={{PD-author|[https://musopen.org/ Musopen]}} |musical composition={{PD-old-auto-expired|deathyear=1827}} }}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Recording commissioned by Musopen and released by Musopen into the public domain ({{PD-author|Musopen}}); composition public domain (Beethoven d. 1827).

### Classical (medieval) era

#### Breves dies hominis (conductus, Notre-Dame school)

- **Composer:** Léonin or Pérotin
- **Performer:** Makemi (voice)
- **Used for:** classical — peace
- **Length as shipped:** 3:32
- **File:** `breves-dies.webm` (2709 kB; -18.2 LUFS integrated, LRA 19 LU, true peak -2 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Breves_dies_hominis.ogg>
- **Licence as stated on the page:** Public domain — `{{PD-self}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Performed live and recorded by the uploader (Wikimedia user Makemi), released into the public domain ({{PD-self}}); composition 12th–13th century, public domain.

#### Veni Sancte Spiritus (sequence for Pentecost)

- **Composer:** Gregorian chant (anonymous)
- **Performer:** Membeth (voice)
- **Used for:** classical — peace
- **Length as shipped:** 2:37
- **File:** `veni-sancte.webm` (1902 kB; -18.1 LUFS integrated, LRA 16.9 LU, true peak -2.1 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Veni.sancte.spiritus.ogg>
- **Licence as stated on the page:** Public domain — `{{PD-self}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Own recording by the singer (Wikimedia user Membeth), released into the public domain ({{PD-self}}); 13th-century sequence, public domain.

#### Dies irae (sequence of the Requiem)

- **Composer:** Gregorian chant (anonymous)
- **Performer:** Membeth (voice)
- **Used for:** classical — war
- **Length as shipped:** 3:00 (first 3:00 of 7:14, faded)
- **File:** `dies-irae.webm` (2156 kB; -18.2 LUFS integrated, LRA 15.6 LU, true peak -1.8 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Dies.irae.ogg>
- **Licence as stated on the page:** Public domain — `{{PD-self}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Own recording by the singer (Wikimedia user Membeth), released into the public domain ({{PD-self}}); 13th-century sequence, public domain.

### Early modern era

#### Ave verum corpus

- **Composer:** William Byrd
- **Performer:** Stile Antico
- **Used for:** earlyModern — peace
- **Length as shipped:** 4:18
- **File:** `byrd-ave-verum.webm` (3310 kB; -18 LUFS integrated, LRA 14.3 LU, true peak -2.2 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Byrd_-_Ave_Verum_Corpus_%28Stile_Antico%29.ogg>
- **Licence as stated on the page:** CC0 — `{{cc-zero}} {{LicenseReview}} {{ArrangedLicenseReview|site=Vimeo|archive=http://web.archive.org/web/20191002192741/https://vimeo.com/stpaulsindy|type=audio}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Published on Vimeo by St. Paul's Episcopal Church, Indianapolis (StPaulsIndy) under CC0; the CC0 licence was verified on the Vimeo page by a Commons licence reviewer ({{cc-zero}} {{LicenseReview}}); composition public domain (Byrd d. 1623).

#### Oboe Concerto in D minor, Op. 9 No. 2: II. Adagio

- **Composer:** Tomaso Albinoni
- **Performer:** Paul Arden-Taylor (oboe)
- **Used for:** earlyModern — peace
- **Length as shipped:** 4:18
- **File:** `albinoni-adagio.webm` (3553 kB; -18 LUFS integrated, LRA 7.7 LU, true peak -2.1 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Albinoni%2C_Concerto_for_Oboe_and_Strings_No._2_in_D_minor%2C_Op._9%2C_II._Adagio.ogg>
- **Licence as stated on the page:** CC0 — `{{Cc-zero}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Musopen recording released under CC0 ({{Cc-zero}}); composition public domain (Albinoni d. 1751).

#### Water Music: Sarabande (Suite No. 3 in G, HWV 350)

- **Composer:** George Frideric Handel
- **Performer:** Marine Chamber Orchestra, "The President's Own" United States Marine Band (Maj Michelle Rakers)
- **Used for:** earlyModern — peace
- **Length as shipped:** 2:47
- **File:** `water-music-sarabande.webm` (2292 kB; -18 LUFS integrated, LRA 10.4 LU, true peak -2.3 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Handel%27s_Water_Music_-_16._Sarabande_-_Chamber_Orchestra_-_United_States_Marine_Band.opus>
- **Licence as stated on the page:** Public domain — `;Composition{{PD-old-auto-expired|deathyear=1759}} ;Performance and recording{{PD-USGov-Military-Marines}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Performance and recording by a US Marine Corps band: a work of the US federal government, public domain ({{PD-USGov-Military-Marines}}); composition public domain (Handel d. 1759).

#### The Four Seasons, Summer, RV 315: III. Presto

- **Composer:** Antonio Vivaldi
- **Performer:** The Modena Chamber Orchestra
- **Used for:** earlyModern — war
- **Length as shipped:** 2:57
- **File:** `vivaldi-summer-presto.webm` (2276 kB; -18 LUFS integrated, LRA 7.1 LU, true peak -2.4 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:The_Modena_Chamber_Orchestra_-_Vivaldi%27s_Summer%2C_RV_315_-_III._Presto.ogg>
- **Licence as stated on the page:** Public domain (marked by the owner) — `{{PDMark-owner}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Musopen recording marked as public domain by its owner ({{PDMark-owner}}); composition public domain (Vivaldi d. 1741).

### Industrial era

#### String Quartet in D, Op. 64 No. 5 "The Lark": II. Adagio cantabile

- **Composer:** Joseph Haydn
- **Performer:** Musopen String Quartet
- **Used for:** industrial — peace
- **Length as shipped:** 4:50
- **File:** `haydn-lark-adagio.webm` (3920 kB; -18 LUFS integrated, LRA 9 LU, true peak -2.1 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Haydn_-_String_Quartet%2C_Op._64_No._5_in_D_major_%27The_Lark%27_-_II._Adagio._Cantabile_%28Musopen_String_Quartet%29.flac>
- **Licence as stated on the page:** Public domain — `{{Copyright information |recording={{PD-author|[https://musopen.org/ Musopen]}} |musical composition={{PD-old-auto-expired|deathyear=1809}} }}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Recording commissioned by Musopen and released by Musopen into the public domain ({{PD-author|Musopen}}); composition public domain (Haydn d. 1809).

#### From Holberg's Time, Op. 40: IV. Air

- **Composer:** Edvard Grieg
- **Performer:** Marine Chamber Orchestra, "The President's Own" United States Marine Band (Maj Jason K. Fettig)
- **Used for:** industrial — peace
- **Length as shipped:** 5:17
- **File:** `holberg-air.webm` (3993 kB; -18 LUFS integrated, LRA 16.3 LU, true peak -2.1 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Grieg%27s_Suite_for_Strings%2C_Op._40%2C_%22From_Holberg%E2%80%99s_Time%22_-_IV._Air_-_Chamber_Orchestra_-_United_States_Marine_Band.mp3>
- **Licence as stated on the page:** Public domain — `;Composition{{PD-old-auto-expired|deathyear=1907}} ;Performance and Recording{{PD-USGov-Military-Marines}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Performance and recording by a US Marine Corps band: a work of the US federal government, public domain ({{PD-USGov-Military-Marines}}); composition public domain (Grieg d. 1907).

#### Tragic Overture, Op. 81

- **Composer:** Johannes Brahms
- **Performer:** Musopen Symphony
- **Used for:** industrial — war
- **Length as shipped:** 3:00 (first 3:00 of 13:50, faded)
- **File:** `brahms-tragic.webm` (2293 kB; -18 LUFS integrated, LRA 14.7 LU, true peak -2 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Brahms_-_Tragic_Overture%2C_Op._81_%28Musopen_Symphony%29.flac>
- **Licence as stated on the page:** Public domain — `{{Copyright information |recording={{PD-author|[https://musopen.org/ Musopen]}} |musical composition={{PD-old-auto-expired|deathyear=1897}} }}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Recording commissioned by Musopen and released by Musopen into the public domain ({{PD-author|Musopen}}); composition public domain (Brahms d. 1897).

### Modern (information) era

#### Serenade for Strings in E minor, Op. 20: II. Larghetto

- **Composer:** Edward Elgar
- **Performer:** United States Army Strings
- **Used for:** modern — peace
- **Length as shipped:** 5:52 (the second movement (3:25–9:17) of the file, which holds the whole serenade)
- **File:** `elgar-serenade.webm` (4464 kB; -18.2 LUFS integrated, LRA 18 LU, true peak -1.8 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Serenade_for_Strings_-mvt-1-_Elgar.ogg>
- **Licence as stated on the page:** Public domain — `;Performance {{PD-USGov-Military-Army}} ;Composition {{PD-old-auto-1923|deathyear=1934}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Performance and recording by a US Army band: a work of the US federal government, public domain ({{PD-USGov-Military-Army}}); composition public domain in the US (published 1893) and in the EU and UK (Elgar d. 1934).

#### First Suite in E-flat for Military Band, Op. 28 No. 1: I. Chaconne

- **Composer:** Gustav Holst
- **Performer:** United States Air Force Heritage of America Band, Concert Band
- **Used for:** modern — peace
- **Length as shipped:** 4:30
- **File:** `holst-chaconne.webm` (3713 kB; -18.1 LUFS integrated, LRA 21 LU, true peak -1.9 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:First_Suite_in_E-flat_for_Military_Band_-_I._Chaconne_-_Concert_Band_-_United_States_Air_Force_Heritage_of_America_Band.mp3>
- **Licence as stated on the page:** Public domain — `;Composition{{PD-old-auto-expired|deathyear=1934}} ;Performance{{PD-USGov-Military-Air Force}} ;Recording{{PD-USGov-Military-Air Force}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Performance and recording by a US Air Force band: a work of the US federal government, public domain ({{PD-USGov-Military-Air Force}}); composition public domain in the US (published 1921) and in the EU and UK (Holst d. 1934).

#### Symphony No. 6 in B minor, Op. 74 "Pathétique": III. Allegro molto vivace

- **Composer:** Pyotr Ilyich Tchaikovsky
- **Performer:** Musopen Symphony
- **Used for:** modern, space — war
- **Length as shipped:** 4:10 (closing 4:10 of 9:53 (the march to its end), faded in)
- **File:** `pathetique-march.webm` (2928 kB; -18 LUFS integrated, LRA 7.7 LU, true peak -1.8 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Tchaikovsky_-_Symphony_No._6_in_B_minor%2C_Op._74_%27Path%C3%A9tique%27_-_III._Allegro_molto_vivace_%28Musopen_Symphony%29.flac>
- **Licence as stated on the page:** Public domain — `{{Copyright information |recording={{PD-author|[https://musopen.org/ Musopen]}} |musical composition={{PD-old-auto-expired|deathyear=1893}} }}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Recording commissioned by Musopen and released by Musopen into the public domain ({{PD-author|Musopen}}); composition public domain (Tchaikovsky d. 1893).

### Space (jump) age

#### Nun komm, der Heiden Heiland, BWV 659 (arranged for piano by Busoni)

- **Composer:** Johann Sebastian Bach, arr. Ferruccio Busoni
- **Performer:** Membeth (piano)
- **Used for:** space — peace
- **Length as shipped:** 4:38
- **File:** `bach-busoni-nun-komm.webm` (3999 kB; -18 LUFS integrated, LRA 11.5 LU, true peak -2.1 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Bach.Busoni.Nun.komm.der.Heiden.Heiland.BWV.659.mitteltoenig.ogg>
- **Licence as stated on the page:** Public domain — `{{PD-self}}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Own recording by the pianist (Wikimedia user Membeth), released into the public domain ({{PD-self}}, also marked {{cc-zero}}); composition public domain (Bach d. 1750; Busoni's transcription published 1907–09, Busoni d. 1924).

#### String Quartet No. 6 in F minor, Op. 80: I. Allegro vivace assai

- **Composer:** Felix Mendelssohn
- **Performer:** Musopen String Quartet
- **Used for:** space — war
- **Length as shipped:** 3:00 (first 3:00 of 7:42, faded)
- **File:** `mendelssohn-quartet-6.webm` (2320 kB; -18 LUFS integrated, LRA 8.7 LU, true peak -1.9 dBTP)
- **Source (file page):** <https://commons.wikimedia.org/wiki/File:Mendelssohn_-_String_Quartet_No._6_in_F_minor%2C_Op._80_-_I._Allegro_vivace_assai_%28Musopen_String_Quartet%29.flac>
- **Licence as stated on the page:** Public domain — `{{Copyright information |recording={{PD-author|[https://musopen.org/ Musopen]}} |musical composition={{PD-old-auto-expired|deathyear=1847}} }}`
- **Retrieved:** 2026-11-10
- **Why the recording is public domain / CC0:** Recording commissioned by Musopen and released by Musopen into the public domain ({{PD-author|Musopen}}); composition public domain (Mendelssohn d. 1847).

## Considered and not used

Licence problems (not shipped):

- **Holst, *The Planets*: "Neptune" and "Saturn", "The President's Own" US Marine Band** (Commons, `{{PD-USMC}}`). The recording is a US government work, but it is a wind-band *transcription*. The band's February 2016 programme credits Merlin Patterson's transcription (a living arranger) at least for "Mars", and who transcribed the other movements could not be confirmed. A modern arrangement is very likely under copyright, so the music as heard is not clearly public domain.
- **Palestrina, *Missa Papae Marcelli*** (Commons, tagged `{{cc-zero}}`, author "European Archive Music"), and every other "European Archive" file (`{{PD-EU-audio}}`): LP-era recordings that were public domain in the EU under the old 50-year term; the CC0 tag does not come from the performers, and in the United States such pre-1972 recordings stay protected (Music Modernization Act) for decades. Unclear provenance.
- **Epitaph of Seikilos** (Commons, the only full performance found): CC BY-SA 2.5. No public-domain or CC0 recording of the oldest complete notated song was found; the CC0 Hurrian hymn file is a 36-second chord sketch.
- **Hildegard of Bingen, "O frondens virga"** (Makemi): the performance is GFDL / CC BY-SA.
- **Debussy, *Syrinx*** (Sarah Bassingthwaite): CC BY-SA 2.0 / EFF Open Audio License.
- **Satie, *Gnossiennes*** (La Pianista, CC BY-SA 3.0 / GFDL) and ***Gymnopédies*** (Michael Laucke, CC BY-SA 4.0).
- **Debussy, *Clair de lune*** ("1905, piano solo", taken from YouTube; the page licenses only the composition) and *Clair de lune* (CC BY 3.0).
- **Gregorian chant** by Schola Gregoriana and others (CC BY-SA) and Kevin MacLeod's "Gregorian Chant" (CC BY).
- ***Shen khar venakhi*** (Georgian hymn, `{{pd-self}}`): the uploader "donated" a file he says belongs to him without naming the performers; provenance unclear.
- **Vaughan Williams, *Fantasia on a Theme by Thomas Tallis*** (US Army Band): the recording is public domain but the composition is under copyright in the EU and UK until the end of 2028 (Vaughan Williams d. 1958). Sibelius (d. 1957) was avoided for the same reason.

Licence fine, not used:

- Holst's own 1922–23 acoustic recording of *The Planets* (`{{PD-US-record-expired}}`): too poor in sound.
- MIDI renderings of Machaut, Pérotin, Dunstable and Senleches (Tetraktys, `{{PD-self}}`) and a sampled-piano rendering of Debussy's *Children's Corner* (`{{PD-self}}`): synthesized, not performances.
- Elgar, *Pomp and Circumstance* (US Army and Marine bands): too familiar.
- Satie, *Gymnopédies* Nos. 1 and 3 (Teknopazzo, CC0); Holst, Second Suite in F, "Song Without Words" (US Air Force Heritage of America Band); Debussy, *Danse profane* (US Marine Chamber Orchestra); Dvořák, "American" Quartet, Lento (Musopen); *Cantigas de Santa Maria* No. 100 (Makemi); Bach, Goldberg Aria (Shelley Katz, CC0) and *Air* (US Air Force Strings): all verified, left out only to keep the music within its 60 MB budget.

## Jurisdiction and other risks

- **US government works** (the Marine, Army and Air Force band recordings) are public domain in the United States (17 U.S.C. § 105). Elsewhere the US government may in principle assert copyright in its works; it does not do so for these band recordings, which the bands publish as public domain, and Wikimedia Commons accepts them as such.
- **Self-published dedications** (`{{PD-self}}`, CC0 by Wikimedia users Membeth and Makemi; Musopen's `{{PD-author}}`) rest on the uploader's statement that they made the recording. Where a public-domain dedication is not legally possible, both the PD-self template and CC0 grant an unconditional licence instead.
- **Vivaldi, *Summer*: Presto** carries the Public Domain Mark applied by its owner (Musopen) rather than a CC0 waiver; the mark states the owner's intent to release it but is not a formal waiver. **Byrd, *Ave verum corpus*** is CC0 as published on Vimeo by St. Paul's Episcopal Church, Indianapolis, verified by a Commons licence reviewer; the church's right to waive for the visiting ensemble is assumed, not documented. Both are flagged here; if either is ever questioned, delete its entry from `tracks.json` and its file, and the game plays the composed score or another recording in its place.
- **Compositions**: every composer here died before 1935, so each work is public domain in the EU and UK (life + 70) and was published before 1931, so public domain in the United States. Busoni (d. 1924) is the latest arranger.
