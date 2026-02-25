// Coding Challenge 130.3: Drawing with Fourier Transform and Epicycles
// Daniel Shiffman
// https://thecodingtrain.com/CodingChallenges/130.1-fourier-transform-drawing.html
// https://thecodingtrain.com/CodingChallenges/130.2-fourier-transform-drawing.html
// https://thecodingtrain.com/CodingChallenges/130.3-fourier-transform-drawing.html
// https://youtu.be/7_vKzcgpfvU
// https://editor.p5js.org/codingtrain/sketches/ldBlISrsQ

// Thank you to https://twitter.com/tomfevrier for the drawing path!

let drawing = [{x:74, y: 15}, {x:71, y: 13}, {x:70, y: 12}, {x:65, y: 12}, {x:64, y: 12}, {x:59, y: 12}, {x:58, y: 12}, {x:53, y: 13}, {x:52, y: 13}, {x:47, y: 15}, {x:46, y: 15}, {x:41, y: 18}, {x:40, y: 19}, {x:36, y: 22}, {x:35, y: 23}, {x:33, y: 26}, {x:32, y: 27}, {x:31, y: 32}, {x:30, y: 33}, {x:30, y: 38}, {x:30, y: 39}, {x:32, y: 42}, {x:92, y: 92}, {x:87, y: 90}, {x:86, y: 89}, {x:79, y: 85}, {x:78, y: 84}, {x:77, y: 83}, {x:76, y: 83}, {x:70, y: 79}, {x:69, y: 78}, {x:64, y: 75}, {x:63, y: 74}, {x:54, y: 68}, {x:53, y: 67}, {x:44, y: 61}, {x:43, y: 60}, {x:39, y: 57}, {x:38, y: 56}, {x:35, y: 54}, {x:113, y: 76}, {x:115, y: 73}, {x:115, y: 72}, {x:114, y: 67}, {x:114, y: 66}, {x:114, y: 60}, {x:114, y: 59}, {x:113, y: 54}, {x:113, y: 53}, {x:112, y: 47}, {x:112, y: 46}, {x:111, y: 41}, {x:111, y: 40}, {x:110, y: 36}, {x:109, y: 35}, {x:104, y: 30}, {x:103, y: 30}, {x:97, y: 26}, {x:96, y: 25}, {x:94, y: 27}];
