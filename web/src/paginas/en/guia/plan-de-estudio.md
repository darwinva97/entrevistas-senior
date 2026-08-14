---
title: Study plan
description: A 10-day sprint, an 8-week track and routes per job profile, combining courses, question bank and mock interviews.
sidebar:
  label: Study plan
---

Three routes depending on how much time you have. All of them combine [courses](/en/cursos/) (understanding) with the [question bank](/en/banco/) and the [mock interviews](/en/entrevistas/) (practice).

> **The rule that runs through all three:** for every hour of reading, half an hour answering **out loud and on a timer**. Interviews don't measure what you know — they measure what you manage to say in 60 seconds.

---

## 🏃 Sprint route — 10 days

For when the interview is already booked. About 3 hours a day.

| Day | Study | Practice |
|:-:|---|---|
| 1 | Course 00 (distributed fundamentals), modules 1–3 | Idempotency lab |
| 2 | Course 00, modules 4–6 | Cascading-failure lab |
| 3 | Course 08 (system design), modules 1–2 | 2 timed design cases |
| 4 | Your language course (Java / TypeScript / Go), first half | Bank questions, summary answers |
| 5 | Your language course, second half + diagnostics lab | The **[CASO]** questions for your language |
| 6 | Course 04: your cloud + the Kubernetes module | Questions for that cloud |
| 7 | Course 06 (security) 1–2 · Course 07 (APIs) 1–2 | Security and versioning questions |
| 8 | Course 08, modules 3 and 5 | 3 production incidents, out loud |
| 9 | Course 09 (interview technique), complete | Write your 6 STAR stories and record them |
| 10 | Review of summary answers | [Full mock interview](/en/entrevistas/) with the rubric |

**If you only had 3 days:** course 00 (days 1–2) + course 08 modules 1, 2 and 5 + your STAR stories. That's the 20% that gives 80%.

---

## 🧗 Full route — 8 weeks

To change league, not to pass an exam. About 8 hours a week.

| Week | Course | Bank | Your own deliverable |
|:-:|---|---|---|
| 1 | 00 · Fundamentals | Production incident cases | A service with real idempotency + outbox |
| 2 | Your language | Full language area | A memory leak reproduced and diagnosed with a profiler |
| 3 | 07 · APIs and versioning | API versioning area | v1 and v2 coexisting + contract tests in CI |
| 4 | 04 · Cloud and Kubernetes | Your cloud + Kubernetes | A deployment with zero 502s during rollout |
| 5 | 06 · Security | Security area | Threat model + 3 vulnerabilities fixed |
| 6 | 05 · Micro-frontends *(if relevant)* or review | Micro-frontends area | Shell + 2 remotes with independent deploys |
| 7 | 08 · System design | The 10 design cases | 5 designs written and timed |
| 8 | 09 · Interview technique | Review of summary answers | 3 mock interviews with another person |

---

## 🎯 Routes by job profile

| Profile | Recommended order | Where they'll press hardest |
|---|---|---|
| **Backend (Java)** | 00 → 01 → 07 → 04 → 08 → 06 | JVM, transactions, Kafka, production cases |
| **Backend (Node/TS)** | 00 → 02 → 07 → 04 → 08 → 06 | Event loop, types at the boundary, shutdown, memory |
| **Backend (Go) / platform** | 00 → 03 → 04 → 08 → 07 → 06 | Goroutines and leaks, `context`, pprof, Kubernetes |
| **Fullstack, frontend-heavy** | 00 → 05 → 02 → 07 → 08 | Micro-frontends, contracts, performance |
| **Staff / architect** | 00 → 08 → 07 → 06 → 04 | Trade-offs, migrations, cost, organisation |
| **SRE / DevOps** | 00 → 04 → 08 → 06 → your language | Incidents, observability, reliability, cost |
| **QA / automation** | 00 → [QA mock](/en/entrevistas/tecnicas/qa/) → 07 → 04 → 08 | Test strategy, flakiness, quality in the process |

---

## 📅 Recommended daily routine (90 minutes)

```
15 min · Out-loud review of 10 summary answers from previous days (spaced repetition)
45 min · A new course module
20 min · The module's lab or practice
10 min · Write down what you learned and what still feels weak
```

The first line is the highest-yield one and the one everyone skips: **memory is built by retrieval, not by re-reading**.

## 🔁 The 7 days before the interview

| When | What |
|---|---|
| −7 | Research the company: product, scale, stack, engineering blog. Adjust which areas you review |
| −5 | Full design mock, recorded |
| −3 | Your language mock + the **[CASO]** questions for your area |
| −2 | STAR stories out loud, timed |
| −1 | Only summary answers and your questions for them. **Nothing new.** Sleep |
| Day | 20-minute review, water, and join the call 10 minutes early |

**Don't study anything new the day before.** New material displaces what's consolidated and creates insecurity exactly when you need fluency.
