
// EXPLICACIÓ GENERAL JS: Aquest arxiu controla la lògica del joc: rep targetes NFC des de l'Arduino, mou la vista 3D, mostra pistes en popups, gestiona la introducció i comprova el codi de la caixa forta.
// / Importem la llibreria Three.js, que és la que permet crear i renderitzar l'entorn 3D de l'escape room dins del navegador.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158/build/three.module.js';
// / Es crea una connexió WebSocket local. En aquest codi, però, la interacció principal amb l'Arduino/NFC es fa amb SimpleWebSerial més avall.
const socket = new WebSocket("ws://localhost:8765");

/* =========================
   ESTAT JOC
========================= */
// / Aquesta variable indica si la partida ja ha començat. Al principi és false perquè encara estem a la pantalla d'introducció.
let gameStarted = false;
// / Aquesta variable guarda quina paret està mirant actualment el jugador dins de la sala 3D.
let currentWall = 1;

/* NFC STATE */
// / Guarda l'última targeta NFC detectada. Serveix per saber si encara és la mateixa targeta o si n'ha entrat una de nova.
let activeUID = null;
// / Desa el moment en què s'ha llegit per última vegada una targeta. Això ajuda a detectar quan la targeta ja no és davant del lector.
let lastUIDTime = 0;
 //per evitar que tanqui durant le'escriptura inicial del popup
let popupLocked = false;
//per el codi correcte
// / Aquí es defineix la combinació correcta de la caixa forta. El jugador haurà d'introduir aquests tres dígits en aquest ordre.
let safeCode = ["1", "9", "5"];   // el codi correcte
// / Array on es van guardant els dígits que introdueix el jugador quan intenta obrir la caixa forta.
let enteredCode = [];
// / Nombre d'intents disponibles per escriure correctament el codi de la caixa forta.
let attemptsLeft = 3;
// / Indica si la caixa forta ja s'ha resolt. Quan passa a true, ja no s'accepten més intents.
let safeSolved = false;
// / Indica si la introducció narrativa s'està reproduint en aquell moment.
let introPlaying = false;
// / Indica si ja es pot saltar la introducció tornant a passar la targeta d'inici pel lector.
let introCanSkip = false;

/* =========================
   THREE.JS
========================= */
// / Es crea l'escena 3D. És l'espai virtual on s'afegiran la sala, les textures i la càmera.
const scene = new THREE.Scene();

// / Es crea la càmera amb perspectiva. Aquesta càmera representa el punt de vista del jugador dins l'habitació.
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// / Col·loquem la càmera al centre de la sala perquè el jugador vegi l'espai des de dins.
camera.position.set(0, 0, 0);

// / El renderer és el motor que dibuixa la imatge 3D dins del canvas de l'HTML.
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("three")
});
// / Fem que el renderitzat ocupi tota la mida de la finestra del navegador.
renderer.setSize(window.innerWidth, window.innerHeight);

// textures
// / Aquest carregador permet importar imatges i aplicar-les com a textures a les parets de la sala.
const loader = new THREE.TextureLoader();

// / Aquí es defineixen les sis textures de la sala: dreta, esquerra, sostre, terra, davant i darrere.
const materials = [
  new THREE.MeshBasicMaterial({ map: loader.load('IMG/dreta.jpg'), side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ map: loader.load('IMG/esquerra.jpg'), side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ map: loader.load('IMG/sostre.jpg'), side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ map: loader.load('IMG/terra.jpg'), side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ map: loader.load('IMG/davant.jpg'), side: THREE.BackSide }),
  new THREE.MeshBasicMaterial({ map: loader.load('IMG/darrere.jpg'), side: THREE.BackSide })
];

// / Es configura la connexió serial amb l'Arduino. Això permet que el navegador rebi les lectures NFC enviades per la placa.
const connection = SimpleWebSerial.setupSerialConnection({
  requestAccessOnPageLoad: true,
  baudRate: 9600,
});

/* =========================
   NFC INPUT
========================= */
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció s'executa cada vegada que l'Arduino envia un codi NFC. El paràmetre uid és l'identificador de la targeta o objecte escanejat.
connection.on('code', (uid) => {
  console.log("UID:", uid);

  // Si és la mateixa targeta, només actualitzem presència.
  // NO tornem a executar el popup.
  // Això evita que la caixa forta faci reset cada 300ms.
  // COMPROVACIÓ: Si el UID rebut és el mateix que ja estava actiu, no obrim cap popup nou; només actualitzem el temps de presència.
  if (uid === activeUID) {
    lastUIDTime = Date.now();
    return;
  }

  // Targeta nova
  activeUID = uid;
  lastUIDTime = Date.now();

  // START GAME
  // COMPROVACIÓ: Si la targeta escanejada és la d'inici, s'inicia el joc o es gestiona el salt de la introducció.
  if (uid === "04B2CFA1882681") {

    // COMPROVACIÓ: Si la introducció s'està reproduint i ja es pot saltar, aquesta segona lectura de la targeta d'inici tanca la introducció.
    if (introPlaying && introCanSkip) {
      popupLocked = false;
      introPlaying = false;
      introCanSkip = false;
      hidePopup();
      return;
    }
    
    startGame();
    return;
  }
  
  // COMPROVACIÓ: Si el joc encara no ha començat, s'ignoren totes les targetes que no siguin la d'inici.
  if (!gameStarted) return;

  // PARETS
  // COMPROVACIÓ: Aquesta targeta fa mirar la paret 1. Abans es tanca qualsevol popup obert.
  if (uid === "04A3D7A1882681") { hidePopup(); mirarParet(1); currentWall = 1; return; }
  // COMPROVACIÓ: Aquesta targeta fa mirar la paret 2 i actualitza la paret activa.
  if (uid === "0433DEA1882681") { hidePopup(); mirarParet(2); currentWall = 2; return; }
  // COMPROVACIÓ: Aquesta targeta fa mirar la paret 3 i actualitza la paret activa.
  if (uid === "046BDAA1882681") { hidePopup(); mirarParet(3); currentWall = 3; return; }
  // COMPROVACIÓ: Aquesta targeta fa mirar la paret 4 i actualitza la paret activa.
  if (uid === "041CA3A1882681") { hidePopup(); mirarParet(4); currentWall = 4; return; }

  // OBJECTES PARET 4
  // COMPROVACIÓ: Si s'escaneja aquest objecte mentre el jugador mira la paret 4, es mostra el popup del llibre.
  if (uid === "07795101" && currentWall === 4) {
    showPopup({
      title: "Llibre: Misery - Stephen King",
      text: "Has trobat una pista: del llibre ha caigut una carta.<br><br> El meu número de la sort, l’u de piques.<br><br> Aquest punt de llibre deixa marcades les pàgines de les millors novel·les de les meves inspiracions: matar, dessagnar i torturar a l’estil de Stephen King.",
      img: "IMG/llibre.png"
    });
    return;
  }

  // COMPROVACIÓ: Si s'escaneja aquest objecte a la paret 4, es mostra el popup de la bola del món.
  if (uid === "E77CD401" && currentWall === 4) {
    showPopup({
      title: "Bola del Món",
      text: "A vegades fantasiejo amb portar els meus crims perfectes a altres parts del món.",
      img: "IMG/bola_del_mon.png"
    });
    return;
  }

  // PARET 1
  // COMPROVACIÓ: Si s'escaneja aquest objecte mentre es mira la paret 1, apareix el diari personal amb una pista narrativa.
  if (uid === "075CD904" && currentWall === 1) {
    showPopup({
      title: "Diari personal",
      text: "Última entrada:<br><br>Des de ben petit, llegia novel·les on les víctimes patien el pitjor dels finals; la seva por era la meva serotonina. Més d’una vegada he recreat els escenaris del crim i les tortures que tant em van captivar dels llibres. Els guardo a mà per quan necessito una mica d’inspiració. El crim que planejo ara l’he tret d’una novel·la…",
      img: "IMG/diari.png"
    });
    return;
  }

  // COMPROVACIÓ: Si s'escaneja la tassa a la paret 1, s'obre un popup amb una pista relacionada amb el temps.
  if (uid === "EABFBF2F" && currentWall === 1) {
    showPopup({
      title: "Tassa",
      text: "Estava prenent el meu te quan de sobte vaig mirar el rellotge i  vaig adonar-me que se’m feia molt tard...",
      img: "IMG/tassa.png"
    });
    return;
  }

  // COMPROVACIÓ: Si s'escaneja el retrat a la paret 1, es mostra una pista sobre els referents del personatge.
  if (uid === "49FA5E2D" && currentWall === 1) {
    showPopup({
      title: "Retrat",
      text: "Aquest és el meu retrat. M'agrada observar-me i imaginar que algun dia algú em mirarà com jo admiro als meus referents: els assassins més despietats i macabres. Res no tindria sentit sense un referent, els miro sempre abans de marxar del despatx...",
      img: "IMG/auto-retrat.png"
    });
    return;
  }

  // COMPROVACIÓ: Si s'escaneja el bolígraf a la paret 1, s'obre un popup relacionat amb la planificació dels crims.
  if (uid === "F8B1A02B" && currentWall === 1) {
    showPopup({
      title: "Bolígraf",
      text: "Abans de començar els assassinats, planejo cada pas, investigo la víctima, els seus horaris, els seus moviments, res se m’escapa…",
      img: "IMG/boli.png"
    });
    return;
  }

  // COMPROVACIÓ: Si s'escaneja la caixa forta a la paret 1, es prepara la pantalla especial per introduir el codi.
  if (uid === "EA1B7A2F" && currentWall === 1) {
    resetSafeDisplay();

    showSafeLayout();

    showPopup({
      title: "Caixa forta",
      text: `

        Dins de la caixa forta s’hi amaga la clau del joc.
        Sabràs trobar el codi per obrir-la? Observa bé els elements de l'escriptori, et portaran a altres llocs que t'ajudaran a trobar els dígits que necessites.<br><br>
        Si el títol d'Investigació Professional Secreta vols obtenir, et deixo aquí una pista: per saber l'ordre de les xifres, hauràs de resoldre l'enigma:<br><br>
        <em>Si vols sortir de la sala,<br><br>
        intuïció i enginy has de tenir.<br><br>
        Guarda bé les pistes, per trobar el camí,<br><br>
        les hauràs d’ordenar, i potser fer un pas enrere.<br><br>
        Espera, no t’atabalis si no saps l’ordre a seguir,<br><br>
        si jo el camí ja t’he dit!</em>
      `,
      img: "IMG/caixa_forta.png"
    });

    return;
  }

  // PARET 2
  // COMPROVACIÓ: Si s'escaneja el tauler mentre es mira la paret 2, es mostra una pista sobre la rutina de la víctima.
  if (uid === "D42EA91F" && currentWall === 2) {
    showPopup({
      title: "Tauler",
      text: "La meva pròxima víctima te una rutina bastant marcada. No sol desviar-se gaire sovint, està sent més difícil del que pensava dur a terme el meu macabre pla. Sempre freqüenta els mateixos llocs.",
      img: "IMG/pissarra.png"
    });
    return;
  }

  // PARET 3
  // COMPROVACIÓ: Si s'escaneja aquest objecte a la paret 3, apareix el popup dels criminals famosos.
  if (uid === "D6687A12" && currentWall === 3) {
    showPopup({
      title: "Criminal famós",
      text: "Res no tindria sentit sense un referent, un mestre, un mentor. Ells han estat sempre els meus millors amics; per a mi són un honor. Sempre puc comptar amb cadascun d'ells!",
      img: "IMG/retrats.png"
    });
    return;
  }

  // COMPROVACIÓ: Si s'escaneja el rellotge a la paret 3, es mostra una pista relacionada amb l'agulla petita.
  if (uid === "E4493F1F" && currentWall === 3) {
    showPopup({
      title: "Rellotge",
      text: "L'hora marca el camí...",
      img: "IMG/rellotge.png"
    });
    return;
  }

  // COMPROVACIÓ: Si s'escaneja el calendari a la paret 3, es mostra una pista relacionada amb el temps i la planificació.
  if (uid === "07A1CA01" && currentWall === 3) {
    showPopup({
      title: "Calendari",
      text: "365 dies a l’any, 24 hores al dia, tot aquest temps per planificar els assassinats.",
      img: "IMG/calendari.png"
    });
    return;
  }

  // RESET
  // COMPROVACIÓ: Si s'escaneja la targeta de reset, el joc torna a l'estat inicial.
  if (uid === "04C3CEA1882681") {
    resetGame();
    return;
  }
});
//test teclat
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció escolta les tecles o dígits que arriben des de l'Arduino per introduir el codi de la caixa forta.
connection.on("clau", (key) => {

  // només si la caixa forta està oberta
  // COMPROVACIÓ: Si la caixa forta no està oberta visualment, s'ignora qualsevol tecla rebuda.
  if (!document.getElementById("safe-layout").classList.contains("active")) return;

  // si ja està resolta, no fem res
  // COMPROVACIÓ: Si la caixa forta ja s'ha resolt, no cal acceptar més dígits.
  if (safeSolved) return;

  // només dígits
  // COMPROVACIÓ: Només s'accepten caràcters que siguin dígits del 0 al 9.
  if (!/^\d$/.test(key)) return;

  // COMPROVACIÓ: Si ja hi ha tres dígits introduïts, no se n'afegeixen més.
  if (enteredCode.length >= 3) return;

  enteredCode.push(key);
  updateSafeDisplay();

  // COMPROVACIÓ: Quan ja hi ha tres dígits, es comprova automàticament si el codi és correcte.
  if (enteredCode.length === 3) {
    checkSafeCode();
  }
});
/* =========================
   NFC WATCHER (OPTIMITZAT PER 700ms Arduino)
========================= */
// EXPLICACIÓ DE LA FUNCIÓ: Aquest temporitzador vigila constantment si la targeta NFC continua present o si ja s'ha retirat del lector.
setInterval(() => {
  // COMPROVACIÓ: Si no hi ha cap targeta activa, el watcher no ha de fer res.
  if (!activeUID) return;

  const now = Date.now();

  /* 👉 IMPORTANT:
     Arduino envia cada ~700ms
     -> posem marge segur de 1100ms */
  // COMPROVACIÓ: Si fa massa temps que no es rep el mateix UID, el programa interpreta que la targeta s'ha retirat.
  if (now - lastUIDTime > 900) {
    // COMPROVACIÓ: Si la targeta retirada era la d'inici i encara sona la introducció, es permet saltar-la en una lectura posterior.
    if (activeUID === "04B2CFA1882681" && introPlaying) {
    introCanSkip = true;
    }
    hidePopup();
    activeUID = null;
  }
}, 100);

/* =========================
   ROOM
========================= */
// / Es crea la geometria de l'habitació com una caixa gran. La càmera estarà dins d'aquesta caixa.
const geometry = new THREE.BoxGeometry(80, 50, 80);
// / Es construeix la sala unint la geometria de caixa amb les textures definides anteriorment.
const room = new THREE.Mesh(geometry, materials);
// / Afegim la sala a l'escena 3D perquè Three.js la pugui renderitzar.
scene.add(room);

// / Aquesta variable marca cap a quin angle ha de girar la càmera quan el jugador canvia de paret.
let targetRotationY = 0;

// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció rep el número de paret i calcula la rotació necessària de la càmera per mirar-la.
function mirarParet(num) {
  // ESTRUCTURA DE CONTROL: El switch selecciona l'angle de rotació segons la paret demanada.
  switch (num) {
    case 1: targetRotationY = 0; break;
    case 2: targetRotationY = -Math.PI / 2; break;
    case 3: targetRotationY = Math.PI; break;
    case 4: targetRotationY = Math.PI / 2; break;
  }
}

/* =========================
   POPUPS
========================= */
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció activa el format normal del popup, és a dir, imatge, títol i text en disposició simple.
function showNormalLayout() {
  document.getElementById("normal-layout").style.display = "block";
  document.getElementById("safe-layout").classList.remove("active");
}

// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció activa el format especial de la caixa forta, amb text a l'esquerra, imatge i dígits a la dreta.
function showSafeLayout() {
  document.getElementById("normal-layout").style.display = "none";
  document.getElementById("safe-layout").classList.add("active");
}
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció mostra un popup amb la informació rebuda: títol, text i imatge.
function showPopup(data) {
  const safeIsActive = document.getElementById("safe-layout").classList.contains("active");

  // COMPROVACIÓ: Si el layout actiu és el de la caixa forta, el contingut es col·loca als elements específics de la caixa forta.
  if (safeIsActive) {
    document.getElementById("safe-popup-title").innerText = data.title;
    document.getElementById("safe-popup-text").innerHTML = data.text;
    document.getElementById("safe-popup-img").src = data.img;
  // ALTERNATIVA: Si no és el layout de la caixa forta, el contingut es col·loca als elements del popup normal.
  } else {
    const img = document.getElementById("normal-popup-img");

    document.getElementById("normal-popup-title").innerText = data.title;
    document.getElementById("normal-popup-text").innerHTML = data.text;
    img.src = data.img;
    img.style.display = "block";
  }

  document.getElementById("popup").classList.add("active");
  document.getElementById("overlay").classList.add("active");
}

// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció mostra el popup especial de la introducció, pensat per escriure el text de manera progressiva.
function showPopup2(data) {
  showNormalLayout();

  document.getElementById("normal-popup-title").innerText = "";

  const img = document.getElementById("normal-popup-img");
  img.removeAttribute("src");
  img.style.display = "none";

  document.getElementById("normal-popup-text").innerHTML = data.text;

  document.getElementById("popup").classList.add("active");
  document.getElementById("overlay").classList.add("active");

  // TEMPORITZADOR: S'espera un petit moment abans d'iniciar l'efecte d'escriptura perquè el popup ja estigui carregat al DOM.
  setTimeout(() => {

    // COMPROVACIÓ: Si la introducció ja no s'està reproduint, s'atura el procés i no s'escriu més text.
    if (!introPlaying) return;
    const texts = [
      "Et trobes atrapat al despatx d’un dels assassins més buscats de tot el país. L’aire és dens i cada racó amaga secrets que esperen ser descoberts.",

      "Salutacions, soc el Mestre Superior Jordi, el teu professor d’investigació. Aquesta és l’última prova que decidirà si ets digne d’obtenir el títol d'Investigació Professional Secreta!",

      "Has de desxifrar el codi amagat per obrir la caixa forta i aconseguir la clau per escapar de l’habitació abans que sigui massa tard. En algun lloc, una nova víctima espera… i només tu pots evitar el seu destí. Res no és el que sembla, algunes pistes et conduiran a carrerons sense sortida, i d’altres, et revelaran el camí correcte. El temps corre en contra teva.",

      "Observa atentament cada objecte de la sala. L'escriptori sembla un bon lloc per començar a buscar.",
    ];

    const textElement = document.getElementById("typingText");

    let textIndex = 0;
    let charIndex = 0;

    popupLocked = true;

    // EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció interna escriu els textos de la introducció caràcter a caràcter per crear l'efecte màquina d'escriure.
    function typeWriter() {

    // COMPROVACIÓ: Si la introducció ja no s'està reproduint, s'atura el procés i no s'escriu més text.
      if (!introPlaying) return;

  const currentText = texts[textIndex];

  // COMPROVACIÓ: Si ja s'han mostrat tots els textos de la introducció, es desbloqueja el popup i es prepara el tancament.
  if (textIndex >= texts.length) {

    popupLocked = false;
    introCanSkip = false;
    introPlaying = false;

    // TEMPORITZADOR: Després d'acabar tota la introducció, es deixa una pausa curta abans de tancar el popup.
    setTimeout(() => {
      hidePopup();
    }, 2500);

    return;
  }

  // 🔥 AIXÒ ÉS EL FIX
  // COMPROVACIÓ: Quan comença un nou fragment de text, es buida el paràgraf perquè no es barregi amb l'anterior.
  if (charIndex === 0) {
    textElement.innerHTML = "";
  }

  // COMPROVACIÓ: Si encara queden caràcters per escriure, s'afegeix el següent caràcter al text visible.
  if (charIndex < currentText.length) {

    textElement.textContent += currentText.charAt(charIndex);
    charIndex++;

    setTimeout(typeWriter, 20);

  // ALTERNATIVA: Si ja s’ha escrit tot el fragment actual, es prepara el pas al text següent.
  } else {

    const wait = Math.max(1200, currentText.length * 45);

    // TEMPORITZADOR: S’espera abans de passar al següent fragment de la introducció.
    setTimeout(() => {

      textIndex++;
      charIndex = 0;

      typeWriter();

    }, wait);
  }
}

    typeWriter();

  }, 100);
}

// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció tanca el popup, treu el desenfocament de fons i torna al layout normal.
function hidePopup() {
  // COMPROVACIÓ: Si el popup està bloquejat, no es pot tancar. Això evita que la introducció es tanqui mentre s'està escrivint.
  if (popupLocked) return;
  document.getElementById("popup").classList.remove("active");
  document.getElementById("overlay").classList.remove("active");
  showNormalLayout();
  resetSafeDisplay();
}

/* =========================
   START GAME
========================= */
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció inicia la partida, amaga la pantalla inicial i llança la introducció narrativa.
function startGame() {

  // COMPROVACIÓ: Si el joc ja havia començat, no es torna a inicialitzar per evitar duplicats o errors d'estat.
  if (gameStarted) return;

  gameStarted = true;
  attemptsLeft = 3;
  introPlaying = true;
  introCanSkip = false;

  document.getElementById("intro").style.display = "none";

  showPopup2({
    text: `

<span style="
  display:flex;
  align-items:flex-start;
  justify-content:center;
  gap:5%;
  width:90%;
  margin:0 auto;
  margin-top:-10%;
  margin-bottom:-350px;
">

  <img 
    src="IMG/inici.png" 
    style="
      height:700px;
      object-fit:contain;
      flex-shrink:0;
    "
  >

  <span style="
    width:65%;
    max-width:65%;
    flex:0 0 65%;
    text-align:left;
    color:black;
    display:flex;
    flex-direction:column;
    justify-content:flex-start;
  ">

    <div style="
      min-height:320px;
      max-height:320px;
      overflow:hidden;
      width:100%;
    ">

      <p id="typingText" style="
        font-size:1.1rem;
        line-height:1.8;
        margin:0;
        white-space:pre-wrap;
        width:100%;
      "></p>

    </div>
    <p style="
      font-size:0.8rem;
      line-height:1.4;
      margin-top:18px;
      opacity:0.75;
    ">
      Saltar introducció: tornar a passar el botó d'inici pel lector
    </p>

  </span>

</span>
`,
  });
}

/* =========================
   RESET
========================= */
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció reinicia el joc i torna a mostrar la pantalla inicial.
function resetGame() {
  gameStarted = false;
  attemptsLeft = 3;
  document.getElementById("intro").style.display = "flex";
  hidePopup();
}

/* =========================
   ANIMACIÓ
========================= */
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció crea el bucle d'animació constant de Three.js i renderitza la sala contínuament.
function animate() {
  requestAnimationFrame(animate);
  camera.rotation.y += (targetRotationY - camera.rotation.y) * 0.05;
  renderer.render(scene, camera);
}
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció actualitza visualment les tres caselles de la caixa forta amb els dígits introduïts.
function updateSafeDisplay() {
  const boxes = document.querySelectorAll(".digit-box");
  // BUCLE: Recorrem cada casella de dígit i hi posem el número corresponent segons la posició.
  boxes.forEach((box, i) => {
    box.textContent = enteredCode[i] || "";
  });
}

// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció buida el codi escrit i neteja les caselles de la caixa forta.
function resetSafeDisplay() {
  enteredCode = [];
  updateSafeDisplay();
}
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció comprova si el codi escrit pel jugador coincideix amb el codi correcte de la caixa forta.
function checkSafeCode() {

  const codeWritten = enteredCode.join("");

  // TEMPORITZADOR: Aquesta acció s’executa amb retard per controlar millor el ritme visual del joc.
  setTimeout(() => {

    // COMPROVACIÓ: Si el codi escrit és igual al codi correcte, la caixa forta queda resolta i es mostra el final positiu.
    if (codeWritten === safeCode.join("")) {
      safeSolved = true;
      showFinalPopup(true);
      return;
    }

    attemptsLeft--;

    resetSafeDisplay();

    // COMPROVACIÓ: Si ja no queden intents, es mostra el final de suspens o derrota.
    if (attemptsLeft <= 0) {
      showFinalPopup(false);
      return;
    }

    // CONDICIÓ RESUMIDA: Aquest ternari adapta el missatge segons si queda un sol intent o més d'un.
    const textIntents = attemptsLeft === 1
      ? "queda 1 intent."
      : `queden ${attemptsLeft} intents.`;

    showErrorPopup(`El codi és incorrecte.<br>Et ${textIntents}`);

  }, 700);
}
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció crea un avís temporal d'error quan el jugador escriu un codi incorrecte.
function showErrorPopup(text) {
  const div = document.createElement("div");

  div.style.position = "fixed";
  div.style.top = "50%";
  div.style.left = "50%";
  div.style.transform = "translate(-50%, -50%)";
  div.style.background = "black";
  div.style.color = "white";
  div.style.padding = "30px 40px";
  div.style.borderRadius = "15px";
  div.style.zIndex = "100";
  div.style.textAlign = "center";

  div.innerHTML = `<h2>Error</h2><p>${text}</p>`;

  document.body.appendChild(div);

  setTimeout(() => div.remove(), 4000);
}
// EXPLICACIÓ DE LA FUNCIÓ: Aquesta funció mostra el missatge final del joc, diferent segons si s'ha resolt o no la caixa forta.
function showFinalPopup(success) {

  hidePopup();

  // TEMPORITZADOR: Aquesta acció s’executa amb retard per controlar millor el ritme visual del joc.
  setTimeout(() => {
    showNormalLayout();

    // ACCIÓ: Es mostra el popup final amb un títol, un text i una imatge segons el resultat de la partida.
    showPopup({
      title: success ? "Ho has aconseguit!" : "Has suspès...",
      text: success
        ? "Per la teva intel·ligència, observació i treball sota pressió, et concedim oficialment el títol d'Investigació Professional Secreta.<br><br>Aquest no és només un premi, és la prova que cap misteri és massa gran per a tu. Enhorabona!"
        : "Has esgotat tots els intents. Sense completar la missió, no has pogut obtenir el Títol d'Investigació Professional Secreta.<br><br>Però recorda: cada derrota és una pista més per al teu pròxim intent. El misteri encara t’espera.",
      img: success ? "IMG/aprovat.png" : "IMG/suspes.png"
    });

    // TEMPORITZADOR: Després d'uns segons, el joc es reinicia automàticament i es tanca el popup final.
    setTimeout(()=> {
      resetGame();
      hidePopup();
    }, 10000);
  }, 300);
}
// / Aquesta crida posa en marxa el bucle d'animació. Sense aquesta línia, la sala 3D no es renderitzaria contínuament.
animate();
