# NEXUS Command Centre (Web Front-End)

This directory contains the source code for the **NEXUS Command Centre**, the primary visual dashboard for the NEXUS AI fairness immunity network. 

Built with React, Vite, TypeScript, and Tailwind CSS, the Command Centre allows compliance officers and executives to monitor AI pipelines in real time, viewing live bias interceptions and federated fairness metrics.

## 🔗 Main Documentation
For the **complete software documentation** (including architecture, 8 microservices, the Flutter mobile app, Python SDK, testing regimens, and the core algorithms), please refer to the [Root README](file:///c:/Users/prana/OneDrive/Desktop/NEXUS/README.md).

## 🚀 Quick Start (Local Development)

### Prerequisites
Make sure you are running the unified backend locally (using `make demo` from the root directory) before interacting heavily with the Web UI.

### Installation
```bash
# Navigate to the web app directory
cd apps/web

# Install dependencies (NPM or Yarn)
npm install

# Start the Vite development sever
npm run dev
```

### Key Components

- **`src/components/InterceptTicker.tsx`**: A primary component demonstrating streaming visualization of real-time intercepted algorithmic decisions.
- **`src/App.tsx`**: Entry point handling layouts, routing, and overarching dashboard themes.
- Recharts for metrics and Framer Motion for highly responsive UI/UX.

## Typescript & Linting
This template utilizes the strict TS-eslint architecture for maximum type safety.

```bash
npm run build     # Compiles using strict TypeScript verification
npm run lint      # Runs the ESLint definitions spanning Vite and React-specific configurations
```
