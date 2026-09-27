# Vector — Engineering Calculator

A full-stack scientific calculator built with React, Express, and mathjs. It includes degree/radian trig, engineering notation, calculation history, quick constants, unit conversions, and a calculation explainer. Add a server-side `OPENAI_API_KEY` to enable natural-language AI explanations; without a key, the app provides a clearly labeled local explanation mode.

## Run locally

1. Install Node.js 20.19+ (or Node.js 22.12+).
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:4180`.

The Vite frontend proxies `/api` requests to the Express service on port 3002. Copy `.env.example` to `.env` and add an OpenAI key if you want the optional AI explainer. The key stays on the server and is not required for calculator operations.
