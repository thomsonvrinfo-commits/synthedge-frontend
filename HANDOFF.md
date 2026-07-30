\# SynthEdge Engineering Handoff



\## Mission



You are taking over an existing SaaS application called SynthEdge.



This is NOT a new build.



The application already has:

\- frontend development

\- backend workers

\- database infrastructure

\- migration documentation



Your role is to understand the current state and finish the remaining work.



\---



\# Product



SynthEdge is a trading analytics and backtesting platform.



Purpose:



Help Deriv Synthetic Index and Forex traders improve using:



\- historical market replay

\- backtesting

\- trading journal

\- analytics

\- performance insights



\---



\# Architecture



The system is being migrated away from Base44.



Old:

Base44 generated application



New:



Frontend:

React + Vite



Backend:

Cloudflare Workers



Database:

Cloudflare D1



Storage:

Cloudflare R2



\---



\# Project Structure



\## Frontend



Location:



frontend/synthedge-frontend



Important folders:



src/

base44/

migration-docs/



\---



\## Backend



Location:



backend/synthedge-new-platform



Contains:



\- database configuration

\- migrations

\- worker structure



\---



\## Workers



workers/auth



Handles authentication.



workers/entities



Handles application entities/business logic.



workers/candles-worker



Handles historical candle data API.



\---



\# Existing Documentation



Read these first:



frontend/synthedge-frontend/migration-docs/



Files:



00-AUDIT.md



01-PHASE1-SUMMARY.md



02-PHASE2-SUMMARY.md



03-PHASE3-SUMMARY.md



04-PHASE4-SUMMARY.md



05-FINAL-BASE44-REMOVAL.md



\---



\# Rules



Do not blindly rewrite the project.



First:



1\. Audit the codebase.

2\. Understand current architecture.

3\. Identify remaining Base44 dependencies.

4\. Identify bugs.

5\. Create a completion plan.



Preserve working features.



\---



\# Goal



Complete SynthEdge into an independent production SaaS application.

