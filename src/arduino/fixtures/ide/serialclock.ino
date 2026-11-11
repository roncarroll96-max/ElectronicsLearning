// Prints a counter, micros() and an analog reading every 100 ms; toggles pin 7 with delayMicroseconds.
int count = 0;

void setup() {
  Serial.begin(9600);
  pinMode(7, OUTPUT);
}

void loop() {
  Serial.print(count++);
  Serial.print(' ');
  Serial.print(analogRead(A0));
  Serial.print(' ');
  Serial.println(micros() / 1000);
  for (int i = 0; i < 20; i++) {
    digitalWrite(7, HIGH);
    delayMicroseconds(250);
    digitalWrite(7, LOW);
    delayMicroseconds(250);
  }
  delay(90);
}
