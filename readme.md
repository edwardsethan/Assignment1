# CSCE 679 Data Visualization Assignment 1

This project implements a matrix view for Hong Kong daily temperature data.

- X-axis: year
- Y-axis: month
- Cell background: monthly max/min temperature (toggle on click)
- Cell content: mini line charts for daily highs and lows
- Hover: tooltip with month summary values
- Legend: color-to-temperature mapping for current mode

## Data

- Source file: [data/temperature_daily.csv](data/temperature_daily.csv)
- Visualization code: [src/main.js](src/main.js)
- Styles: [src/styles.css](src/styles.css)

## Run locally

From the project root, run:

```bash
py -m http.server 8000
```

Then open:

```text
http://localhost:8000
```