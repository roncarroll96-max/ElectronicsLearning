// Traffic light with millis(): red 12, yellow 11, green 10; prints each change.
const int RED = 12, YELLOW = 11, GREEN = 10;
unsigned long since = 0;
int phase = 0;
const unsigned long lengths[] = { 300, 100, 250 };

void show() {
  digitalWrite(RED, phase == 0);
  digitalWrite(YELLOW, phase == 1);
  digitalWrite(GREEN, phase == 2);
  Serial.print(millis());
  Serial.print(" phase ");
  Serial.println(phase);
}

void setup() {
  Serial.begin(115200);
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
  show();
}

void loop() {
  if (millis() - since >= lengths[phase]) {
    since += lengths[phase];
    phase = (phase + 1) % 3;
    show();
  }
}
