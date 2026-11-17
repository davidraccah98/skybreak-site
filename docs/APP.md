# Skybreak: com'è fatta l'app

Il piano dell'app, approvato dal fondatore il 14 novembre 2026: aree, pagine, account, regole, aspetto e mockup. Su questo file si costruisce il frontend del mockup, che poi diventerà l'app vera. Le regole di dettaglio restano in [CONTEST.md](CONTEST.md) (contest), [SFIDE.md](SFIDE.md) (calcolo delle sfide), [REGOLE.md](REGOLE.md) (testo pubblico), [DATA-MODEL.md](DATA-MODEL.md) (dati) e [RIOT.md](RIOT.md) (policy). I nomi delle pagine sono in inglese, come sul sito; gli schemi sono indicativi, i numeri sono esempi.

## 0. L'idea

Skybreak giudica le tue partite classificate in solitaria rispetto al giocatore medio del tuo tier, con lo stesso campione e lo stesso ruolo. Le sfide e le soglie sono le stesse in tutta l'app. Due aree di pari importanza:

| | **Area personale** (gratuita) | **Area contest** (a premi) |
|---|---|---|
| A cosa serve | capire come giochi, allenarti, migliorare | competere per premi in denaro |
| Pagine | Home, Intelligence, Training | Lobby, Join, My contests, Contest, Wallet |
| Iscrizione | blocchi la coppia campione e ruolo | blocchi la coppia e 3 sfide scelte da te |
| Giudizio | tutte le sfide della coppia | le 3 sfide scelte |
| Classifica | contest di miglioramento da 20, gratuito | contest da 20, ticket da 2, 5 o 10 €, 80% ai premi |
| Account | base | verificato |
| Aspetto | cielo e luce; dati puliti | notte e oro: l'arena |

Il ciclo: ti alleni nell'area personale, capisci in cosa sei forte e poi scegli le tue 3 sfide nei contest. Le sfide sono le stesse, quindi quello che impari vale subito.

## 1. Principi

1. Conta solo la tua prestazione, misurata sul tuo tier. Non si punta mai sul risultato di altri.
2. Durante la partita non si mostra niente.
3. Gli altri giocatori vedono solo il tuo Riot ID.
4. Nessun rating permanente e niente MMR. Nei testi si scrive "rank tier", mai "elo".
5. Skybreak mostra i dati e non sceglie per te: niente sfide precompilate, niente "ti consigliamo queste".
6. Vengono analizzate solo le partite che iscrivi.
7. Le regole stanno in una sola pagina, e ogni schermata ha il link alla sezione che la riguarda.
8. Il mockup dice sempre cosa è vero e cosa è simulato.

## 2. Mappa del sito

```
PUBBLICO
  /                    Landing
  #/signin             Sign in
  #/signup             Create account  →  Link Riot account
  #/rules[/sezione]    Rules

AREA PERSONALE  (account base)
  #/home               Home
  #/intel              Intelligence ── You | Explore
  #/train              Training ── Sign-ups | Games | Improvement | Milestones
  #/train/new          Nuova iscrizione
  #/train/game/{id}    Report di una partita
  #/train/contest/{id} Classifica di un contest di miglioramento

AREA CONTEST  (con l'account base si guarda, per giocare serve il verificato)
  #/contests           Lobby
  #/join/{ticket}      Join: coppia → 3 sfide → blocco
  #/mine               My contests ── Waiting | In progress | Finished
  #/contest/{id}       Classifica
  #/wallet             Wallet
  #/verify             Verifica identità

COMUNI
  #/account            Account
  #/support            Supporto
```

## 3. Intestazione e barra del mockup

```
┌─────────────────────────────────────────────────────────────────┐
│ DEMO · real games, invented names · players, clock and money    │
│ are simulated                           [Riot reviewer guide]   │
├─────────────────────────────────────────────────────────────────┤
│ SKYBREAK  [ Personal | Contests ]  Home  Intelligence  Training │
│                                     [Check my games]   (L) ▾    │
└─────────────────────────────────────────────────────────────────┘
area contest:
│ SKYBREAK  [ Personal | Contests ]  Lobby  My contests  Wallet   │
│                            [Check my games]   20.00 €   (L) ▾   │
```

- Lo switch delle aree è sempre visibile. Nell'area contest diventa oro.
- **Check my games** è uno solo per tutte e due le aree.
- Il menu dell'avatar (L) contiene Account, Rules, Support e Sign out.
- Sul telefono lo switch resta in alto e le voci dell'area vanno in una barra in basso.

## 4. Account

### Livelli

| | **Base** | **Verificato** |
|---|---|---|
| Cosa puoi fare | tutta l'area personale; guardare lobby e classifiche dei contest | in più: contest a premi, wallet, usare i punti (coaching e il resto) |
| Cosa chiede | email, password, paese, regole accettate, account Riot con Riot Sign On | in più: nome, cognome, data di nascita, indirizzo, documento |

### Regole

- Una persona ha un solo account Skybreak e un solo account Riot.
- **L'account Riot collegato non si cambia mai.**
- Skybreak non chiede mai la password di Riot.
- **Fair play:** tolleranza zero, gli abusi vengono puniti direttamente. Niente smurf, niente account condivisi o giocati da altri. Il ban è della persona, non dell'account di gioco.
- Puoi scaricare i tuoi dati e chiedere la cancellazione. Prima devi prelevare il saldo e aspettare che si chiudano i contest aperti.
- Età minima e durata di conservazione dei dati: le decide il legale.

### Create account → Link Riot

```
┌──────────────── Create your account ────────────────┐
│ Email      [                         ]              │
│ Password   [                         ]              │
│ Country    [ Italy                 ▾ ]              │
│ [ ] I accept the rules (v1)  → Rules                │
│ [ ] Send me news (optional)                         │
│                  [Create account]   skip (demo)     │
└─────────────────────────────────────────────────────┘
┌──────────────── Link your Riot account ─────────────┐
│ We read your Riot ID, region, rank tier and your    │
│ ranked solo games. Never your password, nothing     │
│ during the game.        [Sign in with Riot]         │
│ Your Riot account can never be changed later.       │
└─────────────────────────────────────────────────────┘
```

### Sign in (nel mockup)

```
┌──────────────── Sign in ────────────────────────────┐
│ Demo: pick an account (real EUW games, invented     │
│ names)                                              │
│ ┌ Lumen ───┐ ┌ Hookline ┐ ┌ Wildthorn ┐ ┌ Steelwind┐ │
│ │ Gold Mid │ │ Plat Sup │ │ Emer Jng  │ │ Dia Top  │ │
│ └──────────┘ └──────────┘ └───────────┘ └──────────┘ │
│ ┌ Rocketeer ┐                                       │
│ │ Master Bot│                                       │
│ └───────────┘                                       │
└─────────────────────────────────────────────────────┘
```

### Verify

```
┌──────────────── Verify your identity ───────────────┐
│ Prizes are real money: we need to know who you are. │
│ Also needed to use points. No other player ever     │
│ sees this data.                                     │
│ First name [      ]   Last name [      ]            │
│ Date of birth [  /  /    ]                          │
│ Address [                 ] City [      ] ZIP [   ] │
│ Document  (•) ID card  ( ) Passport  ( ) Licence    │
│              [Send to verification]   skip (demo)   │
│ Status: Not verified · Pending · Verified · Rejected │
└─────────────────────────────────────────────────────┘
```

### Account

```
Riot ID     Lumen#EUW · Gold II · EUW      (can't be changed)
Account     Base  [Verify]
Email / Password / Language / News
[Download my data]   [Delete account]
demo: [Reset demo]   [Sign out]
```

## 5. Area personale

### Home

```
Welcome, Lumen#EUW                          Gold II · Mid main
┌ HOW YOU'RE PLAYING ─────────────────────────────────────────┐
│ Fizz Mid   W  31'   8 of 11 challenges above your tier      │
│ Fizz Mid   L  27'   4 of 11                                 │
│ Ahri Mid   W  29'   7 of 12                                 │
│                                       [Open Intelligence →] │
└─────────────────────────────────────────────────────────────┘
┌ HOW YOU'RE IMPROVING ───────────────────────────────────────┐
│ Improvement contest #14 · 6th · 13/20 games                 │
│ Milestone: Fizz Mid · Hunter medium · 2 of 5  ▓▓░░░         │
│                                          [Open Training →]  │
└─────────────────────────────────────────────────────────────┘
┌ WHERE TO COMPETE ─────────────────────────────────── (oro) ─┐
│ Wallet 20.00 € · 2 sign-ups waiting · #212 5 € 4th, 14/20   │
│ [2 €]  [5 €]  [10 €]                    [Go to Contests →]  │
└─────────────────────────────────────────────────────────────┘
```

Su un account nuovo i blocchi sono vuoti e c'è un solo invito: **"Sign up your next game"**, che porta al Training.

### Intelligence: You

Si basa solo sulle tue partite iscritte, sia di training sia di contest.

```
Intelligence   [You]  Explore
Pair [ Fizz Mid ▾ ]   based on 37 signed-up games
                 below your tier │ above your tier   last 10
Golden           ░░░░░░░░░░░░░░░░│▓▓▓▓▓▓       +12   ▁▃▅▆▇
Hunter                           │▓▓▓▓▓▓▓▓▓▓   +18   ▃▅▅▇▇
Visionary       ░░░░░░░░░░░░░░░░░│             −15   ▅▃▂▂▁
Few deaths               ░░░░░░░░│              −6   ▃▃▄▃▂
...
┌ Strengths ───────────┐ ┌ To work on ──────────────────────┐
│ Hunter, Golden       │ │ Visionary: tip for Gold players  │
└──────────────────────┘ └──────────────────────────────────┘
In contests you would make:
Golden     easy 70% · medium 41% · hard 12%
Hunter     easy 78% · medium 52% · hard 20%     (dati < 5: "few data")
```

### Intelligence: Explore

Dati di tutti i giocatori, non tuoi.

```
Intelligence   You  [Explore]
Champion [Ahri ▾]  Role [Mid ▾]  Tier [Emerald ▾]
Challenge    Easy    Medium   Hard    Typical   Games
Golden       19%     22%      26%     20%       4,210
Hunter       21%     26%      31%     22%       4,210
...
Not offered for this pair: Split pusher, Duelist
(they don't pass the fairness tests → Rules §4)
Data: ranked solo EUW, period, all patches
```

### Training: iscrizione

È la stessa meccanica dei contest, senza sfide da scegliere.

```
New training sign-up
Your pairs: [Fizz Mid 37] [Ahri Mid 12]
  ◀  Ahri   Akali  ( FIZZ )  Galio   Katarina  ▶
Role  [Top] [Jungle] [Mid] [Bot] [Support]
All 11 challenges of Fizz Mid will be judged:
the same challenges and thresholds as in contests.
· First ranked solo game with Fizz Mid after locking  → rule
· Unplayed sign-ups are removed at the end of the day → rule
                                       [Lock Fizz Mid]
```

### Training: schede

```
Training   [Sign-ups]  Games  Improvement  Milestones
Sign-ups
  Fizz Mid   locked 18:02   waiting                  [Unlock]
  Ahri Mid   locked 18:05   waiting                  [Unlock]
                                         [+ New sign-up]
Games      → lista delle partite, ognuna apre il suo report
Improvement→ i tuoi contest di miglioramento (aperti e finiti)
Milestones → i tuoi obiettivi
```

### Report di una partita

```
Fizz Mid · Win · 31 min · 12 Nov 21:40 · Improvement contest #14
IMPROVEMENT
  vs your tier  +8   vs your Fizz  +5   vs your Mid  +3   vs your Fizz Mid  +6
Challenge    You    Tier avg  Position  vs your Fizz Mid  Contest level
Golden       24%    20%       71/100    ▲                 medium ✓
Hunter       31%    22%       84/100    ▲                 hard ✓
Visionary    0.8    1.4       22/100    ▼                 —
...
```

### Contest di miglioramento

Gratuito, 20 posti, aperto a tutti i tier, perché ognuno è misurato sul proprio.

```
Improvement contest #14 · Open 13/20 · free
#   Riot ID           Pair            Improvement
1   Kestrel#EUW       Lux Support     +14
2   Morrow#EUW        Viego Jungle    +11
...
6   Lumen#EUW (you)   Fizz Mid        +6
```

**Il miglioramento** mette insieme due confronti:
- **tu contro la media** dei giocatori del tuo tier con quella coppia;
- **tu contro le tue partite di miglioramento precedenti**, sullo stesso campione, sullo stesso ruolo e sulla stessa coppia.

La formula si costruisce dopo. Nel mockup i numeri di miglioramento sono dimostrativi. Il numero vale solo dentro il contest e non resta sul profilo.

### Milestone

```
Milestones                                   [+ New milestone]
Fizz Mid · Hunter · medium · 5 times    2 of 5   ▓▓░░░
New: pick a pair, a challenge and a level you usually miss
(lista ordinata dalle sfide in cui riesci meno), how many times.
```

Per ora niente punti: sono solo obiettivi.

## 6. Area contest

### Lobby

```
┌ WALLET ─────────────────────────────────────────────────────┐
│ 20.00 €                [Deposit] [Withdraw]   Movements →   │
└─────────────────────────────────────────────────────────────┘
⚠ Verify your identity to play for prizes            [Verify]
┌ 2 € ─────────────┐ ┌ 5 € ─────────────┐ ┌ 10 € ────────────┐
│ 20 players       │ │ 20 players       │ │ 20 players       │
│ Prize pool 32 €  │ │ Prize pool 80 €  │ │ Prize pool 160 € │
│ 1st place 4 €    │ │ 1st place 10 €   │ │ 1st place 20 €   │
│ 3 open · 17/20   │ │ 2 open · 14/20   │ │ 1 open · 6/20    │
│ You: 1 waiting   │ │ You: —           │ │ You: —           │
│ [Join]           │ │ [Join]           │ │ [Join]           │
└──────────────────┘ └──────────────────┘ └──────────────────┘
Prize table →
IN PROGRESS  #212 · 5 € · 14/20 · you 4th                  →
WAITING      Fizz Mid · 2 € · locked 18:02             [Unlock]
Zero tolerance: abuse is punished directly. No smurfs, no
shared accounts. Bans are on the person, not the game account.
HOW IT WORKS  1 Lock → 2 Play → 3 Check → 4 Leaderboard   → rules
```

### Join

```
Join a 5 € contest                          ① Pair ② Challenges ③ Lock
① PAIR
  Your pairs: [Fizz Mid 37] [Ahri Mid 12] [Zed Mid 8]
  ◀  Ahri   Akali  ( FIZZ )  Galio   Katarina  ▶   Role [Mid]
② CHALLENGES
  [ 1 · empty ]   [ 2 · empty ]   [ 3 · empty ]
  ┌ Golden · gold share at 20 min ───────────────────────────┐
  │ Easy 19% · 10 pts  Medium 22% · 20 pts  Hard 26% · 30 pts│
  │ You: easy 70% · medium 41% · hard 12%   (37 games)       │
  └──────────────────────────────────────────────────────────┘
  ┌ Hunter · kill share ... ┐  ...
═════════════════════════════════════════════════ fissa in basso
  Fizz Mid · Golden M · Hunter H · Visionary E · max 60 pts
  Ticket 5 € · nothing is charged now                [Lock]
  First game after locking · no changes after locking ·
  unlock takes 1 hour  → rules
```

Niente è precompilato. Se l'account non è verificato, Join porta a Verify.

### My contests

```
My contests   [Waiting]  In progress  Finished
Waiting
  Fizz Mid · 5 € · Golden M, Hunter H, Visionary E    [Unlock]
  Ahri Mid · 2 € · unlocking until 19:40
In progress
  #212 · 5 € · 14/20 · you 4th · 42 pts                      →
Finished
  #198 · 2 € · 3rd · 51 pts · +3.00 €                         →
  #190 · 5 € · cancelled · ticket refunded
```

### Contest: classifica

```
Contest #212 · 5 € · Open 14/20 · prize pool 80 € · rules v1 →
#   Riot ID            Pts   Challenges               Prize
1   Kestrel#EUW        58    ✓H  ✓M  ✓E               10.00 €
2   Morrow#EUW         51    ✓M  ✓H  ·                 8.50 €
3   Quill#EUW          51    ✓M  ✓M  ✓E    (tie)       8.50 €
4   Lumen#EUW (you)    42    ✓M  ✓H  ✗                 6.00 €
─── ticket back ──────────────────────────────────────────────
5   ...                                                5.00 €
─── 0.8× ─────────────────────────────────────────────────────
─── no prize ─────────────────────────────────────────────────
(aprendo una riga: i valori sfida per sfida)
Finished: "Prize credited to your wallet" · 3 pts to the place above
```

Le zone premio si distinguono sempre con un'etichetta, mai solo con il colore. I pari punti dividono i premi dei posti che occupano.

### Wallet

```
Wallet · demo: play money
20.00 €                            [Deposit] [Withdraw]
Movements
  13 Nov  Prize    #198      +3.00 €
  13 Nov  Ticket   #212      −5.00 €
  12 Nov  Deposit            +20.00 €
```

## 7. Iscrizioni e check: regole comuni

Valgono identiche per il training e per i contest a premi:

- **Blocco:** salva coppia e orario, e le 3 sfide nei contest. Dopo il blocco non si cambia niente.
- **La partita:** la prima classificata in solitaria con esattamente quella coppia, iniziata dopo il blocco.
- **Fila:** più iscrizioni con la stessa coppia vanno in ordine. Ogni partita vale per un solo contest e non sei mai due volte nello stesso contest.
- **Check:** uno a fine giornata per tutti, più il pulsante Check my games.
- **A fine giornata le iscrizioni non giocate si cancellano,** sia nel training sia nei contest.
- **Sblocco:** fa subito un controllo; è rifiutato se sei in partita; diventa effettivo dopo 1 ora. Nel training serve lo stesso, così non si può nascondere una partita andata male.
- **Partite che non valgono:** remake e partite sotto i 10 minuti non valgono; il dodge non è una partita; la resa vale; le altre code non valgono.
- **Soldi (solo contest):** il ticket si toglie quando la partita entra nel contest. Le iscrizioni che il saldo non copre più vengono eliminate.
- **Contest:** 20 posti; dura finché non si riempie; se non si riempie entro il tempo massimo, viene annullato e i ticket tornano indietro.

## 8. Regole

Una pagina, con una sezione per argomento e un indirizzo per sezione:

| Sezione | Collegata da |
|---|---|
| 1 What Skybreak is | Landing, Home |
| 2 Accounts | Create account, Link Riot, Verify, Account |
| 3 Personal area: Intelligence, Training, improvement contests, milestones | Training, Home |
| 4 Challenges and scoring | Join, report partita, Explore |
| 5 Sign-ups and checks (le regole comuni) | Training, Join, My contests |
| 6 Prize contests: wallet, tickets, prizes, ties | Lobby, Contest, Wallet |
| 7 Fair play | Lobby, Join, Verify |
| 8 Your data | Account, Create account |
| 9 When rules change | Contest |
| Still open | in fondo alla pagina |

## 9. Punti (non nel mockup)

- Si vincono migliorando, non in base al posto come nei contest a premi.
- Servono per coaching e servizi futuri, come scouting e provini.
- Per usarli serve l'account verificato.
- Non diventano mai euro e non comprano ticket.

Come si guadagnano e cosa comprano si decide dopo.

## 10. Aspetto

- **Due linguaggi:**
  - **atmosfera** (cielo, luce, profondità) per la landing, la Home e la fine di un contest;
  - **tecnico** (griglia stretta, numeri allineati) per Intelligence, report e classifiche.
- **Le due aree:**
  - **personale:** blu notte con accento azzurro;
  - **contest:** più scura, con accento oro e card più pesanti.

  Cambiano i colori, non la struttura.
- **Le basi**, fissate una volta nel CSS: colori, 2 caratteri, scala dei testi, spaziature a multipli di 4, raggi degli angoli.
- **I componenti:**
  - intestazione con switch;
  - card, carosello dei campioni, slot sfida;
  - barra divergente, riga di classifica con zona premio;
  - badge di stato, stato vuoto, link alle regole.
- **Accessibilità:** contrasto sufficiente, stati mai affidati al solo colore, tutto usabile da tastiera, testi di almeno 16 px sul telefono.
- **Ogni pagina si apre allo stesso modo** (17 novembre 2026), a ogni larghezza:
  - il cielo della sua area: Home, Intelligence, Training e Regole hanno il loro, l'area contest la notte, le altre pagine personali l'alba della Home;
  - sopra c'è il titolo: occhiello, nome della pagina e una riga. Ha la stessa misura e la stessa altezza in ogni pagina, anche con il link "← indietro" sopra.
- **Il badge evocatore:** icona dell'account in un anello, con il livello sotto. È lo stesso nella barra laterale, in Home e in Account.
- **Telefono e tablet (sotto 900 px):** la barra in basso ha 5 posti uguali, icona sopra il nome, e una lineetta sopra la voce aperta. La riga demo sta su una riga.
- **Regole:** su schermo largo l'indice sta di fianco al testo e resta fermo mentre scorri. Sul telefono è una riga che scorre in orizzontale.

## 11. Guida per il revisore Riot

**Deciso il 17 novembre 2026: percorso facoltativo.** Il revisore sceglie se seguire la guida o esplorare da solo. Non c'è un tour obbligato.

- **Pagina d'ingresso:** due pulsanti, "Follow the review path · 6 stops, about 3 minutes" (il principale) ed "Explore on your own".
- **La barra del percorso:** sta in basso a destra; sul telefono e sul tablet sta sopra la barra di navigazione. Non copre la pagina. Ogni tappa ha:
  - il numero della tappa;
  - un titolo;
  - una frase su cosa guardare;
  - i pulsanti ← Back e "Next: …".

  Si può rimpicciolire (▾) o chiudere (×). Se il revisore va su un'altra pagina, compare "Back to stop N". "Overview for Riot", nella riga demo, riporta sempre alla pagina d'ingresso.
- **Le 6 tappe, sulle schermate vere:**
  1. Home: partite lette a fine gioco, niente durante la partita.
  2. Il report di una partita in Training: confronto con il proprio tier, niente MMR.
  3. Intelligence.
  4. Il training contest gratuito: punti solo guadagnati.
  5. I contest a premi: il ticket per partecipare, i premi ai primi 14, gli ultimi 6 non vincono niente.
  6. Un contest finito: la classifica, solo Riot ID, cosa è simulato.

  L'ultima tappa porta alle Regole.

## 12. Il mockup

- **Vero:**
  - le soglie, calcolate su 121.585 partite;
  - la correzione per tier;
  - i 5 account con le loro partite vere e i valori delle sfide.
- **Simulato:**
  - gli altri giocatori;
  - l'orologio (ogni check lo manda avanti);
  - i soldi;
  - Riot Sign On e la verifica;
  - i numeri di miglioramento.
- **Non cambia:** il calcolo delle sfide, le soglie, il punteggio a finestre, le regole dei contest.
- **Le consegne**, ognuna chiusa da screenshot e dal sì del fondatore:
  1. **Struttura:** tutte le pagine di questo piano, con la grafica di oggi.
  2. **Aspetto:** le basi del CSS, i componenti, i due linguaggi, la landing.
  3. **Guida e controllo finale:** la guida per il revisore, desktop e telefono, testi.

## 13. Da decidere

| Questione | Chi |
|---|---|
| Formula del miglioramento | dopo, con i dati |
| Come si guadagnano i punti e cosa comprano | fondatore |
| Tempo massimo di un contest che non si riempie | fondatore |
| Ora del check di fine giornata e check manuali al giorno | fondatore, con i limiti della chiave Riot |
| Età minima, durata dei dati | legale |
