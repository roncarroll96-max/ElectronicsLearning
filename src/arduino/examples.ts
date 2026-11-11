/**
 * Built-in example sketches for the Arduino part: the classic first programs.
 * Until the code editor arrives (milestone 3, step 3), they're how a board
 * gets a program; afterwards they're starting points.
 */

export const BLINK_SKETCH = `// Blink: the board's own LED (pin 13) on for a second, off for a second.

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}
`;

export interface Example {
  id: string;
  name: string;
  /** What to wire for it to do something. */
  wiring: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  { id: 'blink', name: 'Blink', wiring: 'Nothing needed: the board’s own L light blinks. For a separate LED: pin 13 → 220 Ω → LED → GND.', code: BLINK_SKETCH },
  {
    id: 'button',
    name: 'Button',
    wiring: 'A push button from pin 2 to GND. The L light (pin 13) shows when it’s pressed.',
    code: `// Button: light pin 13 while a push button on pin 2 is pressed.
// INPUT_PULLUP holds pin 2 HIGH until the button connects it to GND.

void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}

void loop() {
  if (digitalRead(2) == LOW) {
    digitalWrite(13, HIGH);
  } else {
    digitalWrite(13, LOW);
  }
}
`,
  },
  {
    id: 'fade',
    name: 'Fade',
    wiring: 'Pin 9 → 220 Ω → LED → GND.',
    code: `// Fade: an LED on pin 9 slowly brightens and dims, using PWM (analogWrite).

int level = 0;
int change = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, level);
  level = level + change;
  if (level <= 0 || level >= 255) {
    change = -change;
  }
  delay(30);
}
`,
  },
  {
    id: 'analog',
    name: 'Read a voltage',
    wiring: 'A potentiometer: one end to 5V, the other to GND, the middle (wiper) to A0. Watch the numbers below.',
    code: `// Read a voltage: measure pin A0 ten times a second and print it.
// analogRead gives 0 for 0 V up to 1023 for 5 V.

void setup() {
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(A0);
  float volts = reading * 5.0 / 1023.0;
  Serial.print(reading);
  Serial.print("  = ");
  Serial.print(volts);
  Serial.println(" V");
  delay(100);
}
`,
  },
  {
    id: 'tone',
    name: 'Play notes',
    wiring: 'Pin 8 → 100 Ω → speaker → GND. Turn sound on in the top bar.',
    code: `// Play notes: a little tune on a speaker connected to pin 8.

int notes[] = { 262, 294, 330, 349, 392, 440, 494, 523 };  // C D E F G A B C

void setup() {
}

void loop() {
  for (int i = 0; i < 8; i++) {
    tone(8, notes[i], 200);
    delay(250);
  }
  delay(1000);
}
`,
  },
  {
    id: 'traffic',
    name: 'Traffic light',
    wiring: 'Three LEDs, each with a 220 Ω resistor to GND: red on pin 12, yellow on pin 11, green on pin 10.',
    code: `// Traffic light: red, red + yellow, green, yellow, and round again.

const int RED = 12;
const int YELLOW = 11;
const int GREEN = 10;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void show(int red, int yellow, int green, int ms) {
  digitalWrite(RED, red);
  digitalWrite(YELLOW, yellow);
  digitalWrite(GREEN, green);
  delay(ms);
}

void loop() {
  show(HIGH, LOW, LOW, 3000);
  show(HIGH, HIGH, LOW, 1000);
  show(LOW, LOW, HIGH, 3000);
  show(LOW, HIGH, LOW, 1000);
}
`,
  },
];

/** The example a sketch is, if it's one of them unchanged. */
export function exampleFor(sketch: string | undefined): Example | undefined {
  return EXAMPLES.find((e) => e.code === sketch);
}
