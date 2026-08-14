# ⚙️ Technical interview · Backend

> Mock interview by level. Read **the question only**, answer out loud and on a timer, then compare. Format explained in [how these mocks work](../README.md).

## What they assess at each level

| Level | What they want | What rules you out |
|---|---|---|
| **Junior** | Correct fundamentals, honesty, basic quality judgment | Making things up; not knowing how to debug anything |
| **Mid** | Autonomy and awareness of the classic traps | Answering only with library names |
| **Senior** | Trade-offs, data, production behaviour | "It depends" with no follow-through; zero numbers |
| **Staff** | Impact beyond the team: cost, risk, migrations, standards | Designing without business constraints |

## Typical script (60 minutes)

```
 5 min · intro and context on your experience
15 min · language and data fundamentals
20 min · design a feature or an API
15 min · production incident (troubleshooting)
 5 min · your questions
```

---

## Junior level

### Q1. What is the difference between `PUT` and `POST`, and why does it matter?

**What they assess:** whether you see HTTP as a contract or as "the verb my framework wanted".

**❌ What NOT to say**

> "POST is for creating and PUT is for updating."

**Why it's wrong:** it's the memorised rule, and it's incomplete to the point of being false. `PUT` can create (when the client picks the identifier) and `POST` can modify. The real distinction is **idempotency**: repeating a `PUT` leaves the same state; repeating a `POST` creates another resource. Without idempotency you cannot reason about retries — which is the actual problem.

**⚠️ Acceptable answer**

> "`POST` is not idempotent and usually creates a new resource; `PUT` replaces a resource at a known URL and is idempotent, so repeating it doesn't change the outcome."

**What it's missing:** the practical consequence. Well memorised, but it never says what the knowledge is *for*.

**✅ Ideal answer**

> "The difference that matters is idempotency: repeating `PUT /orders/123` leaves the same state, while repeating `POST /orders` creates two orders. That decides what I can safely retry after a timeout, which happens all the time in production. So when I need a `POST` to be retry-safe, I add an `Idempotency-Key` header that the server stores together with the result; if the same key comes back, it returns the same response instead of duplicating."

**Why it works:** it ties theory to a real problem (timeouts and retries) and offers a concrete mechanism. From a junior, this immediately raises expectations.

**🔁 Likely follow-up:** *"What about `PATCH`?"* → "Not idempotent by definition — it depends on the operation. `{"stock": 5}` is; `{"stock": {"increment": 1}}` isn't."

📚 [Course 07 · API contracts](../../../cursos/07-apis-y-versionado/01-diseno-de-contratos.md)

---

### Q2. A query takes 3 seconds. How do you investigate it?

**What they assess:** whether you have a method or you poke around.

**❌ What NOT to say**

> "I add an index on the `WHERE` columns and that's it."

**Why it's wrong:** it's a fix before a diagnosis. There may already be an index that isn't used (a function on the column, mismatched types, bad estimates), the query may be returning 200,000 rows, or the real problem may be an N+1 from the application. Indexes also cost on every write: proposing one blindly signals you don't think in trade-offs.

**⚠️ Acceptable answer**

> "I'd run `EXPLAIN` to see whether it does a sequential scan, then add the missing index or rewrite the query."

**What it's missing:** measuring instead of guessing (`EXPLAIN ANALYZE` gives real timings, not estimates), checking how many rows come back, and whether the problem is the query or how the app uses it.

**✅ Ideal answer**

> "First I scope it: is it always slow or only with certain parameters? Then `EXPLAIN (ANALYZE, BUFFERS)` for the real plan — estimated vs actual rows, and whether it reads from disk or cache. If there's a seq scan on a big table I ask why the index isn't used: often it exists but can't be used because there's a function on the column or a type mismatch. I also check how many rows I'm pulling, because very often the problem isn't the query, it's that I fetch 50,000 records to display 20. And if the query alone is fast but the endpoint is slow, I suspect an N+1 from the ORM."

**Why it works:** method (scope → measure → hypothesis), knowledge of why indexes go unused, and the N+1 — the most common real cause.

**🔁 Likely follow-up:** *"How do you detect the N+1?"* → "By counting the statements one request issues: SQL logging or ORM statistics. A 200-item list firing 201 queries is the signature."

📚 [Course 01 · Spring and transactions](../../../cursos/01-java-senior/03-spring-por-dentro-y-transacciones.md)

---

## Mid level

### Q3. Two concurrent requests buy the last unit in stock. How do you prevent it?

**What they assess:** concurrency over shared data. This *is* the mid-level question.

**❌ What NOT to say**

> "I read the stock, check it's greater than zero, and update it. That prevents overselling."

**Why it's wrong:** that *is* the bug (*lost update*). Between your read and your write another transaction does the same: both read 1, both believe there's stock, both sell. PostgreSQL's default isolation (*Read Committed*) does **not** protect you. Saying it confidently is worse than hesitating.

**⚠️ Acceptable answer**

> "I'd use a transaction with `SELECT ... FOR UPDATE` to lock the row while I update it, so the second request waits."

**What it's missing:** the cheaper alternative (an atomic conditional update), the cost of pessimistic locking under contention, and what happens to reservations that are never confirmed.

**✅ Ideal answer**

> "The classic mistake is read-check-write in the application: that loses updates, because another transaction slips in between, and Read Committed doesn't prevent it. The simplest fix is to make the check atomic in the database: `UPDATE products SET stock = stock - 1 WHERE id = ? AND stock >= 1`, and if it affects zero rows there was no stock. If I need to lock more logic around it I use `SELECT ... FOR UPDATE`, accepting that I'm serialising access to that row and capping throughput for a hot SKU. And if this is a checkout flow, instead of decrementing when the item is added to the cart I'd rather reserve with a TTL: reserve when payment starts, confirm on charge, release on expiry."

**Why it works:** names the failure (*lost update*), gives the cheap fix first and the expensive one with its cost, then levels up with the reservation pattern.

**🔁 Likely follow-up:** *"What if stock lives in Redis for speed?"* → "Then I need an atomic operation there (`DECR` or a Lua script) and I accept that the source of truth is split: it needs reconciliation with the database and a defined behaviour if Redis goes down."

📚 [Course 00 · Consistency and CAP](../../../cursos/00-fundamentos-distribuidos/02-consistencia-y-cap.md)

---

### Q4. How do you connect two microservices: HTTP or messaging?

**What they assess:** coupling judgment. It's a design question disguised as a technology question.

**❌ What NOT to say**

> "Kafka, because it's asynchronous and scales better."

**Why it's wrong:** it answers a design question with a product name, and "scales better" is a slogan. It also ignores Kafka's real operational cost and the fact that many flows need an immediate answer. The interviewer reads: architecture copied from a conference talk.

**⚠️ Acceptable answer**

> "It depends: if I need the answer right away, HTTP; if not, a queue. For events several services care about, a broker."

**What it's missing:** what you lose with each option and how you decide in a concrete case.

**✅ Ideal answer**

> "I decide by whether the caller needs the result to continue. If a user is waiting — do they have credit? does this customer exist? — it goes synchronous. Anything that is a side effect — sending the email, updating analytics, notifying billing — goes asynchronous, so a failure over there doesn't break my operation. The cost I accept is that every synchronous dependency eats availability: five services at 99.9% in a chain give 99.5%, which is hours per month. And the cost of async is that I need idempotent consumers and a DLQ, because delivery is at-least-once. One thing I'm strict about: I never write to the database and publish the event in the same function expecting atomicity — that's a dual write, and I use the outbox pattern."

**Why it works:** explicit criterion, a number backing the argument, and idempotency plus outbox — the markers of someone who has operated this.

**🔁 Likely follow-up:** *"Queue or event log?"* → "If I need to replay history or have several consumers read the same stream independently, a log. If it's work distribution with retries and priorities, a plain queue is simpler to operate."

📚 [Course 00 · Messaging and idempotency](../../../cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

---

## Senior level

### Q5. One service got slow and the whole platform degraded. What do we do?

**What they assess:** whether you know the problem isn't the slow service — it's the amplification.

**❌ What NOT to say**

> "We scale the slow service horizontally and add retries so calls stop failing."

**Why it's wrong:** retries are exactly what turns a local problem into an outage (*retry storm*): if every client retries three times, the drowning service gets triple the load. And scaling doesn't help if the bottleneck is the database, a lock or a third party — you just add more clients competing for the same resource.

**⚠️ Acceptable answer**

> "I'd look at metrics and logs to find the culprit service, and meanwhile restart the affected pods or roll back the last deploy."

**What it's missing:** a rollback isn't enough once the system is in a metastable failure — the retry-and-queue loop sustains itself even after the cause is gone.

**✅ Ideal answer**

> "I separate containment from understanding. To contain, the first thing is to break the feedback loop: cut or cap retries, turn on load shedding so we reject fast what we can't serve, and degrade non-critical features behind a flag. A system in metastable failure doesn't recover on its own even if you revert the deploy, because the cause is now the backlog. To understand, I look at what changed at that time and follow the time with traces: the signature is usually high p99 with low CPU — that's waiting, not computing. Then the structural work: explicit timeouts that shrink as you go deeper, retries in one layer only with jitter and a budget, a breaker that also opens on slowness rather than errors alone, and bulkheads so a slow dependency can't consume every thread the checkout needs."

**Why it works:** separates containment from diagnosis, names the mechanism, and gives concrete defences with reasons.

**🔁 Likely follow-up:** *"Why must the breaker open on slowness?"* → "Because real failures are rarely clean outages: it's a service answering in 8 seconds. If I only count errors, the breaker never opens while my threads drain away."

📚 [Course 00 · Resilience](../../../cursos/00-fundamentos-distribuidos/04-resiliencia.md)

---

### Q6. You need to rename a column used by three services, with no downtime. How?

**What they assess:** real execution. This is where you see who has actually migrated data in production.

**❌ What NOT to say**

> "We schedule a maintenance window at night, run the `ALTER` and deploy everything together."

**Why it's wrong:** in a system with independent deploys, a maintenance window is a confession: it means you can't evolve a schema without stopping. It's also irreversible — if the deploy fails at 3 a.m. you're left with a migrated database and old code.

**⚠️ Acceptable answer**

> "I create the new column, copy the data, change the code to use it, then drop the old one."

**What it's missing:** ordering and reversibility — the intermediate deploys (dual writes), the batched backfill, the feature flag for the read switch, and the grace period before the `DROP`.

**✅ Ideal answer**

> "Expand/contract, so the schema and the deployed code are never incompatible. First I add the new column without touching anything, which is compatible with everything already running. Then I deploy code that writes to both and still reads the old one, and backfill in batches watching locks and replication lag, verifying at the end that both columns match. Then I switch reads behind a feature flag, which lets me revert in seconds without a deploy, and I leave it there for days because the rare flows take time to show up. Only then do I stop writing the old column, and weeks later I drop it, after checking query logs and every repo to confirm nobody uses it. Every phase is an independent, reversible deploy."

**Why it works:** it's a procedure, not an idea; it names the operational risks and makes reversibility the criterion.

**🔁 Likely follow-up:** *"What if the backfill is 200 million rows?"* → "Batched, resumable and idempotent, with pauses driven by replication lag; and I estimate the duration up front, because a 20-hour migration needs to be stoppable and resumable."

📚 [Course 07 · Zero-downtime migrations](../../../cursos/07-apis-y-versionado/04-migraciones-sin-downtime.md)

---

### Q7. How do you guarantee a payment is not charged twice?

**What they assess:** end-to-end idempotency. If one question defines backend level, it's this one.

**❌ What NOT to say**

> "Before charging I check whether a charge already exists for that order; if it does, I skip it."

**Why it's wrong:** that's a race condition with a name. Two concurrent requests check at the same time, neither sees anything, both charge. A check that isn't backed by a unique constraint isn't idempotency — it's an assumption.

**⚠️ Acceptable answer**

> "I use an idempotency key: the client sends a unique identifier and I store which keys I've processed, returning the same result on a repeat."

**What it's missing:** persisting the key and the effect **in the same transaction**, what happens when the same key arrives with a different body, and — most importantly — what you do when the payment provider times out.

**✅ Ideal answer**

> "In three layers. First, the client generates an idempotency key per payment *intent*, not per request: if the frontend retries three times, all three carry the same key. Second, the server inserts that key into a table with a unique constraint **inside the same transaction** that creates the charge; if it already exists and is complete, it returns the stored result, and if it arrives with a different body I return 422 so nothing gets overwritten. Third — the part people forget — towards the provider, a timeout does not mean it didn't charge. So I pass my own unique reference to them, and on a timeout I query the status by that reference before retrying. On top of everything, daily reconciliation against the provider's statement, because with money the compensations fail too and I want to find out before the customer does."

**Why it works:** covers client, server and third party; names the unique constraint (the part that actually makes it work) and closes with reconciliation.

**🔁 Likely follow-up:** *"How long do you keep the keys?"* → "As long as the client's retry window plus margin — 24 to 72 hours is typical, with scheduled purging. Keeping them forever adds nothing and grows the table."

📚 [Course 00 · Messaging and idempotency](../../../cursos/00-fundamentos-distribuidos/03-mensajeria-e-idempotencia.md)

---

## Staff / principal level

### Q8. You inherit a platform with 40 microservices and a team that deploys once a month. What do you do?

**What they assess:** whether your impact goes beyond code. They're not looking for architecture here — they're looking for judgment.

**❌ What NOT to say**

> "First thing is to redo the architecture: 40 microservices for that team is too many, we need to consolidate."

**Why it's wrong:** you decide before understanding, and you propose the most expensive, riskiest intervention as your opening move. Even if that conclusion turns out to be right, the process disqualifies you — nobody hands you a platform if in week one you want to rewrite it.

**⚠️ Acceptable answer**

> "I'd talk to the team to understand the pain, review the state of the services and prioritise improvements: CI/CD, tests, observability."

**What it's missing:** measurement. Reasonable, but with no instrument: it doesn't say what you look at, how you show progress, or how you get the business to pay for it.

**✅ Ideal answer**

> "First I measure, because 'deploys once a month' is a symptom and I want the cause. I look at four things: how long a small change takes to reach production, what share of deploys fail, how long recovery takes, and how often we have incidents. With those numbers I talk to the team, and two or three concrete bottlenecks always show up: a slow, flaky test suite, manual deploys, or fear because there's no way to roll back. I attack the fear first — reversible deploys and decent observability — because that unblocks everything else, and I pick one pilot service to prove it in weeks, not a one-year plan. Consolidating services I leave until I have data on which ones share an owner and always change together; at that point the merge justifies itself. And I translate all of it into business language: I don't sell 'CI/CD', I sell 'from idea to production in two days instead of a month'."

**Why it works:** measures before acting, sequences by unblocking, delivers value early and translates to business.

**🔁 Likely follow-up:** *"What if the team resists?"* → "That usually means the proposal doesn't solve *their* pain. I start with what hurts them — usually flaky tests or on-call — and earn permission for the rest."

📚 [Course 04 · Reliability and cost](../../../cursos/04-cloud-y-kubernetes/05-fiabilidad-y-costos.md)

---

## Quick self-assessment rubric

| Dimension | What to check |
|---|---|
| **Mechanism** | Did I explain *why* it works, or only *what* I'd do? |
| **Trade-off** | Did I state the cost of each decision? |
| **Numbers** | Did I give any figure (latency, rps, availability)? |
| **Production** | Did I mention how it behaves when it fails? |
| **Brevity** | Under 90 seconds per answer? |

Scoring under 3 on *mechanism* or *trade-off* means you're answering like a mid-level engineer even if you know more.
