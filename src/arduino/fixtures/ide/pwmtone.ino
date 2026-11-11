// PWM on pins 3, 5, 9 and 11 at different levels, and a tone on pin 8 that changes pitch.
void setup() {
  analogWrite(3, 40);
  analogWrite(5, 128);
  analogWrite(9, 200);
  analogWrite(11, 10);
}

void loop() {
  tone(8, 440, 150);
  delay(200);
  tone(8, 880, 150);
  delay(200);
}
