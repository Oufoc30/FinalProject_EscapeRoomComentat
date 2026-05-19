// Inclou la llibreria SPI, necessària perquè l'Arduino es pugui comunicar amb el lector NFC.
#include <SPI.h> 

// Inclou la llibreria del mòdul lector NFC MFRC522.
#include <MFRC522.h>

// Inclou la llibreria SimpleWebSerial per poder enviar dades de l'Arduino cap a l'espai digital de l'ordinador.
#include <SimpleWebSerial.h>

// Inclou la llibreria Keypad, necessària per llegir el teclat matricial.
#include <Keypad.h>

// Crea un objecte WebSerial que servirà per enviar informació cap al programa de l'ordinador.
SimpleWebSerial WebSerial;

// NFC
// Defineix el pin 10 com a pin SS/SDA del lector NFC.
#define SS_PIN 10

// Defineix el pin 9 com a pin de reset del lector NFC.
#define RST_PIN 9

// Crea l'objecte rfid utilitzant els pins definits anteriorment.
MFRC522 rfid(SS_PIN, RST_PIN);

// Keypad
// Defineix que el teclat té 4 files.
const byte ROWS = 4;

// Defineix que el teclat té 3 columnes.
const byte COLS = 3;

// Defineix la distribució de les tecles del teclat matricial.
char hexaKeys[ROWS][COLS] = {
  // Primera fila de tecles.
  {'2','3','1'},

  // Segona fila de tecles.
  {'0','#','*'},

  // Tercera fila de tecles.
  {'8','9','7'},

  // Quarta fila de tecles.
  {'5','6','4'}
};

// canviats perquè no xoquin amb el NFC
// Defineix els pins de l'Arduino connectats a les files del teclat.
byte rowPins[ROWS] = {A1, A3, A5, 2}; 

// Defineix els pins de l'Arduino connectats a les columnes del teclat.
byte colPins[COLS] = {A0, A4, A2};

// Crea l'objecte del teclat utilitzant el mapa de tecles, els pins de files, els pins de columnes i la mida del teclat.
Keypad customKeypad = Keypad(makeKeymap(hexaKeys), rowPins, colPins, ROWS, COLS);

// Control d'enviament NFC
// Guarda el moment en què es va enviar per última vegada un codi NFC.
unsigned long lastCodeSend = 0;

// Defineix cada quant temps es pot tornar a enviar el mateix UID.
const unsigned long codeSendInterval = 300; // envia UID cada 300ms, però revisa SEMPRE

// Guarda l'últim UID detectat.
String lastUID = "";

// Guarda l'últim moment en què s'ha vist una targeta NFC.
unsigned long lastCardSeen = 0;

// Defineix el temps que ha de passar sense veure cap targeta per oblidar l'últim UID.
const unsigned long forgetCardAfter = 1000;

// Funció setup: només s'executa una vegada quan s'encén o es reinicia l'Arduino.
void setup() {

  // Inicia la comunicació sèrie a 9600 bauds.
  Serial.begin(9600);

  // Inicia la comunicació SPI, necessària per al lector NFC.
  SPI.begin();

  // Inicialitza el lector NFC MFRC522.
  rfid.PCD_Init();
}

// Funció encarregada de llegir el teclat.
void readKeypad() {

  // Llegeix si s'ha premut alguna tecla del teclat.
  char customKey = customKeypad.getKey();

  // Si s'ha premut una tecla, entra dins d'aquest if.
  if (customKey) {

    // Escriu la tecla premuda pel monitor sèrie.
    Serial.println(customKey);

    // Envia la tecla premuda cap a l'espai digital amb l'etiqueta "clau".
    WebSerial.send("clau", String(customKey));
  }
}

// Funció encarregada d'obtenir l'UID de la targeta NFC.
String getUID() {

  // Crea una cadena de text buida on s'anirà construint l'UID.
  String uid = "";

  // Recorre tots els bytes que formen l'UID de la targeta NFC.
  for (byte i = 0; i < rfid.uid.size; i++) {

    // Si el byte és menor que 0x10, s'afegeix un zero al davant per mantenir el format correcte.
    if (rfid.uid.uidByte[i] < 0x10) {

      // Afegeix un zero al text de l'UID.
      uid += "0";
    }

    // Converteix el byte actual a format hexadecimal i l'afegeix a l'UID.
    uid += String(rfid.uid.uidByte[i], HEX);
  }

  // Converteix tot l'UID a majúscules.
  uid.toUpperCase();

  // Retorna l'UID complet.
  return uid;
}

// Funció loop: s'executa contínuament mentre l'Arduino està encès.
void loop() {

  // ---------- KEYPAD ----------
  // El llegim abans del NFC
  // Llegeix el teclat abans de comprovar el lector NFC.
  readKeypad();

  // ---------- NFC ----------
  // AIXÒ ES COMPROVA CONSTANTMENT.
  // No hi ha millis aquí bloquejant la lectura NFC.

  // Comprova si hi ha una nova targeta NFC present i si se'n pot llegir el número de sèrie.
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {

    // Obté l'UID de la targeta NFC detectada.
    String uid = getUID();

    // Guarda el temps actual en mil·lisegons des que l'Arduino s'ha encès.
    unsigned long now = millis();

    // Actualitza el moment en què s'ha vist l'última targeta.
    lastCardSeen = now;

    // Enviar immediatament si és una targeta diferent
    // Comprova si la targeta detectada és diferent de l'última targeta guardada.
    bool differentCard = uid != lastUID;

    // Enviar cada 300ms si és la mateixa targeta
    // Comprova si ja han passat 300 ms des de l'últim enviament del codi.
    bool timeToSendAgain = now - lastCodeSend >= codeSendInterval;

    // Si és una targeta diferent o ja ha passat prou temps, s'envia el codi.
    if (differentCard || timeToSendAgain) {

      // Escriu l'UID pel monitor sèrie.
      Serial.println(uid);

      // Envia l'UID cap a l'espai digital amb l'etiqueta "code".
      WebSerial.send("code", uid);

      // Guarda aquest UID com a últim UID detectat.
      lastUID = uid;

      // Guarda el moment actual com a últim moment d'enviament.
      lastCodeSend = now;
    }
  }

  // Si fa estona que no es veu cap targeta, oblidem l'última
  // Si hi ha un UID guardat i ha passat més d'un segon sense detectar targeta, s'oblida.
  if (lastUID != "" && millis() - lastCardSeen > forgetCardAfter) {

    // Esborra l'últim UID guardat.
    lastUID = "";
  }

  // El tornem a llegir després del NFC per millorar resposta
  // Torna a llegir el teclat després del NFC per fer que la resposta sigui més ràpida.
  readKeypad();
}