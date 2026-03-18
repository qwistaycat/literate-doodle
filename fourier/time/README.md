# Literate Doodle

## Overview
Literate Doodle is a creative coding project that visualizes drawings using Fourier transforms and epicycles. The project leverages the p5.js library to create dynamic visualizations based on coordinates extracted from an SVG file.

## Project Structure
The project consists of the following files:

- **fourier/index.html**: Sets up the HTML structure for the application, including links to the p5.js library, a CSS stylesheet, and JavaScript files.
- **fourier/style.css**: Contains styles for the application, defining the visual appearance of the interface.
- **fourier/ct.js**: Contains additional functionality or utilities related to the project, possibly for handling complex numbers or other mathematical operations.
- **fourier/fourier.js**: Defines the `Complex` class for handling complex numbers and the `dft` function for performing the Discrete Fourier Transform on a set of coordinates. This file will be adjusted to accept coordinates extracted from the SVG file.
- **fourier/sketch.js**: Contains the main p5.js sketch. It sets up the canvas, processes the Fourier Transform of the coordinates, and draws the epicycles. This file will be modified to read coordinates from the SVG and visualize them correctly.
- **fourier/svg-parser.js**: A new file that will parse the `outputfile.svg` and extract the coordinates in the correct order for use in the Fourier visualization.
- **fourier/outputfile.svg**: Contains the SVG image that will be parsed to extract the drawing coordinates for the Fourier epicycle visualization.

## Setup Instructions
1. Clone the repository to your local machine.
2. Open the `fourier/index.html` file in a web browser to run the application.
3. Ensure you have an internet connection to load the p5.js library from the CDN.

## Usage
- The application visualizes the drawing represented in the `outputfile.svg` using Fourier transforms and epicycles.
- Modify the SVG file to change the drawing and see how the visualization updates accordingly.

## Dependencies
- p5.js: This project uses the p5.js library for rendering graphics and handling animations. The library is included via a CDN link in the `index.html` file.

## License
This project is open-source and available for modification and distribution under the MIT License.