# Demo
https://youtu.be/hsWqeEyyGcQ


This is a continuation of a new direction of my original Fourier Epicycles Illustration project where I break down each epicycle. 
Here, I am targetting individual epicycles itself and allowing users to play with variations of how the image changes.

In short, the Fourier Series is a sum of smaller components that represent each epicycle in a mathematical equation. Each epicycle has a constant value as a parameter which changes it. In this project, I wanted to add experimentation and show how each component in the cycles contribute to the overall picture.


# Inspo
From this 3d harmonics reconstruction visual: https://www.instagram.com/reels/DVZlshnEr8j/<img width="510" height="878" alt="Screenshot 2026-03-23 at 2 45 57 AM" src="https://github.com/user-attachments/assets/188c3c6b-e1b9-4138-b57d-22b3ec381adc" />
... I was inspired by its breakdown of each harmonic in the process, so I wanted to show that similar process in my project as well while giving some playful interaction for people to directly manipulate each epicycle.

# Challenge
The biggest part was trying to understand how Fourier worked -- upon rewatching the [3blue1brown video](https://www.youtube.com/watch?v=r6sGWTCMz2k) on the math behind fourier transforms, understanding how each epicycle is represented as a sum of essentially a coefficient * a basic e^(i*pi) circle, I was able to find out that people can distort the image however they like by editting the coefficient on each cycle, thus inspiring this implementation.

